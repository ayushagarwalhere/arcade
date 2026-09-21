#!/usr/bin/env node
// Arcade MCP server.
//
// A dependency-free Model Context Protocol server over stdio (newline-delimited
// JSON-RPC 2.0). It lets a coding agent — Claude Code, Codex, etc. — scan the
// project it is working in and read real results back. Every tool reports on the
// folder the server was started in; none of them returns sample data.
//
// What an agent can and cannot do through it:
//   - scan and read: `arcade_scan` runs the real static scanner over the server's
//     working directory (or a folder inside it, never outside), and the read tools
//     return that scan. Credential values are redacted.
//   - fixes: `arcade_propose_fix` returns a patch; it writes nothing. The agent
//     edits files with its own tools, then `arcade_verify_fix` re-runs the rule.
//   - approvals: it can ask a person and poll for the answer through the Arcade
//     API. There is no tool that grants one, and without an API configured the
//     answer is an explicit "unavailable", never a pretend "pending".
//   - sandboxes: real Docker, network cut (sandbox.mjs).
//
// Register with Claude Code:  arcade connect claude
//   or by hand:               claude mcp add arcade -- npx -y -p arcade-security arcade-mcp

import fs from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { getApproval, requestApproval } from "./approvals.mjs";
import { proposeFix, verifyFinding } from "./fix.mjs";
import { SCOPES, SEVERITIES, VERSION, findFinding, loadConfig, loadScan, runScan, sortFindings, summarize } from "./project.mjs";
import { listSandboxes, runTests } from "./sandbox.mjs";

const str = (description) => ({ type: "string", description });
const ID = { id: str("Finding id from the last scan, e.g. ARC-001") };

const TOOLS = [
  {
    name: "arcade_scan",
    description: "Run Arcade's static security scan over this project (or a folder inside it) and save the result. Real analysis of the files on disk: nothing is executed and nothing leaves the machine. Returns the findings with file and line.",
    inputSchema: { type: "object", properties: { path: str("Folder to scan, relative to the project. Defaults to the project root."), scope: { type: "string", enum: SCOPES, description: "source (default) skips tests, fixtures and docs; all scans everything." } } },
  },
  { name: "arcade_get_findings", description: "Findings from the last scan of this project, strongest first, with file, line, status and whether Arcade has an automatic rewrite.", inputSchema: { type: "object", properties: { severity: { type: "string", enum: SEVERITIES, description: "Only findings at or above this severity." } } } },
  { name: "arcade_get_evidence", description: "Everything about one finding: location, the flagged code, why it matters, root cause and ranked mitigations. Static evidence — the pattern was matched in source; no exploit was run.", inputSchema: { type: "object", properties: ID, required: ["id"] } },
  { name: "arcade_get_attack_surface", description: "The project profile and the attack-surface layers the findings land on, modelled from the last scan.", inputSchema: { type: "object", properties: {} } },
  { name: "arcade_get_status", description: "Summary of the last scan: when, how many files, open and fixed findings by severity.", inputSchema: { type: "object", properties: {} } },
  { name: "arcade_propose_fix", description: "The rule set's own patch for a finding, as a unified diff, computed against the file on disk. Writes nothing. `concrete: false` means Arcade has no automatic rewrite for that rule and you need to write the fix yourself from the mitigations.", inputSchema: { type: "object", properties: ID, required: ["id"] } },
  { name: "arcade_verify_fix", description: "After you change the code: re-run the finding's rule over the file on disk and report whether the flagged code is gone. A static re-check, not a test run.", inputSchema: { type: "object", properties: ID, required: ["id"] } },
  {
    name: "arcade_request_approval",
    description: "Ask a person to approve a high-impact action through the Arcade API. Returns the recorded approval (pending until a signed-in person decides), or status `unavailable` when no API is configured — in which case nobody was asked.",
    inputSchema: { type: "object", properties: { action: str("What needs approving, in one line."), kind: { type: "string", enum: ["code", "destructive", "ship"] }, reason: str("Why it is needed."), target: str("What it touches: a file, branch or environment.") }, required: ["action"] },
  },
  { name: "arcade_get_approval", description: "Poll an approval requested with arcade_request_approval.", inputSchema: { type: "object", properties: { id: str("approvalId"), runId: str("runId returned with it") }, required: ["id"] } },
  { name: "arcade_sandbox_test", description: "Build a fresh Docker sandbox from a project (or a git ref of it), run its tests with the network cut, then destroy the sandbox. Real, not simulated.", inputSchema: { type: "object", properties: { path: { type: "string" }, ref: { type: "string" }, command: { type: "string" } } } },
  { name: "arcade_sandbox_list", description: "List live sandboxes as reported by the Docker daemon.", inputSchema: { type: "object", properties: {} } },
];

/** A folder the agent named: the project itself, or somewhere inside it. Symlinks are resolved first. */
function insideProject(rel) {
  const cwd = fs.realpathSync(process.cwd());
  if (rel == null || rel === "" || rel === ".") return cwd;
  if (typeof rel !== "string" || rel.includes("\0")) throw new Error("`path` must be a folder inside this project.");
  let target;
  try {
    target = fs.realpathSync(path.resolve(cwd, rel));
  } catch {
    throw new Error(`No such folder: ${rel}`);
  }
  const within = path.relative(cwd, target);
  if (within === ".." || within.startsWith(`..${path.sep}`) || path.isAbsolute(within)) throw new Error(`${rel} is outside this project (${cwd}). This server only scans the folder it was started in.`);
  return target;
}

