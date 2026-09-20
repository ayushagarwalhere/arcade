/**
 * Runs and everything that hangs off one: findings, approvals and the audit trail.
 *
 * A run is executed by a client — the desktop app, the CLI or CI — which reports
 * here as it goes. This API is the record, and the meeting point: an approval
 * requested by an agent over MCP is decided by a person in the workbench or on
 * their phone, and both sides see the same row.
 */
import type { Finding } from "@arcade/core/types";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { APPROVER_ROLE, requireOrgRole, type AppEnv } from "../auth/auth";
import type { AuditEvent, FindingRecord, RunRecord } from "../db/store";
import { badRequest, conflict, forbidden, HttpError, notFound } from "../errors";
import { body, pageQuery, type Deps } from "../http";
import { newId } from "../ids";
import { scoreFindings } from "../score/client";

const severity = z.enum(["critical", "high", "medium", "low"]);
const phase = z.enum(["idle", "mapping", "mapped", "attacking", "attacked", "defending", "defended", "awaiting-fix-approval", "remediating", "testing", "verifying", "verified"]);
const counts = z.object({ files: z.number().int().min(0), findings: z.number().int().min(0), critical: z.number().int().min(0), high: z.number().int().min(0), medium: z.number().int().min(0), low: z.number().int().min(0) });
const timelineKind = z.enum(["map", "attack", "evidence", "defend", "approve", "remediate", "test", "verify", "human", "info"]);

/** Only the fields the API relies on are checked; the rest of a Finding passes through as the client built it. */
const findingShape = z.looseObject({
  id: z.string().regex(/^[\w.-]{1,40}$/),
  title: z.string().min(1).max(300),
  severity,
  status: z.string().max(40),
  cwe: z.string().max(200),
});

/** DynamoDB caps an item at 400 KB; leave headroom for keys and the record envelope. */
const MAX_FINDING_BYTES = 300_000;

