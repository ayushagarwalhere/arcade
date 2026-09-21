import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import { findOnPath } from "../connect.mjs";
import { FAKE_KEY, cleanup, makeFixture, runCli, sealedEnv, tempDir } from "./helpers.mjs";

after(cleanup);

const read = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
const idOf = (root, ruleId) => runCli(["findings", "--all", "--json"], { cwd: root }).json().find((f) => f.ruleId === ruleId).id;

test("--version and help", () => {
  const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(runCli(["--version"]).stdout.trim(), `arcade ${pkg.version}`);
  assert.deepEqual(runCli(["--version", "--json"]).json(), { name: "arcade", version: pkg.version });
  const help = runCli(["help"]);
  assert.equal(help.status, 0);
  for (const cmd of ["init", "scan", "findings", "evidence", "fix", "verify", "agent", "agents", "rules", "doctor", "demo", "sandbox"]) assert.match(help.stdout, new RegExp(`\\b${cmd}\\b`));
  assert.ok(!help.stdout.includes("\x1b["), "no colour codes when stdout is not a terminal");
});

test("usage errors exit 2, in JSON too", () => {
  const bad = runCli(["scan", "--fial-on", "high"]);
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /unknown option --fial-on/);
  const asJson = runCli(["scan", "--fail-on", "severe", "--json"], { cwd: tempDir() });
  assert.equal(asJson.status, 2);
  assert.deepEqual(asJson.json(), { ok: false, error: "--fail-on must be one of critical, high, medium, low, none." });
  assert.equal(runCli(["frobnicate"]).status, 2);
  assert.equal(runCli(["attack"]).status, 2, "the fake attack command is gone");
});

test("init really creates the config, and is idempotent", () => {
  const root = tempDir();
  const first = runCli(["init", "--json"], { cwd: root }).json();
  assert.deepEqual(first.created.sort(), [".arcade/.gitignore", ".arcade/config.json"]);
  assert.ok(fs.existsSync(path.join(root, ".arcade", "config.json")));
  const second = runCli(["init"], { cwd: root });
  assert.equal(second.status, 0);
  assert.match(second.stdout, /already exists/);
  assert.doesNotMatch(second.stdout, /created/);
  assert.deepEqual(runCli(["init", "--json"], { cwd: root }).json().created, []);
});

test("commands that need a scan say so instead of printing a sample", () => {
  const root = tempDir();
  for (const cmd of [["findings"], ["evidence", "ARC-001"], ["map"], ["status"], ["verify", "ARC-001"], ["fix", "ARC-001"]]) {
    const r = runCli(cmd, { cwd: root });
    assert.equal(r.status, 2, cmd.join(" "));
    assert.match(r.stderr, /Run "arcade scan"/, cmd.join(" "));
    assert.doesNotMatch(r.stdout + r.stderr, /acme|commerce-api/);
  }
});

test("scan --fail-on sets the exit code; without a threshold it exits 0", () => {
  const root = makeFixture();
  assert.equal(runCli(["scan"], { cwd: root }).status, 0, "no config, no flag → informational");
  assert.equal(runCli(["scan", ".", "--fail-on", "critical"], { cwd: root }).status, 0);
  assert.equal(runCli(["scan", ".", "--fail-on=high"], { cwd: root }).status, 1);
  assert.equal(runCli(["scan", "--fail-on", "none"], { cwd: root }).status, 0);

  runCli(["init"], { cwd: root }); // config says failOn: high
  const viaConfig = runCli(["scan", "--json"], { cwd: root });
  assert.equal(viaConfig.status, 1);
  const out = viaConfig.json();
  assert.equal(out.failed, true);
  assert.equal(out.failOn, "high");
  assert.equal(out.failing.length, 3);
  assert.equal(runCli(["scan", "--fail-on", "critical"], { cwd: root }).status, 0, "the flag overrides the config");
});

test("scan of a path argument, and a missing folder", () => {
  const root = makeFixture();
  const elsewhere = tempDir();
  const r = runCli(["scan", root, "--json"], { cwd: elsewhere });
  assert.equal(r.status, 0);
  assert.equal(r.json().counts.total, 4);
  assert.ok(fs.existsSync(path.join(root, ".arcade", "last-scan.json")), "results are saved in the scanned project");
  assert.ok(!fs.existsSync(path.join(elsewhere, ".arcade")));
  assert.equal(runCli(["findings", "--json", "--cwd", root], { cwd: elsewhere }).json().length, 4);
  assert.equal(runCli(["scan", path.join(root, "nope")]).status, 2);
});

