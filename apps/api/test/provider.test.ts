/** The client half (packages/agents) against the server half (this app), with only the model faked. */
import { bedrockProvider, ProviderError, sourceWindow } from "@arcade/agents/provider";
import type { Finding } from "@arcade/core/types";
import { describe, expect, it } from "vitest";
import { fakeModel, harness } from "./helpers";

const target = {
  id: "ARC-001",
  title: "SQL built by string concatenation",
  severity: "high",
  cwe: "CWE-89 · SQL Injection",
  summary: "s",
  description: "d",
  mitigations: [],
  remediation: { branch: "b", commit: "", summary: "", rootCause: "", files: [], tests: [], commands: [] },
  vulnerableCode: { path: "src/orders.ts", lines: [{ no: 2, text: "db.query('select ' + id)", flagged: true }] },
} as unknown as Finding;

const source = "export function get(id) {\n  return db.query('select ' + id)\n}";

async function connect(answers: unknown[], as = "ada") {
  const { client, calls } = fakeModel(answers);
  const h = harness({ model: client });
  const { org } = await h.seed("ada");
  const errors: [string, unknown][] = [];
  const provider = bedrockProvider({
    apiUrl: "http://api.test",
    orgId: org.id,
    getToken: () => `dev:${as}`,
    onError: (task, e) => errors.push([task, e]),
    fetch: ((url: string, init?: RequestInit) => h.app.request(url, init)) as typeof fetch,
  });
  return { provider, calls, errors };
}

describe("bedrockProvider ↔ API", () => {
  it("explains a finding in the shape the defender merges", async () => {
    const { provider } = await connect([{ description: "D", attackNarrative: "A", rootCause: "R", mitigations: [{ title: "Use parameters", detail: "x", recommended: true, effort: "low" }] }]);
    const patch = await provider.explain!(target, source);
    expect(patch).toMatchObject({ description: "D", attackNarrative: "A", remediation: { branch: "b", rootCause: "R" } });
    expect(patch?.mitigations?.[0].title).toBe("Use parameters");
  });

  it("proposes a fix in the shape the remediator diffs", async () => {
    const { provider, calls } = await connect([{ mode: "replace", code: ["  return db.query('select $1', [id])"], rationale: "parameterise the query" }]);
    expect(await provider.propose!(target, source)).toEqual({ mode: "replace", code: ["  return db.query('select $1', [id])"], rationale: "parameterise the query" });
    expect(calls[0].user).toContain("flagged line: 2");
  });

  it("turns discovered hits into scanner Hits with a usable rule", async () => {
    const { provider } = await connect([{ hits: [{ path: "src/orders.ts", line: 1, title: "No ownership check", severity: "critical", cwe: "CWE-639", category: "authz", surface: "api", summary: "s", description: "d", attackNarrative: "a", mitigations: [], fix: { mode: "insert-above", code: ["assertOwner(id);"], rationale: "check ownership" } }] }]);
    const hits = await provider.discover!([], { "src/orders.ts": source });
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ path: "src/orders.ts", match: { line: 1, excerpt: "export function get(id) {" }, rule: { id: "model-no-ownership-check", severity: "critical" } });
    expect(hits[0].rule.fix({ line: "", id: "ARC-009" })).toEqual({ mode: "insert-above", add: ["assertOwner(id);"], note: "check ownership" });
  });

  it("reports API failures with their code instead of failing silently", async () => {
    const { provider, errors } = await connect([], "mallory");
    await expect(provider.propose!(target, source)).rejects.toBeInstanceOf(ProviderError);
    expect(errors).toHaveLength(1);
    expect(errors[0][0]).toBe("propose");
    expect((errors[0][1] as ProviderError).code).toBe("not_found");
  });
});

describe("sourceWindow", () => {
  it("sends small files whole", () => {
    expect(sourceWindow("a\nb\nc", 2)).toEqual({ text: "a\nb\nc", startLine: 1 });
  });

  it("cuts large files to whole lines around the finding, and says where the window starts", () => {
    const lines = Array.from({ length: 1000 }, (_, i) => `line ${i + 1} ${"x".repeat(40)}`);
    const w = sourceWindow(lines.join("\n"), 500, 2000);
    const got = w.text.split("\n");
    expect(new TextEncoder().encode(w.text).length).toBeLessThanOrEqual(2000);
    expect(got[0]).toBe(lines[w.startLine - 1]);
    expect(got).toContain(lines[499]);
    expect(w.startLine).toBeGreaterThan(450);
    expect(w.startLine + got.length).toBeLessThan(550);
  });
});
