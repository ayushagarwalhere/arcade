#!/usr/bin/env node
// Arcade CLI — static security analysis, verified fixes, Docker sandboxes and a
// bridge to the coding agents on this machine, from a terminal or a CI job.
//
// Everything here reports on the project it is run in. `arcade scan` runs the
// monorepo engine (engine.mjs) over real files and saves the result to
// .arcade/last-scan.json; the other commands read that scan. The only fictional
// data left is behind `arcade demo`, and it says so.
//
// Rules this file keeps:
//   - never print success for something that didn't happen; a dry run says "dry run"
//   - every command answers in JSON with --json, errors included
//   - exit codes are a contract: 0 ok · 1 findings at/above the threshold, or a fix
//     that didn't verify · 2 usage or runtime error
//   - the GitHub token is read from the environment and never echoed
//
// Dependency-free.

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { SNAPSHOT } from "./arcade-data.mjs";
import { UsageError, parseArgv } from "./argv.mjs";
import { AgentError, detectAgents, findAgentBinary, runAgent } from "./agent-runner.mjs";
import { AGENT_IDS, ConnectError, connectAgent, disconnectAgent, listAgents } from "./connect.mjs";
import { RULES, isConcrete } from "./engine.mjs";
import { FixError, agentPrompt, applyFix, defaultBranch, fixWithAgent, landFix, preflightLand, proposeFix, readTarget, verifyFinding, verifyText } from "./fix.mjs";
import { GitError, gitInfo } from "./git.mjs";
import { FsError } from "./node-fs.mjs";
import { ProjectError, SCOPES, SEVERITIES, VERSION, atOrAbove, findFinding, initProject, loadConfig, loadScan, runScan, sortFindings, summarize } from "./project.mjs";
import { ensureDocker, sandboxCli } from "./sandbox.mjs";
import { toSarif } from "./sarif.mjs";

const EXIT = { ok: 0, findings: 1, error: 2 };