/** The folder last scanned in this session; the read tools follow it. Defaults to the project root. */
let lastRoot = null;
const lastScan = () => loadScan(lastRoot ?? process.cwd());

const cloudIds = () => {
  try {
    return loadConfig(process.cwd()).config.cloud ?? {};
  } catch {
    return {};
  }
};

async function call(name, a = {}) {
  switch (name) {
    case "arcade_scan": {
      if (a.scope !== undefined && !SCOPES.includes(a.scope)) throw new Error(`scope must be one of ${SCOPES.join(", ")}.`);
      const r = await runScan(insideProject(a.path), { scope: a.scope });
      lastRoot = r.root;
      return { root: r.root, analysis: "static", scannedAt: r.scannedAt, scope: r.scope, stats: r.stats, counts: r.counts, findings: r.findings.map(summarize), note: "Use arcade_get_evidence for one finding, arcade_propose_fix for a patch, arcade_verify_fix after changing code." };
    }
    case "arcade_get_findings": {
      if (a.severity !== undefined && !SEVERITIES.includes(a.severity)) throw new Error(`severity must be one of ${SEVERITIES.join(", ")}.`);
      const scan = lastScan();
      const list = sortFindings(scan.findings).filter((f) => !a.severity || SEVERITIES.indexOf(f.severity) <= SEVERITIES.indexOf(a.severity));
      return { root: scan.root, scannedAt: scan.scannedAt, findings: list.map(summarize) };
    }
    case "arcade_get_evidence": {
      const f = findFinding(lastScan(), a.id);
      return { ...f, analysis: "static", note: "The pattern was matched in source. Nothing was executed and no request was sent." };
    }
    case "arcade_get_attack_surface": {
      const scan = lastScan();
      return { root: scan.root, project: scan.project, surface: scan.surface, note: "Modelled from static analysis: a layer is marked vulnerable when a finding's category lands on it. No exploit was run." };
    }
    case "arcade_get_status": {
      const scan = lastScan();
      const open = scan.findings.filter((f) => f.status !== "fixed");
      return { root: scan.root, scannedAt: scan.scannedAt, tool: scan.tool, analysis: "static", scope: scan.scope, files: scan.stats, open: { ...Object.fromEntries(SEVERITIES.map((s) => [s, open.filter((f) => f.severity === s).length])), total: open.length }, fixed: scan.findings.length - open.length };
    }
    case "arcade_propose_fix": {
      const scan = lastScan();
      const f = findFinding(scan, a.id);
      const p = await proposeFix(scan.root, f);
      if (!p.concrete) return { id: f.id, ruleId: f.ruleId, file: f.file, line: p.line, concrete: false, patch: null, reason: p.reason, mitigations: f.mitigations };
      return { id: f.id, ruleId: f.ruleId, file: f.file, line: p.line, concrete: true, safe: p.safe, mode: p.mode, note: p.note, warnings: p.warnings, patch: p.patch, expected: p.expected, applied: false };
    }
    case "arcade_verify_fix": {
      const scan = lastScan();
      const f = findFinding(scan, a.id);
      const v = await verifyFinding(scan.root, f);
      return { id: f.id, ruleId: f.ruleId, file: f.file, outcome: v.closed ? "verified" : "failed", ...v, note: "Static re-check: the rule that raised the finding was re-run over the file on disk." };
    }
    case "arcade_request_approval":
      return requestApproval(a, { cloud: cloudIds() });
    case "arcade_get_approval":
      return getApproval(a, { cloud: cloudIds() });
    case "arcade_sandbox_test": {
      const steps = [];
      const result = await runTests({ dir: a.path, ref: a.ref, command: a.command, onStep: (step, detail) => steps.push({ step, detail }) });
      return { ...result, steps };
    }
    case "arcade_sandbox_list":
      return listSandboxes();
    default:
      throw new Error(`unknown tool ${name}`);
  }
}

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

const rl = createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  const text = line.trim();
  if (!text) return;
  let req;
  try {
    req = JSON.parse(text);
  } catch {
    return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
  }
  const { id, method, params } = req;
  // notifications carry no id → no response
  if (id === undefined || id === null) return;

  try {
    if (method === "initialize") {
      return send({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "arcade", version: VERSION },
          instructions: "Arcade scans the project this server was started in. Call arcade_scan first; the other tools read that scan. Findings are static: a weak pattern matched in source, with file and line.",
        },
      });
    }
    if (method === "tools/list") {
      return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    }
    if (method === "tools/call") {
      const result = await call(params?.name, params?.arguments || {});
      return send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] } });
    }
    if (method === "ping") {
      return send({ jsonrpc: "2.0", id, result: {} });
    }
    send({ jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } });
  } catch (e) {
    send({ jsonrpc: "2.0", id, error: { code: -32000, message: String(e.message || e) } });
  }
});
