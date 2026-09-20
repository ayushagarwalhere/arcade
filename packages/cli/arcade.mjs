#!/usr/bin/env node
// Arcade CLI — drive the security ADE from the terminal, or from another agent.
//
// This reference build reads a deterministic snapshot (arcade-data.mjs) so the
// commands are real and scriptable today; a full build wires the same commands
// to a live run. Prefer `--json` for agent integrations.

import { SNAPSHOT, findingById } from "./arcade-data.mjs";
import { sandboxCli } from "./sandbox.mjs";
import { AGENT_IDS, agentStatus, connectAgent, disconnectAgent, listAgents } from "./connect.mjs";

const args = process.argv.slice(2);
const json = args.includes("--json");
const positional = args.filter((a) => !a.startsWith("-"));
const [cmd = "help", arg1] = positional;

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  amber: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
};
const SEV = { critical: C.red, high: C.amber, medium: C.amber, low: C.dim };
const out = (obj) => console.log(JSON.stringify(obj, null, 2));

function help() {
  console.log(`${C.b("arcade")} — security ADE for AI-generated software

${C.b("Usage")}
  arcade <command> [target] [--json]

${C.b("Commands")}
  init                 Set up Arcade in the current repository
  scan <path>          Run the full security loop (map → attack → verify)
  map                  Build the security map / attack surface
  attack               Reproduce exploits in the isolated sandbox
  findings             List findings with severity and status
  evidence <id>        Print the evidence trail for a finding
  verify <id>          Independently re-run the original attack
  status [--json]      Machine-readable agent/run state
  sandbox <sub>        Real Docker sandboxes: create, test, exec, ls, destroy
  agents               Show which coding agents Arcade is connected to
  connect [agent]      Register Arcade's MCP server with claude, codex, or both
  disconnect [agent]   Remove it again
  help                 Show this help

${C.b("Examples")}
  arcade scan .
  arcade findings --json
  arcade evidence ARC-001
  arcade status --json`);
}

function status() {
  if (json) {
    return out({
      run: SNAPSHOT.run,
      phase: SNAPSHOT.phase,
      environment: SNAPSHOT.environment,
      agents: SNAPSHOT.agents,
      findings: SNAPSHOT.findings.map((f) => ({ id: f.id, severity: f.severity, status: f.status })),
    });
  }
  console.log(`${C.b("Run")} ${SNAPSHOT.run}  ${C.dim("· phase")} ${C.cyan(SNAPSHOT.phase)}`);
  console.log(`${C.dim("Target")} ${SNAPSHOT.environment.sandboxId} (isolated, disposable, network: ${SNAPSHOT.environment.network})`);
  console.log(`\n${C.b("Agents")}`);
  for (const [k, v] of Object.entries(SNAPSHOT.agents)) {
    const dot = v === "done" ? C.green("●") : C.amber("●");
    console.log(`  ${dot} ${k.padEnd(12)} ${v}`);
  }
  console.log(`\n${C.b("Findings")} ${SNAPSHOT.findings.length}`);
}

function findings() {
  if (json) return out(SNAPSHOT.findings.map((f) => ({ id: f.id, title: f.title, severity: f.severity, status: f.status, target: f.target })));
  console.log(`${C.b("Findings")} — ${SNAPSHOT.project.repo}\n`);
  for (const f of SNAPSHOT.findings) {
    const sev = (SEV[f.severity] || ((s) => s))(f.severity.toUpperCase().padEnd(8));
    const st = f.status === "verified" ? C.green(f.status) : f.status;
    console.log(`  ${C.dim(f.id)}  ${sev}  ${f.title}  ${C.dim("[" + st + "]")}`);
  }
}

function evidence(id) {
  const f = findingById(id);
  if (!f) return fail(`no finding ${id}`);
  if (!f.evidence) return fail(`no evidence captured for ${f.id}`);
  if (json) return out({ id: f.id, evidence: f.evidence, verification: f.verification });
  console.log(`${C.b(f.id)} ${f.title}  ${C.dim(f.cwe)}\n`);
  console.log(`${C.b("Request")}   ${f.evidence.method} ${f.evidence.target}`);
  console.log(`${C.b("Response")}  ${C.red(f.evidence.statusBefore)} (unauthorized access confirmed)`);
  console.log(`${C.b("Repro")}`);
  f.evidence.reproduction.forEach((s, i) => console.log(`  ${i + 1}. ${s}`));
  console.log(`${C.dim("Artifact: " + f.evidence.artifact)}`);
}

