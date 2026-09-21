/**
 * Real fixes — the file-level operations behind a remediation that actually lands.
 *
 * The run engine shows a *proposed* diff. This module is what turns a proposal
 * into a change on disk (or in a commit) and checks the result honestly:
 *
 *   applyEdit    the patched text for a rule's line edit
 *   isConcrete   a rewrite that changes behaviour, as opposed to a FIXME scaffold
 *   diffTexts    a reviewable unified diff from a file's before and after text
 *   verifyFile   re-run the finding's own rule over the patched text
 *
 * Pure: no filesystem, no network, no React. The desktop app, the CLI and the
 * mobile app all call it with text they read themselves.
 */
import type { DiffLine, Finding, RemediationFile } from "./types";
import { RULES, RULES_BY_ID, type FixEdit, type Rule, type RuleMatch } from "./rules";
import { extOf } from "./fs";

const MAX_LINE_LEN = 800;
const CONTEXT = 3;
/** Above this many differing lines on a side, the diff is reported as one replaced block. */
const MAX_LCS = 2500;

/** The rule that produced a finding. Two rules share CWE-798, so the id wins over the CWE. */
export function ruleOf(finding: Finding): Rule | undefined {
  return (finding.ruleId && RULES_BY_ID[finding.ruleId]) || RULES.find((r) => r.cwe === finding.cwe);
}

/** Apply one rule to one file's text — the scanner's matching, for a single file. */
export function matchRule(rule: Rule, path: string, text: string): RuleMatch[] {
  if (rule.ext && !rule.ext.includes(extOf(path))) return [];
  if (rule.fileScan) {
    try {
      return rule.fileScan(text, path);
    } catch {
      return [];
    }
  }
  if (!rule.pattern) return [];
  const out: RuleMatch[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > MAX_LINE_LEN) continue;
    rule.pattern.lastIndex = 0;
    const m = rule.pattern.exec(line);
    if (!m || (rule.refine && !rule.refine(line, path))) continue;
    out.push({ line: i + 1, column: m.index, excerpt: line.trim().slice(0, 240), captured: m[0] });
  }
  return out;
}

/** A scaffold leaves the weak line in place behind a comment; it documents a fix, it isn't one. */
export const isConcrete = (edit: Pick<FixEdit, "mode">) => edit.mode !== "insert-above";

/** The rule's own edit for a finding's flagged line, or null when there is nothing to anchor it to. */
export function ruleEdit(finding: Finding): { line: number; edit: FixEdit } | null {
  const rule = ruleOf(finding);
  const flagged = finding.vulnerableCode.lines.find((l) => l.flagged);
  if (!rule || !flagged) return null;
  // The scanner splits on "\n", so a line from a CRLF file still ends in "\r"; the rule should never see it.
  return { line: flagged.no, edit: rule.fix({ line: flagged.text.replace(/\r$/, ""), id: finding.id, mitigation: finding.mitigations[0] }) };
}

/** The file's text after a one-line edit. Line endings and indentation of the original are kept. */
export function applyEdit(text: string, lineNo: number, edit: { mode: FixEdit["mode"]; add?: string[] }): string {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const idx = lineNo - 1;
  if (idx < 0 || idx >= lines.length) throw new Error(`Line ${lineNo} is outside the file`);
  const indent = /^\s*/.exec(lines[idx])![0];
  // A replacement carries its own indentation (it was derived from the line); an inserted guard takes the line's.
  // Line endings are this function's job: a stray "\r" on an added line would double up when re-joined.
  const added = (edit.add ?? []).map((l) => l.replace(/\r$/, "")).map((l) => (edit.mode === "insert-above" ? indent + l.trimStart() : l));
  if (edit.mode === "remove") lines.splice(idx, 1);
  else if (edit.mode === "replace") lines.splice(idx, 1, ...added);
  else lines.splice(idx, 0, ...added);
  return lines.join(eol);
}

/* --------------------------------------------------------------------- diff */

/** Longest common subsequence over two line arrays, as index pairs. */
function lcs(a: string[], b: string[]): [number, number][] {
  const n = a.length;
  const m = b.length;
  const table = new Uint32Array((n + 1) * (m + 1));
  const w = m + 1;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * w + j] = a[i] === b[j] ? table[(i + 1) * w + j + 1] + 1 : Math.max(table[(i + 1) * w + j], table[i * w + j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) pairs.push([i++, j++]);
    else if (table[(i + 1) * w + j] >= table[i * w + j + 1]) i++;
    else j++;
  }
  return pairs;
}

type Op = { kind: "context" | "add" | "del"; text: string };

