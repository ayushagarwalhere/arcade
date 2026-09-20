/**
 * The model endpoints behind `AssessmentProvider`: explain, propose, discover.
 *
 * Each request is authorized, size-checked, charged against the org's monthly
 * budget, stripped of secrets, and only then sent to Bedrock. Usage is recorded
 * whether or not the answer was usable, because the tokens were spent either way.
 */
import { Hono, type Context } from "hono";
import type { z } from "zod";
import { requireOrgRole, type AppEnv } from "../auth/auth";
import { HttpError } from "../errors";
import { body, type Deps } from "../http";
import { monthOf } from "../ids";
import { ModelDeclined, type ModelResult, type ModelUsage } from "../model/client";
import { discoverPrompt, findingPrompt, SYSTEM } from "../model/prompts";
import { redact } from "../model/redact";
import { discoverRequest, discoverResponse, explainRequest, explainResponse, proposeRequest, proposeResponse } from "../model/schemas";

export function modelRoutes({ store, config, model }: Deps) {
  const app = new Hono<AppEnv>();

  /** Authorize, check size and budget; returns what a task needs to run. */
  async function admit(c: Context<AppEnv>, sourceBytes: number) {
    const orgId = c.req.param("orgId") as string;
    await requireOrgRole(c, store, orgId, "member");
    if (!model) throw new HttpError(503, "model_disabled", "Model analysis is switched off on this server");
    if (sourceBytes > config.model.maxSourceBytes) {
      throw new HttpError(413, "source_too_large", `Send at most ${config.model.maxSourceBytes} bytes of source per request — a window around the finding is enough`);
    }
    const month = monthOf();
    const used = await store.getUsage(orgId, month);
    if (used.inputTokens + used.outputTokens >= config.model.monthlyTokenBudget) {
      throw new HttpError(402, "budget_exceeded", "This organisation has used its model budget for the month");
    }
    const record = (u: ModelUsage) => store.addUsage(orgId, month, { requests: 1, ...u });
    return { model, record };
  }

  async function run<T>(record: (u: ModelUsage) => Promise<void>, call: () => Promise<ModelResult<T>>): Promise<ModelResult<T>> {
    try {
      const result = await call();
      await record(result.usage);
      return result;
    } catch (e) {
      if (e instanceof ModelDeclined) await record(e.usage);
      throw e;
    }
  }

  const meta = (r: ModelResult<unknown>, redactions: Record<string, number>) => ({ model: r.model, usage: r.usage, redactions });

  const bytes = (s: string) => Buffer.byteLength(s);

  // explain and propose take the same request shape, so one schema type covers both.
  function findingTask<Res extends z.ZodType>(path: string, request: typeof explainRequest | typeof proposeRequest, response: Res, system: string, effort: "low" | "medium" | "high") {
    app.post(path, async (c) => {
      const input = await body(c, request);
      const { model, record } = await admit(c, bytes(input.source.text));
      const clean = redact(input.source.text);
      const result = await run(record, () => model.structured({ system, user: findingPrompt(input.finding, clean.text, input.source.startLine), schema: response, effort }));
      return c.json({ result: result.value, meta: meta(result, clean.counts) });
    });
  }

  findingTask("/orgs/:orgId/model/explain", explainRequest, explainResponse, SYSTEM.explain, "medium");
  findingTask("/orgs/:orgId/model/propose", proposeRequest, proposeResponse, SYSTEM.propose, "high");

  app.post("/orgs/:orgId/model/discover", async (c) => {
    const input = await body(c, discoverRequest);
    const { model, record } = await admit(c, input.files.reduce((n, f) => n + bytes(f.text), 0));

    const redactions: Record<string, number> = {};
    const files = input.files.map((f) => {
      const clean = redact(f.text);
      for (const [kind, n] of Object.entries(clean.counts)) redactions[kind] = (redactions[kind] ?? 0) + n;
      return { path: f.path, text: clean.text };
    });

    const result = await run(record, () => model.structured({ system: SYSTEM.discover, user: discoverPrompt(input.known, files), schema: discoverResponse, effort: "high" }));

    // The model names files and lines; keep only the ones that exist and are new.
    const lineCount = new Map(input.files.map((f) => [f.path, f.text.split("\n").length]));
    const known = new Set(input.known.map((k) => `${k.path}:${k.line}`));
    const hits = result.value.hits.filter((h) => {
      const lines = lineCount.get(h.path);
      return lines !== undefined && h.line >= 1 && h.line <= lines && !known.has(`${h.path}:${h.line}`);
    });
    return c.json({ result: { hits }, meta: { ...meta(result, redactions), dropped: result.value.hits.length - hits.length } });
  });

  return app;
}
