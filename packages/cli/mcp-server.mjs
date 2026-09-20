#!/usr/bin/env node
// Arcade MCP server (reference build).
//
// A dependency-free Model Context Protocol server over stdio (newline-delimited
// JSON-RPC 2.0). It lets a coding agent — Claude Code, Codex, etc. — drive the
// Arcade security workflow and read results back. Backed by the same snapshot
// the CLI uses; a full build wires these tools to a live run.
//
// Register with Claude Code:
//   claude mcp add arcade -- node ./packages/cli/mcp-server.mjs

import { createInterface } from "node:readline";
import { SNAPSHOT, findingById } from "./arcade-data.mjs";
import { listSandboxes, runTests } from "./sandbox.mjs";

const TOOLS = [
  { name: "arcade_scan", description: "Start a security workflow against a target path.", inputSchema: { type: "object", properties: { path: { type: "string" } } } },
  { name: "arcade_get_attack_surface", description: "Return the mapped attack-surface nodes and exploit path.", inputSchema: { type: "object", properties: {} } },
  { name: "arcade_get_findings", description: "Return findings with severity and status.", inputSchema: { type: "object", properties: {} } },
  { name: "arcade_get_evidence", description: "Return the reproduction and evidence for a finding.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "arcade_run_attack", description: "Run the attack loop in the isolated sandbox.", inputSchema: { type: "object", properties: {} } },
  { name: "arcade_request_approval", description: "Request human approval for a high-impact action.", inputSchema: { type: "object", properties: { action: { type: "string" } }, required: ["action"] } },
  { name: "arcade_verify_fix", description: "Independently re-run the original attack to verify a fix.", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] } },
  { name: "arcade_sandbox_test", description: "Build a fresh Docker sandbox from a project (or a git ref of it), run its tests with the network cut, then destroy the sandbox. Real, not simulated.", inputSchema: { type: "object", properties: { path: { type: "string" }, ref: { type: "string" }, command: { type: "string" } } } },
  { name: "arcade_sandbox_list", description: "List live sandboxes as reported by the Docker daemon.", inputSchema: { type: "object", properties: {} } },
  { name: "arcade_get_status", description: "Return machine-readable run/agent state.", inputSchema: { type: "object", properties: {} } },
];

async function call(name, a = {}) {
  switch (name) {
    case "arcade_scan":
      return { started: "scan", target: a.path || ".", run: SNAPSHOT.run, note: "Runs map → attack → verify; pauses at the human approval gate." };
    case "arcade_get_attack_surface":
      return SNAPSHOT.attackSurface;
    case "arcade_get_findings":
      return SNAPSHOT.findings.map((f) => ({ id: f.id, title: f.title, severity: f.severity, status: f.status, target: f.target, cwe: f.cwe }));
    case "arcade_get_evidence": {
      const f = findingById(a.id);
      if (!f) throw new Error(`no finding ${a.id}`);
      return { id: f.id, evidence: f.evidence || null, verification: f.verification || null };
    }
    case "arcade_run_attack":
      return { sandbox: SNAPSHOT.environment.sandboxId, reproduced: ["ARC-001"], note: "Attacks run in an isolated, disposable sandbox with no network." };
    case "arcade_request_approval":
      return { action: a.action, status: "pending", note: "Waiting for the human to approve or reject in the ADE." };
    case "arcade_verify_fix": {
      const f = findingById(a.id);
      if (!f) throw new Error(`no finding ${a.id}`);
      return { id: f.id, verification: f.verification || { outcome: "pending" } };
    }
    case "arcade_sandbox_test": {
      const steps = [];
      const result = await runTests({ dir: a.path, ref: a.ref, command: a.command, onStep: (step, detail) => steps.push({ step, detail }) });
      return { ...result, steps };
    }
    case "arcade_sandbox_list":
      return listSandboxes();
    case "arcade_get_status":
      return { run: SNAPSHOT.run, phase: SNAPSHOT.phase, agents: SNAPSHOT.agents, environment: SNAPSHOT.environment };
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
    return;
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
          serverInfo: { name: "arcade", version: SNAPSHOT.version },
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
