import type { z } from "zod";
import { createApp } from "../src/app";
import { memoryStore } from "../src/db/memory";
import type { Store } from "../src/db/store";
import { loadConfig } from "../src/env";
import type { ModelClient } from "../src/model/client";
import type { ScoreClient } from "../src/score/client";

/** A model that answers from a queue and records every prompt it was sent. */
export function fakeModel(answers: unknown[] = []) {
  const calls: { system: string; user: string }[] = [];
  const client: ModelClient = {
    async structured({ system, user, schema }) {
      calls.push({ system, user });
      const next = answers.shift();
      if (next instanceof Error) throw next;
      return { value: schema.parse(next) as z.infer<typeof schema>, usage: { inputTokens: 1000, outputTokens: 200, cacheReadTokens: 0 }, model: "fake-model" };
    },
  };
  return { client, calls };
}

export function harness(opts: { model?: ModelClient; scorer?: ScoreClient; env?: Record<string, string>; store?: Store } = {}) {
  const config = loadConfig({ ARCADE_AUTH: "dev", ARCADE_STORE: "memory", ...opts.env });
  const store = opts.store ?? memoryStore();
  const app = createApp({ store, config, model: opts.model, scorer: opts.scorer });

  /** Call the API as a dev user, or with a raw bearer credential. */
  async function call(as: string | { bearer: string } | null, method: string, path: string, json?: unknown) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (as) headers.authorization = `Bearer ${typeof as === "string" ? `dev:${as}` : as.bearer}`;
    const res = await app.request(`/v1${path}`, { method, headers, body: json === undefined ? undefined : JSON.stringify(json) });
    const text = await res.text();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return { status: res.status, body: (text ? JSON.parse(text) : null) as any };
  }

  /** An org owned by `owner`, with one project and one run in it. */
  async function seed(owner = "ada") {
    const org = (await call(owner, "POST", "/orgs", { name: "Acme" })).body.org;
    const project = (await call(owner, "POST", `/orgs/${org.id}/projects`, { name: "commerce-api" })).body.project;
    const run = (await call(owner, "POST", `/orgs/${org.id}/projects/${project.id}/runs`, {})).body.run;
    return { org, project, run, runPath: `/orgs/${org.id}/projects/${project.id}/runs/${run.id}` };
  }

  return { app, store, call, seed };
}

export const finding = (id: string, severity: "critical" | "high" | "medium" | "low" = "high") => ({
  id,
  title: `Finding ${id}`,
  severity,
  status: "reproduced",
  cwe: "CWE-89 · SQL Injection",
  target: "src/api/orders.ts",
  summary: "String-built SQL",
  vulnerableCode: { path: "src/api/orders.ts", lines: [{ no: 12, text: "db.query('select ' + id)", flagged: true }] },
});
