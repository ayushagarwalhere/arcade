/**
 * In-memory Store, for local development and tests.
 *
 * It keeps items in one map keyed exactly like the DynamoDB table (see
 * keys.ts), so ordering, isolation and "decide once" behave the same way in
 * both implementations. The contract tests run against both.
 */
import { gsi, key } from "./keys";
import { emptyUsage, type ApiToken, type ApprovalRecord, type AuditEvent, type FindingRecord, type Membership, type Org, type Page, type PageQuery, type ProjectRecord, type RunRecord, type Store, type Usage, type User } from "./store";

interface Item {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
  data: unknown;
}

const clone = <T>(v: T): T => structuredClone(v);

export function memoryStore(): Store {
  const items = new Map<string, Item>();
  const id = (k: { PK: string; SK: string }) => `${k.PK}|${k.SK}`;

  const put = (k: { PK: string; SK: string }, data: unknown, index?: { GSI1PK: string; GSI1SK: string }) => {
    items.set(id(k), { ...k, ...index, data: clone(data) });
  };
  const get = <T>(k: { PK: string; SK: string }): T | null => {
    const it = items.get(id(k));
    return it ? (clone(it.data) as T) : null;
  };
  const query = <T>(pk: string, skPrefix: string, descending = false): T[] => {
    const out = [...items.values()].filter((i) => i.PK === pk && i.SK.startsWith(skPrefix)).sort((a, b) => (a.SK < b.SK ? -1 : 1));
    if (descending) out.reverse();
    return out.map((i) => clone(i.data) as T);
  };
  const queryIndex = <T>(gpk: string, gskPrefix: string): T[] =>
    [...items.values()]
      .filter((i) => i.GSI1PK === gpk && (i.GSI1SK ?? "").startsWith(gskPrefix))
      .sort((a, b) => ((a.GSI1SK ?? "") < (b.GSI1SK ?? "") ? -1 : 1))
      .map((i) => clone(i.data) as T);

  function page<T>(all: T[], q?: PageQuery): Page<T> {
    const limit = Math.min(Math.max(q?.limit ?? 50, 1), 200);
    const start = q?.cursor ? Number(Buffer.from(q.cursor, "base64url").toString()) || 0 : 0;
    const slice = all.slice(start, start + limit);
    const next = start + limit < all.length ? Buffer.from(String(start + limit)).toString("base64url") : undefined;
    return { items: slice, cursor: next };
  }

  const putFinding = (f: FindingRecord) => put(key.finding(f.orgId, f.runId, f.id), f, gsi.finding({ ...f, severity: f.finding.severity }));

  return {
    async upsertUser(user) {
      const existing = get<User>(key.user(user.id));
      const merged = existing ? { ...existing, email: user.email ?? existing.email, name: user.name ?? existing.name } : user;
      put(key.user(user.id), merged);
      return merged;
    },
    async getUser(userId) {
      return get<User>(key.user(userId));
    },

    async createOrg(org, owner) {
      put(key.org(org.id), org);
      put(key.member(owner.orgId, owner.userId), owner, gsi.memberByUser(owner.orgId, owner.userId));
    },
    async getOrg(orgId) {
      return get<Org>(key.org(orgId));
    },
    async listOrgsForUser(userId) {
      return queryIndex<Membership>(`USER#${userId}`, "ORG#");
    },
    async getMembership(orgId, userId) {
      return get<Membership>(key.member(orgId, userId));
    },
    async listMembers(orgId) {
      return query<Membership>(`ORG#${orgId}`, "MEMBER#");
    },
    async putMembership(m) {
      put(key.member(m.orgId, m.userId), m, gsi.memberByUser(m.orgId, m.userId));
    },
    async removeMembership(orgId, userId) {
      items.delete(id(key.member(orgId, userId)));
    },

    async createProject(p) {
      put(key.project(p.orgId, p.id), p);
    },
    async getProject(orgId, projectId) {
      return get<ProjectRecord>(key.project(orgId, projectId));
    },
    async listProjects(orgId) {
      return query<ProjectRecord>(`ORG#${orgId}`, "PROJECT#");
    },

    async createRun(r) {
      put(key.run(r.orgId, r.projectId, r.id), r);
    },
    async getRun(orgId, projectId, runId) {
      return get<RunRecord>(key.run(orgId, projectId, runId));
    },
    async listRuns(orgId, projectId, q) {
      return page(query<RunRecord>(`ORG#${orgId}#PROJECT#${projectId}`, "RUN#", true), q);
    },
    async updateRun(orgId, projectId, runId, patch) {
      const run = get<RunRecord>(key.run(orgId, projectId, runId));
      if (!run) return null;
      const next = { ...run, ...patch, updatedAt: new Date().toISOString() };
      put(key.run(orgId, projectId, runId), next);
      return next;
    },

    async putFindings(records) {
      records.forEach(putFinding);
    },
    async getFinding(orgId, runId, findingId) {
      return get<FindingRecord>(key.finding(orgId, runId, findingId));
    },
    async listFindings(orgId, runId) {
      return query<FindingRecord>(`ORG#${orgId}#RUN#${runId}`, "FINDING#");
    },
    async listOrgFindings(orgId, triage, q) {
      return page(queryIndex<FindingRecord>(`ORG#${orgId}#FINDINGS`, `${triage}#`), q);
    },
    async updateFinding(orgId, runId, findingId, patch) {
      const f = get<FindingRecord>(key.finding(orgId, runId, findingId));
      if (!f) return null;
      const next: FindingRecord = { ...f, triage: patch.triage ?? f.triage, updatedAt: new Date().toISOString() };
      if (patch.assignee !== undefined) next.assignee = patch.assignee ?? undefined;
      putFinding(next);
      return next;
    },

    async createApproval(a) {
      put(key.approval(a.orgId, a.runId, a.id), a);
    },
    async getApproval(orgId, runId, approvalId) {
      return get<ApprovalRecord>(key.approval(orgId, runId, approvalId));
    },
    async listApprovals(orgId, runId) {
      return query<ApprovalRecord>(`ORG#${orgId}#RUN#${runId}`, "APPROVAL#");
    },
    async decideApproval(orgId, runId, approvalId, decision, event) {
      const a = get<ApprovalRecord>(key.approval(orgId, runId, approvalId));
      if (!a || a.status !== "pending") return null;
      const next: ApprovalRecord = { ...a, ...decision };
      put(key.approval(orgId, runId, approvalId), next);
      put(key.event(event.orgId, event.runId, event.id), event);
      return next;
    },

    async appendEvent(e) {
      put(key.event(e.orgId, e.runId, e.id), e);
    },
    async listEvents(orgId, runId, q) {
      return page(query<AuditEvent>(`ORG#${orgId}#RUN#${runId}`, "EVENT#"), q);
    },

    async createToken(t) {
      put(key.token(t.hash), t, gsi.tokenByOrg(t.orgId, t.id));
    },
    async getTokenByHash(hash) {
      return get<ApiToken>(key.token(hash));
    },
    async listTokens(orgId) {
      return queryIndex<ApiToken>(`ORG#${orgId}#TOKENS`, "TOKEN#");
    },
    async deleteToken(orgId, tokenId) {
      const t = queryIndex<ApiToken>(`ORG#${orgId}#TOKENS`, `TOKEN#${tokenId}`).find((x) => x.id === tokenId);
      if (!t) return false;
      items.delete(id(key.token(t.hash)));
      return true;
    },
    async touchToken(hash, at) {
      const t = get<ApiToken>(key.token(hash));
      if (t) put(key.token(hash), { ...t, lastUsedAt: at }, gsi.tokenByOrg(t.orgId, t.id));
    },

    async addUsage(orgId, month, delta) {
      const u = get<Usage>(key.usage(orgId, month)) ?? emptyUsage(orgId, month);
      put(key.usage(orgId, month), {
        ...u,
        requests: u.requests + delta.requests,
        inputTokens: u.inputTokens + delta.inputTokens,
        outputTokens: u.outputTokens + delta.outputTokens,
        cacheReadTokens: u.cacheReadTokens + delta.cacheReadTokens,
      });
    },
    async getUsage(orgId, month) {
      return get<Usage>(key.usage(orgId, month)) ?? emptyUsage(orgId, month);
    },
  };
}
