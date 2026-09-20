/**
 * The persistence contract.
 *
 * Routes talk to a `Store`, never to DynamoDB directly. `dynamo.ts` is the
 * production implementation; `memory.ts` is a faithful in-process twin used by
 * local development and the test suite. Every method takes the org id, so
 * tenant isolation is structural: there is no way to ask for a record without
 * naming the org it belongs to.
 *
 * The audit trail is append-only by construction — the interface has no way to
 * edit or delete an event.
 */
import type { ApprovalKind, ApprovalStatus, AttackSurface, Finding, RunPhase, TimelineKind } from "@arcade/core/types";

export type Role = "viewer" | "member" | "admin" | "owner";
export const ROLE_RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };

export interface User {
  id: string;
  email?: string;
  name?: string;
  createdAt: string;
}

export interface Org {
  id: string;
  name: string;
  createdBy: string;
  createdAt: string;
}

export interface Membership {
  orgId: string;
  userId: string;
  role: Role;
  createdAt: string;
}

export interface ProjectRecord {
  id: string;
  orgId: string;
  name: string;
  repo?: string;
  description?: string;
  createdBy: string;
  createdAt: string;
}

export type RunStatus = "running" | "awaiting-approval" | "completed" | "failed" | "cancelled";

export interface RunRecord {
  id: string;
  orgId: string;
  projectId: string;
  status: RunStatus;
  phase: RunPhase;
  profile: "full" | "scan";
  /** Where the run executed: the desktop app, the CLI, or CI. */
  source: "ade" | "cli" | "ci" | "mcp";
  counts: { files: number; findings: number; critical: number; high: number; medium: number; low: number };
  surface?: AttackSurface;
  startedBy: string;
  createdAt: string;
  updatedAt: string;
}

export type Triage = "open" | "accepted-risk" | "false-positive" | "fixed";

export interface FindingRecord {
  id: string;
  orgId: string;
  projectId: string;
  runId: string;
  triage: Triage;
  assignee?: string;
  /** The false-positive classifier's estimate; absent when the scorer was off, cold, or the finding was not scorable. */
  score?: { pTruePositive: number; model: string; at: string };
  finding: Finding;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalRecord {
  id: string;
  orgId: string;
  projectId: string;
  runId: string;
  kind: ApprovalKind;
  title: string;
  reason: string;
  target: string;
  status: ApprovalStatus;
  requestedBy: string;
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
  note?: string;
}

/** One entry in a run's audit trail. Written once, never changed. */
export interface AuditEvent {
  id: string;
  orgId: string;
  runId: string;
  at: string;
  /** A user id, or an agent name such as "remediator". */
  actor: string;
  kind: TimelineKind;
  text: string;
}

export interface ApiToken {
  id: string;
  orgId: string;
  userId: string;
  name: string;
  role: Role;
  /** SHA-256 of the token. The token itself is shown once and never stored. */
  hash: string;
  /** First characters of the token, so a person can tell tokens apart. */
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface Usage {
  orgId: string;
  month: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
}

export interface Page<T> {
  items: T[];
  /** Pass back to get the next page; absent on the last page. */
  cursor?: string;
}

export interface PageQuery {
  limit?: number;
  cursor?: string;
}

export interface Store {
  upsertUser(user: User): Promise<User>;
  getUser(id: string): Promise<User | null>;

  /** Creates the org and its first owner atomically. */
  createOrg(org: Org, owner: Membership): Promise<void>;
  getOrg(orgId: string): Promise<Org | null>;
  listOrgsForUser(userId: string): Promise<Membership[]>;
  getMembership(orgId: string, userId: string): Promise<Membership | null>;
  listMembers(orgId: string): Promise<Membership[]>;
  putMembership(m: Membership): Promise<void>;
  removeMembership(orgId: string, userId: string): Promise<void>;

  createProject(p: ProjectRecord): Promise<void>;
  getProject(orgId: string, projectId: string): Promise<ProjectRecord | null>;
  listProjects(orgId: string): Promise<ProjectRecord[]>;

  createRun(r: RunRecord): Promise<void>;
  getRun(orgId: string, projectId: string, runId: string): Promise<RunRecord | null>;
  /** Newest first. */
  listRuns(orgId: string, projectId: string, q?: PageQuery): Promise<Page<RunRecord>>;
  updateRun(orgId: string, projectId: string, runId: string, patch: Partial<Pick<RunRecord, "status" | "phase" | "counts" | "surface">>): Promise<RunRecord | null>;

  putFindings(records: FindingRecord[]): Promise<void>;
  getFinding(orgId: string, runId: string, findingId: string): Promise<FindingRecord | null>;
  listFindings(orgId: string, runId: string): Promise<FindingRecord[]>;
  /** Across every run in the org, most severe first within a triage state. */
  listOrgFindings(orgId: string, triage: Triage, q?: PageQuery): Promise<Page<FindingRecord>>;
  updateFinding(orgId: string, runId: string, findingId: string, patch: { triage?: Triage; assignee?: string | null }): Promise<FindingRecord | null>;

  createApproval(a: ApprovalRecord): Promise<void>;
  getApproval(orgId: string, runId: string, approvalId: string): Promise<ApprovalRecord | null>;
  listApprovals(orgId: string, runId: string): Promise<ApprovalRecord[]>;
  /**
   * Records a decision and its audit event together. Returns null when the
   * approval is missing or was already decided — a decision is made once.
   */
  decideApproval(
    orgId: string,
    runId: string,
    approvalId: string,
    decision: { status: "approved" | "rejected"; decidedBy: string; decidedAt: string; note?: string },
    event: AuditEvent,
  ): Promise<ApprovalRecord | null>;

  appendEvent(e: AuditEvent): Promise<void>;
  /** Oldest first. */
  listEvents(orgId: string, runId: string, q?: PageQuery): Promise<Page<AuditEvent>>;

  createToken(t: ApiToken): Promise<void>;
  getTokenByHash(hash: string): Promise<ApiToken | null>;
  listTokens(orgId: string): Promise<ApiToken[]>;
  deleteToken(orgId: string, tokenId: string): Promise<boolean>;
  touchToken(hash: string, at: string): Promise<void>;

  addUsage(orgId: string, month: string, delta: Omit<Usage, "orgId" | "month">): Promise<void>;
  getUsage(orgId: string, month: string): Promise<Usage>;
}

export const emptyUsage = (orgId: string, month: string): Usage => ({ orgId, month, requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 });

export const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const;
