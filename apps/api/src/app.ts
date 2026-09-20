/**
 * The HTTP app. Built from its dependencies so the same routes run on Lambda,
 * on the local dev server, and in tests against an in-memory store.
 */
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { ZodError } from "zod";
import { authenticate, cognitoVerifier, type AppEnv, type JwtVerifier } from "./auth/auth";
import { dynamoStore } from "./db/dynamo";
import { memoryStore } from "./db/memory";
import type { Config } from "./env";
import { HttpError } from "./errors";
import type { Deps } from "./http";
import { bedrockModel } from "./model/client";
import { modelRoutes } from "./routes/model";
import { orgRoutes } from "./routes/orgs";
import { runRoutes } from "./routes/runs";

export function createApp(deps: Deps & { verifyJwt?: JwtVerifier }) {
  const { config, store } = deps;
  const app = new Hono<AppEnv>();

  app.use("*", cors({ origin: config.corsOrigins, allowHeaders: ["authorization", "content-type"], allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"], maxAge: 600 }));
  // Findings batches and discover payloads are the largest bodies; both fit well inside this.
  app.use("*", bodyLimit({ maxSize: 4 * 1024 * 1024, onError: (c) => c.json({ error: { code: "body_too_large", message: "Request body is too large" } }, 413) }));

  app.get("/health", (c) => c.json({ ok: true, stage: config.stage, model: deps.model ? config.model.modelId : null }));

  const v1 = new Hono<AppEnv>();
  v1.use("*", authenticate({ store, verifyJwt: deps.verifyJwt, devAuth: config.auth.mode === "dev" }));
  v1.route("/", orgRoutes(deps));
  v1.route("/", runRoutes(deps));
  v1.route("/", modelRoutes(deps));
  app.route("/v1", v1);

  app.notFound((c) => c.json({ error: { code: "not_found", message: "No such route" } }, 404));

  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: { code: err.code, message: err.message } }, err.status);
    if (err instanceof ZodError) {
      const issues = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
      return c.json({ error: { code: "invalid_request", message: "The request did not validate", issues } }, 400);
    }
    console.error("unhandled error", err);
    return c.json({ error: { code: "internal", message: "Something went wrong" } }, 500);
  });

  return app;
}

/** Wire the real dependencies from configuration. */
export function createAppFromConfig(config: Config) {
  const store = config.store.kind === "memory" ? memoryStore() : dynamoStore({ tableName: config.store.tableName, region: config.region, endpoint: config.store.endpoint });
  const model = config.model.enabled ? bedrockModel({ region: config.model.region, modelId: config.model.modelId }) : undefined;
  const verifyJwt = config.auth.mode === "cognito" ? cognitoVerifier(config.auth) : undefined;
  return createApp({ store, config, model, verifyJwt });
}