function verify(id) {
  const f = findingById(id);
  if (!f) return fail(`no finding ${id}`);
  const v = f.verification;
  if (!v || v.outcome !== "verified") {
    if (json) return out({ id: f.id, verification: v || { outcome: "pending" } });
    return console.log(`${f.id} verification: ${(v && v.outcome) || "pending"}`);
  }
  if (json) return out({ id: f.id, ...v });
  console.log(`${C.green("VERIFIED")} ${f.id}\n`);
  console.log(`  Original exploit: ${f.target}`);
  console.log(`  Previous: ${C.red(v.statusBefore)}   Current: ${C.green(v.statusAfter)}`);
  console.log(`  Mutations: ${v.mutatedSucceeded}/${v.mutatedPayloads} succeeded · regression ${v.regression}`);
  console.log(`  ${C.dim(v.independent ? "Verifier ran independently, with no memory of the fix." : "")}`);
}

function surface() {
  if (json) return out(SNAPSHOT.attackSurface);
  console.log(`${C.b("Attack surface")} — ${SNAPSHOT.project.endpoints} endpoints, ${SNAPSHOT.project.authBoundaries} auth boundaries\n`);
  for (const n of SNAPSHOT.attackSurface.nodes) {
    const mark = n.risk === "vulnerable" ? C.red("✗") : n.risk === "attention" ? C.amber("!") : C.green("·");
    console.log(`  ${mark} ${n.label.padEnd(18)} ${C.dim(n.risk)}`);
  }
  console.log(`\n${C.b("Exploit path")}  ${SNAPSHOT.attackSurface.exploitPath.join(" → ")}`);
}

function loop(kind, path) {
  const steps =
    kind === "scan"
      ? ["map", "attack", "evidence", "defend", "approve (human)", "remediate", "test", "verify"]
      : kind === "attack"
        ? ["spawn sandbox", "probe endpoints", "reproduce exploit", "capture evidence"]
        : ["index files", "identify services", "build attack surface"];
  if (json) return out({ started: kind, target: path || ".", steps, note: kind === "scan" ? "stops at the human approval gate" : undefined });
  console.log(`${C.b("arcade " + kind)} ${path || "."}  ${C.dim("· " + SNAPSHOT.environment.sandboxId)}`);
  steps.forEach((s) => console.log(`  ${C.green("●")} ${s}`));
  if (kind === "scan") console.log(`\n${C.amber("!")} Pauses for your approval before changing code. Run ${C.b("arcade findings")} to review.`);
}

function printAgent(a) {
  const state = a.error ? C.red("error") : !a.installed ? C.dim("not installed") : a.outdated ? C.amber("connected (elsewhere)") : a.connected ? C.green("connected") : "not connected";
  console.log(`  ${a.connected && !a.error ? C.green("●") : C.dim("○")} ${a.name.padEnd(12)} ${state}  ${C.dim(a.configPath)}`);
  if (a.error) console.log(`    ${a.error}`);
}

// No agent named → every agent installed here. Naming one that isn't installed is an error.
function agents(change, which) {
  let results;
  try {
    const ids = which ? [which] : change === connectAgent ? listAgents().filter((a) => a.installed).map((a) => a.id) : AGENT_IDS;
    results = ids.map((id) => (change ? change(id) : agentStatus(id)));
  } catch (e) {
    return fail(e.message);
  }
  if (json) return out(results);
  if (!results.length) return fail("no supported coding agent found. Arcade connects to Claude Code and Codex.");
  console.log(`${C.b("Coding agents")}\n`);
  results.forEach(printAgent);
  if (change === connectAgent) console.log(`\nRestart the agent, then ask it to ${C.b("scan this project with Arcade")}. In Claude Code, ${C.b("/mcp")} lists the tools.`);
  else if (results.some((a) => a.outdated)) console.log(`\n${C.amber("!")} Connected to an Arcade server somewhere else on disk. Run ${C.b("arcade connect")} to repoint it here.`);
}

function fail(msg) {
  console.error(`arcade: ${msg}`);
  process.exitCode = 1;
}

switch (cmd) {
  case "init":
    json ? out({ ok: true, created: [".arcade/config.json"], next: "arcade scan ." }) : console.log(`${C.green("✓")} Initialized Arcade. Next: ${C.b("arcade scan .")}`);
    break;
  case "scan":
    loop("scan", arg1);
    break;
  case "map":
    surface();
    break;
  case "attack":
    loop("attack", arg1);
    break;
  case "findings":
    findings();
    break;
  case "evidence":
    evidence(arg1);
    break;
  case "verify":
    verify(arg1);
    break;
  case "status":
    status();
    break;
  case "sandbox":
    // Real Docker sandboxes; has its own flags, so it parses the raw argv itself.
    await sandboxCli(args.slice(args.indexOf("sandbox") + 1));
    break;
  case "agents":
    agents(null);
    break;
  case "connect":
    agents(connectAgent, arg1);
    break;
  case "disconnect":
    agents(disconnectAgent, arg1);
    break;
  case "help":
  case "--help":
  case "-h":
    help();
    break;
  default:
    fail(`unknown command "${cmd}". Try "arcade help".`);
}
