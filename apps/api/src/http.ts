import type { Context } from "hono";
import type { z } from "zod";
import type { ModelClient } from "./model/client";
import type { ScoreClient } from "./score/client";
import type { Config } from "./env";
import type { Store } from "./db/store";
import { badRequest } from "./errors";

export interface Deps {
  store: Store;
  config: Config;
  /** Absent when the model is switched off; the model routes answer 503. */
  model?: ModelClient;
  /** Absent when no classifier endpoint is configured; findings are then stored unscored. */
  scorer?: ScoreClient;
}

/** Parse and validate a JSON body. Validation failures surface as a 400 listing each problem. */
export async function body<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest("The request body must be JSON");
  }
  return schema.parse(raw);
}

export const pageQuery = (c: Context) => {
  const limit = Number(c.req.query("limit"));
  return { limit: Number.isFinite(limit) && limit > 0 ? limit : undefined, cursor: c.req.query("cursor") || undefined };
};
