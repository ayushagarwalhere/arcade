/** The ADE's save path (packages/core cloud-sync) against the real API routes and store. */
import { CloudError, saveAssessment } from "@arcade/core/cloud-sync";
import type { Finding } from "@arcade/core/types";
import { describe, expect, it } from "vitest";
import type { ScoreClient } from "../src/score/client";
import { finding, harness } from "./helpers";

const scorer: ScoreClient = { model: "fake-endpoint", score: async (texts) => texts.map(() => 0.8) };
const findings = (n: number) => Array.from({ length: n }, (_, i) => ({ ...finding(`ARC-${String(i + 1).padStart(3, "0")}`, i === 0 ? "critical" : "low"), ruleId: "sql-injection" })) as unknown as Finding[];

function connect(user: string, h = harness({ scorer })) {
  const cfg = { apiUrl: "http://api.test/", getToken: () => `dev:${user}`, fetch: ((url: string, init?: RequestInit) => h.app.request(url, init)) as typeof fetch };
  return { h, cfg };
}

describe("saveAssessment", () => {
  it("creates a workspace for a first-time user and stores the scan, scored, in one call", async () => {
    const { h, cfg } = connect("newcomer");
    const saved = await saveAssessment(cfg, { projectName: "commerce-api", repo: "acme/commerce-api", profile: "full", filesScanned: 412, findings: findings(3) });
    expect(saved).toMatchObject({ stored: 3, scored: 3 });

    const bundle = (await h.call("newcomer", "GET", `/orgs/${saved.orgId}/projects/${saved.projectId}/runs/${saved.runId}`)).body;
    expect(bundle.run).toMatchObject({ status: "completed", phase: "defended", source: "ade", counts: { files: 412, findings: 3, critical: 1, low: 2 } });
    expect(bundle.findings).toHaveLength(3);
    expect(bundle.findings[0].score.pTruePositive).toBe(0.8);
    expect(bundle.events.map((e: { text: string }) => e.text)).toContain("Scanned 412 files · 3 findings");
  });

  it("reuses the org and the project, so repeated scans build a history", async () => {
    const { h, cfg } = connect("ada");
    const a = await saveAssessment(cfg, { projectName: "commerce-api", profile: "scan-only", filesScanned: 10, findings: findings(1) });
    const b = await saveAssessment(cfg, { projectName: "commerce-api", profile: "scan-only", filesScanned: 11, findings: findings(2) });
    expect([b.orgId, b.projectId]).toEqual([a.orgId, a.projectId]);
    expect(b.runId).not.toBe(a.runId);
    const runs = (await h.call("ada", "GET", `/orgs/${a.orgId}/projects/${a.projectId}/runs`)).body.runs;
    expect(runs.map((r: { id: string }) => r.id)).toEqual([b.runId, a.runId]);
  });

  it("sends large scans in batches the API accepts", async () => {
    const { cfg } = connect("ada");
    const saved = await saveAssessment(cfg, { projectName: "big", profile: "full", filesScanned: 4000, findings: findings(130) });
    expect(saved.stored).toBe(130);
  });

  it("stores a clean scan as a run with no findings", async () => {
    const { h, cfg } = connect("ada");
    const saved = await saveAssessment(cfg, { projectName: "clean", profile: "full", filesScanned: 50, findings: [] });
    const bundle = (await h.call("ada", "GET", `/orgs/${saved.orgId}/projects/${saved.projectId}/runs/${saved.runId}`)).body;
    expect(bundle.findings).toEqual([]);
    expect(bundle.run.counts.findings).toBe(0);
  });

  it("surfaces an API failure with its code", async () => {
    const h = harness();
    const cfg = { apiUrl: "http://api.test", getToken: () => "not-a-valid-credential", fetch: ((url: string, init?: RequestInit) => h.app.request(url, init)) as typeof fetch };
    await expect(saveAssessment(cfg, { projectName: "x", profile: "full", filesScanned: 1, findings: [] })).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    await expect(saveAssessment(cfg, { projectName: "x", profile: "full", filesScanned: 1, findings: [] })).rejects.toBeInstanceOf(CloudError);
  });
});
