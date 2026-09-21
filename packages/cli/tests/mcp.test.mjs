import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { after, test } from "node:test";
import { FAKE_KEY, cleanup, makeFixture, sealedEnv, startMcp, tempDir } from "./helpers.mjs";

after(cleanup);

test("MCP over stdio: initialize → tools/list → a real scan → evidence, propose, verify", async () => {
  const root = makeFixture();
  const mcp = startMcp({ cwd: root });
  try {
    const init = await mcp.call("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "0" } });
    assert.equal(init.result.protocolVersion, "2024-11-05");
    assert.equal(init.result.serverInfo.name, "arcade");
    assert.deepEqual(init.result.capabilities, { tools: {} });
    mcp.notify("notifications/initialized");
    assert.deepEqual((await mcp.call("ping")).result, {});

    const { tools } = (await mcp.call("tools/list")).result;
    const names = tools.map((t) => t.name);
    for (const n of ["arcade_scan", "arcade_get_findings", "arcade_get_evidence", "arcade_get_attack_surface", "arcade_get_status", "arcade_propose_fix", "arcade_verify_fix", "arcade_request_approval", "arcade_sandbox_test", "arcade_sandbox_list"]) assert.ok(names.includes(n), n);
    assert.ok(!names.includes("arcade_run_attack"), "the fictional attack tool is gone");
    for (const t of tools) assert.equal(t.inputSchema.type, "object");

    // Before any scan: a clear error, never sample data.
    const early = await mcp.tool("arcade_get_findings");
    assert.match(early.error.message, /Run "arcade scan"/);

    const scan = (await mcp.tool("arcade_scan")).result;
    assert.equal(scan.root, root);
    assert.equal(scan.analysis, "static");
    assert.equal(scan.counts.total, 4);
    const hash = scan.findings.find((f) => f.ruleId === "weak-hash");
    assert.deepEqual([hash.file, hash.line, hash.fix], ["src/hash.js", 4, "rewrite"]);
    assert.ok(fs.existsSync(path.join(root, ".arcade", "last-scan.json")));

    const found = (await mcp.tool("arcade_get_findings", { severity: "high" })).result;
    assert.equal(found.findings.length, 3);
    assert.ok(!JSON.stringify(found).includes("acme"));

    const secretId = scan.findings.find((f) => f.ruleId === "hardcoded-secret").id;
    const evidence = (await mcp.tool("arcade_get_evidence", { id: secretId })).result;
    assert.equal(evidence.file, "src/config.js");
    assert.ok(!JSON.stringify(evidence).includes(FAKE_KEY), "the agent was handed the secret");

    const surface = (await mcp.tool("arcade_get_attack_surface")).result;
    assert.ok(surface.surface.nodes.length >= 7);
    assert.equal((await mcp.tool("arcade_get_status")).result.open.total, 4);

    const proposal = (await mcp.tool("arcade_propose_fix", { id: hash.id })).result;
    assert.equal(proposal.concrete, true);
    assert.equal(proposal.applied, false);
    assert.match(proposal.patch, /\+  return createHash\("sha256"\)/);
    assert.match(fs.readFileSync(path.join(root, "src/hash.js"), "utf8"), /md5/, "proposing must not write");

    const sqlId = scan.findings.find((f) => f.ruleId === "sql-injection").id;
    const none = (await mcp.tool("arcade_propose_fix", { id: sqlId })).result;
    assert.equal(none.concrete, false);
    assert.equal(none.patch, null);
    assert.ok(!JSON.stringify(none).includes("FIXME"));

    assert.equal((await mcp.tool("arcade_verify_fix", { id: hash.id })).result.outcome, "failed");
    const file = path.join(root, "src/hash.js");
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace('"md5"', '"sha256"'));
    const verified = (await mcp.tool("arcade_verify_fix", { id: hash.id })).result;
    assert.equal(verified.outcome, "verified");
    assert.equal(verified.closed, true);

    assert.match((await mcp.tool("arcade_get_evidence", { id: "ARC-999" })).error.message, /No finding/);
    assert.equal((await mcp.call("tools/call", { name: "nope", arguments: {} })).error.code, -32000);
    assert.equal((await mcp.call("resources/list")).error.code, -32601);
  } finally {
    await mcp.close();
  }
});

