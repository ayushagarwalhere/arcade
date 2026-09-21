/**
 * A real assessment of a GitHub repository, run on the phone.
 *
 * The shared pipeline does the work — crawl, the static rule set, the mapper,
 * the root-cause pass — over the repository read through the GitHub API. What
 * this module adds is the phone's side of it: pinning the commit, bounded
 * fetching, errors that must stop the run, and an account of the result that
 * says only what happened.
 *
 * That last part matters. The shared live plan narrates a sandbox, a commit
 * and a test run; none of those take place here, so this module builds its own
 * run state from the pipeline's data instead of playing that script: findings
 * are pattern matches from static analysis, nothing was executed, and a fix
 * exists only once the user approves one (see fix.ts).
 */
import type { RunPlan } from "@/core/engine";
import { initialAgents } from "@/core/demo";
import { RULES } from "@/core/rules";
import type { ScanOptions } from "@/core/scanner";
import type { ArcadeState, AttackSurface, Finding, Project, Severity, TerminalLine, TimelineEvent } from "@/core/types";
import { runAssessment } from "@/orchestrator/pipeline";
import { isMemoryRepo, pinHead } from "@/github/repo-fs";
import { repoWorkspace } from "./repo-workspace";

export type Scope = ScanOptions["scope"];

export interface AssessmentMeta {
  repo: string;
  /** "fixture" is the development-only in-memory repository; it never exists in a production build. */
  source: "github" | "fixture";
  /** The commit that was analysed. */
  commit: string | null;
  scope: Scope;
  finishedAt: string;
  filesIndexed: number;
  filesAnalysed: number;
  bytesAnalysed: number;
  /** Files GitHub would not return. They were not analysed. */
  unreadable: number;
  rules: number;
  /** GitHub cut the file listing short, so the deepest paths were never seen. */
  treeTruncated: boolean;
  /** The scanner stopped at its cap on matches; files after that point were not analysed. */
  scanTruncated: boolean;
  /** Matches found. `findings` may hold fewer once an assessment has been stored. */
  totalFindings: number;
}

/** What happened to one finding after the scan. Only finished, real outcomes are kept. */
export type FixOutcome =
  | { kind: "pull-request"; branch: string; sha: string; commitUrl: string; number: number; url: string; existing: boolean; at: string }
  | { kind: "issue"; number: number; url: string; at: string };

export interface StoredAssessment {
  v: 1;
  meta: AssessmentMeta;
  project: Project;
  surface: AttackSurface;
  findings: Finding[];
  outcomes: Record<string, FixOutcome>;
}

export interface AssessProgress {
  stage: "listing" | "scanning" | "explaining" | "done";
  filesRead: number;
  totalFiles: number;
  findings: number;
  current?: string;
}

export class AssessmentCancelled extends Error {
  constructor() {
    super("The assessment was cancelled.");
  }
}

export const shortSha = (sha: string | null) => (sha ? sha.slice(0, 7) : "HEAD");

/** "static analysis of owner/repo @ 1a2b3c4" — the one-line answer to "what am I looking at?". */
export const describeRun = (meta: AssessmentMeta) => `Static analysis of ${meta.repo} @ ${shortSha(meta.commit)}`;

const clock = (d = new Date()) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const flaggedLine = (f: Finding) => f.vulnerableCode.lines.find((l) => l.flagged)?.no;

/**
 * The pipeline's finding, restated for what the phone actually did. The shared
 * attacker writes evidence as if a sandbox run had been saved; here the only
 * evidence is the match itself.
 */
function honest(f: Finding): Finding {
  const at = `${f.vulnerableCode.path}:${flaggedLine(f) ?? "?"}`;
  return {
    ...f,
    status: "reproduced",
    agent: f.ruleId ? `Static rule ${f.ruleId}` : "Static analysis",
    evidence: {
      ...f.evidence,
      method: "STATIC",
      target: at,
      requestHeaders: [`rule: ${f.ruleId ?? "unknown"}`, "mode: static analysis — nothing was executed"],
      statusBefore: "pattern present",
      steps: [`The rule's pattern matched the source at ${at}.`, "No request was sent and no code was run; whether the line is reachable in practice is for a reviewer to judge."],
      artifact: "",
    },
    verification: { ...f.verification, outcome: "pending", independent: false, replaySummary: "", statusBefore: "pattern present", statusAfter: "—", mutatedPayloads: 0, mutatedSucceeded: 0, regressionPassed: 0, regressionTotal: 0 },
  };
}

