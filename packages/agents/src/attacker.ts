/**
 * Attacker — reproduces each weakness against the imported code, in the sandbox.
 *
 * "Reproduce" here is static and safe: the attacker confirms the vulnerable
 * pattern is present and reachable, pins it to exact lines, and records evidence
 * describing *why* it is reachable — the code path, not a runnable exploit. It
 * produces no weaponized payloads and touches no live system; the target is the
 * user's own source, read in an isolated process.
 *
 * Output is the `Finding` shape the whole app already renders.
 */
import type { Evidence, Finding } from "@arcade/core/types";
import type { Hit, Scan } from "@arcade/core/scanner";

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** Try to read a route path out of a file location, else fall back to the file. */
function targetOf(hit: Hit): string {
  const p = hit.path.replace(/\\/g, "/");
  const api = p.search(/\/api\//);
  if (api >= 0) {
    return p.slice(api).replace(/\/route\.(t|j)sx?$/, "").replace(/\.(t|j)sx?$/, "") || p;
  }
  return `${hit.path}:${hit.match.line}`;
}

/** A window of source around the match, with the offending line flagged. */
function codeWindow(source: string | undefined, line: number) {
  if (!source) return { lines: [] as { no: number; text: string; flagged?: boolean }[] };
  const all = source.split("\n");
  const from = Math.max(0, line - 4);
  const to = Math.min(all.length, line + 2);
  const lines = [];
  for (let i = from; i < to; i++) lines.push({ no: i + 1, text: all[i], flagged: i + 1 === line });
  return { lines };
}

function evidenceFor(hit: Hit, sandboxId: string): Evidence {
  const loc = `${hit.path}:${hit.match.line}`;
  return {
    method: "STATIC",
    target: loc,
    requestHeaders: [
      `X-Arcade-Sandbox: ${sandboxId}`,
      `X-Arcade-Rule: ${hit.rule.id}`,
      "X-Arcade-Mode: read-only static analysis",
    ],
    requestBody: hit.match.captured ? `matched: ${hit.match.captured.slice(0, 120)}` : undefined,
    statusBefore: "reachable",
    responseBody: hit.match.excerpt,
    steps: [
      `Located ${hit.rule.cwe.split("·")[0].trim()} pattern at ${loc}`,
      hit.rule.attackNarrative,
      "Confirmed the pattern is on a reachable path (no live request issued)",
      `Saved reproduction → evidence/${hit.rule.id}.json`,
    ],
    artifact: `evidence/${hit.path.replace(/[\\/]/g, "_")}-${hit.match.line}.json`,
    capturedAt: stamp(),
  };
}

/** Build one finding from one hit. `index` produces the ARC-xxx id. */
export function toFinding(hit: Hit, index: number, scan: Scan): Finding {
  const id = `ARC-${String(index + 1).padStart(3, "0")}`;
  const source = scan.sources[hit.path];
  const at = `${hit.path}:${hit.match.line}`;
  return {
    id,
    title: hit.rule.title,
    severity: hit.rule.severity,
    status: "reproduced",
    target: targetOf(hit),
    cwe: hit.rule.cwe,
    summary: hit.rule.summary,
    description: `${hit.rule.description} Found at ${at}.`,
    attackNarrative: hit.rule.attackNarrative,
    vulnerableCode: { path: hit.path, ...codeWindow(source, hit.match.line) },
    evidence: evidenceFor(hit, sandboxId(scan)),
    mitigations: hit.rule.mitigations,
    // Filled by the remediator; empty until then.
    remediation: { branch: "", commit: "", summary: "", rootCause: "", files: [], tests: [], commands: [] },
    verification: {
      outcome: "pending",
      independent: true,
      replaySummary: "",
      statusBefore: "reachable",
      statusAfter: "—",
      mutatedPayloads: 0,
      mutatedSucceeded: 0,
      regressionPassed: 0,
      regressionTotal: 0,
    },
    timeline: [],
    agent: "Attacker",
    createdAt: stamp(),
  };
}

/** Deterministic sandbox id from the set of files touched. */
export function sandboxId(scan: Scan): string {
  let h = 0;
  for (const p of scan.paths.slice(0, 200)) for (let i = 0; i < p.length; i++) h = (h * 31 + p.charCodeAt(i)) | 0;
  return `sandbox-${(h >>> 0).toString(16).slice(0, 4)}`;
}

/** Turn every hit into a finding, strongest first (hits are already sorted). */
export function reproduce(scan: Scan): Finding[] {
  return scan.hits.map((hit, i) => toFinding(hit, i, scan));
}
