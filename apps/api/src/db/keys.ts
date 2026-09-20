/**
 * Single-table key design.
 *
 *   Item          PK                          SK                       GSI1PK               GSI1SK
 *   User          USER#<u>                    PROFILE
 *   Org           ORG#<o>                     META
 *   Membership    ORG#<o>                     MEMBER#<u>               USER#<u>             ORG#<o>
 *   Project       ORG#<o>                     PROJECT#<p>
 *   ApiToken      TOKEN#<sha256>              META                     ORG#<o>#TOKENS       TOKEN#<id>
 *   Usage         ORG#<o>                     USAGE#<yyyy-mm>
 *   Run           ORG#<o>#PROJECT#<p>         RUN#<r>
 *   Finding       ORG#<o>#RUN#<r>             FINDING#<f>              ORG#<o>#FINDINGS     <triage>#<sev>#<r>#<f>
 *   Approval      ORG#<o>#RUN#<r>             APPROVAL#<a>
 *   AuditEvent    ORG#<o>#RUN#<r>             EVENT#<e>
 *
 * Every tenant-owned partition key starts with the org id, so a query can never
 * cross a tenant boundary. Run ids and event ids are time-sortable, so a sort
 * key range is also a time range. A run's findings, approvals and events share
 * one partition: one Query loads everything a run screen needs.
 */
import { SEVERITY_RANK, type FindingRecord } from "./store";

export const TABLE = {
  pk: "PK",
  sk: "SK",
  gsi1: "GSI1",
  gsi1pk: "GSI1PK",
  gsi1sk: "GSI1SK",
  ttl: "ttl",
} as const;

export const key = {
  user: (u: string) => ({ PK: `USER#${u}`, SK: "PROFILE" }),
  org: (o: string) => ({ PK: `ORG#${o}`, SK: "META" }),
  member: (o: string, u: string) => ({ PK: `ORG#${o}`, SK: `MEMBER#${u}` }),
  project: (o: string, p: string) => ({ PK: `ORG#${o}`, SK: `PROJECT#${p}` }),
  token: (hash: string) => ({ PK: `TOKEN#${hash}`, SK: "META" }),
  usage: (o: string, month: string) => ({ PK: `ORG#${o}`, SK: `USAGE#${month}` }),
  run: (o: string, p: string, r: string) => ({ PK: `ORG#${o}#PROJECT#${p}`, SK: `RUN#${r}` }),
  finding: (o: string, r: string, f: string) => ({ PK: `ORG#${o}#RUN#${r}`, SK: `FINDING#${f}` }),
  approval: (o: string, r: string, a: string) => ({ PK: `ORG#${o}#RUN#${r}`, SK: `APPROVAL#${a}` }),
  event: (o: string, r: string, e: string) => ({ PK: `ORG#${o}#RUN#${r}`, SK: `EVENT#${e}` }),
};

export const gsi = {
  memberByUser: (o: string, u: string) => ({ GSI1PK: `USER#${u}`, GSI1SK: `ORG#${o}` }),
  tokenByOrg: (o: string, id: string) => ({ GSI1PK: `ORG#${o}#TOKENS`, GSI1SK: `TOKEN#${id}` }),
  finding: (f: Pick<FindingRecord, "orgId" | "runId" | "id" | "triage"> & { severity: keyof typeof SEVERITY_RANK }) => ({
    GSI1PK: `ORG#${f.orgId}#FINDINGS`,
    GSI1SK: `${f.triage}#${SEVERITY_RANK[f.severity]}#${f.runId}#${f.id}`,
  }),
};