function lineOps(before: string[], after: string[]): Op[] {
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head++;
  let tail = 0;
  while (tail < before.length - head && tail < after.length - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail++;

  const a = before.slice(head, before.length - tail);
  const b = after.slice(head, after.length - tail);
  const ops: Op[] = before.slice(0, head).map((text) => ({ kind: "context", text }));

  if (a.length > MAX_LCS || b.length > MAX_LCS) {
    ops.push(...a.map((text): Op => ({ kind: "del", text })), ...b.map((text): Op => ({ kind: "add", text })));
  } else {
    let i = 0;
    let j = 0;
    for (const [pi, pj] of lcs(a, b)) {
      while (i < pi) ops.push({ kind: "del", text: a[i++] });
      while (j < pj) ops.push({ kind: "add", text: b[j++] });
      ops.push({ kind: "context", text: a[i] });
      i++;
      j++;
    }
    while (i < a.length) ops.push({ kind: "del", text: a[i++] });
    while (j < b.length) ops.push({ kind: "add", text: b[j++] });
  }

  ops.push(...before.slice(before.length - tail).map((text): Op => ({ kind: "context", text })));
  return ops;
}

/**
 * A unified diff (three lines of context) between a file's old and new text.
 * `before` null means the file is new; `after` null means it was deleted.
 */
export function diffTexts(path: string, before: string | null, after: string | null): RemediationFile {
  const split = (t: string | null) => (t == null || t === "" ? [] : t.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n"));
  const ops = lineOps(split(before), split(after));

  const diff: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;
  let oldNo = 1;
  let newNo = 1;
  const numbered = ops.map((op) => {
    const row = { ...op, oldNo: op.kind === "add" ? undefined : oldNo, newNo: op.kind === "del" ? undefined : newNo };
    if (op.kind !== "add") oldNo++;
    if (op.kind !== "del") newNo++;
    return row;
  });

  let i = 0;
  while (i < numbered.length) {
    if (numbered[i].kind === "context") {
      i++;
      continue;
    }
    // Grow a hunk from this change until CONTEXT*2 unchanged lines separate it from the next one.
    const start = Math.max(0, i - CONTEXT);
    let end = i;
    let quiet = 0;
    for (let k = i; k < numbered.length; k++) {
      if (numbered[k].kind === "context") {
        if (++quiet > CONTEXT * 2) break;
      } else {
        quiet = 0;
        end = k;
      }
    }
    const stop = Math.min(numbered.length - 1, end + CONTEXT);
    const rows = numbered.slice(start, stop + 1);
    const olds = rows.filter((r) => r.kind !== "add");
    const news = rows.filter((r) => r.kind !== "del");
    diff.push({ kind: "hunk", text: `@@ -${olds[0]?.oldNo ?? 0},${olds.length} +${news[0]?.newNo ?? 0},${news.length} @@` });
    for (const r of rows) {
      diff.push({ kind: r.kind, oldNo: r.oldNo, newNo: r.newNo, text: r.text });
      if (r.kind === "add") additions++;
      else if (r.kind === "del") deletions++;
    }
    i = stop + 1;
  }

  return { path, status: before == null ? "A" : after == null ? "D" : "M", additions, deletions, diff };
}

/* ------------------------------------------------------------------- verify */

export interface FileVerdict {
  /** The finding's rule no longer fires where it did. */
  closed: boolean;
  /** Places the same rule still fires in this file after the change. */
  remaining: RuleMatch[];
  summary: string;
}

/**
 * Re-run the finding's rule over the patched file. "Closed" means the flagged
 * code is gone: no remaining match carries the original excerpt. Other matches
 * of the same rule elsewhere in the file are reported, not held against the fix.
 */
export function verifyFile(finding: Finding, patched: string | null): FileVerdict {
  const rule = ruleOf(finding);
  if (!rule) return { closed: false, remaining: [], summary: "The rule behind this finding is not in this build, so it can't be re-checked." };
  if (patched == null) return { closed: true, remaining: [], summary: "The file that held the weakness was removed." };

  const remaining = matchRule(rule, finding.vulnerableCode.path, patched);
  const flagged = finding.vulnerableCode.lines.find((l) => l.flagged);
  const original = flagged?.text.trim().slice(0, 240);
  const still = original ? remaining.some((m) => m.excerpt === original) : remaining.length > 0;

  if (still) return { closed: false, remaining, summary: `Re-ran ${rule.id} over the patched file: the flagged code is still there.` };
  return {
    closed: true,
    remaining,
    summary: remaining.length
      ? `Re-ran ${rule.id} over the patched file: the flagged code is gone. ${remaining.length} other match${remaining.length === 1 ? "" : "es"} of the same rule remain in this file.`
      : `Re-ran ${rule.id} over the patched file: it no longer fires.`,
  };
}