test("arcade_scan refuses a path outside the server's working directory", async () => {
  const root = makeFixture();
  const outside = tempDir();
  const mcp = startMcp({ cwd: path.join(root, "src") });
  try {
    for (const p of ["..", outside, "../../"]) {
      const r = await mcp.tool("arcade_scan", { path: p });
      assert.match(r.error.message, /outside this project/, p);
    }
    assert.ok(!fs.existsSync(path.join(root, ".arcade")) && !fs.existsSync(path.join(outside, ".arcade")));
    const inside = (await mcp.tool("arcade_scan", { path: "." })).result;
    assert.equal(inside.root, path.join(root, "src"));
  } finally {
    await mcp.close();
  }
});

test("approval without an API is an explicit 'unavailable', never a fake 'pending'", async () => {
  const mcp = startMcp({ cwd: tempDir() });
  try {
    const r = (await mcp.tool("arcade_request_approval", { action: "merge the fix" })).result;
    assert.equal(r.status, "unavailable");
    assert.match(r.reason, /ARCADE_API_URL and ARCADE_TOKEN are not set/);
    assert.match(r.reason, /Nobody has been asked/);
  } finally {
    await mcp.close();
  }
});

test("approval with an API configured calls the real endpoints", async () => {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body: body ? JSON.parse(body) : null });
      res.setHeader("content-type", "application/json");
      if (req.method === "POST" && req.url === "/v1/orgs/org_1/projects/prj_1/runs") return res.writeHead(201).end(JSON.stringify({ run: { id: "run_9" } }));
      if (req.method === "POST" && req.url === "/v1/orgs/org_1/projects/prj_1/runs/run_9/approvals") return res.writeHead(201).end(JSON.stringify({ approval: { id: "apr_7", status: "pending", ...JSON.parse(body) } }));
      if (req.method === "GET" && req.url === "/v1/orgs/org_1/projects/prj_1/runs/run_9/approvals/apr_7") return res.end(JSON.stringify({ approval: { id: "apr_7", status: "approved", kind: "ship", title: "merge the fix" } }));
      res.writeHead(404).end(JSON.stringify({ error: { code: "not_found", message: "Run not found" } }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const token = "arc_test_token_value";

  const mcp = startMcp({ cwd: tempDir(), env: sealedEnv({ ARCADE_API_URL: url, ARCADE_TOKEN: token, ARCADE_ORG_ID: "org_1", ARCADE_PROJECT_ID: "prj_1" }) });
  try {
    const asked = (await mcp.tool("arcade_request_approval", { action: "merge the fix", kind: "ship", reason: "verified", target: "main" })).result;
    assert.deepEqual([asked.status, asked.approvalId, asked.runId, asked.runCreated], ["pending", "apr_7", "run_9", true]);
    assert.deepEqual(seen[0].body, { profile: "scan", source: "mcp" });
    assert.deepEqual(seen[1].body, { kind: "ship", title: "merge the fix", reason: "verified", target: "main" });
    assert.ok(seen.every((s) => s.auth === `Bearer ${token}`));
    assert.ok(!JSON.stringify(asked).includes(token), "the token must never be returned");

    const polled = (await mcp.tool("arcade_get_approval", { id: "apr_7", runId: "run_9" })).result;
    assert.equal(polled.status, "approved");

    const missing = await mcp.tool("arcade_get_approval", { id: "apr_404", runId: "run_9" });
    assert.match(missing.error.message, /404 \(not_found\)/);
  } finally {
    await mcp.close();
    server.close();
  }

  // Configured API but no org/project: fail clearly rather than guess.
  const bare = startMcp({ cwd: tempDir(), env: sealedEnv({ ARCADE_API_URL: url, ARCADE_TOKEN: token }) });
  try {
    assert.match((await bare.tool("arcade_request_approval", { action: "x" })).error.message, /ARCADE_ORG_ID and ARCADE_PROJECT_ID are missing/);
  } finally {
    await bare.close();
  }
  // A token is never sent over plain http to a remote host.
  const insecure = startMcp({ cwd: tempDir(), env: sealedEnv({ ARCADE_API_URL: "http://api.example.com", ARCADE_TOKEN: token, ARCADE_ORG_ID: "o", ARCADE_PROJECT_ID: "p" }) });
  try {
    assert.match((await insecure.tool("arcade_request_approval", { action: "x" })).error.message, /must be https/);
  } finally {
    await insecure.close();
  }
});
