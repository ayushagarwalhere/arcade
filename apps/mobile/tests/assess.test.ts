import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { memoryFs } from "@/core/fs";
import { runAssessment } from "@/orchestrator/pipeline";
import { assessRepo, planFor, type StoredAssessment } from "@/assess/assess";
import { FIXTURE_FILES } from "@/assess/dev-fixture";
import { repoWorkspace } from "@/assess/repo-workspace";
import { loadAssessment, loadLastAssessment, MAX_STORED_FINDINGS, saveAssessment, storedAssessments } from "@/assess/storage";
import { GithubRateLimitError } from "@/github/github";
import { pinHead } from "@/github/repo-fs";
import { routeForLink } from "@/links";
import { HEAD, REPO, installFakeGithub, type FakeGithub } from "./fake-github";

let gh: FakeGithub;
before(() => {
  gh = installFakeGithub();
});
beforeEach(() => gh.reset(FIXTURE_FILES));

const at = (a: StoredAssessment | { findings: StoredAssessment["findings"] }) => a.findings.map((f) => `${f.ruleId} ${f.vulnerableCode.path}:${f.vulnerableCode.lines.find((l) => l.flagged)?.no}`).sort();

const EXPECTED_SOURCE = [
  "hardcoded-secret src/lib/payments.ts:1",
  "missing-authz src/api/admin/export.ts:6", // where the handler authenticates, not the line that imports the helper
  "open-cors src/server.ts:8",
  "sql-injection src/db/users.ts:4",
  "tls-verification-disabled src/lib/billing-client.ts:5",
  "tls-verification-disabled src/lib/billing-client.ts:9",
  "weak-hash src/lib/etag.ts:5",
];

/* ------------------------------------------------ the engine, in memory */

test("runAssessment over an in-memory repository finds the known weaknesses at their real lines", async () => {
  const result = await runAssessment(memoryFs(FIXTURE_FILES), { profile: "scan-only", scope: "source", projectName: "fixture-shop", projectPath: "acme/shop" }, () => {});
  assert.deepEqual(at(result), EXPECTED_SOURCE);
  assert.equal(result.findings[0].severity, "critical", "strongest finding first");
  const hash = result.findings.find((f) => f.ruleId === "weak-hash")!;
  assert.equal(hash.vulnerableCode.lines.find((l) => l.flagged)!.text, `  return createHash("md5").update(body).digest("hex");`);
  assert.equal(result.plan.initial.surface.nodes.some((n) => n.risk === "vulnerable"), true);
});

/* ------------------------------------------- repo-fs → WorkspaceFs adapter */

test("the adapter serves the engine's exact list/read shapes from the GitHub API", async () => {
  await pinHead(REPO);
  const ws = repoWorkspace(REPO);
  const root = await ws.fs.list("");
  assert.deepEqual(root.map((e) => `${e.kind} ${e.path}`), ["dir src", "dir tests", "file package.json", "file README.md", "file tsconfig.json"]);
  assert.deepEqual(await ws.fs.list("src/lib"), [
    { name: "billing-client.ts", path: "src/lib/billing-client.ts", kind: "file" },
    { name: "etag.ts", path: "src/lib/etag.ts", kind: "file" },
    { name: "payments.ts", path: "src/lib/payments.ts", kind: "file" },
  ]);

  const file = await ws.fs.read("src/lib/etag.ts");
  assert.deepEqual(file, { kind: "text", text: FIXTURE_FILES["src/lib/etag.ts"], size: FIXTURE_FILES["src/lib/etag.ts"].length });
  await ws.fs.read("src/lib/etag.ts");
  assert.equal(gh.calls.filter((c) => c.path.includes("/git/blobs/")).length, 1, "a second read comes from the blob cache");
  await assert.rejects(ws.fs.read("nope.ts"));
  assert.deepEqual(ws.unreadable(), ["nope.ts"]);
  assert.equal(gh.calls.every((c) => c.method === "GET"), true, "reading never writes");
});

test("candidates() lists what the scanner will read for each scope without fetching a single file", async () => {
  await pinHead(REPO);
  const ws = repoWorkspace(REPO);
  const source = await ws.candidates("source");
  const all = await ws.candidates("all");
  assert.equal(source.includes("tests/etag.test.ts"), false);
  assert.equal(all.includes("tests/etag.test.ts"), true);
  assert.equal(source.includes("src/server.ts"), true);
  assert.equal(gh.calls.some((c) => c.path.includes("/git/blobs/")), false);
});

test("assessRepo: real findings, pinned to the commit, fetched with bounded concurrency", async () => {
  // Distinct contents, so nothing is served from an earlier test's blob cache.
  const files = Object.fromEntries(Object.entries(FIXTURE_FILES).map(([p, t]) => [p, p.endsWith(".ts") ? `${t}// v2\n` : t]));
  for (let i = 0; i < 30; i++) files[`src/gen/m${i}.ts`] = `export const m${i} = ${i};\n`;
  gh.reset(files);

  const stages: string[] = [];
  let lastTotal = 0;
  const a = await assessRepo(REPO, "source", (p) => (stages.push(p.stage), (lastTotal = p.totalFiles)), () => false);

  assert.deepEqual(at(a), EXPECTED_SOURCE);
  assert.equal(a.meta.commit, HEAD);
  assert.equal(a.meta.source, "github");
  assert.equal(a.meta.unreadable, 0);
  assert.equal(a.meta.filesAnalysed, lastTotal);
  assert.equal(a.meta.totalFindings, 7);
  assert.deepEqual([...new Set(stages)], ["listing", "scanning", "explaining", "done"]);
  assert.ok(gh.maxInflight > 1, "files are fetched ahead of the scanner");
  assert.ok(gh.maxInflight <= 6, `at most 6 requests in flight, saw ${gh.maxInflight}`);
  assert.equal(gh.calls.filter((c) => c.path.includes("/git/trees/")).length, 1, "one tree call");
  assert.ok(gh.calls.find((c) => c.path.includes(`/git/trees/${HEAD}`)), "the tree is read at the pinned commit, not a moving HEAD");
  assert.equal(gh.writes().length, 0, "an assessment never writes");

  const all = await assessRepo(REPO, "all", () => {}, () => false);
  assert.ok(at(all).includes("weak-hash tests/etag.test.ts:2"), "scope=all also analyses tests");
});