const colour = process.env.FORCE_COLOR ? process.env.FORCE_COLOR !== "0" : !process.env.NO_COLOR && !!process.stdout.isTTY;
const paint = (code) => (s) => (colour ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const C = { dim: paint(2), b: paint(1), green: paint(32), red: paint(31), amber: paint(33), cyan: paint(36) };
const SEV = { critical: C.red, high: C.amber, medium: C.amber, low: C.dim };
const out = (obj) => console.log(JSON.stringify(obj, null, 2));
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

let json = false;

function fail(msg, code = EXIT.error) {
  if (json) out({ ok: false, error: msg });
  else console.error(`arcade: ${msg}`);
  process.exitCode = code;
}

/* --------------------------------------------------------------------- help */

function help() {
  console.log(`${C.b("arcade")} ${VERSION} — security analysis for AI-generated software

${C.b("Usage")}
  arcade <command> [arguments] [options]

${C.b("Scan")}  ${C.dim("static analysis: files are read, never executed; nothing leaves this machine")}
  init [path]          Write .arcade/config.json (scope, failOn, ignore globs)
  scan [path]          Scan a folder and save the result to .arcade/last-scan.json
                         --scope source|all     source skips tests, fixtures and docs (default: config, else source)
                         --fail-on <severity>   exit 1 if an open finding is at or above critical|high|medium|low
                         --sarif <file>         also write SARIF 2.1.0 for GitHub code scanning
  findings             List the findings of the last scan   ${C.dim("[--severity <s>] [--all]")}
  evidence <id>        Where a finding is, the code, why it matters, how to fix it
  map                  Project profile and the attack-surface layers the findings land on
  status               Summary of the last scan
  rules                The rule set: id, severity, CWE, and whether Arcade can rewrite it itself

${C.b("Fix")}
  fix <id>             Dry run: print the proposed patch. Nothing is written without --apply
                         --apply                write the change, then re-run the rule over the file
                         --agent <id>           have an installed coding agent write the fix (needs --apply to run)
                         --model <name>         model for that agent
                         --commit               commit the verified change (implies --apply)
                         --branch <name>        commit on a new branch
                         --push                 push the branch to origin
                         --pr                   open a pull request (needs GITHUB_TOKEN or GH_TOKEN)
                         --force                apply a rewrite flagged unsafe / commit when the check failed
  verify <id>          Re-run the finding's rule over the file as it is on disk now

${C.b("Agents")}
  agent "<prompt>"     Run an installed coding agent here and stream what it does   ${C.dim("[--agent <id>] [--edit] [--model <m>]")}
  agents               Coding agents Arcade can run, and which have Arcade's MCP server registered
  connect [agent]      Register Arcade's MCP server with claude, codex, or both
  disconnect [agent]   Remove it again

${C.b("Sandbox")}  ${C.dim("needs Docker")}
  sandbox <sub>        create · test · exec · ls · destroy   ${C.dim("(arcade sandbox help)")}

${C.b("Other")}
  doctor               Check this machine: Node, git, Docker, agents, GitHub token
  demo                 Print a fictional sample run. Not your code
  help, --version

${C.b("Global options")}
  --json               machine-readable output (errors too)
  --cwd <dir>          run as if started in <dir>

${C.b("Exit codes")}  0 ok · 1 findings at/above --fail-on, or a fix that did not verify · 2 error

${C.b("Examples")}
  arcade scan . --fail-on high --sarif arcade.sarif
  arcade evidence ARC-001
  arcade fix ARC-003 --apply --commit --branch fix/weak-hash
  arcade fix ARC-002 --agent claude-code --apply`);
}

/* --------------------------------------------------------------- init, scan */

function init(target) {
  const r = initProject(target || ".");
  if (json) return out({ ok: true, root: r.root, created: r.created, existing: r.existing, config: r.config, next: "arcade scan" });
  if (r.created.length) for (const f of r.created) console.log(`${C.green("✓")} created ${f}`);
  for (const f of r.existing) console.log(`${C.dim("·")} ${f} already exists, left as it is`);
  if (!r.created.length) console.log("Nothing to do: Arcade is already set up here.");
  console.log(`\n  scope ${C.b(r.config.scope)} · failOn ${C.b(r.config.failOn)} · ${plural(r.config.ignore.length, "ignore glob")}\n\nNext: ${C.b("arcade scan")}`);
}

const where = (f) => `${f.file}:${f.line}`;
const sevLabel = (f) => (SEV[f.severity] || String)(f.severity.toUpperCase().padEnd(8));
const fixLabel = (f) => (f.status === "fixed" ? C.green("fixed") : f.fix.kind === "rewrite" ? C.cyan("rewrite") : C.dim("agent"));

function printFindingRows(findings) {
  const w = Math.min(46, Math.max(...findings.map((f) => f.title.length)));
  const lw = Math.min(48, Math.max(...findings.map((f) => where(f).length)));
  for (const f of findings) console.log(`  ${C.dim(f.id)}  ${sevLabel(f)}  ${f.title.padEnd(w)}  ${C.dim(where(f).padEnd(lw))}  ${C.dim("[")}${fixLabel(f)}${C.dim("]")}`);
}

const countLine = (c) => SEVERITIES.map((s) => `${c[s]} ${s}`).join(", ");

async function scan(target, flags) {
  const scope = flags.scope;
  if (scope !== undefined && !SCOPES.includes(scope)) throw new UsageError(`--scope must be one of ${SCOPES.join(", ")}.`);
  const failFlag = flags["fail-on"];
  if (failFlag !== undefined && failFlag !== "none" && !SEVERITIES.includes(failFlag)) throw new UsageError(`--fail-on must be one of ${SEVERITIES.join(", ")}, none.`);

  const root = path.resolve(target || ".");
  const result = await runScan(root, { scope });
  const failOn = failFlag ?? loadConfig(root).config.failOn;
  const failing = atOrAbove(result.findings, failOn);

  let sarifPath = null;
  if (flags.sarif) {
    sarifPath = path.resolve(flags.sarif);
    fs.mkdirSync(path.dirname(sarifPath), { recursive: true });
    fs.writeFileSync(sarifPath, `${JSON.stringify(toSarif(result), null, 2)}\n`);
  }
  if (failing.length) process.exitCode = EXIT.findings;

  if (json) return out({ ...result, savedTo: path.join(root, ".arcade", "last-scan.json"), sarif: sarifPath, failOn, failed: failing.length > 0, failing: failing.map((f) => f.id) });

  const s = result.stats;
  console.log(`${C.b("arcade scan")} ${root}  ${C.dim(`· scope ${result.scope} · static analysis`)}`);
  console.log(`  ${C.green("●")} indexed ${plural(s.filesIndexed, "file")}, analysed ${s.filesScanned} (${(s.bytesScanned / 1024).toFixed(0)} KB) with ${plural(RULES.length, "rule")} in ${(result.durationMs / 1000).toFixed(1)}s`);
  if (result.scope === "source") console.log(C.dim("    tests, fixtures, examples and docs were skipped; use --scope all to include them"));
  if (s.truncated) console.log(`  ${C.amber("!")} stopped at the hit limit; the list below is incomplete. Narrow the scan with ignore globs.`);

  if (!result.findings.length) console.log(`\n${C.green("✓")} No findings from ${plural(RULES.length, "rule")}. That is not proof of security: see ${C.b("arcade rules")} for what is covered.`);
  else {
    console.log("");
    printFindingRows(result.findings);
    console.log(`\n${C.b(plural(result.counts.total, "finding"))}: ${countLine(result.counts)}`);
  }
  console.log(C.dim(`Saved ${path.join(".arcade", "last-scan.json")}${sarifPath ? ` · SARIF ${sarifPath}` : ""}`));
  if (failing.length) console.log(`\n${C.red("✗")} ${plural(failing.length, "finding")} at or above ${C.b(failOn)} (exit ${EXIT.findings})`);
  else if (failOn !== "none") console.log(`\n${C.green("✓")} nothing at or above ${C.b(failOn)}`);
  if (result.findings.length) console.log(`\nNext: ${C.b(`arcade evidence ${result.findings[0].id}`)} · ${C.b("arcade fix <id>")}`);
}

/* ------------------------------------------------------------ read the scan */

const age = (iso) => {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  return s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`;
};

function findings(flags) {
  if (flags.severity !== undefined && !SEVERITIES.includes(flags.severity)) throw new UsageError(`--severity must be one of ${SEVERITIES.join(", ")}.`);
  const scanned = loadScan();
  let list = sortFindings(scanned.findings);
  if (flags.severity) list = list.filter((f) => SEVERITIES.indexOf(f.severity) <= SEVERITIES.indexOf(flags.severity));
  if (!flags.all) list = list.filter((f) => f.status !== "fixed");
  if (json) return out(list.map(summarize));
  const fixed = scanned.findings.filter((f) => f.status === "fixed").length;
  console.log(`${C.b("Findings")} — ${scanned.root}  ${C.dim(`· scanned ${age(scanned.scannedAt)}`)}\n`);
  if (!list.length) console.log(`  ${C.green("✓")} none open${flags.severity ? ` at or above ${flags.severity}` : ""}`);
  else printFindingRows(list);
  if (fixed && !flags.all) console.log(C.dim(`\n${fixed} fixed and verified since the scan (--all shows them)`));
}

function printCode(f) {
  const width = String(Math.max(...f.vulnerableCode.lines.map((l) => l.no))).length;
  for (const l of f.vulnerableCode.lines) {
    const row = `${l.flagged ? ">" : " "} ${String(l.no).padStart(width)} │ ${l.text}`;
    console.log(`  ${l.flagged ? C.red(row) : C.dim(row)}`);
  }
}

function evidence(id) {
  const f = findFinding(loadScan(), id);
  if (json) return out({ ...f, analysis: "static", note: "The pattern was matched in source. Nothing was executed and no request was sent." });
  console.log(`${C.b(f.id)}  ${f.title}  ${sevLabel(f).trim()}  ${C.dim(f.cwe)}\n`);
  console.log(`${C.b("Location")}  ${where(f)}:${f.column}`);
  console.log(`${C.b("Rule")}      ${f.ruleId}  ${C.dim("static analysis: matched in source, nothing was executed")}`);
  if (f.matched) console.log(`${C.b("Matched")}   ${f.matched}`);
  if (f.redacted) console.log(C.dim("          the value is redacted here and in the saved scan"));
  console.log(`\n${C.b("Code")}`);
  printCode(f);
  console.log(`\n${C.b("Why it matters")}\n  ${f.attackNarrative}`);
  console.log(`\n${C.b("Root cause")}\n  ${f.rootCause}`);
  console.log(`\n${C.b("How to fix")}`);
  f.mitigations.forEach((m, i) => console.log(`  ${i + 1}. ${m.title}${m.recommended ? C.green(" (recommended)") : ""} ${C.dim(`· ${m.effort} effort`)}\n     ${C.dim(m.detail)}`));
  console.log("");
  if (f.status === "fixed") console.log(`${C.green("✓ fixed")} ${C.dim(f.verification?.summary ?? "")}`);
  else if (f.fix.kind === "rewrite") console.log(`${C.b("Fix")}  automatic rewrite available: ${C.b(`arcade fix ${f.id}`)} ${C.dim(`(${f.fix.note})`)}`);
  else console.log(`${C.b("Fix")}  no automatic rewrite for this rule. With a coding agent: ${C.b(`arcade fix ${f.id} --agent <id> --apply`)}`);
}

function surface() {
  const scanned = loadScan();
  const note = "Modelled from static analysis: the layers are fixed, and a layer is marked vulnerable when a finding's category lands on it. No exploit was run.";
  if (json) return out({ root: scanned.root, project: scanned.project, surface: scanned.surface, note });
  const p = scanned.project;
  console.log(`${C.b("Project")} ${p.name}  ${C.dim(p.repo)}`);
  console.log(`  ${p.technologies.join(" · ") || C.dim("no stack signals found")}`);
  console.log(C.dim(`  ${plural(p.endpoints, "route-like file")} · ${plural(scanned.stats.filesScanned, "file")} analysed`));
  console.log(`\n${C.b("Attack surface")}`);
  for (const n of scanned.surface.nodes) {
    const mark = n.risk === "vulnerable" ? C.red("✗") : n.risk === "attention" ? C.amber("!") : C.green("·");
    console.log(`  ${mark} ${n.label.padEnd(16)} ${C.dim(n.risk.padEnd(10))} ${C.dim(n.detail)}`);
  }
  if (scanned.findings.length) console.log(`\n${C.b("Path to the strongest finding")}  ${scanned.surface.exploitPath.join(" → ")}`);
  console.log(C.dim(`\n${note}`));
}

async function status() {
  const scanned = loadScan();
  const open = scanned.findings.filter((f) => f.status !== "fixed");
  const fixed = scanned.findings.length - open.length;
  const counts = Object.fromEntries(SEVERITIES.map((s) => [s, open.filter((f) => f.severity === s).length]));
  const failOn = loadConfig(scanned.root).config.failOn;
  const git = await gitInfo(scanned.root).catch(() => ({ repo: false }));
  const data = {
    root: scanned.root,
    scannedAt: scanned.scannedAt,
    tool: scanned.tool,
    analysis: "static",
    scope: scanned.scope,
    files: scanned.stats,
    open: { ...counts, total: open.length },
    fixed,
    failOn,
    failing: atOrAbove(scanned.findings, failOn).map((f) => f.id),
    git: git.repo ? { branch: git.branch, head: git.head } : null,
    findings: sortFindings(scanned.findings).map(summarize),
  };
  if (json) return out(data);
  console.log(`${C.b("Project")} ${scanned.root}`);
  console.log(`${C.dim("Scanned")} ${age(scanned.scannedAt)} ${C.dim(`· arcade ${scanned.tool.version} · scope ${scanned.scope} · ${scanned.stats.filesScanned} files · static analysis`)}`);
  if (git.repo) console.log(`${C.dim("Branch ")} ${git.branch ?? "(detached)"} ${C.dim(git.head ?? "")}`);
  console.log(`\n${C.b("Open")} ${open.length}  ${C.dim(countLine(counts))}`);
  console.log(`${C.b("Fixed")} ${fixed} ${C.dim("(re-checked by the rule that found them)")}`);
  if (failOn !== "none") console.log(data.failing.length ? `\n${C.red("✗")} ${plural(data.failing.length, "finding")} at or above ${failOn}: ${data.failing.join(", ")}` : `\n${C.green("✓")} nothing open at or above ${failOn}`);
}

function rules() {
  const probes = ['createHash("md5")', 'origin: "*"', "rejectUnauthorized: false,", ""];
  const rows = RULES.map((r) => {
    const rewrite = probes.some((line) => {
      if (r.pattern) {
        r.pattern.lastIndex = 0;
        if (line && !r.pattern.test(line)) return false;
      }
      return isConcrete(r.fix({ line, id: "ARC-000", mitigation: r.mitigations[0] }));
    });
    return { id: r.id, severity: r.severity, cwe: /CWE-\d+/.exec(r.cwe)?.[0] ?? r.cwe, title: r.title, category: r.category, languages: r.ext ?? "any text file", automaticRewrite: rewrite };
  });
  if (json) return out(rows);
  console.log(`${C.b("Rules")} — ${rows.length}, all static pattern checks\n`);
  for (const r of rows) console.log(`  ${r.id.padEnd(26)} ${(SEV[r.severity] || String)(r.severity.padEnd(8))}  ${r.cwe.padEnd(8)}  ${r.automaticRewrite ? C.cyan("rewrite") : C.dim("agent  ")}  ${r.title}`);
  console.log(C.dim(`\nrewrite: \`arcade fix <id> --apply\` can change the line itself.  agent: the fix depends on your code; use \`arcade fix <id> --agent <id>\` or fix it by hand.`));
}

