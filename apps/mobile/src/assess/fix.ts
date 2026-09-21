/**
 * From an approved finding to a real pull request — or an honest "no".
 *
 * Only a rule whose edit is a concrete rewrite (`isConcrete`) can be fixed from
 * the phone. Every other rule's edit merely inserts a `// FIXME` note above the
 * weak line; that documents a problem, it does not close one, so it is never
 * shown as a fix and never committed. For those findings the phone can open a
 * GitHub issue instead, and the desktop app can hand them to a coding agent.
 *
 * Nothing here writes to a default branch: the commit goes to a new
 * `arcade/fix-…` branch and merging stays a human decision on GitHub. The only
 * check a fix gets is the one described to the user — the same static rule,
 * re-run over the patched file. No tests are run and nothing is executed.
 *
 * Pure of React. The callers (and the tests) supply the token.
 */
import { applyEdit, diffTexts, isConcrete, ruleEdit, ruleOf, verifyFile, type FileVerdict } from "@/core/fixes";
import { commitFiles, openPullRequest, repoAccess } from "@/core/github-write";
import type { FixEdit } from "@/core/rules";
import type { Finding, RemediationFile } from "@/core/types";
import { githubFetch } from "@/github/github";
import { blobShaOf, isMemoryRepo, pinHead, readFile } from "@/github/repo-fs";
import { shortSha, type AssessmentMeta, type FixOutcome } from "./assess";

/** The fix cannot go ahead, for a reason the user should read as-is. */
export class FixBlocked extends Error {}

export type FixPlan = { kind: "rewrite"; line: number; edit: FixEdit; caveat?: string } | { kind: "none"; reason: string };

export const NO_REWRITE =
  "There is no automatic rewrite for this rule. All the rule can do is put a FIXME note above the line, and a note is not a fix, so Arcade will not commit it. The desktop app can hand this finding to a coding agent; from here you can open a GitHub issue with the details.";

/** What a reviewer has to know about a rewrite before merging it. */
const CAVEATS: Record<string, string> = {
  "tls-verification-disabled": "This turns certificate checks back on. Connections to a host with a self-signed or private-CA certificate will start to fail until that CA is trusted.",
  "weak-hash": "Values hashed before and after this change will not match. If stored hashes are compared (passwords, cache keys, signatures), plan the migration before merging.",
};

const stripCr = (s: string) => s.replace(/\r$/, "");

/** The finding with CRLF residue removed from its code window, so edits derived from a line never carry a stray "\r". */
const normalised = (f: Finding): Finding => ({ ...f, vulnerableCode: { ...f.vulnerableCode, lines: f.vulnerableCode.lines.map((l) => ({ ...l, text: stripCr(l.text) })) } });

/**
 * A "remove" edit deletes the whole line, which is only safe when the line holds
 * nothing but the offending setting. Defensive: no rule in the current set uses
 * "remove" (the TLS rule now flips its flag in place), so this path is not
 * reached today and has no integration test. It stays because `applyEdit` still
 * supports the mode, and a rule that reintroduced it must not delete other code.
 */
function removalIsSafe(finding: Finding, line: string): boolean {
  const pattern = ruleOf(finding)?.pattern;
  if (!pattern) return false;
  pattern.lastIndex = 0;
  const m = pattern.exec(line);
  if (!m) return false;
  const rest = line.slice(0, m.index) + line.slice(m.index + m[0].length);
  return /^[\s,;"'`]*$/.test(rest) || /^\s*process\.env\.\s*["']?\s*;?\s*$/.test(rest);
}

/** Whether, and how, this finding can be fixed from the phone. Decided from the rule alone; no network. */
export function fixPlanFor(raw: Finding): FixPlan {
  const finding = normalised(raw);
  const planned = ruleEdit(finding);
  if (!planned) return { kind: "none", reason: "This finding has no flagged line to anchor a change to, so there is nothing to rewrite automatically." };
  if (!isConcrete(planned.edit)) return { kind: "none", reason: NO_REWRITE };
  const flagged = finding.vulnerableCode.lines.find((l) => l.flagged)!;
  if (planned.edit.mode === "remove" && !removalIsSafe(finding, flagged.text)) {
    return { kind: "none", reason: "The rule's rewrite deletes the flagged line, but this line also holds other code, so deleting it would break the file. It needs a hand edit: the desktop app can hand it to a coding agent, or you can open a GitHub issue from here." };
  }
  return { kind: "rewrite", line: planned.line, edit: planned.edit, caveat: finding.ruleId ? CAVEATS[finding.ruleId] : undefined };
}

export interface PreparedFix {
  path: string;
  line: number;
  /** The blob the patch was made against. Shipping refuses if the file has moved on. */
  blobSha: string;
  /** The commit the file was read at. */
  commit: string | null;
  patched: string;
  file: RemediationFile;
  verdict: FileVerdict;
  branch: string;
  note: string;
  caveat?: string;
}

function hash6(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 6);
}

