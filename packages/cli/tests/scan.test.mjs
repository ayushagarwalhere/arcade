import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import { compileIgnore, nodeFs } from "../node-fs.mjs";
import { atOrAbove, findFinding, initProject, loadConfig, loadScan, runScan } from "../project.mjs";
import { FAKE_KEY, cleanup, makeFixture, tempDir, write } from "./helpers.mjs";

after(cleanup);

const at = (scan, file) => scan.findings.filter((f) => f.file === file);

test("scanner finds the real weaknesses, at the right file and line", async () => {
  const root = makeFixture();
  const scan = await runScan(root, { scope: "source" });

  const hash = at(scan, "src/hash.js");
  assert.equal(hash.length, 1);
  assert.equal(hash[0].ruleId, "weak-hash");
  assert.equal(hash[0].line, 4);
  assert.equal(hash[0].severity, "medium");
  assert.equal(hash[0].fix.kind, "rewrite");
  assert.equal(hash[0].excerpt, 'return createHash("md5").update(value).digest("hex");');

  const sql = at(scan, "src/db.js");
  assert.deepEqual(sql.map((f) => [f.ruleId, f.line, f.fix.kind]), [["sql-injection", 3, "agent"]]);

  const tls = at(scan, "src/tls.js");
  assert.deepEqual(tls.map((f) => [f.ruleId, f.line]), [["tls-verification-disabled", 3]]);
  assert.equal(tls[0].excerpt, "rejectUnauthorized: false,", "CRLF must not leak into the excerpt");

  assert.deepEqual(scan.counts, { critical: 0, high: 3, medium: 1, low: 0, total: 4 });
  assert.deepEqual(scan.findings.map((f) => f.id), ["ARC-001", "ARC-002", "ARC-003", "ARC-004"]);
  assert.equal(scan.findings.at(-1).severity, "medium", "strongest first");
  assert.equal(scan.analysis, "static");
});

test("source scope skips tests; all scope includes them; node_modules is never crawled", async () => {
  const root = makeFixture();
  const source = await runScan(root, { scope: "source", save: false });
  assert.equal(at(source, "tests/legacy.test.js").length, 0);
  const all = await runScan(root, { scope: "all", save: false });
  assert.deepEqual(at(all, "tests/legacy.test.js").map((f) => [f.ruleId, f.line]), [["weak-hash", 1]]);
  assert.ok(!all.findings.some((f) => f.file.startsWith("node_modules/")));
});

test("a secret is never copied into the scan record", async () => {
  const root = makeFixture();
  const scan = await runScan(root);
  const secret = at(scan, "src/config.js")[0];
  assert.equal(secret.ruleId, "hardcoded-secret");
  assert.equal(secret.line, 2);
  assert.equal(secret.redacted, true);
  const saved = fs.readFileSync(path.join(root, ".arcade", "last-scan.json"), "utf8");
  assert.ok(!saved.includes(FAKE_KEY), "last-scan.json contains the secret");
  assert.ok(!JSON.stringify(scan).includes(FAKE_KEY), "the scan result contains the secret");
  assert.match(fs.readFileSync(path.join(root, ".arcade", ".gitignore"), "utf8"), /last-scan\.json/);
});

test("the saved scan round-trips, is found from a sub-folder, and is not rescanned", async () => {
  const root = makeFixture();
  const first = await runScan(root);
  const loaded = loadScan(path.join(root, "src"));
  assert.equal(loaded.root, root);
  assert.equal(loaded.findings.length, first.findings.length);
  assert.equal(findFinding(loaded, "arc-2").id, "ARC-002");
  assert.equal(findFinding(loaded, "2").id, "ARC-002");
  assert.throws(() => findFinding(loaded, "ARC-999"), /No finding ARC-999/);

  const again = await runScan(root);
  assert.equal(again.findings.length, first.findings.length, ".arcade/last-scan.json must not be scanned as source");
  assert.ok(!again.findings.some((f) => f.file.startsWith(".arcade/")));
});

test("loadScan says what to do when nothing was scanned", () => {
  assert.throws(() => loadScan(tempDir()), (e) => e.code === "NO_SCAN" && /Run "arcade scan"/.test(e.message));
});