/**
 * Assess `repo` at its current default-branch commit. Rejects with the GitHub
 * error when a rate limit or a rejected token stops the run, and with
 * AssessmentCancelled when the user backs out — never resolves with a partial
 * scan dressed as a full one.
 */
export async function assessRepo(repo: string, scope: Scope, onProgress: (p: AssessProgress) => void, isCancelled: () => boolean): Promise<StoredAssessment> {
  onProgress({ stage: "listing", filesRead: 0, totalFiles: 0, findings: 0 });
  const tree = await pinHead(repo);
  if (isCancelled()) throw new AssessmentCancelled();

  let hits = 0;
  let total = 0;
  const workspace = repoWorkspace(repo, (filesRead, current) => onProgress({ stage: "scanning", filesRead, totalFiles: total, findings: hits, current }));
  const candidates = await workspace.candidates(scope);
  total = candidates.length;
  workspace.prime(candidates);

  const result = await runAssessment(
    workspace.fs,
    { profile: "scan-only", scope, projectName: repo.slice(repo.indexOf("/") + 1), projectPath: repo },
    (p) => {
      hits = p.findings;
      if (p.stage === "scanning") onProgress({ stage: "scanning", filesRead: workspace.filesRead(), totalFiles: total, findings: hits });
      else if (p.stage !== "done") onProgress({ stage: "explaining", filesRead: workspace.filesRead(), totalFiles: total, findings: hits });
    },
    () => isCancelled() || !!workspace.fatal(),
  );

  const fatal = workspace.fatal();
  if (fatal) throw fatal;
  if (isCancelled()) throw new AssessmentCancelled();

  const { scan, plan } = result;
  const findings = result.findings.map(honest);
  const meta: AssessmentMeta = {
    repo,
    source: isMemoryRepo(repo) ? "fixture" : "github",
    commit: tree.commit,
    scope,
    finishedAt: new Date().toISOString(),
    filesIndexed: scan.paths.length,
    filesAnalysed: scan.filesScanned,
    bytesAnalysed: scan.bytesScanned,
    unreadable: workspace.unreadable().length,
    rules: RULES.length,
    treeTruncated: tree.truncated,
    scanTruncated: scan.truncated,
    totalFindings: findings.length,
  };
  const project: Project = {
    ...result.project,
    description: `${describeRun(meta)}. ${meta.filesAnalysed} of ${meta.filesIndexed} files were checked against ${meta.rules} rules on this phone. Nothing was executed.`,
  };

  onProgress({ stage: "done", filesRead: workspace.filesRead(), totalFiles: total, findings: findings.length });
  return { v: 1, meta, project, surface: plan.initial.surface, findings, outcomes: {} };
}

/* --------------------------------------------------------------- run state */

const countBy = (findings: Finding[]) => {
  const c: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of findings) c[f.severity]++;
  return c;
};

export const IDLE_REWRITE = "Rewrites a line only after you approve it";

/** Shown in the single-finding slot of the run state when no rule matched. It is never listed as a finding. */
export const CLEAN_ID = "ARC-000";

function cleanFinding(a: StoredAssessment): Finding {
  return {
    id: CLEAN_ID,
    title: "No rule matched",
    severity: "low",
    status: "reproduced",
    target: a.meta.repo,
    cwe: "—",
    summary: `None of the ${a.meta.rules} static rules matched the ${a.meta.filesAnalysed} files that were analysed.`,
    description: "This does not show the repository is secure — only that none of the current rules fired on the files that were read.",
    attackNarrative: "",
    vulnerableCode: { path: "", lines: [] },
    evidence: { method: "STATIC", target: "", requestHeaders: [], statusBefore: "—", responseBody: "", steps: [], artifact: "", capturedAt: "" },
    mitigations: [],
    remediation: { branch: "", commit: "", summary: "", rootCause: "", files: [], tests: [], commands: [] },
    verification: { outcome: "pending", independent: false, replaySummary: "", statusBefore: "—", statusAfter: "—", mutatedPayloads: 0, mutatedSucceeded: 0, regressionPassed: 0, regressionTotal: 0 },
    timeline: [],
    agent: "Static analysis",
    createdAt: "",
  };
}

/**
 * The run state for a finished assessment. There are no beats to play: the
 * work already happened, so the state starts complete and only changes when
 * something real does (an approval, a prepared fix, a pull request).
 */
