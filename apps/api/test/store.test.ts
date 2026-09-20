/**
 * The Store contract. It always runs against the in-memory store, and also
 * against DynamoDB Local when DYNAMO_ENDPOINT is set — so the two
 * implementations are held to identical behaviour:
 *
 *   docker run -d -p 8000:8000 amazon/dynamodb-local
 *   DYNAMO_ENDPOINT=http://localhost:8000 npm test -w apps/api
 */
import type { Finding } from "@arcade/core/types";
import { describe, expect, it } from "vitest";
import { createLocalTable } from "../scripts/create-table";
import { dynamoStore } from "../src/db/dynamo";
import { memoryStore } from "../src/db/memory";
import type { ApprovalRecord, AuditEvent, FindingRecord, RunRecord, Store } from "../src/db/store";
import { newId } from "../src/ids";

const endpoint = process.env.DYNAMO_ENDPOINT;
const stores: [string, () => Promise<Store>][] = [["memory", async () => memoryStore()]];
if (endpoint) {
  stores.push([
    "dynamodb-local",
    async () => {
      await createLocalTable(endpoint, "arcade-test", "local");
      return dynamoStore({ tableName: "arcade-test", region: "local", endpoint });
    },
  ]);
}

const now = () => new Date().toISOString();
const run = (orgId: string, projectId: string, id = newId("run")): RunRecord => ({ id, orgId, projectId, status: "running", phase: "idle", profile: "full", source: "ade", counts: { files: 0, findings: 0, critical: 0, high: 0, medium: 0, low: 0 }, startedBy: "ada", createdAt: now(), updatedAt: now() });
const findingRecord = (orgId: string, runId: string, id: string, severity: Finding["severity"]): FindingRecord => ({ id, orgId, projectId: "prj", runId, triage: "open", finding: { id, severity, title: id } as Finding, createdAt: now(), updatedAt: now() });
const event = (orgId: string, runId: string, text: string): AuditEvent => ({ id: newId("evt"), orgId, runId, at: now(), actor: "ada", kind: "info", text });