test("init writes the config once, and only reports what it created", () => {
  const root = tempDir();
  const first = initProject(root);
  assert.deepEqual(first.created.sort(), [".arcade/.gitignore", ".arcade/config.json"]);
  assert.deepEqual(first.existing, []);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, ".arcade", "config.json"), "utf8")), { version: 1, scope: "source", failOn: "high", ignore: [] });

  fs.writeFileSync(path.join(root, ".arcade", "config.json"), JSON.stringify({ scope: "all", failOn: "low", ignore: ["legacy/"] }));
  const second = initProject(root);
  assert.deepEqual(second.created, []);
  assert.deepEqual(second.existing, [".arcade/config.json"]);
  assert.equal(loadConfig(root).config.scope, "all", "init must not overwrite an existing config");
});

test("config is honoured: scope, ignore globs; a broken config is an error", async () => {
  const root = makeFixture();
  write(root, ".arcade/config.json", JSON.stringify({ scope: "all", failOn: "medium", ignore: ["src/db.js", "tests/"] }));
  const scan = await runScan(root);
  assert.equal(scan.scope, "all");
  assert.equal(at(scan, "src/db.js").length, 0);
  assert.equal(at(scan, "tests/legacy.test.js").length, 0);
  assert.equal(at(scan, "src/hash.js").length, 1);

  write(root, ".arcade/config.json", '{ "scope": "everything" }');
  await assert.rejects(runScan(root), (e) => e.code === "BAD_CONFIG" && /"scope" must be one of/.test(e.message));
  write(root, ".arcade/config.json", "{ not json");
  await assert.rejects(runScan(root), (e) => e.code === "BAD_CONFIG");
});

test("atOrAbove implements the --fail-on threshold", async () => {
  const scan = await runScan(makeFixture(), { save: false });
  assert.equal(atOrAbove(scan.findings, "critical").length, 0);
  assert.equal(atOrAbove(scan.findings, "high").length, 3);
  assert.equal(atOrAbove(scan.findings, "low").length, 4);
  assert.equal(atOrAbove(scan.findings, "none").length, 0);
});

test("ignore globs", () => {
  const ig = compileIgnore(["fixtures", "legacy/", "src/gen/**", "*.min.js", "# comment", ""]);
  assert.equal(ig("a/b/fixtures", "dir"), true);
  assert.equal(ig("fixtures", "file"), true);
  assert.equal(ig("legacy", "dir"), true);
  assert.equal(ig("legacy", "file"), false);
  assert.equal(ig("src/gen/a/b.ts", "file"), true);
  assert.equal(ig("other/src/gen/a.ts", "file"), false);
  assert.equal(ig("app/x.min.js", "file"), true);
  assert.equal(ig("src/index.ts", "file"), false);
});

test("node fs: text, binary, too large, '/'-separated paths, and no way out of the root", async () => {
  const root = tempDir();
  const outside = tempDir();
  write(outside, "secret.js", 'const h = require("crypto").createHash("md5");\n');
  write(root, "a/b/c.txt", "hello\n");
  fs.writeFileSync(path.join(root, "blob.bin"), Buffer.from([1, 2, 0, 3]));
  fs.writeFileSync(path.join(root, "big.txt"), Buffer.alloc(1.5 * 1024 * 1024 + 1, 0x61));
  write(root, ".git/config", "[core]\n");

  const wfs = nodeFs(root);
  const top = await wfs.list("");
  assert.deepEqual(top.map((e) => `${e.kind}:${e.path}`), ["dir:a", "file:big.txt", "file:blob.bin"], "folders first; .git hidden");
  assert.deepEqual((await wfs.list("a/b")).map((e) => e.path), ["a/b/c.txt"]);
  assert.deepEqual(await wfs.read("a/b/c.txt"), { kind: "text", size: 6, text: "hello\n" });
  assert.equal((await wfs.read("blob.bin")).kind, "binary");
  assert.equal((await wfs.read("big.txt")).kind, "too-large");

  await assert.rejects(wfs.read("../outside.txt"), /outside the project/);
  await assert.rejects(wfs.read(path.join(outside, "secret.js")), /outside the project/);
  await assert.rejects(wfs.list(".."), /outside the project/);

  // A link that points out of the root is listed, but nothing behind it can be read.
  let linked = true;
  try {
    fs.symlinkSync(outside, path.join(root, "escape"), "junction");
  } catch {
    linked = false; // no permission to create links on this machine
  }
  if (linked) {
    await assert.rejects(wfs.list("escape"), /outside the project/);
    await assert.rejects(wfs.read("escape/secret.js"), /outside the project/);
    const scan = await runScan(root, { scope: "all", save: false });
    assert.equal(scan.findings.length, 0, "files behind an escaping link must not be scanned");
  }
});
