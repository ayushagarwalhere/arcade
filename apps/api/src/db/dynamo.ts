/**
 * DynamoDB Store. One table, one index — the layout is documented in keys.ts.
 *
 * Each item holds its entity under `data`, plus the key attributes. Usage is
 * the exception: its counters are top-level numbers so they can be incremented
 * atomically with ADD, with no read-modify-write race between Lambdas.
 */
import { ConditionalCheckFailedException, DynamoDBClient, TransactionCanceledException } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand, type QueryCommandInput } from "@aws-sdk/lib-dynamodb";
import { badRequest } from "../errors";
import { gsi, key, TABLE } from "./keys";
import { emptyUsage, type ApiToken, type ApprovalRecord, type AuditEvent, type FindingRecord, type Membership, type Org, type Page, type PageQuery, type ProjectRecord, type RunRecord, type Store, type User } from "./store";

type Key = { PK: string; SK: string };

const encodeCursor = (k: Record<string, unknown> | undefined) => (k ? Buffer.from(JSON.stringify(k)).toString("base64url") : undefined);

/** A cursor is client-held, so check it still points inside the partition being read. */
function decodeCursor(cursor: string | undefined, attr: "PK" | "GSI1PK", expected: string): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  try {
    const k = JSON.parse(Buffer.from(cursor, "base64url").toString()) as Record<string, unknown>;
    if (k[attr] !== expected) throw new Error("foreign cursor");
    return k;
  } catch {
    throw badRequest("Invalid cursor");
  }
}

const clampLimit = (n: number | undefined) => Math.min(Math.max(n ?? 50, 1), 200);

export const LOCAL_CREDENTIALS = { accessKeyId: "local", secretAccessKey: "local" };