export function planFor(a: StoredAssessment): RunPlan {
  const { meta, findings } = a;
  const counts = countBy(findings);
  const when = clock(new Date(meta.finishedAt));
  const agents = initialAgents();
  const done = { status: "done", progress: 1 } as const;
  // The engine's five agents, named for what each one actually did here.
  agents.mapper = { ...agents.mapper, ...done, name: "Index", role: "Lists the repository and recognises the stack", task: `Indexed ${meta.filesIndexed} files · ${a.project.technologies.slice(0, 4).join(" · ") || "stack not recognised"}` };
  agents.attacker = { ...agents.attacker, ...done, name: "Scan", role: "Matches the static rule set against the source", task: `${meta.rules} static rules over ${meta.filesAnalysed} files · ${meta.totalFindings} match${meta.totalFindings === 1 ? "" : "es"}` };
  agents.defender = { ...agents.defender, ...done, name: "Explain", role: "Root cause and ranked mitigations, from the rule set", task: findings.length ? "Root cause and ranked mitigations, from the rule set" : "Nothing to explain" };
  agents.remediator = { ...agents.remediator, status: "idle", progress: 0, name: "Rewrite", role: "Applies a rule's concrete rewrite, once you approve it", task: IDLE_REWRITE };
  agents.verifier = { ...agents.verifier, status: "idle", progress: 0, name: "Re-check", role: "Re-runs the same rule over the patched file", task: "Re-runs the rule on the patched file before anything is committed" };

  const terminal: TerminalLine[] = [
    { agent: "system", kind: "plain", text: `${describeRun(meta).toLowerCase()} · scope: ${meta.scope} · read-only, nothing executed` },
    { agent: "mapper", kind: "info", text: `indexed ${meta.filesIndexed} files${meta.treeTruncated ? " (GitHub truncated the listing)" : ""}` },
    { agent: "attacker", kind: "info", text: `analysed ${meta.filesAnalysed} files with ${meta.rules} rules${meta.unreadable ? ` · ${meta.unreadable} could not be read` : ""}` },
    ...findings.slice(0, 40).map((f): TerminalLine => ({ agent: "attacker", kind: f.severity === "critical" || f.severity === "high" ? "warn" : "sub", text: `${f.severity.toUpperCase()}  ${f.ruleId ?? f.title} · ${f.vulnerableCode.path}:${flaggedLine(f) ?? "?"}` })),
    ...(findings.length > 40 ? [{ agent: "attacker", kind: "plain", text: `…and ${findings.length - 40} more` } as TerminalLine] : []),
    { agent: "attacker", kind: findings.length ? "err" : "ok", text: findings.length ? `${meta.totalFindings} findings · ${counts.critical} critical, ${counts.high} high, ${counts.medium} medium, ${counts.low} low` : "no rule matched" },
  ];
  const timeline: TimelineEvent[] = [
    { time: when, actor: "Arcade", kind: "map", text: `Read ${meta.repo} @ ${shortSha(meta.commit)} from GitHub and indexed ${meta.filesIndexed} files` },
    { time: when, actor: "Arcade", kind: "attack", text: `Static analysis of ${meta.filesAnalysed} files matched ${meta.totalFindings} finding${meta.totalFindings === 1 ? "" : "s"}` },
    // What was really done about a finding, carried over when a stored assessment is reopened.
    ...Object.entries(a.outcomes).map(
      ([id, o]): TimelineEvent =>
        o.kind === "pull-request"
          ? { time: clock(new Date(o.at)), actor: "You", kind: "remediate", text: `${id}: pull request #${o.number} opened from ${o.branch} (${shortSha(o.sha)})` }
          : { time: clock(new Date(o.at)), actor: "You", kind: "human", text: `${id}: issue #${o.number} opened` },
    ),
  ];

  const top = findings[0] ?? cleanFinding(a);
  const initial: ArcadeState = {
    project: a.project,
    environment: { isolated: false, disposable: false, host: "this phone", network: "api.github.com", sandboxId: "" },
    workspaces: [],
    providers: [],
    agents,
    surface: a.surface,
    finding: { ...top, timeline: [] },
    secondaryFindings: findings.slice(1),
    approvals: [],
    timeline,
    terminal,
    phase: findings.length ? "defended" : "attacked",
    revealedNodes: a.surface.nodes.length,
  };
  return { beats: [], initial };
}
