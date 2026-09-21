// Arcade project state — the real scan behind `arcade scan` and the MCP tools,
// and the two small files Arcade keeps inside a project:
//
//   .arcade/config.json      scope, failOn and ignore globs; written by `arcade init`
//   .arcade/last-scan.json   the most recent scan, so `findings`, `evidence`, `fix`
//                            and `verify` talk about this project and not a sample
//
// The analysis is the monorepo engine (engine.mjs): the same scanner, rules and
// agents the desktop app runs. It is static — files are listed and read, never
// executed, and nothing reaches the network.
//
// Secrets stay where they are: for credential findings the stored and displayed
// code is redacted, so a scan never copies a key out of the source file. The
// state folder also ignores its own scan cache, keeping it out of commits.
//
// Dependency-free.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { ENGINE_VERSION, LOCAL_PROVIDER, RULES, bySeverity, defend, githubRepoOf, isConcrete, mapProject, mapSurface, reproduce, scanWorkspace } from "./engine.mjs";
import { gitInfo } from "./git.mjs";
import { STATE_DIR, nodeFs } from "./node-fs.mjs";

/** package.json when it is next to us; the desktop app ships the .mjs files alone, so the engine carries a copy. */
function readVersion() {
  try {
    const pkg = JSON.parse(fs.readFileSync(new URL("./package.json", import.meta.url), "utf8"));
    if (pkg.name === "arcade-security" && typeof pkg.version === "string") return pkg.version;
  } catch {
    /* not shipped alongside */
  }
  return ENGINE_VERSION;
}

export const VERSION = readVersion();
export const SEVERITIES = ["critical", "high", "medium", "low"];
export const SCOPES = ["source", "all"];

/** `code`: "NO_SCAN" | "NO_FINDING" | "BAD_CONFIG" | "BAD_PATH" */
export class ProjectError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

export const DEFAULT_CONFIG = Object.freeze({ version: 1, scope: "source", failOn: "high", ignore: [] });

const configPath = (root) => path.join(root, STATE_DIR, "config.json");
const scanPath = (root) => path.join(root, STATE_DIR, "last-scan.json");
const rel = (root, fp) => path.relative(root, fp).replace(/\\/g, "/");

function writeAtomic(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

/** "packages/api" when `abs` is that folder of a bigger git repository; "" otherwise. */
function repoPrefix(git, abs) {
  if (!git.parentRepo) return "";
  const p = path.relative(path.resolve(git.parentRepo), fs.realpathSync(abs)).replace(/\\/g, "/");
  return p && !p.startsWith("..") && !path.isAbsolute(p) ? p : "";
}

/** The scan cache quotes source lines; it has no business in a commit. */
function ensureStateDir(root) {
  const dir = path.join(root, STATE_DIR);
  const created = [];
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const ignore = path.join(dir, ".gitignore");
  if (!fs.existsSync(ignore)) {
    fs.writeFileSync(ignore, "# Arcade's scan cache is local to this machine.\nlast-scan.json\n");
    created.push(rel(root, ignore));
  }
  return created;
}

/* ------------------------------------------------------------------- config */

function checkConfig(raw, where) {
  const bad = (msg) => new ProjectError(`${where}: ${msg}`, "BAD_CONFIG");
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw bad("expected a JSON object.");
  const cfg = { ...DEFAULT_CONFIG, ignore: [] };
  if (raw.scope !== undefined) {
    if (!SCOPES.includes(raw.scope)) throw bad(`"scope" must be one of ${SCOPES.join(", ")}.`);
    cfg.scope = raw.scope;
  }
  if (raw.failOn !== undefined) {
    if (raw.failOn !== "none" && !SEVERITIES.includes(raw.failOn)) throw bad(`"failOn" must be one of ${SEVERITIES.join(", ")}, none.`);
    cfg.failOn = raw.failOn;
  }
  if (raw.ignore !== undefined) {
    if (!Array.isArray(raw.ignore) || raw.ignore.some((g) => typeof g !== "string")) throw bad('"ignore" must be a list of glob strings.');
    cfg.ignore = raw.ignore;
  }
  // Optional ids for the Arcade API's approval gate (see approvals.mjs). Never a token.
  if (raw.cloud !== undefined) {
    if (!raw.cloud || typeof raw.cloud !== "object" || Array.isArray(raw.cloud)) throw bad('"cloud" must be an object with orgId / projectId / runId.');
    cfg.cloud = {};
    for (const k of ["orgId", "projectId", "runId"]) {
      if (raw.cloud[k] === undefined) continue;
      if (typeof raw.cloud[k] !== "string") throw bad(`"cloud.${k}" must be a string.`);
      cfg.cloud[k] = raw.cloud[k];
    }
  }
  return cfg;
}

/** The project's config, or the defaults (with `failOn: "none"`) when it has never been initialised. */
export function loadConfig(root) {
  const file = configPath(root);
  if (!fs.existsSync(file)) return { exists: false, path: file, config: { ...DEFAULT_CONFIG, failOn: "none", ignore: [] } };
  let raw;
  try {
    const text = fs.readFileSync(file, "utf8");
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text); // PowerShell writes a BOM
  } catch (e) {
    throw new ProjectError(`${rel(root, file)} is not valid JSON: ${e.message}`, "BAD_CONFIG");
  }
  return { exists: true, path: file, config: checkConfig(raw, rel(root, file)) };
}