test("a rate limit mid-scan rejects the assessment instead of passing off a partial scan as clean", async () => {
  const files = Object.fromEntries(Object.entries(FIXTURE_FILES).map(([p, t]) => [p, p.endsWith(".ts") ? `${t}// v3\n` : t]));
  gh.reset(files);
  gh.blobBudget = 3;
  await assert.rejects(
    assessRepo(REPO, "source", () => {}, () => false),
    (e: unknown) => e instanceof GithubRateLimitError && /rate limit/i.test(e.message) && e.resetAt instanceof Date,
  );
});

test("cancelling rejects too", async () => {
  const files = Object.fromEntries(Object.entries(FIXTURE_FILES).map(([p, t]) => [p, p.endsWith(".ts") ? `${t}// v4\n` : t]));
  gh.reset(files);
  let reads = 0;
  await assert.rejects(assessRepo(REPO, "source", (p) => void (reads = p.filesRead), () => reads >= 2), /cancelled/);
});

/* ------------------------------------------------------- honest run state */

test("the run state of a real assessment claims nothing that did not happen", async () => {
  const a = await assessRepo(REPO, "source", () => {}, () => false);
  const plan = planFor(a);
  assert.equal(plan.beats.length, 0, "nothing is replayed: the work already happened");
  const s = plan.initial;
  assert.deepEqual([s.finding, ...s.secondaryFindings].map((f) => f.id), a.findings.map((f) => f.id));
  assert.match(s.project.description, /^Static analysis of acme\/shop @ 1111111\./);

  const said = JSON.stringify([s.terminal, s.timeline, s.agents, s.project.description, a.findings.map((f) => [f.evidence, f.verification, f.agent, f.remediation])]);
  for (const lie of [/sandbox/i, /\bPASS\b/, /tests? (?:green|pass)/i, /verified/i, /reproduc/i, /Saved reproduction/i, /committed [0-9a-f]{7}/i]) assert.doesNotMatch(said, lie);
  for (const f of a.findings) {
    assert.equal(f.verification.outcome, "pending");
    assert.equal(f.remediation.files.length, 0, "no fix exists until the user approves one");
    assert.equal(f.remediation.tests.length, 0);
  }
});

/* ------------------------------------------------------------ persistence */

test("the last assessment per repository is stored without file contents, and the fixture never is", async () => {
  const a = await assessRepo(REPO, "source", () => {}, () => false);
  const many = { ...a, findings: Array.from({ length: 400 }, (_, i) => ({ ...a.findings[i % a.findings.length], id: `ARC-${i + 1}` })) };
  await saveAssessment(many);
  await saveAssessment({ ...a, meta: { ...a.meta, repo: "arcade-dev/fixture-shop", source: "fixture" } });

  assert.deepEqual((await storedAssessments()).map((e) => e.repo), [REPO]);
  const back = (await loadAssessment(REPO))!;
  assert.equal(back.findings.length, MAX_STORED_FINDINGS);
  assert.equal(back.meta.totalFindings, a.meta.totalFindings);
  assert.equal((await loadLastAssessment())!.meta.repo, REPO);
  const stored = JSON.stringify(back);
  assert.equal(stored.includes("test-token"), false, "no secret in AsyncStorage");

  // AsyncStorage is unencrypted: a credential found in the repository must not be written to it.
  // The fixture's fake key, assembled here so no key-shaped literal sits in the repository for secret scanners to trip on.
  assert.equal(JSON.stringify(a).includes(["sk", "live", "FixtureOnlyNotARealKey000"].join("_")), true, "control: the live result does hold the matched line");
  assert.equal(stored.includes("sk_live_"), false, "the flagged line of a secret finding is not stored");
  const secret = back.findings.find((f) => f.ruleId === "hardcoded-secret")!;
  assert.equal(secret.vulnerableCode.path, "src/lib/payments.ts");
  assert.equal(secret.vulnerableCode.lines.find((l) => l.flagged)!.no, 1, "its location is kept");
  assert.equal(back.findings.find((f) => f.ruleId === "weak-hash")!.vulnerableCode.lines.some((l) => l.text.includes("md5")), true, "other findings keep their code window");
  assert.equal(stored.includes(`app.listen(3000)`), false, "whole files are not stored, only each finding's code window");
});

/* ------------------------------------------------------------- deep links */

test("arcade:// links map to the repository screens and nothing else", () => {
  assert.equal(routeForLink("arcade://repo/acme/shop"), "/repo?repo=acme%2Fshop");
  assert.equal(routeForLink("arcade:///repo/acme/shop"), "/repo?repo=acme%2Fshop");
  assert.equal(routeForLink("/repo/acme/shop"), "/repo?repo=acme%2Fshop");
  assert.equal(routeForLink("arcade://repo/acme/shop/assess"), "/assess?repo=acme%2Fshop");
  assert.equal(routeForLink("arcade://repo/acme/..%2F..%2Fsecrets"), "/");
  assert.equal(routeForLink("arcade://repo/acme"), "arcade://repo/acme", "not a repository link: left for the router");
  assert.equal(routeForLink("/finding/ARC-001"), "/finding/ARC-001");
});