/** Stable per weakness, not per scan: the same line yields the same branch, so a second attempt finds the first pull request. */
export function branchFor(finding: Finding): string {
  const flagged = finding.vulnerableCode.lines.find((l) => l.flagged);
  return `arcade/fix-${finding.ruleId ?? "finding"}-${hash6(`${finding.vulnerableCode.path}\n${stripCr(flagged?.text ?? "").trim()}`)}`;
}

/**
 * Read the file as it is on the default branch now, apply the rule's rewrite,
 * and re-run the rule over the result. Read-only: nothing is written anywhere.
 * Throws FixBlocked unless the re-check says the flagged code is gone.
 */
export async function prepareFix(repo: string, raw: Finding): Promise<PreparedFix> {
  const finding = normalised(raw);
  const plan = fixPlanFor(finding);
  if (plan.kind === "none") throw new FixBlocked(plan.reason);

  const path = finding.vulnerableCode.path;
  const tree = await pinHead(repo);
  const blobSha = await blobShaOf(repo, path);
  if (!blobSha) throw new FixBlocked(`${path} is no longer in ${repo}. Assess the repository again.`);
  const content = await readFile(repo, path);
  if (content.kind !== "text") throw new FixBlocked(`${path} can no longer be read as text.`);

  const flagged = finding.vulnerableCode.lines.find((l) => l.flagged)!;
  const current = content.text.split(/\r?\n/)[plan.line - 1];
  if (current === undefined || current !== flagged.text) {
    throw new FixBlocked(`${path} has changed since it was analysed: line ${plan.line} is no longer the flagged code. Assess the repository again before fixing it.`);
  }

  const patched = applyEdit(content.text, plan.line, plan.edit);
  if (patched === content.text) throw new FixBlocked("The rule's rewrite leaves this line unchanged, so there is nothing to commit.");
  const verdict = verifyFile(finding, patched);
  if (!verdict.closed) throw new FixBlocked(`The rewrite was not kept. ${verdict.summary}`);

  return { path, line: plan.line, blobSha, commit: tree.commit, patched, file: diffTexts(path, content.text, patched), verdict, branch: branchFor(finding), note: plan.edit.note, caveat: plan.caveat };
}

/* -------------------------------------------------------------------- ship */

const cweOf = (f: Finding) => f.cwe.split("·")[0].trim();

const permalink = (repo: string, commit: string | null, path: string, line?: number) =>
  `https://github.com/${repo}/blob/${commit ?? "HEAD"}/${path.split("/").map(encodeURIComponent).join("/")}${line ? `#L${line}` : ""}`;

export function pullRequestText(finding: Finding, fix: PreparedFix, repo: string): { title: string; message: string; body: string } {
  const title = `${fix.note} (${cweOf(finding)})`;
  const body = [
    `**${finding.title}** — ${finding.severity}, ${finding.cwe}`,
    "",
    `Found by Arcade's static rule \`${finding.ruleId}\` at [\`${fix.path}:${fix.line}\`](${permalink(repo, fix.commit, fix.path, fix.line)}).`,
    "",
    finding.description,
    "",
    "### What this changes",
    `${fix.note}. One line in \`${fix.path}\`; nothing else is touched.`,
    ...(fix.caveat ? ["", `> **Before merging:** ${fix.caveat}`] : []),
    "",
    "### How it was checked",
    `${fix.verdict.summary} That is the only check this change has had: it is a rule-based rewrite made from a phone. No tests were run and nothing was executed, so review it like any other change.`,
  ].join("\n");
  return { title, message: `${title}\n\nArcade static rule ${finding.ruleId} · ${fix.path}:${fix.line}`, body };
}

/** Whether the connected token may push to `repo`, and where its pull requests go. */
export async function pushAccess(token: string, repo: string) {
  return repoAccess(token, repo);
}

/**
 * Commit the prepared file to its `arcade/fix-…` branch and open the pull
 * request. Call only after the user has confirmed the repository and branch.
 */
