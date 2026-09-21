/**
 * Arcade ADE — core data models.
 *
 * These are the same shapes the demo run uses and that a real agent backend
 * would populate. The demo store in `store.ts` produces values of these types;
 * every view renders from them. Nothing here is UI-specific.
 */

export type Severity = "critical" | "high" | "medium" | "low";

export type AgentKind =
  | "mapper"
  | "attacker"
  | "defender"
  | "remediator"
  | "verifier";

export type AgentStatus =
  | "idle"
  | "queued"
  | "running"
  | "done"
  | "awaiting-approval"
  | "blocked";

/** One of the five specialized agents in the fleet. */
export interface Agent {
  kind: AgentKind;
  name: string;
  role: string;
  status: AgentStatus;
  /** Short description of what it is doing right now. */
  task: string;
  /** 0..1 completion of the current task. */
  progress: number;
}

/** A node in the attack-surface graph. */
export interface SurfaceNode {
  id: string;
  label: string;
  kind:
    | "user"
    | "browser"
    | "api"
    | "auth"
    | "service"
    | "database"
    | "thirdparty"
    | "admin"
    | "secrets";
  /** Grid coordinates for layout (col, row). */
  col: number;
  row: number;
  risk: "safe" | "attention" | "vulnerable";
  detail: string;
}

export interface SurfaceEdge {
  from: string;
  to: string;
  /** True if this edge is part of the proven exploit path. */
  vulnerable?: boolean;
  label?: string;
}

export interface AttackSurface {
  nodes: SurfaceNode[];
  edges: SurfaceEdge[];
  /** ordered node ids describing the proven exploit path */
  exploitPath: string[];
}

/** Reproducible proof that an exploit worked. */
export interface Evidence {
  method: string;
  target: string;
  requestHeaders: string[];
  requestBody?: string;
  statusBefore: string;
  responseBody: string;
  steps: string[];
  artifact: string;
  capturedAt: string;
}

export interface DiffLine {
  kind: "hunk" | "context" | "add" | "del";
  oldNo?: number;
  newNo?: number;
  text: string;
}

export interface RemediationFile {
  path: string;
  status: "M" | "A" | "D";
  additions: number;
  deletions: number;
  diff: DiffLine[];
}

export interface TestResult {
  name: string;
  suite: string;
  passed: boolean;
  ms: number;
}

export interface Remediation {
  branch: string;
  commit: string;
  summary: string;
  rootCause: string;
  files: RemediationFile[];
  tests: TestResult[];
  commands: string[];
}

/** A ranked mitigation the defender proposes. */
export interface Mitigation {
  title: string;
  detail: string;
  recommended: boolean;
  effort: "low" | "medium" | "high";
}

export interface Verification {
  outcome: "pending" | "verified" | "failed";
  /** independent — verifier has no memory of the fix */
  independent: boolean;
  replaySummary: string;
  statusBefore: string;
  statusAfter: string;
  mutatedPayloads: number;
  mutatedSucceeded: number;
  regressionPassed: number;
  regressionTotal: number;
}

export type FindingStatus =
  | "reproduced"
  | "analyzing"
  | "awaiting-approval"
  | "remediating"
  | "verifying"
  | "verified"
  | "verification-failed";

export type TimelineKind =
  | "map"
  | "attack"
  | "evidence"
  | "defend"
  | "approve"
  | "remediate"
  | "test"
  | "verify"
  | "human"
  | "info";

export interface TimelineEvent {
  time: string;
  actor: string;
  kind: TimelineKind;
  text: string;
}

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  status: FindingStatus;
  target: string;
  /** The scanner rule that produced this finding (or `model-…` for a model-discovered one). */
  ruleId?: string;
  cwe: string;
  summary: string;
  description: string;
  attackNarrative: string;
  vulnerableCode: { path: string; lines: { no: number; text: string; flagged?: boolean }[] };
  evidence: Evidence;
  mitigations: Mitigation[];
  remediation: Remediation;
  verification: Verification;
  timeline: TimelineEvent[];
  agent: string;
  createdAt: string;
}

export type ApprovalKind = "code" | "destructive" | "ship";
export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface Approval {
  id: string;
  kind: ApprovalKind;
  title: string;
  reason: string;
  target: string;
  status: ApprovalStatus;
  /** What was actually established before asking (tests that ran, the re-check result). Shown with the request. */
  evidence?: string;
  /** Names the action the approve button takes, e.g. "Push & open pull request". */
  approveLabel?: string;
}

export interface TargetEnvironment {
  isolated: boolean;
  disposable: boolean;
  host: string;
  network: string;
  sandboxId: string;
}

export interface Workspace {
  id: string;
  name: string;
  branch: string;
  status: "active" | "queued" | "done";
  agents: AgentKind[];
}

export interface Project {
  id: string;
  name: string;
  repo: string;
  description: string;
  technologies: string[];
  services: string[];
  endpoints: number;
  authBoundaries: number;
  integrations: number;
  privilegedOps: number;
}

/** Which coding agent is driving Arcade (Bring Your Own Agent). */
export interface AgentProvider {
  id: string;
  name: string;
  connected: boolean;
}

/** The phases the demo run moves through. */
export type RunPhase =
  | "idle"
  | "mapping"
  | "mapped"
  | "attacking"
  | "attacked"
  | "defending"
  | "defended"
  | "awaiting-fix-approval"
  | "remediating"
  | "testing"
  | "verifying"
  | "verified";

export interface ArcadeState {
  project: Project;
  environment: TargetEnvironment;
  workspaces: Workspace[];
  providers: AgentProvider[];
  agents: Record<AgentKind, Agent>;
  surface: AttackSurface;
  finding: Finding;
  secondaryFindings: Finding[];
  approvals: Approval[];
  timeline: TimelineEvent[];
  terminal: TerminalLine[];
  phase: RunPhase;
  /** how many surface nodes have been revealed by the mapper */
  revealedNodes: number;
}

export interface TerminalLine {
  agent: AgentKind | "system";
  kind: "cmd" | "info" | "sub" | "ok" | "err" | "warn" | "plain";
  text: string;
}
