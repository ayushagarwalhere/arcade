/**
 * The assessment pipeline — the orchestrator that runs the five agents.
 *
 *   Mapper    → understands the project (profile + attack surface)
 *   Attacker  → reproduces each weakness as a finding, with evidence
 *   Defender  → traces root cause and ranks the fixes
 *   Remediator→ writes the fix diff and a regression test
 *   Verifier  → independently re-checks that the fix closes the weakness
 *
 * It reads only through the WorkspaceFs, runs a provider (local by default),
 * and returns a RunPlan the store can play. Everything is read-only and
 * side-effect free: no file is written and nothing is executed. With the local
 * provider no network call leaves the process; the Bedrock provider sends
 * source to the Arcade API, which redacts secrets before any model sees it.
 */
import type { WorkspaceFs } from "@arcade/core/fs";
import type { Finding, Project } from "@arcade/core/types";
import { scanWorkspace, type Scan, type ScanProgress } from "@arcade/core/scanner";
import { bySeverity } from "@arcade/core/rules";
import { mapProject, mapSurface } from "@arcade/agents/mapper";
import { reproduce } from "@arcade/agents/attacker";
import { defend } from "@arcade/agents/defender";
import { remediate } from "@arcade/agents/remediator";
import { verify } from "@arcade/agents/verifier";
import { LOCAL_PROVIDER, type AssessmentProvider } from "@arcade/agents/provider";
import { buildLivePlan, type LiveInput } from "./live-engine";
import { proposeFix } from "./proposal";
import type { RunPlan } from "@arcade/core/engine";

export interface AssessmentOptions {
  profile: "full" | "scan-only";
  scope: "all" | "source";
  projectName: string;
  projectPath: string;
  provider?: AssessmentProvider;
  /**
   * The caller will carry the remediation out for real (branch, edit, tests, re-check,
   * commit). The assessment then stops at the ranked fixes and pre-fills no results:
   * the plan ends after "defended" and the finding carries only an honest proposal.
   */
  handoff?: boolean;
}

export type Stage = "scanning" | "mapping" | "reproducing" | "analyzing" | "remediating" | "verifying" | "planning" | "done";

export interface PipelineProgress {
  stage: Stage;
  label: string;
  filesScanned: number;
  totalFiles: number;
  findings: number;
}

export interface Assessment {
  scan: Scan;
  project: Project;
  findings: Finding[];
  plan: RunPlan;
}

/** A stand-in for the state's single finding slot when a scan is clean. */
function cleanFinding(project: Project): Finding {
  return {
    id: "ARC-000",
    title: "No weaknesses matched the rule set",
    severity: "low",
    status: "verified",
    target: project.repo,
    cwe: "—",
    summary: "The static rule set found no matching weaknesses in the analysed files.",
    description: "This does not prove the project is secure — only that none of the current rules fired. Add rules or a model provider to go deeper.",
    attackNarrative: "",
    vulnerableCode: { path: "", lines: [] },
    evidence: { method: "STATIC", target: "", requestHeaders: [], statusBefore: "—", responseBody: "—", steps: [], artifact: "", capturedAt: "" },
    mitigations: [],
    remediation: { branch: "", commit: "", summary: "", rootCause: "", files: [], tests: [], commands: [] },
    verification: { outcome: "verified", independent: true, replaySummary: "", statusBefore: "—", statusAfter: "—", mutatedPayloads: 0, mutatedSucceeded: 0, regressionPassed: 0, regressionTotal: 0 },
    timeline: [],
    agent: "Mapper",
    createdAt: "",
  };
}

/**
 * Run the whole loop over an imported workspace. Cooperative and cancellable so
 * the launch UI can show progress and the user can back out.
 */
export async function runAssessment(
  fs: WorkspaceFs,
  opts: AssessmentOptions,
  onProgress: (p: PipelineProgress) => void,
  isCancelled: () => boolean = () => false,
): Promise<Assessment> {
  const provider = opts.provider ?? LOCAL_PROVIDER;
  const report = (stage: Stage, label: string, scan?: Scan, sp?: ScanProgress) =>
    onProgress({ stage, label, filesScanned: sp?.filesScanned ?? scan?.filesScanned ?? 0, totalFiles: sp?.total ?? 0, findings: sp?.hits ?? scan?.hits.length ?? 0 });

  // 1. Scan --------------------------------------------------------------
  report("scanning", "Scanning the workspace…");
  const scan = await scanWorkspace(fs, { scope: opts.scope }, isCancelled, (sp) => report("scanning", `Scanning · ${sp.filesScanned} files`, undefined, sp));

  // Optional: a model provider surfaces weaknesses the static rules miss.
  if (provider.discover) {
    try {
      const extra = await provider.discover(scan.hits, scan.sources);
      scan.hits.push(...extra);
      // The scanner sorted before the model added its hits; findings[0] must still be the most severe.
      scan.hits.sort((a, b) => bySeverity(a.rule, b.rule));
    } catch {
      /* provider optional; ignore failures */
    }
  }

  // 2. Map ---------------------------------------------------------------
  report("mapping", "Mapping the application…", scan);
  const project = mapProject(scan, opts.projectName, opts.projectPath);

  // 3. Attack (reproduce) ------------------------------------------------
  report("reproducing", "Reproducing findings in the sandbox…", scan);
  let findings = reproduce(scan);

  // 4-6. Defend → Remediate → Verify.
  // The top finding runs the full loop; secondaries are analysed (defended) so
  // the list is explained without generating a diff for every one.
  if (findings.length) {
    report("analyzing", "Tracing root cause and ranking fixes…", scan);
    const explained = await Promise.all(findings.map((f) => defend(f, scan.sources[f.vulnerableCode.path] ?? "", provider)));
    findings = explained;

    if (opts.profile === "full" && opts.handoff) {
      report("remediating", "Preparing the fix proposal…", scan);
      findings[0] = proposeFix(findings[0], scan.sources[findings[0].vulnerableCode.path]);
    } else if (opts.profile === "full") {
      report("remediating", "Writing the fix and a regression test…", scan);
      const top = await remediate(findings[0], scan.sources[findings[0].vulnerableCode.path], provider);
      report("verifying", "Independently verifying the fix…", scan);
      findings[0] = verify(top);
    }
  }

  // 7. Plan --------------------------------------------------------------
  report("planning", "Assembling the run…", scan);
  const surface = mapSurface(findings, scan);
  const top = findings[0] ?? cleanFinding(project);
  const input: LiveInput = {
    project,
    surface,
    findings,
    top,
    secondary: findings.slice(1),
    scan,
    profile: findings.length ? opts.profile : "scan-only",
    handoff: !!opts.handoff,
  };
  const plan = buildLivePlan(input);

  report("done", `Found ${findings.length} finding${findings.length === 1 ? "" : "s"}`, scan);
  return { scan, project, findings, plan };
}