export async function shipFix(token: string, repo: string, finding: Finding, fix: PreparedFix): Promise<Extract<FixOutcome, { kind: "pull-request" }>> {
  if (isMemoryRepo(repo)) throw new FixBlocked("This is the built-in development fixture, not a GitHub repository, so there is nowhere to commit to.");

  const access = await repoAccess(token, repo);
  if (!access.canPush) {
    throw new FixBlocked(`Your GitHub token can read ${repo} but not push to it, so Arcade cannot create the branch. Use a token with the \`repo\` scope from an account with write access, or open an issue instead.`);
  }
  const base = access.defaultBranch;
  if (!fix.branch.startsWith("arcade/fix-") || fix.branch === base) throw new FixBlocked("Arcade only commits to its own arcade/fix-… branches.");

  // The patch is a whole-file replacement, so it must still be a patch of the file that is there now.
  await pinHead(repo);
  if ((await blobShaOf(repo, fix.path)) !== fix.blobSha) {
    throw new FixBlocked(`${fix.path} changed on ${base} while this fix was waiting. Nothing was committed — prepare the fix again.`);
  }

  // A pull request already open for this branch is the same fix: report it rather than stacking a second commit.
  const owner = repo.split("/")[0];
  const open = (await (await githubFetch(token, `/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${fix.branch}`)}`)).json()) as { number: number; html_url: string; head: { sha: string } }[];
  if (open[0]) {
    return { kind: "pull-request", branch: fix.branch, sha: open[0].head.sha, commitUrl: `https://github.com/${repo}/commit/${open[0].head.sha}`, number: open[0].number, url: open[0].html_url, existing: true, at: new Date().toISOString() };
  }

  const text = pullRequestText(finding, fix, repo);
  const commit = await commitFiles(token, repo, { branch: fix.branch, base, message: text.message, files: [{ path: fix.path, content: fix.patched }] });
  const pr = await openPullRequest(token, repo, { head: fix.branch, base, title: text.title, body: text.body });
  return { kind: "pull-request", branch: fix.branch, sha: commit.sha, commitUrl: commit.url, number: pr.number, url: pr.url, existing: pr.existing, at: new Date().toISOString() };
}

/* ------------------------------------------------------------------- issue */

/** Rules whose match is itself a secret: the flagged code must not be copied into an issue. */
const SECRET_RULES = new Set(["hardcoded-secret", "private-key"]);

export function issueText(finding: Finding, meta: Pick<AssessmentMeta, "repo" | "commit">): { title: string; body: string } {
  const line = finding.vulnerableCode.lines.find((l) => l.flagged)?.no;
  const path = finding.vulnerableCode.path;
  const secret = SECRET_RULES.has(finding.ruleId ?? "");
  const code = finding.vulnerableCode.lines.map((l) => `${l.flagged ? ">" : " "} ${String(l.no).padStart(4)}  ${stripCr(l.text)}`).join("\n");
  const body = [
    `**${finding.severity[0].toUpperCase()}${finding.severity.slice(1)}** · ${finding.cwe}`,
    "",
    `Arcade's static rule \`${finding.ruleId}\` matched [\`${path}${line ? `:${line}` : ""}\`](${permalink(meta.repo, meta.commit, path, line)}) at commit \`${shortSha(meta.commit)}\`.`,
    "",
    finding.description,
    "",
    ...(secret ? ["The flagged line is not copied here because it may contain the secret itself. Rotate the credential as well as removing it: it stays in the git history."] : ["```", code, "```"]),
    "",
    "### Suggested mitigations",
    ...finding.mitigations.map((m) => `- **${m.title}**${m.recommended ? " (recommended)" : ""} — ${m.detail}`),
    "",
    "_This is a pattern match from static analysis. Nothing was executed, and whether the line is reachable in practice needs a reviewer's judgement._",
  ].join("\n");
  return { title: `${finding.title} in ${path}`, body };
}

/** What the confirmation must tell the user before an issue is filed. */
export async function issueContext(token: string, repo: string): Promise<{ isPrivate: boolean; hasIssues: boolean }> {
  const r = (await (await githubFetch(token, `/repos/${repo}`)).json()) as { private: boolean; has_issues: boolean };
  return { isPrivate: !!r.private, hasIssues: r.has_issues !== false };
}

/** File the issue. Call only after the user has confirmed the repository. */
export async function openIssue(token: string, meta: Pick<AssessmentMeta, "repo" | "commit">, finding: Finding): Promise<Extract<FixOutcome, { kind: "issue" }>> {
  if (isMemoryRepo(meta.repo)) throw new FixBlocked("This is the built-in development fixture, not a GitHub repository, so there is nowhere to open an issue.");
  const res = await githubFetch(token, `/repos/${meta.repo}/issues`, undefined, { method: "POST", body: issueText(finding, meta) });
  const issue = (await res.json()) as { number: number; html_url: string };
  return { kind: "issue", number: issue.number, url: issue.html_url, at: new Date().toISOString() };
}