test("findings, evidence, map and status report the real scan", () => {
  const root = makeFixture();
  runCli(["scan"], { cwd: root });

  const list = runCli(["findings", "--json"], { cwd: root }).json();
  assert.deepEqual(list.map((f) => f.ruleId).sort(), ["hardcoded-secret", "sql-injection", "tls-verification-disabled", "weak-hash"]);
  assert.deepEqual(runCli(["findings", "--severity", "high", "--json"], { cwd: root }).json().length, 3);
  assert.match(runCli(["findings"], { cwd: root }).stdout, /src\/hash\.js:4/);

  const ev = runCli(["evidence", idOf(root, "weak-hash"), "--json"], { cwd: root }).json();
  assert.equal(ev.file, "src/hash.js");
  assert.equal(ev.line, 4);
  assert.equal(ev.analysis, "static");
  assert.ok(ev.vulnerableCode.lines.some((l) => l.flagged && l.no === 4));
  assert.ok(ev.mitigations.length > 0);

  const secret = runCli(["evidence", idOf(root, "hardcoded-secret")], { cwd: root });
  assert.ok(!secret.stdout.includes(FAKE_KEY), "evidence printed the secret");
  assert.match(secret.stdout, /\[redacted\]/);

  const map = runCli(["map", "--json"], { cwd: root }).json();
  assert.ok(map.surface.nodes.some((n) => n.id === "secrets" && n.risk === "vulnerable"));
  assert.match(map.note, /No exploit was run/);

  const status = runCli(["status", "--json"], { cwd: root }).json();
  assert.equal(status.open.total, 4);
  assert.equal(status.fixed, 0);
  assert.equal(status.root, root);
  assert.equal(runCli(["evidence", "ARC-404"], { cwd: root }).status, 2);
});

test("SARIF output is valid 2.1.0 for GitHub code scanning", () => {
  const root = makeFixture();
  const file = path.join(root, "out", "arcade.sarif");
  const r = runCli(["scan", "--sarif", file], { cwd: root });
  assert.equal(r.status, 0);
  const sarif = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(sarif.version, "2.1.0");
  assert.match(sarif.$schema, /sarif-2\.1\.0/);
  assert.equal(sarif.runs.length, 1);
  const run = sarif.runs[0];
  assert.equal(run.tool.driver.name, "Arcade");
  assert.equal(run.tool.driver.rules.length, 14);
  for (const rule of run.tool.driver.rules) {
    assert.ok(rule.id && rule.shortDescription.text && rule.fullDescription.text && rule.help.text);
    assert.ok(["error", "warning", "note"].includes(rule.defaultConfiguration.level));
    assert.match(rule.properties["security-severity"], /^\d+\.\d$/);
    assert.ok(rule.properties.tags.includes("security"));
  }
  assert.equal(run.results.length, 4);
  for (const res of run.results) {
    assert.equal(run.tool.driver.rules[res.ruleIndex].id, res.ruleId);
    assert.ok(res.message.text);
    const loc = res.locations[0].physicalLocation;
    assert.equal(loc.artifactLocation.uriBaseId, "%SRCROOT%");
    assert.ok(!loc.artifactLocation.uri.startsWith("/") && !loc.artifactLocation.uri.includes("\\"), "relative, '/'-separated URI");
    assert.ok(Number.isInteger(loc.region.startLine) && loc.region.startLine >= 1);
    assert.ok(Number.isInteger(loc.region.startColumn) && loc.region.startColumn >= 1);
    assert.match(res.partialFingerprints["arcadeFinding/v1"], /^[0-9a-f]{32}$/);
  }
  const hash = run.results.find((x) => x.ruleId === "weak-hash");
  assert.equal(hash.locations[0].physicalLocation.artifactLocation.uri, "src/hash.js");
  assert.equal(hash.locations[0].physicalLocation.region.startLine, 4);
  assert.equal(hash.level, "warning");
  assert.ok(!JSON.stringify(sarif).includes(FAKE_KEY), "SARIF contains the secret");
});

test("SARIF paths are relative to the repository when a sub-folder is scanned", { skip: !findOnPath("git") && "git is not installed" }, () => {
  const repo = tempDir();
  execFileSync("git", ["init", "-q"], { cwd: repo, stdio: "ignore" });
  const svc = path.join(repo, "services", "api");
  fs.mkdirSync(path.join(svc, "src"), { recursive: true });
  fs.writeFileSync(path.join(svc, "src", "hash.js"), 'export const h = (c) => c.createHash("md5");\n');
  const file = path.join(repo, "out.sarif");
  assert.equal(runCli(["scan", svc, "--sarif", file], { cwd: repo }).status, 0);
  const result = JSON.parse(fs.readFileSync(file, "utf8")).runs[0].results[0];
  assert.equal(result.locations[0].physicalLocation.artifactLocation.uri, "services/api/src/hash.js");
});

