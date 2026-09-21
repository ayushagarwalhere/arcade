import assert from "node:assert/strict";
import { before, beforeEach, test } from "node:test";
import { assessRepo, type StoredAssessment } from "@/assess/assess";
import { FIXTURE_FILES } from "@/assess/dev-fixture";
import { FixBlocked, fixPlanFor, issueText, openIssue, prepareFix, shipFix } from "@/assess/fix";
import { HEAD, REPO, installFakeGithub, type FakeGithub } from "./fake-github";

let gh: FakeGithub;
let assessment: StoredAssessment;
before(() => {
  gh = installFakeGithub();
});
beforeEach(async () => {
  gh.reset(FIXTURE_FILES);
  assessment = await assessRepo(REPO, "source", () => {}, () => false);
  gh.calls = [];
});

const finding = (rule: string, line?: number) => assessment.findings.find((f) => f.ruleId === rule && (line === undefined || f.vulnerableCode.lines.some((l) => l.flagged && l.no === line)))!;

test("a concrete rewrite: read, applyEdit, verifyFile closed, a real diff — with nothing written", async () => {
  const f = finding("weak-hash");
  assert.equal(fixPlanFor(f).kind, "rewrite");
  const fix = await prepareFix(REPO, f);

  assert.equal(fix.path, "src/lib/etag.ts");
  assert.equal(fix.line, 5);
  assert.equal(fix.commit, HEAD);
  assert.equal(fix.patched, FIXTURE_FILES["src/lib/etag.ts"].replace(`"md5"`, `"sha256"`));
  assert.equal(fix.verdict.closed, true);
  assert.deepEqual([fix.file.status, fix.file.additions, fix.file.deletions], ["M", 1, 1]);
  assert.deepEqual(
    fix.file.diff.filter((d) => d.kind === "add" || d.kind === "del").map((d) => `${d.kind} ${d.text.trim()}`),
    [`del return createHash("md5").update(body).digest("hex");`, `add return createHash("sha256").update(body).digest("hex");`],
  );
  assert.match(fix.branch, /^arcade\/fix-weak-hash-[0-9a-f]{6}$/);
  assert.equal(gh.writes().length, 0, "preparing a fix only reads");
});

test("shipping: blobs, tree, commit, ref, pulls — on a new arcade/fix branch, never the default branch", async () => {
  const f = finding("weak-hash");
  const fix = await prepareFix(REPO, f);
  gh.calls = [];
  const outcome = await shipFix("test-token", REPO, f, fix);

  assert.deepEqual(
    gh.writes().map((c) => `${c.method} ${c.path.replace(`/repos/${REPO}`, "")}`),
    ["POST /git/blobs", "POST /git/trees", "POST /git/commits", "POST /git/refs", "POST /pulls"],
  );
  const [blob, tree, commit, ref, pull] = gh.writes();
  assert.deepEqual(blob.body, { content: fix.patched, encoding: "utf-8" });
  assert.deepEqual(tree.body.tree.map((t: { path: string }) => t.path), ["src/lib/etag.ts"], "only the flagged file is in the commit");
  assert.equal(tree.body.base_tree, "base-tree");
  assert.deepEqual(commit.body.parents, [HEAD]);
  assert.equal(ref.body.ref, `refs/heads/${fix.branch}`);
  assert.deepEqual([pull.body.head, pull.body.base], [fix.branch, "main"]);
  assert.match(pull.body.body, /No tests were run/);

  for (const w of gh.writes()) {
    assert.doesNotMatch(w.path, /heads\/main/, "no write addresses the default branch");
    assert.notEqual(w.body?.ref, "refs/heads/main");
  }
  assert.equal(gh.refs["heads/main"], HEAD, "main did not move");
  assert.equal(gh.refs[`heads/${fix.branch}`], "c0ffee0000000000000000000000000000000000");

  assert.deepEqual(
    { ...outcome, at: "" },
    { kind: "pull-request", branch: fix.branch, sha: "c0ffee0000000000000000000000000000000000", commitUrl: `https://github.com/${REPO}/commit/c0ffee0`, number: 42, url: `https://github.com/${REPO}/pull/42`, existing: false, at: "" },
  );
});

test("no push access: explained, and not one write is attempted", async () => {
  const f = finding("weak-hash");
  const fix = await prepareFix(REPO, f);
  gh.canPush = false;
  gh.calls = [];
  await assert.rejects(shipFix("test-token", REPO, f, fix), (e: unknown) => e instanceof FixBlocked && /can read acme\/shop but not push/.test(e.message));
  assert.equal(gh.writes().length, 0);
});

test("the file moved on after the fix was prepared: nothing is committed", async () => {
  const f = finding("weak-hash");
  const fix = await prepareFix(REPO, f);
  gh.files["src/lib/etag.ts"] += "// edited by someone else\n";
  gh.calls = [];
  await assert.rejects(shipFix("test-token", REPO, f, fix), (e: unknown) => e instanceof FixBlocked && /changed on main/.test(e.message));
  assert.equal(gh.writes().length, 0);
});

