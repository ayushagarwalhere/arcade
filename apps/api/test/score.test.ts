import { describe, expect, it } from "vitest";
import type { ScoreClient } from "../src/score/client";
import { finding, harness } from "./helpers";

/** A scorer that answers from a function of the text, and records what it was asked. */
function fakeScorer(fn: (text: string) => number = () => 0.9) {
  const asked: string[][] = [];
  const client: ScoreClient = {
    model: "fake-endpoint",
    async score(texts) {
      asked.push(texts);
      return texts.map(fn);
    },
  };
  return { client, asked };
}

const scorable = (id: string) => ({ ...finding(id), ruleId: "sql-injection" });

describe("false-positive scoring", () => {
  it("scores findings on save, in the exact text form the model was trained on", async () => {
    const { client, asked } = fakeScorer((t) => (t.includes("select") ? 0.97 : 0.1));
    const { call, seed } = harness({ scorer: client });
    const { runPath } = await seed();
    const res = await call("ada", "PUT", `${runPath}/findings`, { findings: [scorable("ARC-001")] });
    expect(res.body).toEqual({ stored: 1, scored: 1 });
    expect(asked[0][0]).toBe("rule: sql-injection\npath: src/api/orders.ts\n>>> db.query('select ' + id)");

    const stored = (await call("ada", "GET", runPath)).body.findings[0];
    expect(stored.score).toMatchObject({ pTruePositive: 0.97, model: "fake-endpoint" });
  });

  it("saves findings unscored when the classifier fails — scoring never blocks a scan", async () => {
    const failing: ScoreClient = { model: "cold", score: async () => Promise.reject(new Error("endpoint cold")) };
    const { call, seed } = harness({ scorer: failing });
    const { runPath } = await seed();
    const res = await call("ada", "PUT", `${runPath}/findings`, { findings: [scorable("ARC-001")] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ stored: 1, scored: 0 });
    expect((await call("ada", "GET", runPath)).body.findings[0].score).toBeUndefined();
  });

  it("skips findings without a rule id or a flagged line rather than guessing", async () => {
    const { client, asked } = fakeScorer();
    const { call, seed } = harness({ scorer: client });
    const { runPath } = await seed();
    const res = await call("ada", "PUT", `${runPath}/findings`, { findings: [finding("NO-RULE"), scorable("ARC-002")] });
    expect(res.body).toEqual({ stored: 2, scored: 1 });
    expect(asked[0]).toHaveLength(1);
  });

  it("re-scores only what is missing, and keeps a score when a finding is reported again", async () => {
    let up = false;
    const flaky: ScoreClient = { model: "m1", score: async (texts) => (up ? texts.map(() => 0.42) : Promise.reject(new Error("cold"))) };
    const { call, seed } = harness({ scorer: flaky });
    const { runPath } = await seed();
    await call("ada", "PUT", `${runPath}/findings`, { findings: [scorable("ARC-001")] });

    up = true;
    expect((await call("ada", "POST", `${runPath}/findings/score`)).body).toEqual({ scored: 1, stillUnscored: 0 });
    expect((await call("ada", "POST", `${runPath}/findings/score`)).body).toEqual({ scored: 0, stillUnscored: 0 });

    up = false; // reported again while the classifier is down: the earlier score survives
    await call("ada", "PUT", `${runPath}/findings`, { findings: [scorable("ARC-001")] });
    expect((await call("ada", "GET", runPath)).body.findings[0].score.pTruePositive).toBe(0.42);
  });

  it("answers 503 on re-score when no classifier is configured, and still stores findings", async () => {
    const { call, seed } = harness();
    const { runPath } = await seed();
    expect((await call("ada", "PUT", `${runPath}/findings`, { findings: [scorable("ARC-001")] })).body).toEqual({ stored: 1, scored: 0 });
    expect((await call("ada", "POST", `${runPath}/findings/score`)).status).toBe(503);
  });
});
