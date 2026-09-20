/**
 * Local development server: `npm run dev -w apps/api` → http://localhost:3002
 *
 * Defaults to an in-memory store, dev auth (`Authorization: Bearer dev:<name>`)
 * and the model switched off, so it runs with no AWS account at all. Override
 * any of these through the environment — see .env.example.
 */
import { serve } from "@hono/node-server";
import { createAppFromConfig } from "./app";
import { loadConfig } from "./env";

const env = {
  ARCADE_AUTH: "dev",
  ARCADE_STORE: "memory",
  ARCADE_MODEL: "off",
  CORS_ORIGINS: "http://localhost:3000,http://localhost:3001",
  ...process.env,
};

const config = loadConfig(env);
const port = Number(process.env.PORT ?? 3002);

serve({ fetch: createAppFromConfig(config).fetch, port }, () => {
  console.log(`Arcade API on http://localhost:${port}  ·  auth: ${config.auth.mode}  ·  store: ${config.store.kind}  ·  model: ${config.model.enabled ? config.model.modelId : "off"}`);
});