test("the flagged line changed since the assessment: no fix is prepared", async () => {
  const f = finding("weak-hash");
  gh.files["src/lib/etag.ts"] = `// moved\n${FIXTURE_FILES["src/lib/etag.ts"]}`;
  await assert.rejects(prepareFix(REPO, f), (e: unknown) => e instanceof FixBlocked && /has changed since it was analysed/.test(e.message));
});

test("a pull request already open for the branch is reported, not duplicated", async () => {
  const f = finding("weak-hash");
  const fix = await prepareFix(REPO, f);
  gh.openPulls = [{ number: 9, html_url: `https://github.com/${REPO}/pull/9`, head: { sha: "abc1234000000000000000000000000000000000" } }];
  gh.calls = [];
  const outcome = await shipFix("test-token", REPO, f, fix);
  assert.deepEqual([outcome.existing, outcome.number, outcome.sha.slice(0, 7)], [true, 9, "abc1234"]);
  assert.equal(gh.writes().length, 0);
});

test("scaffold-only rules are refused: a FIXME note is never prepared, shown or committed as a fix", async () => {
  for (const rule of ["sql-injection", "missing-authz", "hardcoded-secret"]) {
    const f = finding(rule);
    const plan = fixPlanFor(f);
    assert.equal(plan.kind, "none", rule);
    assert.match(plan.kind === "none" ? plan.reason : "", /no automatic rewrite/);
    await assert.rejects(prepareFix(REPO, f), FixBlocked);
  }
  assert.equal(gh.writes().length, 0);
});

test("the TLS rewrite flips the flag in place, keeping everything else on the line", async () => {
  // On its own line inside an object literal.
  const alone = finding("tls-verification-disabled", 5);
  const fix = await prepareFix(REPO, alone);
  assert.equal(fix.patched.includes("  rejectUnauthorized: true,\n"), true);
  assert.equal(fix.patched.includes("keepAlive: true,"), true);
  assert.deepEqual([fix.file.additions, fix.file.deletions], [1, 1]);
  assert.equal(fix.verdict.closed, true);
  assert.equal(fix.verdict.remaining.length, 1, "the other match in the file is reported, not hidden");
  assert.match(fix.caveat ?? "", /turns certificate checks back on/);

  // Inline with other code: the agent must survive, only the flag changes.
  const inline = finding("tls-verification-disabled", 9);
  assert.equal(fixPlanFor(inline).kind, "rewrite");
  const second = await prepareFix(REPO, inline);
  assert.equal(second.patched.includes("export const legacyAgent = new https.Agent({ rejectUnauthorized: true });"), true);
  assert.deepEqual([second.file.additions, second.file.deletions], [1, 1]);
  assert.equal(second.verdict.closed, true);
  assert.notEqual(second.branch, fix.branch, "two weaknesses in one file get their own branches");
});

test("a wildcard CORS origin is never auto-fixed: only the project knows its real origins", async () => {
  const f = finding("open-cors");
  const plan = fixPlanFor(f);
  assert.equal(plan.kind, "none");
  assert.match(plan.kind === "none" ? plan.reason : "", /no automatic rewrite/);
  await assert.rejects(prepareFix(REPO, f), FixBlocked);
  assert.equal(gh.writes().length, 0);
});

test("CRLF files are patched without corrupting line endings", async () => {
  gh.reset({ ...FIXTURE_FILES, "src/lib/etag.ts": FIXTURE_FILES["src/lib/etag.ts"].replace(/\n/g, "\r\n") });
  const a = await assessRepo(REPO, "source", () => {}, () => false);
  const f = a.findings.find((x) => x.ruleId === "weak-hash")!;
  const fix = await prepareFix(REPO, f);
  assert.equal(fix.patched, FIXTURE_FILES["src/lib/etag.ts"].replace(`"md5"`, `"sha256"`).replace(/\n/g, "\r\n"));
  assert.deepEqual([fix.file.additions, fix.file.deletions], [1, 1]);
});

test("opening an issue posts the finding's details, and never the secret itself", async () => {
  const sql = finding("sql-injection");
  const outcome = await openIssue("test-token", assessment.meta, sql);
  assert.deepEqual([outcome.kind, outcome.number, outcome.url], ["issue", 7, `https://github.com/${REPO}/issues/7`]);
  const [post] = gh.writes();
  assert.equal(`${post.method} ${post.path}`, `POST /repos/${REPO}/issues`);
  assert.equal(post.body.title, "SQL built from untrusted input in src/db/users.ts");
  assert.match(post.body.body, new RegExp(`blob/${HEAD}/src/db/users\\.ts#L4`));
  assert.match(post.body.body, /SELECT \* FROM users WHERE email/);
  assert.match(post.body.body, /Use parameterized queries.*\(recommended\)/);
  assert.match(post.body.body, /Nothing was executed/);

  const secret = issueText(finding("hardcoded-secret"), assessment.meta);
  assert.doesNotMatch(secret.body, /sk_live_/);
  assert.match(secret.body, /Rotate the credential/);
});