/** Create .arcade/config.json (and the state folder's .gitignore). Reports only what it really wrote. */
export function initProject(root) {
  const abs = path.resolve(root);
  if (!fs.statSync(abs, { throwIfNoEntry: false })?.isDirectory()) throw new ProjectError(`${abs} is not a folder.`, "BAD_PATH");
  const file = configPath(abs);
  const existing = [];
  const created = [];
  const hadConfig = fs.existsSync(file);
  if (hadConfig) loadConfig(abs); // an unreadable config is an error, not something to paper over
  created.push(...ensureStateDir(abs));
  if (hadConfig) existing.push(rel(abs, file));
  else {
    fs.writeFileSync(file, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, { flag: "wx" });
    created.push(rel(abs, file));
  }
  return { root: abs, created, existing, config: loadConfig(abs).config };
}

/* ---------------------------------------------------------------- redaction */

/** Blank out anything key-shaped or quoted in a line that holds a credential. */
export function redactLine(text) {
  return String(text)
    .replace(/(sk_(?:live|test)_)[0-9a-zA-Z]+/g, "$1[redacted]")
    .replace(/AKIA[0-9A-Z]{16}/g, "AKIA[redacted]")
    .replace(/(gh[pousr]_)[0-9A-Za-z]+/g, "$1[redacted]")
    .replace(/(["'`])(?:(?!\1).){8,}\1/g, "$1[redacted]$1");
}

/** How a source line is stored and compared: trimmed like the scanner's excerpt, redacted for credential rules. */
export const excerptOf = (category, line) => {
  const t = String(line).trim().slice(0, 240);
  return category === "secrets" ? redactLine(t) : t;
};

function storedWindow(finding, category, ruleId) {
  let afterKey = false;
  return finding.vulnerableCode.lines.map((l) => {
    let text = l.text.replace(/\r$/, "");
    if (category === "secrets") text = afterKey ? "[redacted key material]" : redactLine(text);
    if (l.flagged && ruleId === "private-key") afterKey = true;
    return { no: l.no, text, ...(l.flagged ? { flagged: true } : {}) };
  });
}

/* --------------------------------------------------------------------- scan */

const countBySeverity = (findings) => {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, total: 0 };
  for (const f of findings) {
    counts[f.severity]++;
    counts.total++;
  }
  return counts;
};

const fingerprint = (f) => crypto.createHash("sha256").update(`${f.ruleId}\n${f.file}\n${f.excerpt}`).digest("hex").slice(0, 32);

/**
 * Scan a folder for real. Returns the record that is saved as last-scan.json.
 * `scope` and `ignore` default to the project's config.
 */
export async function runScan(root, { scope, ignore, onProgress, isCancelled = () => false, save = true } = {}) {
  const abs = path.resolve(root);
  if (!fs.statSync(abs, { throwIfNoEntry: false })?.isDirectory()) throw new ProjectError(`${abs} is not a folder.`, "BAD_PATH");
  const { config, exists: configured } = loadConfig(abs);
  const useScope = scope ?? config.scope;
  if (!SCOPES.includes(useScope)) throw new ProjectError(`scope must be one of ${SCOPES.join(", ")}.`, "BAD_CONFIG");
  const globs = ignore ?? config.ignore;

  const started = Date.now();
  const scan = await scanWorkspace(nodeFs(abs, { ignore: globs }), { scope: useScope }, isCancelled, onProgress);

  const raw = reproduce(scan);
  const findings = [];
  for (let i = 0; i < raw.length; i++) {
    const hit = scan.hits[i];
    const f = await defend(raw[i], scan.sources[hit.path] ?? "", LOCAL_PROVIDER);
    const flagged = f.vulnerableCode.lines.find((l) => l.flagged);
    const line = (flagged?.text ?? "").replace(/\r$/, "");
    const edit = hit.rule.fix({ line, id: f.id, mitigation: f.mitigations[0] });
    const secret = hit.rule.category === "secrets";
    const record = {
      id: f.id,
      ruleId: hit.rule.id,
      title: f.title,
      severity: f.severity,
      cwe: f.cwe,
      category: hit.rule.category,
      file: hit.path,
      line: hit.match.line,
      column: hit.match.column + 1,
      excerpt: excerptOf(hit.rule.category, line),
      ...(secret ? { redacted: true } : hit.match.captured ? { matched: hit.match.captured.slice(0, 120) } : {}),
      summary: f.summary,
      description: f.description,
      attackNarrative: f.attackNarrative,
      rootCause: f.remediation.rootCause,
      mitigations: f.mitigations,
      vulnerableCode: { path: hit.path, lines: storedWindow(f, hit.rule.category, hit.rule.id) },
      fix: { kind: isConcrete(edit) ? "rewrite" : "agent", note: isConcrete(edit) ? edit.note : "No automatic rewrite exists for this rule; a coding agent (or a person) has to write the fix." },
      status: "open",
    };
    record.fingerprint = fingerprint(record);
    findings.push(record);
  }

  const git = await gitInfo(abs).catch(() => ({ installed: false, repo: false }));
  const repo = githubRepoOf(git.remote) ?? path.basename(abs);
  const result = {
    schema: 1,
    tool: { name: "arcade", version: VERSION, rules: RULES.length },
    analysis: "static",
    root: abs,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    scope: useScope,
    ignore: globs,
    configured,
    git: git.repo ? { branch: git.branch, head: git.head, remote: git.remote } : null,
    // Set when the scanned folder sits inside a larger repository: SARIF paths must be relative to that repository.
    repoPrefix: repoPrefix(git, abs),
    stats: { filesIndexed: scan.paths.length, filesScanned: scan.filesScanned, bytesScanned: scan.bytesScanned, languages: scan.languages, truncated: scan.truncated },
    counts: countBySeverity(findings),
    project: mapProject(scan, path.basename(abs), repo),
    surface: mapSurface(raw, scan),
    findings,
  };
  if (save) saveScan(abs, result);
  return result;
}

export function saveScan(root, result) {
  ensureStateDir(root);
  writeAtomic(scanPath(root), `${JSON.stringify(result, null, 2)}\n`);
  return scanPath(root);
}

/** The nearest folder at or above `from` that holds a saved scan — the way git finds its repository. */
export function findProjectRoot(from = process.cwd()) {
  let dir = path.resolve(from);
  for (;;) {
    if (fs.existsSync(scanPath(dir))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** The last real scan of the project containing `from`. Throws NO_SCAN when there isn't one. */
export function loadScan(from = process.cwd()) {
  const root = findProjectRoot(from);
  if (!root) throw new ProjectError(`No scan found for ${path.resolve(from)}. Run "arcade scan" in your project first.`, "NO_SCAN");
  let scan;
  try {
    scan = JSON.parse(fs.readFileSync(scanPath(root), "utf8"));
  } catch (e) {
    throw new ProjectError(`${scanPath(root)} can't be read (${e.message}). Run "arcade scan" again.`, "NO_SCAN");
  }
  if (scan?.schema !== 1 || !Array.isArray(scan.findings)) throw new ProjectError(`${scanPath(root)} was written by a different Arcade version. Run "arcade scan" again.`, "NO_SCAN");
  scan.root = root; // the folder may have moved since it was scanned
  return scan;
}

/** "ARC-003", "arc-3" and "3" all name the same finding. */
export function findFinding(scan, id) {
  const want = String(id ?? "").trim().toLowerCase();
  if (!want) throw new ProjectError("Name a finding, e.g. ARC-001. `arcade findings` lists them.", "NO_FINDING");
  const n = /^(?:arc-)?0*(\d+)$/.exec(want)?.[1];
  const f = scan.findings.find((x) => x.id.toLowerCase() === want || (n && Number(/\d+$/.exec(x.id)?.[0]) === Number(n)));
  if (!f) throw new ProjectError(`No finding ${id} in the last scan of ${scan.root}. \`arcade findings\` lists them.`, "NO_FINDING");
  return f;
}

/** Persist a change to one finding (status, verification, fix result) in last-scan.json. */
export function updateFinding(root, id, patch) {
  const scan = loadScan(root);
  const f = findFinding(scan, id);
  Object.assign(f, patch);
  scan.counts = countBySeverity(scan.findings);
  saveScan(scan.root, scan);
  return f;
}

/* --------------------------------------------------------------- thresholds */

/** Findings still open at or above a severity ("none" → []). */
export function atOrAbove(findings, threshold) {
  if (!threshold || threshold === "none") return [];
  const limit = SEVERITIES.indexOf(threshold);
  return findings.filter((f) => f.status !== "fixed" && SEVERITIES.indexOf(f.severity) <= limit);
}

export const sortFindings = (findings) => [...findings].sort((a, b) => bySeverity(a, b) || a.file.localeCompare(b.file) || a.line - b.line);

/** The short row used by lists (CLI `findings`, MCP `arcade_get_findings`). */
export const summarize = (f) => ({ id: f.id, severity: f.severity, status: f.status, title: f.title, ruleId: f.ruleId, cwe: f.cwe, file: f.file, line: f.line, fix: f.fix.kind });
