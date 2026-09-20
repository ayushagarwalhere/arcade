import { describe, expect, it } from "vitest";
import { ModelDeclined } from "../src/model/client";
import { redact } from "../src/model/redact";
import { fakeModel, harness } from "./helpers";

const ctx = { id: "ARC-001", title: "Hard-coded secret", severity: "high", cwe: "CWE-798", summary: "s", description: "d", path: "src/config.ts", line: 2 };
const explained = { description: "d", attackNarrative: "a", rootCause: "r", mitigations: [{ title: "t", detail: "d", recommended: true, effort: "low" }] };

describe("redact", () => {
  it("removes key-shaped values and keeps every line where it was", () => {
    const src = ["const a = 1;", 'const stripe = "sk_live_51Nf2aKabcdefghijklmnop";', "const aws = 'AKIAIOSFODNN7EXAMPLE';", "-----BEGIN RSA PRIVATE KEY-----", "MIIEowIBAAKCAQEA1234", "abcd/efgh+ijkl==", "-----END RSA PRIVATE KEY-----", "done();"].join("\n");
    const out = redact(src);
    expect(out.text).not.toMatch(/sk_live_51|AKIAIOSFODNN7|MIIEowIBAAKCAQEA|abcd\/efgh/);
    expect(out.text.split("\n")).toHaveLength(src.split("\n").length);
    expect(out.text.split("\n")[7]).toBe("done();");
    expect(out.counts["private-key"]).toBe(1);
  });

  it("redacts assigned and .env secrets but leaves references to the environment alone", () => {
    const out = redact(['const password = "hunter2hunter2";', "const token = process.env.API_TOKEN;", 'apiKey: "${API_KEY_FROM_ENV}",', "JWT_SECRET=s3cr3t-value-123", "DATABASE_URL=postgres://app:p4ssw0rd99@db.internal/app"].join("\n"));
    expect(out.text).not.toMatch(/hunter2|s3cr3t-value|p4ssw0rd99/);
    expect(out.text).toContain("process.env.API_TOKEN");
    expect(out.text).toContain("${API_KEY_FROM_ENV}");
    expect(out.text).toContain("postgres://app:");
  });
});

describe("model endpoints", () => {
  it("never sends a secret to the model, numbers lines from the window start, and records usage", async () => {
    const { client, calls } = fakeModel([explained]);
    const { call, seed } = harness({ model: client });
    const { org } = await seed();
    const res = await call("ada", "POST", `/orgs/${org.id}/model/explain`, { finding: ctx, source: { text: 'export const cfg = {\n  key: "sk_live_51Nf2aKabcdefghijklmnop",\n};', startLine: 41 } });

    expect(res.status).toBe(200);
    expect(res.body.result.rootCause).toBe("r");
    expect(res.body.meta.redactions["stripe-key"]).toBe(1);
    expect(calls[0].user).not.toContain("sk_live_51");
    expect(calls[0].user).toContain('42|   key: "[REDACTED:stripe-key]"');

    const usage = (await call("ada", "GET", `/orgs/${org.id}/usage`)).body.usage;
    expect(usage).toMatchObject({ requests: 1, inputTokens: 1000, outputTokens: 200 });
  });

  it("stops at the monthly budget", async () => {
    const { client, calls } = fakeModel([explained, explained]);
    const { call, seed } = harness({ model: client, env: { MODEL_MONTHLY_TOKEN_BUDGET: "1200" } });
    const { org } = await seed();
    const req = { finding: ctx, source: { text: "x" } };
    expect((await call("ada", "POST", `/orgs/${org.id}/model/explain`, req)).status).toBe(200);
    const second = await call("ada", "POST", `/orgs/${org.id}/model/explain`, req);
    expect(second.status).toBe(402);
    expect(calls).toHaveLength(1);
  });

  it("refuses oversized source instead of truncating it", async () => {
    const { client, calls } = fakeModel([explained]);
    const { call, seed } = harness({ model: client, env: { MODEL_MAX_SOURCE_BYTES: "100" } });
    const { org } = await seed();
    const res = await call("ada", "POST", `/orgs/${org.id}/model/explain`, { finding: ctx, source: { text: "x".repeat(101) } });
    expect(res.status).toBe(413);
    expect(calls).toHaveLength(0);
  });

  it("charges for a refusal and reports it as one", async () => {
    const { client } = fakeModel([new ModelDeclined({ inputTokens: 500, outputTokens: 0, cacheReadTokens: 0 }, "fake-model")]);
    const { call, seed } = harness({ model: client });
    const { org } = await seed();
    const res = await call("ada", "POST", `/orgs/${org.id}/model/propose`, { finding: ctx, source: { text: "x" } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("model_refused");
    expect((await call("ada", "GET", `/orgs/${org.id}/usage`)).body.usage.inputTokens).toBe(500);
  });

  it("drops discovered hits that point outside the files sent, or repeat a known hit", async () => {
    const hit = (path: string, line: number) => ({ path, line, title: "Missing role check", severity: "critical", cwe: "CWE-862", category: "authz", surface: "admin", summary: "s", description: "d", attackNarrative: "a", mitigations: [], fix: { mode: "insert-above", code: ["guard();"], rationale: "add guard" } });
    const { client } = fakeModel([{ hits: [hit("src/a.ts", 2), hit("src/a.ts", 99), hit("src/ghost.ts", 1), hit("src/a.ts", 1)] }]);
    const { call, seed } = harness({ model: client });
    const { org } = await seed();
    const res = await call("ada", "POST", `/orgs/${org.id}/model/discover`, { known: [{ ruleId: "sql-injection", path: "src/a.ts", line: 1 }], files: [{ path: "src/a.ts", text: "one\ntwo\nthree" }] });
    expect(res.body.result.hits).toHaveLength(1);
    expect(res.body.result.hits[0].line).toBe(2);
    expect(res.body.meta.dropped).toBe(3);
  });

  it("is members-only, and answers 503 when the model is switched off", async () => {
    const { call, seed } = harness();
    const { org } = await seed();
    await call("ada", "PUT", `/orgs/${org.id}/members/vic`, { role: "viewer" });
    const req = { finding: ctx, source: { text: "x" } };
    expect((await call("vic", "POST", `/orgs/${org.id}/model/explain`, req)).status).toBe(403);
    expect((await call("ada", "POST", `/orgs/${org.id}/model/explain`, req)).status).toBe(503);
  });
});
