// Arcade fixes — what `arcade fix`, `arcade verify` and the MCP fix tools do to a
// real file, and the rules they hold themselves to:
//
//   - A proposal is either a concrete rewrite the rule set knows how to make, or
//     nothing. The engine's `// FIXME` scaffolds document a fix; they are never
//     offered, applied or counted as one.
//   - The edit is computed from the file as it is on disk now, not from the scan's
//     copy. If the flagged line can't be found any more, nothing is written.
//   - Every change is re-checked by re-running the finding's own rule over the new
//     text (`verifyFile`). "Verified" means exactly that and nothing more: the
//     pattern is gone. It does not mean the program still works — run your tests.
//   - Nothing is committed when verification fails, unless the caller forces it,
//     and never anything the user had staged themselves.
//   - Agent prompts travel over stdin (see agent-runner.mjs); the GitHub token is
//     read from the environment, handed to git/GitHub, and never printed.
//
// Dependency-free.

import fs from "node:fs";
import path from "node:path";
import { RULES, applyEdit, diffTexts, githubRepoOf, isConcrete, matchRule, openPullRequest, ruleOf, verifyFile } from "./engine.mjs";
import { runAgent } from "./agent-runner.mjs";
import { gitBranches, gitCheckout, gitCommit, gitInfo, gitPush, gitStatus } from "./git.mjs";
import { resolveInside } from "./node-fs.mjs";
import { excerptOf, redactLine, updateFinding } from "./project.mjs";

/** `code`: "NO_RULE" | "STALE" | "NO_REWRITE" | "UNSAFE" | "CHANGED" | "GIT" | "NO_TOKEN" | "NOT_GITHUB" */
export class FixError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/* --------------------------------------------------------------------- read */

/** The finding's file as it is now: `{ abs, text }`, with `text: null` when it no longer exists. */
export async function readTarget(root, finding) {
  let abs;
  try {
    abs = await resolveInside(root, finding.file);
  } catch (e) {
    if (e.code === "ENOENT") return { abs: path.resolve(root, finding.file), text: null };
    throw e;
  }
  return { abs, text: await fs.promises.readFile(abs, "utf8") };
}

const sameLine = (finding, line) => excerptOf(finding.category, line.replace(/\r$/, "")) === finding.excerpt;

/** Where the flagged line is today (1-based), or null. Code above it may have moved it since the scan. */
export function locate(finding, text) {
  const lines = text.split("\n");
  if (lines[finding.line - 1] != null && sameLine(finding, lines[finding.line - 1])) return finding.line;
  const rule = ruleOf(finding);
  if (!rule) return null;
  const same = matchRule(rule, finding.file, text).filter((m) => sameLine(finding, lines[m.line - 1] ?? ""));
  same.sort((a, b) => Math.abs(a.line - finding.line) - Math.abs(b.line - finding.line));
  return same[0]?.line ?? null;
}

/* ------------------------------------------------------------------- verify */

/**
 * Re-run the finding's rule over text. `closed` means no remaining match is the
 * flagged code. Credential findings are compared in redacted form, because the
 * scan never stored the secret itself.
 */
export function verifyText(finding, text) {
  const verdict = verifyFile(finding, text);
  const rule = ruleOf(finding);
  let { closed, summary } = verdict;
  if (finding.redacted && rule && text != null) {
    const still = verdict.remaining.some((m) => excerptOf(finding.category, m.excerpt) === finding.excerpt);
    closed = !still;
    const others = verdict.remaining.length;
    summary = still
      ? `Re-ran ${rule.id} over the file: the flagged code is still there.`
      : others
        ? `Re-ran ${rule.id} over the file: the flagged code is gone. ${others} other match${others === 1 ? "" : "es"} of the same rule remain in this file.`
        : `Re-ran ${rule.id} over the file: it no longer fires.`;
  }
  return {
    closed,
    summary,
    remaining: verdict.remaining.map((m) => ({ line: m.line, excerpt: excerptOf(finding.category, m.excerpt) })),
  };
}

/** `arcade verify <id>`: check the file on disk and record the outcome in last-scan.json. */
export async function verifyFinding(root, finding) {
  const { text } = await readTarget(root, finding);
  const verdict = { ...verifyText(finding, text), fileMissing: text == null, checkedAt: new Date().toISOString() };
  updateFinding(root, finding.id, { status: verdict.closed ? "fixed" : "open", verification: { closed: verdict.closed, summary: verdict.summary, checkedAt: verdict.checkedAt } });
  return verdict;
}