test("fix: dry run by default, --apply rewrites the file, verify then passes", () => {
  const root = makeFixture();
  runCli(["scan"], { cwd: root });
  const id = idOf(root, "weak-hash");
  const before = read(root, "src/hash.js");

  const dry = runCli(["fix", id], { cwd: root });
  assert.equal(dry.status, 0);
  assert.match(dry.stdout, /-  return createHash\("md5"\)/);
  assert.match(dry.stdout, /\+  return createHash\("sha256"\)/);
  assert.match(dry.stdout, /Dry run: nothing was written/);
  assert.equal(read(root, "src/hash.js"), before, "a dry run must not touch the file");
  assert.equal(runCli(["verify", id], { cwd: root }).status, 1, "still vulnerable → verify fails");

  const applied = runCli(["fix", id, "--apply", "--json"], { cwd: root });
  assert.equal(applied.status, 0);
  const out = applied.json();
  assert.equal(out.applied, true);
  assert.equal(out.verification.closed, true);
  assert.equal(out.committed, false);
  assert.equal(read(root, "src/hash.js"), before.replace('"md5"', '"sha256"'));

  const verified = runCli(["verify", id, "--json"], { cwd: root });
  assert.equal(verified.status, 0);
  assert.equal(verified.json().closed, true);
  assert.equal(runCli(["status", "--json"], { cwd: root }).json().fixed, 1);
  assert.ok(!runCli(["findings", "--json"], { cwd: root }).json().some((f) => f.id === id), "fixed findings leave the open list");

  const again = runCli(["fix", id, "--apply", "--json"], { cwd: root });
  assert.equal(again.status, 0, "fixing what is already fixed is a no-op, not an error");
  assert.deepEqual([again.json().alreadyFixed, again.json().applied], [true, false]);
});

test("fix keeps CRLF line endings", () => {
  const root = makeFixture();
  runCli(["scan"], { cwd: root });
  const r = runCli(["fix", idOf(root, "tls-verification-disabled"), "--apply"], { cwd: root });
  assert.equal(r.status, 0);
  // The flag is flipped where it stands, and every line keeps its \r\n.
  assert.equal(read(root, "src/tls.js"), ['import https from "node:https";', "export const agent = new https.Agent({", "  rejectUnauthorized: true,", "  keepAlive: true,", "});", ""].join("\r\n"));
});

test("a rewrite never takes the rest of its line with it", () => {
  const root = makeFixture();
  fs.writeFileSync(path.join(root, "src", "tls.js"), 'export const agent = new (require("https").Agent)({ rejectUnauthorized: false });\n');
  runCli(["scan"], { cwd: root });
  const r = runCli(["fix", idOf(root, "tls-verification-disabled"), "--apply"], { cwd: root });
  assert.equal(r.status, 0);
  assert.equal(read(root, "src/tls.js"), 'export const agent = new (require("https").Agent)({ rejectUnauthorized: true });\n');
});

test("a rewrite touches the algorithm, not an identifier that contains its name", () => {
  const root = makeFixture();
  fs.writeFileSync(path.join(root, "src", "hash.js"), 'import crypto from "node:crypto";\nexport const md5sum = (b) => crypto.createHash("md5").update(b).digest("hex");\n');
  runCli(["scan"], { cwd: root });
  const r = runCli(["fix", idOf(root, "weak-hash"), "--apply"], { cwd: root });
  assert.equal(r.status, 0);
  assert.equal(read(root, "src/hash.js"), 'import crypto from "node:crypto";\nexport const md5sum = (b) => crypto.createHash("sha256").update(b).digest("hex");\n');
});

test("a scaffold-only rule refuses to pretend it has a fix", () => {
  const root = makeFixture();
  runCli(["scan"], { cwd: root });
  const id = idOf(root, "sql-injection");
  const before = read(root, "src/db.js");

  const dry = runCli(["fix", id], { cwd: root });
  assert.match(dry.stdout, /No automatic fix/);
  assert.match(dry.stdout, /--agent/);
  assert.match(dry.stdout, /Nothing was changed/);

  const apply = runCli(["fix", id, "--apply", "--json"], { cwd: root });
  assert.equal(apply.status, 1);
  const out = apply.json();
  assert.equal(out.ok, false);
  assert.equal(out.concrete, false);
  assert.equal(out.applied, false);
  assert.equal(read(root, "src/db.js"), before);
  assert.ok(!read(root, "src/db.js").includes("FIXME"), "a FIXME scaffold must never be written as a fix");
  assert.equal(runCli(["verify", id], { cwd: root }).status, 1);
});