describe.each(stores)("Store contract · %s", (_name, make) => {
  it("creates an org with its owner and finds it from the user's side", async () => {
    const s = await make();
    const orgId = newId("org");
    const userId = newId("usr");
    await s.createOrg({ id: orgId, name: "Acme", createdBy: userId, createdAt: now() }, { orgId, userId, role: "owner", createdAt: now() });
    expect((await s.getOrg(orgId))?.name).toBe("Acme");
    expect(await s.listOrgsForUser(userId)).toMatchObject([{ orgId, role: "owner" }]);
    await s.removeMembership(orgId, userId);
    expect(await s.listOrgsForUser(userId)).toEqual([]);
  });

  it("lists runs newest first and pages through them without crossing projects", async () => {
    const s = await make();
    const orgId = newId("org");
    const ids = [1, 2, 3].map((n) => newId("run", 1_700_000_000_000 + n * 1000));
    for (const id of ids) await s.createRun(run(orgId, "prj", id));
    await s.createRun(run(orgId, "other"));

    const first = await s.listRuns(orgId, "prj", { limit: 2 });
    expect(first.items.map((r) => r.id)).toEqual([ids[2], ids[1]]);
    expect(first.cursor).toBeTruthy();
    const second = await s.listRuns(orgId, "prj", { limit: 2, cursor: first.cursor });
    expect(second.items.map((r) => r.id)).toEqual([ids[0]]);
    expect(second.cursor).toBeUndefined();
  });

  it("patches a run in place and reports a missing one", async () => {
    const s = await make();
    const orgId = newId("org");
    const r = run(orgId, "prj");
    await s.createRun(r);
    const updated = await s.updateRun(orgId, "prj", r.id, { status: "completed", phase: "verified" });
    expect(updated).toMatchObject({ id: r.id, status: "completed", phase: "verified", startedBy: "ada" });
    expect(await s.updateRun(orgId, "prj", "run_missing", { status: "failed" })).toBeNull();
  });

  it("stores more findings than one batch holds, and re-files them when triage changes", async () => {
    const s = await make();
    const orgId = newId("org");
    const runId = newId("run");
    const records = Array.from({ length: 30 }, (_, i) => findingRecord(orgId, runId, `F-${String(i).padStart(2, "0")}`, i === 7 ? "critical" : "low"));
    await s.putFindings(records);
    expect(await s.listFindings(orgId, runId)).toHaveLength(30);

    const open = await s.listOrgFindings(orgId, "open", { limit: 5 });
    expect(open.items[0].id).toBe("F-07");

    await s.updateFinding(orgId, runId, "F-07", { triage: "fixed", assignee: "grace" });
    expect((await s.listOrgFindings(orgId, "open", { limit: 200 })).items.map((f) => f.id)).not.toContain("F-07");
    expect((await s.listOrgFindings(orgId, "fixed")).items).toMatchObject([{ id: "F-07", assignee: "grace" }]);
    expect(await s.updateFinding(orgId, runId, "F-99", { triage: "fixed" })).toBeNull();
  });

  it("decides an approval exactly once, writing the audit event with it", async () => {
    const s = await make();
    const orgId = newId("org");
    const runId = newId("run");
    const a: ApprovalRecord = { id: newId("apr"), orgId, projectId: "prj", runId, kind: "code", title: "Apply fix", reason: "r", target: "t", status: "pending", requestedBy: "agent", createdAt: now() };
    await s.createApproval(a);

    const decide = (status: "approved" | "rejected") => s.decideApproval(orgId, runId, a.id, { status, decidedBy: "ada", decidedAt: now(), note: "ok" }, event(orgId, runId, `${status} it`));
    // Two people press the button at once: exactly one decision lands.
    const results = await Promise.all([decide("approved"), decide("rejected")]);
    const landed = results.filter(Boolean);
    expect(landed).toHaveLength(1);
    expect(landed[0]).toMatchObject({ decidedBy: "ada", note: "ok" });
    expect((await s.getApproval(orgId, runId, a.id))?.status).toBe(landed[0]?.status);
    expect((await s.listEvents(orgId, runId)).items).toHaveLength(1);
    expect(await decide("approved")).toBeNull();
  });

  it("keeps events in order and apart from the findings and approvals sharing their partition", async () => {
    const s = await make();
    const orgId = newId("org");
    const runId = newId("run");
    await s.putFindings([findingRecord(orgId, runId, "F-1", "high")]);
    for (const text of ["one", "two", "three"]) {
      await s.appendEvent(event(orgId, runId, text));
      await new Promise((r) => setTimeout(r, 2));
    }
    expect((await s.listEvents(orgId, runId)).items.map((e) => e.text)).toEqual(["one", "two", "three"]);
    expect(await s.listApprovals(orgId, runId)).toEqual([]);
  });

  it("looks a token up by hash, lists it by org, and deletes it by id", async () => {
    const s = await make();
    const orgId = newId("org");
    const hash = newId("hash");
    await s.createToken({ id: "tok_1", orgId, userId: "ada", name: "ci", role: "member", hash, prefix: "arc_abc", createdAt: now() });
    await s.touchToken(hash, "2026-09-20T00:00:00.000Z");
    expect(await s.getTokenByHash(hash)).toMatchObject({ id: "tok_1", lastUsedAt: "2026-09-20T00:00:00.000Z" });
    expect(await s.listTokens(orgId)).toHaveLength(1);
    expect(await s.deleteToken(newId("org"), "tok_1")).toBe(false);
    expect(await s.deleteToken(orgId, "tok_1")).toBe(true);
    expect(await s.getTokenByHash(hash)).toBeNull();
  });

  it("adds usage atomically under concurrent writers", async () => {
    const s = await make();
    const orgId = newId("org");
    await Promise.all(Array.from({ length: 10 }, () => s.addUsage(orgId, "2026-09", { requests: 1, inputTokens: 100, outputTokens: 10, cacheReadTokens: 0 })));
    expect(await s.getUsage(orgId, "2026-09")).toMatchObject({ requests: 10, inputTokens: 1000, outputTokens: 100 });
    expect((await s.getUsage(orgId, "2026-10")).requests).toBe(0);
  });
});