export function runRoutes({ store, scorer }: Deps) {
  const app = new Hono<AppEnv>();
  const base = "/orgs/:orgId/projects/:projectId/runs";

  async function loadRun(c: Context<AppEnv>, min: "viewer" | "member"): Promise<RunRecord> {
    const orgId = c.req.param("orgId") as string;
    const projectId = c.req.param("projectId") as string;
    const runId = c.req.param("runId") as string;
    await requireOrgRole(c, store, orgId, min);
    const run = await store.getRun(orgId, projectId, runId);
    if (!run) throw notFound("Run");
    return run;
  }

  const event = (run: Pick<RunRecord, "orgId" | "id">, actor: string, kind: AuditEvent["kind"], text: string): AuditEvent => ({
    id: newId("evt"),
    orgId: run.orgId,
    runId: run.id,
    at: new Date().toISOString(),
    actor,
    kind,
    text,
  });

  app.post(base, async (c) => {
    const { orgId, projectId } = c.req.param();
    await requireOrgRole(c, store, orgId, "member");
    if (!(await store.getProject(orgId, projectId))) throw notFound("Project");
    const input = await body(c, z.object({ profile: z.enum(["full", "scan"]).default("full"), source: z.enum(["ade", "cli", "ci", "mcp"]).default("ade") }));
    const now = new Date().toISOString();
    const userId = c.get("principal").userId;
    const run: RunRecord = {
      id: newId("run"),
      orgId,
      projectId,
      status: "running",
      phase: "idle",
      ...input,
      counts: { files: 0, findings: 0, critical: 0, high: 0, medium: 0, low: 0 },
      startedBy: userId,
      createdAt: now,
      updatedAt: now,
    };
    await store.createRun(run);
    await store.appendEvent(event(run, userId, "info", `Started a ${run.profile} run from ${run.source}`));
    return c.json({ run }, 201);
  });

  app.get(base, async (c) => {
    const { orgId, projectId } = c.req.param();
    await requireOrgRole(c, store, orgId, "viewer");
    const page = await store.listRuns(orgId, projectId, pageQuery(c));
    return c.json({ runs: page.items, cursor: page.cursor });
  });

  /** Everything a run screen needs, in one call. */
  app.get(`${base}/:runId`, async (c) => {
    const run = await loadRun(c, "viewer");
    const [findings, approvals, events] = await Promise.all([store.listFindings(run.orgId, run.id), store.listApprovals(run.orgId, run.id), store.listEvents(run.orgId, run.id, { limit: 200 })]);
    return c.json({ run, findings, approvals, events: events.items, eventsCursor: events.cursor });
  });

  app.patch(`${base}/:runId`, async (c) => {
    const run = await loadRun(c, "member");
    const patch = await body(
      c,
      z.object({
        status: z.enum(["running", "awaiting-approval", "completed", "failed", "cancelled"]).optional(),
        phase: phase.optional(),
        counts: counts.optional(),
        surface: z.looseObject({ nodes: z.array(z.looseObject({})).max(200), edges: z.array(z.looseObject({})).max(600), exploitPath: z.array(z.string()).max(50) }).optional(),
      }),
    );
    const updated = await store.updateRun(run.orgId, run.projectId, run.id, patch as Parameters<typeof store.updateRun>[3]);
    if (patch.status && patch.status !== run.status) await store.appendEvent(event(run, c.get("principal").userId, "info", `Run ${patch.status}`));
    return c.json({ run: updated });
  });

  /* ---------------------------------------------------------------- findings */

  app.put(`${base}/:runId/findings`, async (c) => {
    const run = await loadRun(c, "member");
    const input = await body(c, z.object({ findings: z.array(findingShape).min(1).max(100) }));
    const now = new Date().toISOString();
    const existing = new Map((await store.listFindings(run.orgId, run.id)).map((f) => [f.id, f]));
    for (const f of input.findings) {
      if (Buffer.byteLength(JSON.stringify(f)) > MAX_FINDING_BYTES) throw badRequest(`Finding ${f.id} is too large to store — trim its diff or evidence body`);
    }
    const findings = input.findings as unknown as Finding[];
    // Advisory, and allowed to fail: a cold classifier must never stop findings being saved.
    const scores = await scoreFindings(scorer, findings);
    const records: FindingRecord[] = findings.map((f) => {
      const prior = existing.get(f.id);
      // Re-reporting a finding refreshes its content but keeps the human triage decision.
      return { id: f.id, orgId: run.orgId, projectId: run.projectId, runId: run.id, triage: prior?.triage ?? "open", assignee: prior?.assignee, score: scores.get(f.id) ?? prior?.score, finding: f, createdAt: prior?.createdAt ?? now, updatedAt: now };
    });
    await store.putFindings(records);
    return c.json({ stored: records.length, scored: scores.size });
  });

  /** Score the findings that have none — e.g. the classifier was cold when they were reported. */
  app.post(`${base}/:runId/findings/score`, async (c) => {
    const run = await loadRun(c, "member");
    if (!scorer) throw new HttpError(503, "scorer_disabled", "No classifier endpoint is configured on this server");
    const unscored = (await store.listFindings(run.orgId, run.id)).filter((r) => !r.score);
    const scores = await scoreFindings(scorer, unscored.map((r) => r.finding));
    const updated = unscored.filter((r) => scores.has(r.id)).map((r) => ({ ...r, score: scores.get(r.id) }));
    if (updated.length) await store.putFindings(updated);
    return c.json({ scored: updated.length, stillUnscored: unscored.length - updated.length });
  });

  app.patch(`${base}/:runId/findings/:findingId`, async (c) => {
    const run = await loadRun(c, "member");
    const patch = await body(c, z.object({ triage: z.enum(["open", "accepted-risk", "false-positive", "fixed"]).optional(), assignee: z.string().max(120).nullable().optional() }));
    const updated = await store.updateFinding(run.orgId, run.id, c.req.param("findingId"), patch);
    if (!updated) throw notFound("Finding");
    if (patch.triage) await store.appendEvent(event(run, c.get("principal").userId, "human", `Marked ${updated.id} as ${patch.triage}`));
    return c.json({ finding: updated });
  });

  /** Findings across every run in the org, for the triage queue. */
  app.get("/orgs/:orgId/findings", async (c) => {
    const orgId = c.req.param("orgId");
    await requireOrgRole(c, store, orgId, "viewer");
    const triage = z.enum(["open", "accepted-risk", "false-positive", "fixed"]).parse(c.req.query("triage") ?? "open");
    const page = await store.listOrgFindings(orgId, triage, pageQuery(c));
    return c.json({ findings: page.items, cursor: page.cursor });
  });

  /* --------------------------------------------------------------- approvals */

  app.post(`${base}/:runId/approvals`, async (c) => {
    const run = await loadRun(c, "member");
    const input = await body(c, z.object({ kind: z.enum(["code", "destructive", "ship"]), title: z.string().min(1).max(200), reason: z.string().max(2000), target: z.string().max(1000) }));
    const userId = c.get("principal").userId;
    const approval = { id: newId("apr"), orgId: run.orgId, projectId: run.projectId, runId: run.id, ...input, status: "pending" as const, requestedBy: userId, createdAt: new Date().toISOString() };
    await store.createApproval(approval);
    await store.updateRun(run.orgId, run.projectId, run.id, { status: "awaiting-approval" });
    await store.appendEvent(event(run, userId, "approve", `Requested ${input.kind} approval: ${input.title}`));
    return c.json({ approval }, 201);
  });

  app.get(`${base}/:runId/approvals`, async (c) => {
    const run = await loadRun(c, "viewer");
    return c.json({ approvals: await store.listApprovals(run.orgId, run.id) });
  });

  /** What an agent polls while it waits for a person. */
  app.get(`${base}/:runId/approvals/:approvalId`, async (c) => {
    const run = await loadRun(c, "viewer");
    const approval = await store.getApproval(run.orgId, run.id, c.req.param("approvalId"));
    if (!approval) throw notFound("Approval");
    return c.json({ approval });
  });

  app.post(`${base}/:runId/approvals/:approvalId/decision`, async (c) => {
    const run = await loadRun(c, "viewer");
    const approvalId = c.req.param("approvalId");
    // The point of a gate is that a person stands at it. Agents hold API tokens, so a token can
    // request an approval and watch it, but can never be the one to grant it.
    if (c.get("principal").token) throw forbidden("Approvals are decided by a signed-in person, not an API token");
    const input = await body(c, z.object({ decision: z.enum(["approved", "rejected"]), note: z.string().max(2000).optional() }));
    const approval = await store.getApproval(run.orgId, run.id, approvalId);
    if (!approval) throw notFound("Approval");
    await requireOrgRole(c, store, run.orgId, APPROVER_ROLE[approval.kind]);

    const userId = c.get("principal").userId;
    const verb = input.decision === "approved" ? "Approved" : "Rejected";
    const decided = await store.decideApproval(
      run.orgId,
      run.id,
      approvalId,
      { status: input.decision, decidedBy: userId, decidedAt: new Date().toISOString(), note: input.note },
      event(run, userId, "human", `${verb} ${approval.kind} approval: ${approval.title}${input.note ? ` — ${input.note}` : ""}`),
    );
    if (!decided) throw conflict("This approval has already been decided");

    const stillPending = (await store.listApprovals(run.orgId, run.id)).some((a) => a.status === "pending");
    if (!stillPending) await store.updateRun(run.orgId, run.projectId, run.id, { status: "running" });
    return c.json({ approval: decided });
  });

  /* ------------------------------------------------------------- audit trail */

  app.post(`${base}/:runId/events`, async (c) => {
    const run = await loadRun(c, "member");
    const input = await body(c, z.object({ actor: z.string().min(1).max(80), kind: timelineKind, text: z.string().min(1).max(2000) }));
    // "human" entries are written only by this API, from a verified identity — a client cannot forge one.
    if (input.kind === "human") throw badRequest("Human decisions are recorded by the API, not reported by clients");
    const e = event(run, input.actor, input.kind, input.text);
    await store.appendEvent(e);
    return c.json({ event: e }, 201);
  });

  app.get(`${base}/:runId/events`, async (c) => {
    const run = await loadRun(c, "viewer");
    const page = await store.listEvents(run.orgId, run.id, pageQuery(c));
    return c.json({ events: page.items, cursor: page.cursor });
  });

  return app;
}
