/**
 * DEVELOPMENT ONLY — a small in-memory repository with known weaknesses, for
 * exercising the assessment and fix screens without a GitHub token (and as the
 * corpus for scripts/test.mjs). It is reached only through `require` inside an
 * `if (__DEV__)` block (see dev.ts), which Metro removes from production
 * bundles together with this module. The marker below lets a build be checked:
 * ARCADE_DEV_FIXTURE_MARKER must not appear in an exported bundle.
 *
 * The "secret" is a made-up value in a key-shaped format.
 */
export const FIXTURE_MARKER = "ARCADE_DEV_FIXTURE_MARKER";

export const FIXTURE_FILES: Record<string, string> = {
  "package.json": `{\n  "name": "fixture-shop",\n  "private": true,\n  "dependencies": { "express": "^4.19.0", "pg": "^8.11.0" }\n}\n`,
  "tsconfig.json": `{ "compilerOptions": { "strict": true } }\n`,
  "README.md": `# fixture-shop\n\nA deliberately weak sample service. ${FIXTURE_MARKER}\n`,
  "src/server.ts": [
    `import express from "express";`,
    `import cors from "cors";`,
    `import { exportUsers } from "./api/admin/export";`,
    ``,
    `const app = express();`,
    `app.use(`,
    `  cors({`,
    `    origin: "*",`,
    `    credentials: true,`,
    `  }),`,
    `);`,
    `app.post("/api/admin/export", exportUsers);`,
    `app.listen(3000);`,
    ``,
  ].join("\n"),
  "src/lib/etag.ts": [
    `import { createHash } from "node:crypto";`,
    ``,
    `/** Cache validator for a response body. */`,
    `export function etag(body: string) {`,
    `  return createHash("md5").update(body).digest("hex");`,
    `}`,
    ``,
  ].join("\n"),
  "src/lib/billing-client.ts": [
    `import https from "node:https";`,
    ``,
    `export const billingAgent = new https.Agent({`,
    `  keepAlive: true,`,
    `  rejectUnauthorized: false,`,
    `});`,
    ``,
    `// The same flag, inline with other code on one line.`,
    `export const legacyAgent = new https.Agent({ rejectUnauthorized: false });`,
    ``,
  ].join("\n"),
  "src/lib/payments.ts": [`const STRIPE_KEY = "sk_live_` + `FixtureOnlyNotARealKey000";`, ``, `export const stripeKey = () => STRIPE_KEY;`, ``].join("\n"),
  "src/db/users.ts": [
    `import { db } from "./client";`,
    ``,
    `export async function findUser(email: string) {`,
    "  return db.query(`SELECT * FROM users WHERE email = '${email}'`);",
    `}`,
    ``,
  ].join("\n"),
  "src/api/admin/export.ts": [
    `import type { Request, Response } from "express";`,
    `import { validateSession } from "../../auth/session";`,
    `import { db } from "../../db/client";`,
    ``,
    `export async function exportUsers(req: Request, res: Response) {`,
    `  const session = await validateSession(req);`,
    `  if (!session) return res.status(401).end();`,
    `  const rows = await db.query("SELECT * FROM users");`,
    `  res.json(rows);`,
    `}`,
    ``,
  ].join("\n"),
  "tests/etag.test.ts": [`import { createHash } from "node:crypto";`, `test("md5 fixture", () => expect(createHash("md5").update("a").digest("hex")).toHaveLength(32));`, ``].join("\n"),
};