/* ---------------------------------------------------------------------- fix */

/** Turns agent-runner events into terminal lines. */
function agentPrinter() {
  let midLine = false;
  const line = (s, stream = process.stdout) => {
    if (midLine) process.stdout.write("\n");
    midLine = false;
    stream.write(`${s}\n`);
  };
  return {
    onEvent(ev) {
      if (ev.type === "start") line(C.dim(`  session ${ev.sessionId ?? "—"}${ev.model ? ` · ${ev.model}` : ""}`));
      else if (ev.type === "text") {
        process.stdout.write(ev.text);
        midLine = !ev.text.endsWith("\n");
        if (!ev.delta && midLine) line("");
      } else if (ev.type === "tool") line(C.dim(`  → ${ev.name}${ev.summary ? ` ${ev.summary}` : ""}`));
      else if (ev.type === "tool-result" && !ev.ok) line(C.amber("  ✗ that step failed"));
      else if (ev.type === "file") line(C.cyan(`  ✎ ${ev.kind} ${ev.path}`));
      else if (ev.type === "log") line(C.dim(`  ${ev.text}`), process.stderr);
    },
    end: () => midLine && line(""),
  };
}

function requireAgent(id) {
  const binary = findAgentBinary(id); // throws for an id Arcade doesn't know
  const all = detectAgents();
  const found = binary ? all.find((a) => a.binary === binary) : null;
  if (found) return found;
  const runnable = all.filter((a) => a.runnable).map((a) => a.id);
  const me = all.find((a) => a.id === String(id).toLowerCase());
  throw new AgentError(`${me?.name ?? id} isn't installed on this machine${me ? ` (${me.install})` : ""}. ${runnable.length ? `Runnable here: ${runnable.join(", ")}.` : "No supported coding agent was found; see `arcade agents`."}`);
}