export function dynamoStore(opts: { tableName: string; region: string; endpoint?: string }): Store {
  const TableName = opts.tableName;
  // DynamoDB Local files tables under the access key and region that created them, so a local
  // endpoint always gets the same fixed identity — and real credentials are never sent to it.
  const local = opts.endpoint ? { endpoint: opts.endpoint, credentials: LOCAL_CREDENTIALS } : {};
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({ region: opts.region, ...local }), {
    marshallOptions: { removeUndefinedValues: true },
  });

  const put = (k: Key, data: unknown, index?: { GSI1PK: string; GSI1SK: string }) => doc.send(new PutCommand({ TableName, Item: { ...k, ...index, data } }));

  async function get<T>(k: Key): Promise<T | null> {
    const out = await doc.send(new GetCommand({ TableName, Key: k }));
    return (out.Item?.data as T | undefined) ?? null;
  }

  /** Reads a whole key range, following pagination. Only for ranges that are small by design. */
  async function queryAll<T>(input: Omit<QueryCommandInput, "TableName">): Promise<T[]> {
    const items: T[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const out = await doc.send(new QueryCommand({ TableName, ...input, ExclusiveStartKey }));
      for (const it of out.Items ?? []) items.push(it.data as T);
      ExclusiveStartKey = out.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
  }

  const byPrefix = (pk: string, prefix: string): Omit<QueryCommandInput, "TableName"> => ({
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: { ":pk": pk, ":sk": prefix },
  });
  const byIndexPrefix = (gpk: string, prefix: string): Omit<QueryCommandInput, "TableName"> => ({
    IndexName: TABLE.gsi1,
    KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
    ExpressionAttributeValues: { ":pk": gpk, ":sk": prefix },
  });

  async function queryPage<T>(input: Omit<QueryCommandInput, "TableName">, q: PageQuery | undefined, attr: "PK" | "GSI1PK", partition: string): Promise<Page<T>> {
    const out = await doc.send(new QueryCommand({ TableName, ...input, Limit: clampLimit(q?.limit), ExclusiveStartKey: decodeCursor(q?.cursor, attr, partition) }));
    return { items: (out.Items ?? []).map((i) => i.data as T), cursor: encodeCursor(out.LastEvaluatedKey) };
  }

  const findingItem = (f: FindingRecord) => ({ ...key.finding(f.orgId, f.runId, f.id), ...gsi.finding({ ...f, severity: f.finding.severity }), data: f });

  return {
    async upsertUser(user) {
      const existing = await get<User>(key.user(user.id));
      const merged = existing ? { ...existing, email: user.email ?? existing.email, name: user.name ?? existing.name } : user;
      await put(key.user(user.id), merged);
      return merged;
    },
    getUser: (userId) => get<User>(key.user(userId)),

    async createOrg(org, owner) {
      await doc.send(
        new TransactWriteCommand({
          TransactItems: [
            { Put: { TableName, Item: { ...key.org(org.id), data: org }, ConditionExpression: "attribute_not_exists(PK)" } },
            { Put: { TableName, Item: { ...key.member(owner.orgId, owner.userId), ...gsi.memberByUser(owner.orgId, owner.userId), data: owner } } },
          ],
        }),
      );
    },
    getOrg: (orgId) => get<Org>(key.org(orgId)),
    listOrgsForUser: (userId) => queryAll<Membership>(byIndexPrefix(`USER#${userId}`, "ORG#")),
    getMembership: (orgId, userId) => get<Membership>(key.member(orgId, userId)),
    listMembers: (orgId) => queryAll<Membership>(byPrefix(`ORG#${orgId}`, "MEMBER#")),
    async putMembership(m) {
      await put(key.member(m.orgId, m.userId), m, gsi.memberByUser(m.orgId, m.userId));
    },
    async removeMembership(orgId, userId) {
      await doc.send(new DeleteCommand({ TableName, Key: key.member(orgId, userId) }));
    },

    async createProject(p) {
      await put(key.project(p.orgId, p.id), p);
    },
    getProject: (orgId, projectId) => get<ProjectRecord>(key.project(orgId, projectId)),
    listProjects: (orgId) => queryAll<ProjectRecord>(byPrefix(`ORG#${orgId}`, "PROJECT#")),

    async createRun(r) {
      await put(key.run(r.orgId, r.projectId, r.id), r);
    },
    getRun: (orgId, projectId, runId) => get<RunRecord>(key.run(orgId, projectId, runId)),
    listRuns(orgId, projectId, q) {
      const pk = `ORG#${orgId}#PROJECT#${projectId}`;
      return queryPage<RunRecord>({ ...byPrefix(pk, "RUN#"), ScanIndexForward: false }, q, "PK", pk);
    },
    async updateRun(orgId, projectId, runId, patch) {
      const fields = { ...patch, updatedAt: new Date().toISOString() } as Record<string, unknown>;
      const names: Record<string, string> = { "#data": "data" };
      const values: Record<string, unknown> = {};
      const sets: string[] = [];
      Object.entries(fields).forEach(([k, v], i) => {
        if (v === undefined) return;
        names[`#f${i}`] = k;
        values[`:v${i}`] = v;
        sets.push(`#data.#f${i} = :v${i}`);
      });
      try {
        const out = await doc.send(
          new UpdateCommand({
            TableName,
            Key: key.run(orgId, projectId, runId),
            UpdateExpression: `SET ${sets.join(", ")}`,
            ConditionExpression: "attribute_exists(PK)",
            ExpressionAttributeNames: names,
            ExpressionAttributeValues: values,
            ReturnValues: "ALL_NEW",
          }),
        );
        return (out.Attributes?.data as RunRecord | undefined) ?? null;
      } catch (e) {
        if (e instanceof ConditionalCheckFailedException) return null;
        throw e;
      }
    },

    async putFindings(records) {
      for (let i = 0; i < records.length; i += 25) {
        let requests = records.slice(i, i + 25).map((f) => ({ PutRequest: { Item: findingItem(f) } }));
        // BatchWrite may hand back items it had no capacity for; retry those with a short backoff.
        for (let attempt = 0; requests.length; attempt++) {
          if (attempt > 5) throw new Error("DynamoDB did not accept all findings");
          if (attempt) await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
          const out = await doc.send(new BatchWriteCommand({ RequestItems: { [TableName]: requests } }));
          requests = (out.UnprocessedItems?.[TableName] ?? []) as typeof requests;
        }
      }
    },
    getFinding: (orgId, runId, findingId) => get<FindingRecord>(key.finding(orgId, runId, findingId)),
    listFindings: (orgId, runId) => queryAll<FindingRecord>(byPrefix(`ORG#${orgId}#RUN#${runId}`, "FINDING#")),
    listOrgFindings(orgId, triage, q) {
      const gpk = `ORG#${orgId}#FINDINGS`;
      return queryPage<FindingRecord>(byIndexPrefix(gpk, `${triage}#`), q, "GSI1PK", gpk);
    },
    async updateFinding(orgId, runId, findingId, patch) {
      const f = await get<FindingRecord>(key.finding(orgId, runId, findingId));
      if (!f) return null;
      const next: FindingRecord = { ...f, triage: patch.triage ?? f.triage, updatedAt: new Date().toISOString() };
      if (patch.assignee !== undefined) next.assignee = patch.assignee ?? undefined;
      await doc.send(new PutCommand({ TableName, Item: findingItem(next), ConditionExpression: "attribute_exists(PK)" }));
      return next;
    },

    async createApproval(a) {
      await put(key.approval(a.orgId, a.runId, a.id), a);
    },
    getApproval: (orgId, runId, approvalId) => get<ApprovalRecord>(key.approval(orgId, runId, approvalId)),
    listApprovals: (orgId, runId) => queryAll<ApprovalRecord>(byPrefix(`ORG#${orgId}#RUN#${runId}`, "APPROVAL#")),
    async decideApproval(orgId, runId, approvalId, decision, event) {
      const names: Record<string, string> = { "#data": "data", "#status": "status", "#by": "decidedBy", "#at": "decidedAt" };
      const values: Record<string, unknown> = { ":pending": "pending", ":status": decision.status, ":by": decision.decidedBy, ":at": decision.decidedAt };
      let set = "SET #data.#status = :status, #data.#by = :by, #data.#at = :at";
      if (decision.note) {
        names["#note"] = "note";
        values[":note"] = decision.note;
        set += ", #data.#note = :note";
      }
      try {
        // The decision and its audit entry land together or not at all.
        await doc.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Update: {
                  TableName,
                  Key: key.approval(orgId, runId, approvalId),
                  UpdateExpression: set,
                  ConditionExpression: "attribute_exists(PK) AND #data.#status = :pending",
                  ExpressionAttributeNames: names,
                  ExpressionAttributeValues: values,
                },
              },
              { Put: { TableName, Item: { ...key.event(event.orgId, event.runId, event.id), data: event }, ConditionExpression: "attribute_not_exists(PK)" } },
            ],
          }),
        );
      } catch (e) {
        if (e instanceof TransactionCanceledException) return null;
        throw e;
      }
      return get<ApprovalRecord>(key.approval(orgId, runId, approvalId));
    },

    async appendEvent(e) {
      // attribute_not_exists makes the trail write-once: an event id can never be overwritten.
      await doc.send(new PutCommand({ TableName, Item: { ...key.event(e.orgId, e.runId, e.id), data: e }, ConditionExpression: "attribute_not_exists(PK)" }));
    },
    listEvents(orgId, runId, q) {
      const pk = `ORG#${orgId}#RUN#${runId}`;
      return queryPage<AuditEvent>(byPrefix(pk, "EVENT#"), q, "PK", pk);
    },

    async createToken(t) {
      await put(key.token(t.hash), t, gsi.tokenByOrg(t.orgId, t.id));
    },
    getTokenByHash: (hash) => get<ApiToken>(key.token(hash)),
    listTokens: (orgId) => queryAll<ApiToken>(byIndexPrefix(`ORG#${orgId}#TOKENS`, "TOKEN#")),
    async deleteToken(orgId, tokenId) {
      const found = (await queryAll<ApiToken>(byIndexPrefix(`ORG#${orgId}#TOKENS`, `TOKEN#${tokenId}`))).find((t) => t.id === tokenId);
      if (!found) return false;
      await doc.send(new DeleteCommand({ TableName, Key: key.token(found.hash) }));
      return true;
    },
    async touchToken(hash, at) {
      try {
        await doc.send(
          new UpdateCommand({
            TableName,
            Key: key.token(hash),
            UpdateExpression: "SET #data.#at = :at",
            ConditionExpression: "attribute_exists(PK)",
            ExpressionAttributeNames: { "#data": "data", "#at": "lastUsedAt" },
            ExpressionAttributeValues: { ":at": at },
          }),
        );
      } catch (e) {
        if (!(e instanceof ConditionalCheckFailedException)) throw e;
      }
    },

    async addUsage(orgId, month, delta) {
      await doc.send(
        new UpdateCommand({
          TableName,
          Key: key.usage(orgId, month),
          UpdateExpression: "ADD requests :r, inputTokens :i, outputTokens :o, cacheReadTokens :c",
          ExpressionAttributeValues: { ":r": delta.requests, ":i": delta.inputTokens, ":o": delta.outputTokens, ":c": delta.cacheReadTokens },
        }),
      );
    },
    async getUsage(orgId, month) {
      const out = await doc.send(new GetCommand({ TableName, Key: key.usage(orgId, month) }));
      const it = out.Item;
      if (!it) return emptyUsage(orgId, month);
      return { orgId, month, requests: it.requests ?? 0, inputTokens: it.inputTokens ?? 0, outputTokens: it.outputTokens ?? 0, cacheReadTokens: it.cacheReadTokens ?? 0 };
    },
  };
}