/* ------------------------------------------------------------------ propose */

/** A removable line is one that holds the insecure setting and nothing else: `rejectUnauthorized: false,` */
const LONE_SETTING = /^["']?[\w$.-]+["']?\s*[:=]\s*[^,;(){}[\]]+[,;]?$/;

const SECRET_RULES = RULES.filter((r) => r.category === "secrets");
const holdsSecret = (file, line) => SECRET_RULES.some((r) => matchRule(r, file, line).length > 0);

/**
 * A reviewable patch in unified format, from the engine's structured diff. It is
 * for reading (terminals, CI logs, agents), so any line a credential rule fires
 * on is redacted; `--apply` works from the file, never from this text.
 */
export function unifiedPatch(file) {
  const body = file.diff.map((d) => {
    if (d.kind === "hunk") return d.text;
    const text = holdsSecret(file.path, d.text) ? redactLine(d.text) : d.text;
    return `${d.kind === "add" ? "+" : d.kind === "del" ? "-" : " "}${text}`;
  });
  return [`--- a/${file.path}`, `+++ b/${file.path}`, ...body].join("\n");
}

/**
 * The rule set's own rewrite for a finding, computed against the file on disk.
 * Returns `{ concrete: false, reason }` when the rule has no real rewrite.
 * Nothing is written.
 */
export async function proposeFix(root, finding) {
  const rule = ruleOf(finding);
  if (!rule) throw new FixError(`The rule behind ${finding.id} (${finding.ruleId}) is not in this build of Arcade.`, "NO_RULE");
  const { abs, text } = await readTarget(root, finding);
  if (text == null) throw new FixError(`${finding.file} no longer exists. Run "arcade verify ${finding.id}" or scan again.`, "STALE");

  const base = { id: finding.id, ruleId: rule.id, title: finding.title, file: finding.file, mitigations: finding.mitigations };
  const lineNo = locate(finding, text);
  if (lineNo == null) {
    const verdict = verifyText(finding, text);
    throw new FixError(verdict.closed ? `${finding.id} is no longer present in ${finding.file}: ${verdict.summary}` : `${finding.file} changed since the scan and the flagged line can't be pinned down. Run "arcade scan" again.`, "STALE");
  }

  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const current = text.split(/\r?\n/)[lineNo - 1];
  const edit = rule.fix({ line: current, id: finding.id, mitigation: finding.mitigations[0] });
  if (!isConcrete(edit)) {
    return {
      ...base,
      line: lineNo,
      concrete: false,
      reason: `Arcade has no automatic rewrite for ${rule.id}: closing it takes a change that depends on your code, not a one-line substitution.`,
      recommended: finding.mitigations[0] ?? null,
    };
  }

  const after = applyEdit(text, lineNo, edit);
  const warnings = [];
  let safe = true;
  if (edit.mode === "remove" && !LONE_SETTING.test(current.trim())) {
    safe = false;
    warnings.push("This rewrite deletes the whole line, and the line holds more than the insecure setting. Applying it as-is would probably break the code. Edit the line by hand, or use --agent.");
  }
  if ((edit.add ?? []).some((l) => /\bexample\.(?:com|org)\b/.test(l)) && !/\bexample\.(?:com|org)\b/.test(current)) {
    warnings.push("The rewrite contains a placeholder host (example.com). Replace it with your real value before you ship.");
  }
  const expected = verifyText(finding, after);
  if (!expected.closed) warnings.push("Even with this rewrite applied, the rule would still flag this line.");

  const diff = diffTexts(finding.file, text, after);
  return { ...base, line: lineNo, concrete: true, safe, mode: edit.mode, note: edit.note, warnings, expected, diff, patch: unifiedPatch(diff), abs, before: text, after, eol };
}

/** Write a concrete proposal to disk, then verify what is actually on disk. */
export async function applyFix(root, finding, proposal, { force = false } = {}) {
  if (!proposal.concrete) throw new FixError(proposal.reason, "NO_REWRITE");
  if (!proposal.safe && !force) throw new FixError(proposal.warnings[0], "UNSAFE");
  const now = await fs.promises.readFile(proposal.abs, "utf8");
  if (now !== proposal.before) throw new FixError(`${finding.file} changed while the fix was being prepared. Nothing was written; run the command again.`, "CHANGED");
  await fs.promises.writeFile(proposal.abs, proposal.after);
  const verification = verifyText(finding, await fs.promises.readFile(proposal.abs, "utf8"));
  record(root, finding, verification, { by: "rule", note: proposal.note });
  return { applied: true, files: [finding.file], verification };
}

function record(root, finding, verification, how) {
  updateFinding(root, finding.id, {
    status: verification.closed ? "fixed" : "open",
    verification: { closed: verification.closed, summary: verification.summary, checkedAt: new Date().toISOString() },
    fixedBy: verification.closed ? how : undefined,
  });
}

/* -------------------------------------------------------------------- agent */

/** The instruction an agent gets. Precise and narrow: one finding, one file, the minimal change. */
export function agentPrompt(finding) {
  const rule = ruleOf(finding);
  const fixes = finding.mitigations.map((m) => `- ${m.title}${m.recommended ? " (recommended)" : ""}: ${m.detail}`).join("\n");
  return [
    `Fix one security finding in this project. Make the minimal change that closes it and do not touch anything else.`,
    ``,
    `Finding ${finding.id}: ${finding.title}`,
    `Rule: ${finding.ruleId} (${finding.cwe})`,
    `File: ${finding.file}`,
    `Line: ${finding.line}`,
    finding.redacted ? `The flagged line holds a credential, so it is not quoted here. Read it in the file.` : `Flagged code: ${finding.excerpt}`,
    ``,
    `What is wrong: ${rule?.description ?? finding.description}`,
    ``,
    `Accepted ways to fix it:`,
    fixes,
    ``,
    `Constraints:`,
    `- Edit ${finding.file}. Change another file only if the fix cannot work without it.`,
    `- Keep behaviour, names, formatting and unrelated code exactly as they are. No refactoring, no new dependencies.`,
    `- Do not add TODO/FIXME comments in place of a fix, and do not suppress or comment out the code to hide it from a scanner.`,
    finding.category === "secrets" ? `- Replace the literal with a read from the environment (or the project's existing config mechanism). Do not print, log or copy the secret anywhere.` : null,
    `- Do not run git commands, commit, or push. Do not run the application.`,
    `- When you are done, reply with one short paragraph: what you changed and why it closes the finding.`,
  ]
    .filter((l) => l != null)
    .join("\n");
}

const statusPaths = (s) => new Map([...s.staged, ...s.unstaged].map((f) => [f.path, f.status]));

/**
 * Hand a finding to an installed coding agent in edit mode, then judge the result
 * ourselves: the real before/after diff of the flagged file, and the rule re-run
 * over it. The agent's own account of what it did is reported, never trusted.
 */
export async function fixWithAgent(root, finding, { agent, model, onEvent = () => {}, signal, env, home } = {}) {
  const target = await readTarget(root, finding);
  if (target.text == null) throw new FixError(`${finding.file} no longer exists. Run "arcade scan" again.`, "STALE");
  const info = await gitInfo(root).catch(() => ({ repo: false }));
  const before = info.repo ? statusPaths(await gitStatus(root)) : null;

  const touched = new Set();
  let reply = "";
  const result = await runAgent({
    id: agent,
    cwd: root,
    prompt: agentPrompt(finding),
    mode: "edit",
    model,
    signal,
    env,
    home,
    onEvent: (ev) => {
      if (ev.type === "file" && typeof ev.path === "string") touched.add(ev.path);
      if (ev.type === "text") reply += ev.text;
      onEvent(ev);
    },
  });

  const afterText = fs.existsSync(target.abs) ? await fs.promises.readFile(target.abs, "utf8") : null;
  const changed = afterText !== target.text;
  const diff = changed ? diffTexts(finding.file, target.text, afterText) : null;

  // Files this run changed: what git newly reports, plus what the agent said it wrote.
  const files = new Set(changed ? [finding.file] : []);
  if (before) {
    for (const [p, st] of statusPaths(await gitStatus(root))) if (before.get(p) !== st && !p.startsWith(".arcade/")) files.add(p);
  }
  for (const p of touched) {
    const relPath = path.relative(root, path.resolve(root, p)).replace(/\\/g, "/");
    if (relPath && !relPath.startsWith("..") && !path.isAbsolute(relPath) && !relPath.startsWith(".arcade/")) files.add(relPath);
  }

  const verification = verifyText(finding, afterText);
  if (changed) record(root, finding, verification, { by: "agent", agent });
  return { agent, ok: result.ok, error: result.error, cancelled: result.cancelled, costUsd: result.costUsd, durationMs: result.durationMs, reply: reply.trim(), changed, files: [...files], diff, patch: diff ? unifiedPatch(diff) : null, verification };
}

/* --------------------------------------------------------------------- land */

export const githubToken = (env = process.env) => env.GITHUB_TOKEN || env.GH_TOKEN || null;
export const defaultBranch = (finding) => `arcade/${finding.id.toLowerCase()}-${finding.ruleId}`;

/**
 * Everything that can stop a commit / push / pull request, checked before a
 * single byte of the project changes.
 */
export async function preflightLand(root, { branch, push, pr, env = process.env }) {
  const info = await gitInfo(root);
  if (!info.installed) throw new FixError("git isn't installed (or isn't on PATH), so there is nothing to commit with.", "GIT");
  if (!info.repo) throw new FixError(info.parentRepo ? `This folder is part of the repository at ${info.parentRepo}. Run arcade from that folder to commit.` : "This folder isn't a git repository, so there is nothing to commit to. Run `git init` first.", "GIT");
  if (!info.user) throw new FixError('git doesn\'t know who you are yet. Run: git config --global user.name "Your Name" and git config --global user.email you@example.com', "GIT");
  const { staged } = await gitStatus(root);
  if (staged.length) throw new FixError(`You have ${staged.length} staged file${staged.length === 1 ? "" : "s"} of your own. Commit or unstage them first, so the fix lands in a commit by itself.`, "GIT");
  if (branch && (await gitBranches(root)).some((b) => b.name === branch && !b.current)) {
    throw new FixError(`A branch named ${branch} already exists. Pick another name with --branch.`, "GIT");
  }
  if ((push || pr) && !info.remote) throw new FixError('This repository has no "origin" remote to push to.', "GIT");
  let repo = null;
  if (pr) {
    repo = githubRepoOf(info.remote);
    if (!repo) throw new FixError(`A pull request needs a github.com remote; origin is ${info.remote}.`, "NOT_GITHUB");
    if (!githubToken(env)) throw new FixError("Opening a pull request needs a GitHub token. Set GITHUB_TOKEN (or GH_TOKEN) with the `repo` scope.", "NO_TOKEN");
  }
  return { info, repo };
}

const commitMessage = (finding, verification, how) =>
  [
    `fix(security): ${finding.title.toLowerCase()} in ${finding.file}`,
    ``,
    `${finding.id} · ${finding.ruleId} · ${finding.cwe}`,
    how,
    `Check: ${verification.summary}`,
  ].join("\n");

/** Branch (optional) → commit exactly `files` → push (optional) → pull request (optional). */
export async function landFix(root, finding, { files, verification, how, branch, push = false, pr = false, base, env = process.env }) {
  const out = { branch: null, commit: null, pushed: null, pullRequest: null };
  const start = await gitInfo(root);
  if (branch && start.branch !== branch) await gitCheckout(root, branch, { create: true });
  const commit = await gitCommit(root, commitMessage(finding, verification, how), { paths: files });
  out.commit = commit;
  out.branch = commit.branch;
  if (push || pr) out.pushed = await gitPush(root, { branch: commit.branch, token: githubToken(env) ?? undefined });
  if (pr) {
    const repo = githubRepoOf(start.remote);
    out.pullRequest = await openPullRequest(githubToken(env), repo, {
      head: commit.branch,
      base: base ?? (start.branch && start.branch !== commit.branch ? start.branch : undefined),
      title: `Fix ${finding.title.toLowerCase()} (${finding.id})`,
      body: [
        `Closes Arcade finding **${finding.id}**: ${finding.title}.`,
        ``,
        `- Rule: \`${finding.ruleId}\` (${finding.cwe})`,
        `- Location: \`${finding.file}:${finding.line}\``,
        `- ${how}`,
        `- Check: ${verification.summary}`,
        ``,
        `The check is static: the rule that raised the finding was re-run over the changed file. Review the diff and run the test suite before merging.`,
      ].join("\n"),
    });
  }
  return out;
}