function printPatch(patch) {
  for (const l of patch.split("\n")) console.log(`  ${l.startsWith("+") && !l.startsWith("+++") ? C.green(l) : l.startsWith("-") && !l.startsWith("---") ? C.red(l) : l.startsWith("@@") ? C.cyan(l) : C.dim(l)}`);
}

const printCheck = (v) => console.log(`${v.closed ? C.green("✓ verified") : C.red("✗ not verified")}  ${v.summary}`);

function printLanded(l) {
  if (l.commit) console.log(`${C.green("✓")} committed ${C.b(l.commit.short)} on ${C.b(l.commit.branch ?? "(detached)")} ${C.dim(`· ${plural(l.commit.files, "file")}`)}`);
  if (l.pushed) console.log(`${C.green("✓")} pushed ${l.pushed.branch} → ${l.pushed.remote}`);
  if (l.pullRequest) console.log(`${C.green("✓")} pull request #${l.pullRequest.number}${l.pullRequest.existing ? " (already open)" : ""}: ${l.pullRequest.url}`);
}

async function fix(id, flags) {
  const scanned = loadScan();
  const root = scanned.root;
  const f = findFinding(scanned, id);
  const landing = !!(flags.commit || flags.push || flags.pr || flags.branch);
  const doApply = !!flags.apply || landing;
  const branch = flags.branch ?? (flags.pr ? defaultBranch(f) : undefined);
  const land = { branch, push: !!flags.push, pr: !!flags.pr };

  if (flags.model && !flags.agent) throw new UsageError("--model only applies together with --agent.");

  // Already gone from the file (fixed earlier, or by hand)? Then there is nothing to do, and that is a success.
  const now = verifyText(f, (await readTarget(root, f)).text);
  if (now.closed) {
    await verifyFinding(root, f); // records it
    if (json) return out({ ok: true, id: f.id, applied: false, alreadyFixed: true, verification: now });
    return console.log(`${C.green("✓")} ${f.id} is already fixed. ${now.summary} Nothing was changed.`);
  }

  /* ---- with a coding agent ---- */
  if (flags.agent) {
    const agent = requireAgent(flags.agent);
    const prompt = agentPrompt(f);
    if (!doApply) {
      if (json) return out({ ok: true, dryRun: true, id: f.id, agent: agent.id, binary: agent.binary, mode: "edit", prompt, note: "Nothing was run. Add --apply to run the agent." });
      console.log(`${C.b("arcade fix")} ${f.id} ${C.dim(`· dry run · ${agent.name} would run in edit mode in ${root}`)}\n`);
      console.log(prompt.replace(/^/gm, "  "));
      return console.log(`\n${C.amber("Dry run:")} no agent was started and nothing was written. Re-run with ${C.b("--apply")} to run it. ${C.dim("Agent runs use your own account and may cost money.")}`);
    }
    if (landing) await preflightLand(root, land);

    const printer = agentPrinter();
    const abort = new AbortController();
    process.once("SIGINT", () => abort.abort());
    if (!json) console.log(`${C.b("arcade fix")} ${f.id} ${C.dim(`· ${agent.name} · edit mode · ${where(f)}`)}\n`);
    const r = await fixWithAgent(root, f, { agent: agent.id, model: flags.model, signal: abort.signal, onEvent: json ? undefined : printer.onEvent });
    printer.end();

    let landed = null;
    const mayLand = landing && r.changed && (r.verification.closed || flags.force);
    if (mayLand) landed = await landFix(root, f, { ...land, files: r.files, verification: r.verification, how: `Fix written by ${agent.name}, re-checked by Arcade.` });
    const good = r.ok && r.changed && r.verification.closed;
    if (!good) process.exitCode = EXIT.findings;

    if (json) return out({ ok: good, id: f.id, agent: r.agent, agentOk: r.ok, agentError: r.error ?? null, changed: r.changed, files: r.files, patch: r.patch, verification: r.verification, costUsd: r.costUsd ?? null, durationMs: r.durationMs, reply: r.reply, landed, committed: !!landed?.commit });
    console.log("");
    if (!r.ok) console.log(`${C.red("✗")} ${agent.name} stopped with an error: ${r.error}`);
    if (!r.changed) console.log(`${C.red("✗")} ${agent.name} did not change ${f.file}.${r.files.length ? ` It touched: ${r.files.join(", ")}` : ""}`);
    else {
      console.log(`${C.b("What changed")} ${C.dim(`(the real diff of ${f.file}, not the agent's description)`)}`);
      printPatch(r.patch);
      const others = r.files.filter((p) => p !== f.file);
      if (others.length) console.log(C.amber(`  also changed: ${others.join(", ")}`));
      console.log("");
    }
    printCheck(r.verification);
    if (r.costUsd != null) console.log(C.dim(`  ${agent.name} reported a cost of $${r.costUsd.toFixed(4)}`));
    if (landed) printLanded(landed);
    else if (landing && r.changed) console.log(`${C.amber("!")} not committed: the check did not pass. The change is in your working tree; review it, or re-run with --force.`);
    if (r.changed && r.verification.closed) console.log(C.dim("\nThe check is static. Review the diff and run your tests."));
    return;
  }

  /* ---- with the rule set's own rewrite ---- */
  const proposal = await proposeFix(root, f);
  if (!proposal.concrete) {
    if (doApply) process.exitCode = EXIT.findings;
    const runnable = detectAgents().filter((a) => a.runnable);
    if (json) return out({ ok: false, id: f.id, concrete: false, applied: false, reason: proposal.reason, recommended: proposal.recommended, mitigations: f.mitigations, agents: runnable.map((a) => a.id) });
    console.log(`${C.b(f.id)} ${f.title} ${C.dim(`· ${where(f)}`)}\n`);
    console.log(`${C.amber("No automatic fix.")} ${proposal.reason}`);
    if (proposal.recommended) console.log(`\n${C.b("Recommended")}  ${proposal.recommended.title}\n  ${C.dim(proposal.recommended.detail)}`);
    console.log(`\nNothing was changed. ${runnable.length ? `To have an agent write it: ${C.b(`arcade fix ${f.id} --agent ${runnable[0].id} --apply`)}` : `Install a coding agent (${C.b("arcade agents")}) and use --agent, or fix it by hand and run ${C.b(`arcade verify ${f.id}`)}.`}`);
    return;
  }

  const view = { id: f.id, ruleId: proposal.ruleId, file: proposal.file, line: proposal.line, concrete: true, safe: proposal.safe, mode: proposal.mode, note: proposal.note, warnings: proposal.warnings, additions: proposal.diff.additions, deletions: proposal.diff.deletions, patch: proposal.patch };
  if (!doApply) {
    if (json) return out({ ok: true, dryRun: true, applied: false, ...view, expected: proposal.expected });
    console.log(`${C.b("arcade fix")} ${f.id} ${C.dim(`· dry run · ${proposal.note}`)}\n`);
    printPatch(proposal.patch);
    for (const w of proposal.warnings) console.log(`\n${C.amber("!")} ${w}`);
    return console.log(`\n${C.amber("Dry run:")} nothing was written. Re-run with ${C.b("--apply")}${proposal.safe ? "" : " --force"} to change ${f.file}.`);
  }

  if (landing) await preflightLand(root, land);
  const applied = await applyFix(root, f, proposal, { force: !!flags.force });
  let landed = null;
  if (landing && (applied.verification.closed || flags.force)) landed = await landFix(root, f, { ...land, files: applied.files, verification: applied.verification, how: `Rule rewrite: ${proposal.note}.` });
  if (!applied.verification.closed) process.exitCode = EXIT.findings;

  if (json) return out({ ok: applied.verification.closed, applied: true, ...view, verification: applied.verification, landed, committed: !!landed?.commit });
  console.log(`${C.b("arcade fix")} ${f.id} ${C.dim(`· ${proposal.note}`)}\n`);
  printPatch(proposal.patch);
  console.log(`\n${C.green("✓")} wrote ${f.file}`);
  printCheck(applied.verification);
  for (const w of proposal.warnings) console.log(`${C.amber("!")} ${w}`);
  if (landed) printLanded(landed);
  else if (landing) console.log(`${C.amber("!")} not committed: the check did not pass. Re-run with --force to commit anyway.`);
  if (applied.verification.closed) console.log(C.dim("\nThe check is static. Review the diff and run your tests."));
}

async function verify(id) {
  const scanned = loadScan();
  const f = findFinding(scanned, id);
  const v = await verifyFinding(scanned.root, f);
  if (!v.closed) process.exitCode = EXIT.findings;
  if (json) return out({ ok: v.closed, id: f.id, ruleId: f.ruleId, file: f.file, ...v });
  console.log(`${C.b(f.id)} ${f.title} ${C.dim(`· ${f.file}`)}\n`);
  printCheck(v);
  if (v.fileMissing) console.log(C.dim("  the file no longer exists"));
  for (const m of v.remaining.slice(0, 5)) console.log(C.dim(`  ${f.file}:${m.line}  ${m.excerpt}`));
  if (v.closed) console.log(C.dim("\nStatic re-check only: the rule that found it no longer matches. It says nothing about whether the program still works."));
}

/* ------------------------------------------------------------------- agents */

async function agent(words, flags) {
  const prompt = words.join(" ").trim();
  if (!prompt) throw new UsageError('give the agent something to do: arcade agent "explain the auth flow" [--agent <id>] [--edit]');
  const chosen = flags.agent ? requireAgent(flags.agent) : detectAgents().find((a) => a.runnable);
  if (!chosen) throw new AgentError("No supported coding agent is installed on this machine. `arcade agents` lists what Arcade can run and where to get it.");
  const mode = flags.edit ? "edit" : "read";
  const cwd = process.cwd();

  const events = [];
  const printer = agentPrinter();
  const abort = new AbortController();
  process.once("SIGINT", () => abort.abort());
  if (!json) console.log(`${C.b("arcade agent")} ${C.dim(`· ${chosen.name} · ${mode === "edit" ? "may edit files" : "read-only"} · ${cwd}`)}\n`);
  const done = await runAgent({ id: chosen.id, cwd, prompt, mode, model: flags.model, signal: abort.signal, onEvent: json ? (ev) => ev.type !== "done" && events.push(ev) : printer.onEvent });
  printer.end();
  if (!done.ok) process.exitCode = EXIT.findings;
  if (json) return out({ ok: done.ok, agent: chosen.id, mode, cwd, text: events.filter((e) => e.type === "text").map((e) => e.text).join(""), files: events.filter((e) => e.type === "file"), events, result: done });
  const tail = `${(done.durationMs / 1000).toFixed(1)}s${done.costUsd != null ? ` · $${done.costUsd.toFixed(4)}` : ""}`;
  console.log(done.ok ? `\n${C.green("✓")} done ${C.dim(`· ${tail}`)}` : `\n${C.red("✗")} ${done.cancelled ? "stopped" : done.error} ${C.dim(`· ${tail}`)}`);
}

function printConnection(a) {
  const state = a.error ? C.red("error") : !a.installed ? C.dim("not installed") : a.outdated ? C.amber("connected (elsewhere)") : a.connected ? C.green("connected") : "not connected";
  console.log(`  ${a.connected && !a.error ? C.green("●") : C.dim("○")} ${a.name.padEnd(12)} ${state}  ${C.dim(a.configPath)}`);
  if (a.error) console.log(`    ${a.error}`);
}

function agents() {
  const runners = detectAgents();
  const connections = listAgents();
  if (json) return out({ runners, connections });
  console.log(`${C.b("Agents Arcade can run")} ${C.dim("(arcade agent, arcade fix --agent)")}\n`);
  for (const r of runners) console.log(`  ${r.runnable ? C.green("●") : C.dim("○")} ${r.id.padEnd(12)} ${r.runnable ? r.binary : C.dim(`not installed · ${r.install}`)}`);
  console.log(`\n${C.b("Agents that can call Arcade")} ${C.dim("(MCP server registered)")}\n`);
  connections.forEach(printConnection);
  if (connections.some((a) => a.outdated)) console.log(`\n${C.amber("!")} Connected to an Arcade server somewhere else on disk. Run ${C.b("arcade connect")} to repoint it here.`);
  else if (connections.some((a) => a.installed && !a.connected)) console.log(C.dim(`\nRegister the MCP server with: arcade connect`));
}

// No agent named → every agent installed here. Naming one that isn't installed is an error.
function connection(change, which) {
  const ids = which ? [which] : change === connectAgent ? listAgents().filter((a) => a.installed).map((a) => a.id) : AGENT_IDS;
  const results = ids.map((id) => change(id));
  if (!results.length) return fail("no supported coding agent found. Arcade connects to Claude Code and Codex.");
  if (json) return out(results);
  console.log(`${C.b("Coding agents")}\n`);
  results.forEach(printConnection);
  if (change === connectAgent) console.log(`\nRestart the agent, then ask it to ${C.b("scan this project with Arcade")}. In Claude Code, ${C.b("/mcp")} lists the tools.`);
}

/* ------------------------------------------------------------------- doctor */

const tryExec = (bin, args) => new Promise((resolve) => execFile(bin, args, { windowsHide: true, timeout: 15000 }, (err, stdout) => resolve(err ? null : String(stdout).trim())));

async function doctor() {
  const checks = [];
  const add = (name, ok, detail, required = false) => checks.push({ name, ok, required, detail });

  const major = Number(process.versions.node.split(".")[0]);
  add("node", major >= 20, `v${process.versions.node}${major >= 20 ? "" : " (Arcade needs Node 20 or newer)"}`, true);
  add("engine", RULES.length > 0, `arcade ${VERSION} · ${plural(RULES.length, "rule")}`, true);

  const git = await tryExec("git", ["--version"]);
  add("git", !!git, git ?? "not found on PATH (needed for fix --commit / --push)");

  const docker = await ensureDocker().then((v) => ({ ok: true, detail: `Docker server ${v}` })).catch((e) => ({ ok: false, detail: `${String(e.message).split("\n")[0]} (only the sandbox commands need it)` }));
  add("docker", docker.ok, docker.detail);

  const runners = detectAgents();
  for (const r of runners) add(`agent:${r.id}`, r.runnable, r.runnable ? r.binary : `not installed · ${r.install}`);
  for (const c of listAgents()) add(`mcp:${c.id}`, c.connected && !c.outdated && !c.error, c.error ?? (!c.installed ? "agent not installed" : c.outdated ? "registered, but pointing at another copy of Arcade (run: arcade connect)" : c.connected ? "Arcade MCP server registered" : "not registered (run: arcade connect)"));

  const tokenVar = process.env.GITHUB_TOKEN ? "GITHUB_TOKEN" : process.env.GH_TOKEN ? "GH_TOKEN" : null;
  add("github-token", !!tokenVar, tokenVar ? `${tokenVar} is set (value not shown)` : "GITHUB_TOKEN / GH_TOKEN not set (only fix --pr needs it)");
  const api = !!process.env.ARCADE_API_URL && !!process.env.ARCADE_TOKEN;
  add("arcade-api", api, api ? "ARCADE_API_URL and ARCADE_TOKEN are set (values not shown)" : "ARCADE_API_URL / ARCADE_TOKEN not set (only MCP approval requests need them)");

  const cfg = (() => {
    try {
      return loadConfig(process.cwd());
    } catch (e) {
      return { error: e.message };
    }
  })();
  add("project-config", !!cfg.exists, cfg.error ?? (cfg.exists ? ".arcade/config.json found" : "no .arcade/config.json here (run: arcade init)"));

  const healthy = checks.every((c) => c.ok || !c.required);
  if (!healthy) process.exitCode = EXIT.error;
  if (json) return out({ ok: healthy, version: VERSION, platform: `${process.platform}-${process.arch}`, checks });
  console.log(`${C.b("arcade doctor")} ${C.dim(`· ${process.platform}-${process.arch}`)}\n`);
  for (const c of checks) console.log(`  ${c.ok ? C.green("✓") : c.required ? C.red("✗") : C.dim("○")} ${c.name.padEnd(18)} ${c.ok ? c.detail : C.dim(c.detail)}`);
  console.log(healthy ? `\n${C.green("✓")} Scanning and fixing will work. ${C.dim("○ marks optional pieces that aren't set up.")}` : `\n${C.red("✗")} Arcade can't run properly here; fix the items marked ✗.`);
}

/* --------------------------------------------------------------------- demo */

function demo() {
  const note = "SAMPLE DATA. A fictional project (acme/commerce-api) that does not exist. Nothing here describes your code; run `arcade scan` for that.";
  if (json) return out({ sample: true, note, snapshot: SNAPSHOT });
  console.log(`${C.amber(C.b("SAMPLE DATA"))} ${C.amber("— a fictional run against a project that does not exist. Nothing below describes your code.")}\n`);
  console.log(`${C.b("Run")} ${SNAPSHOT.run}  ${C.dim("· project")} ${SNAPSHOT.project.repo}\n`);
  for (const f of SNAPSHOT.findings) console.log(`  ${C.dim(f.id)}  ${(SEV[f.severity] || String)(f.severity.toUpperCase().padEnd(8))}  ${f.title}  ${C.dim(`[${f.status}]`)}`);
  console.log(`\n${C.dim("This is what a full Arcade run looks like in the desktop app. For a real result:")} ${C.b("arcade scan")}`);
}

/* --------------------------------------------------------------------- main */

async function main() {
  const argv = process.argv.slice(2);
  const { command, positionals, flags, raw } = parseArgv(argv);
  json = !!flags.json;

  if (flags.cwd) {
    try {
      process.chdir(flags.cwd);
    } catch {
      return fail(`--cwd: ${flags.cwd} is not a folder.`);
    }
  }
  if (flags.version) return json ? out({ name: "arcade", version: VERSION }) : console.log(`arcade ${VERSION}`);
  if (flags.help || !command) return help();

  const [arg1] = positionals;
  switch (command) {
    case "init":
      return init(arg1);
    case "scan":
      return scan(arg1, flags);
    case "findings":
      return findings(flags);
    case "evidence":
      return evidence(arg1);
    case "map":
      return surface();
    case "status":
      return status();
    case "rules":
      return rules();
    case "fix":
      return fix(arg1, flags);
    case "verify":
      return verify(arg1);
    case "agent":
      return agent(positionals, flags);
    case "agents":
      return agents();
    case "connect":
      return connection(connectAgent, arg1);
    case "disconnect":
      return connection(disconnectAgent, arg1);
    case "sandbox":
      // Real Docker sandboxes; it has its own flags, so it gets everything after the command, untouched.
      return sandboxCli(flags.json && !raw.includes("--json") ? [...raw, "--json"] : raw);
    case "doctor":
      return doctor();
    case "demo":
      return demo();
    case "attack":
      return fail("`arcade attack` was removed: this CLI analyses source statically and never ran an attack. Use `arcade scan`, then `arcade evidence <id>`. `arcade sandbox test` runs your tests in an isolated container.");
    case "version":
      return json ? out({ name: "arcade", version: VERSION }) : console.log(`arcade ${VERSION}`);
    case "help":
      return help();
    default:
      return fail(`unknown command "${command}". Try "arcade help".`);
  }
}

try {
  await main();
} catch (e) {
  const expected = e instanceof UsageError || e instanceof ProjectError || e instanceof FixError || e instanceof AgentError || e instanceof GitError || e instanceof ConnectError || e instanceof FsError || e?.name === "GithubWriteError" || typeof e?.status === "number";
  if (!json && process.argv.includes("--json")) json = true; // a usage error can strike before the flags are parsed
  if (expected) fail(e.message);
  else {
    fail(`unexpected error: ${e?.stack || e}`);
  }
}
