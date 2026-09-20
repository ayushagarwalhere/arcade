/**
 * End-to-end smoke test against whatever the environment points at — by default
 * the in-memory store; set DYNAMO_ENDPOINT (+ ARCADE_STORE=dynamo) for DynamoDB Local.
 *
 *   npx tsx scripts/smoke.ts
 */
import { createAppFromConfig } from "../src/app";
import { loadConfig } from "../src/env";
import { createLocalTable } from "./create-table";

const env = { ARCADE_AUTH: "dev", ARCADE_STORE: "memory", ARCADE_MODEL: "off", ...process.env };
const config = loadConfig(env);
if (config.store.kind === "dynamo") {
  if (!config.store.endpoint) throw new Error("Refusing to smoke-test a real AWS table — set DYNAMO_ENDPOINT");
  await createLocalTable(config.store.endpoint, config.store.tableName, config.region);
}
const app = createAppFromConfig(config);

async function call(user: string, method: string, path: string, json?: unknown) {
  const res = await app.request(`/v1${path}`, { method, headers: { authorization: `Bearer dev:${user}`, "content-type": "application/json" }, body: json ? JSON.stringify(json) : undefined });
  const body = res.status === 204 ? null : await res.json();
  console.log(`${res.status}  ${method.padEnd(5)} ${path.replace(/(org|prj|run|apr)_\w+/g, "$1_…")}`);
  if (res.status >= 400) throw new Error(JSON.stringify(body));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return body as any;
}

const user = `smoke-${Date.now()}`;
const { org } = await call(user, "POST", "/orgs", { name: "Smoke Test Org" });
const { project } = await call(user, "POST", `/orgs/${org.id}/projects`, { name: "commerce-api", repo: "acme/commerce-api" });
const { run } = await call(user, "POST", `/orgs/${org.id}/projects/${project.id}/runs`, { source: "cli" });
const runPath = `/orgs/${org.id}/projects/${project.id}/runs/${run.id}`;
await call(user, "PUT", `${runPath}/findings`, { findings: [{ id: "ARC-001", title: "Missing role check on admin export", severity: "critical", status: "reproduced", cwe: "CWE-862" }] });
const { approval } = await call(user, "POST", `${runPath}/approvals`, { kind: "code", title: "Apply fix for ARC-001", reason: "Adds the role check", target: "src/api/admin/export.ts" });
await call(user, "POST", `${runPath}/approvals/${approval.id}/decision`, { decision: "approved", note: "looks right" });
await call(user, "PATCH", runPath, { status: "completed", phase: "verified" });
const bundle = await call(user, "GET", runPath);
const me = await call(user, "GET", "/me");

console.log(`\nstore: ${config.store.kind}  ·  run ${bundle.run.status}/${bundle.run.phase}  ·  ${bundle.findings.length} finding  ·  approval ${bundle.approvals[0].status} by ${bundle.approvals[0].decidedBy}  ·  ${me.orgs.length} org`);
console.log("audit trail:");
for (const e of bundle.events) console.log(`  ${e.at}  ${e.actor.padEnd(22)} ${e.kind.padEnd(8)} ${e.text}`);