test("fix --commit --branch makes one real commit holding only the fix", { skip: !findOnPath("git") && "git is not installed" }, () => {
  const root = makeFixture();
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  git("init", "-q");
  git("config", "user.name", "Arcade Test");
  git("config", "user.email", "test@example.com");
  git("config", "commit.gpgsign", "false");
  fs.writeFileSync(path.join(root, ".gitignore"), "node_modules/\n");
  git("add", "-A");
  git("commit", "-q", "-m", "baseline");
  const base = git("rev-parse", "HEAD");

  runCli(["scan"], { cwd: root });
  fs.writeFileSync(path.join(root, "notes.txt"), "unrelated work in progress\n");
  const id = idOf(root, "weak-hash");
  const r = runCli(["fix", id, "--commit", "--branch", "fix/weak-hash", "--json"], { cwd: root });
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const out = r.json();
  assert.equal(out.committed, true);
  assert.equal(out.landed.branch, "fix/weak-hash");
  assert.equal(git("rev-parse", "--abbrev-ref", "HEAD"), "fix/weak-hash");
  assert.equal(git("rev-parse", "HEAD"), out.landed.commit.sha);
  assert.equal(git("rev-parse", "HEAD~1"), base);
  assert.deepEqual(git("show", "--name-only", "--format=", "HEAD").split("\n"), ["src/hash.js"], "only the fixed file is committed");
  assert.match(git("log", "-1", "--format=%B"), /weak-hash/);
  assert.doesNotMatch(git("log", "-1", "--format=%B"), /co-authored-by/i);
  assert.match(git("status", "--porcelain"), /\?\? notes\.txt/, "unrelated work stays uncommitted");

  // --pr without a token is refused before anything changes.
  const tlsId = idOf(root, "tls-verification-disabled");
  const tlsBefore = read(root, "src/tls.js");
  const pr = runCli(["fix", tlsId, "--pr"], { cwd: root });
  assert.equal(pr.status, 2);
  assert.match(pr.stderr, /origin|GitHub token|github\.com/);
  assert.equal(read(root, "src/tls.js"), tlsBefore);
});

test("fix --commit outside a git repository changes nothing", () => {
  const root = makeFixture();
  runCli(["scan"], { cwd: root });
  const before = read(root, "src/hash.js");
  const r = runCli(["fix", idOf(root, "weak-hash"), "--commit"], { cwd: root });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /git/i);
  assert.equal(read(root, "src/hash.js"), before);
});

test("rules lists all 14 with whether a rewrite exists", () => {
  const rules = runCli(["rules", "--json"]).json();
  assert.equal(rules.length, 14);
  const byId = Object.fromEntries(rules.map((r) => [r.id, r]));
  assert.equal(byId["weak-hash"].automaticRewrite, true);
  // Which origins are legitimate is project knowledge: the rule must not invent one.
  assert.equal(byId["open-cors"].automaticRewrite, false);
  assert.equal(byId["tls-verification-disabled"].automaticRewrite, true);
  assert.equal(byId["sql-injection"].automaticRewrite, false);
  assert.equal(byId["missing-authz"].automaticRewrite, false);
  assert.equal(byId["sql-injection"].cwe, "CWE-89");
});

test("doctor reports token presence and never the token", () => {
  // Assembled at runtime so no token-shaped literal sits in the repository for secret scanners to trip on.
  const token = ["ghp", "thisIsNotARealTokenButMustNotLeak123"].join("_");
  const r = runCli(["doctor", "--json"], { cwd: tempDir(), env: sealedEnv({ GITHUB_TOKEN: token }) });
  assert.equal(r.status, 0);
  assert.ok(!(r.stdout + r.stderr).includes(token));
  const out = r.json();
  assert.equal(out.checks.find((c) => c.name === "node").ok, true);
  assert.equal(out.checks.find((c) => c.name === "github-token").ok, true);
  const text = runCli(["doctor"], { cwd: tempDir(), env: sealedEnv({ GH_TOKEN: token }) });
  assert.ok(!(text.stdout + text.stderr).includes(token));
  assert.match(text.stdout, /GH_TOKEN is set/);
});

test("agents shows runnable CLIs and MCP connections without running anything", () => {
  const out = runCli(["agents", "--json"]).json();
  assert.deepEqual(out.runners.map((r) => r.id), ["claude-code", "codex", "gemini", "cursor", "opencode"]);
  assert.deepEqual(out.connections.map((c) => c.id), ["claude-code", "codex"]);
});

test("demo is labelled as sample data", () => {
  const r = runCli(["demo"]);
  assert.match(r.stdout, /SAMPLE DATA/);
  assert.match(r.stdout, /does not exist/);
  assert.equal(runCli(["demo", "--json"]).json().sample, true);
});
