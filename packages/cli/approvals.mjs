// Arcade approvals — the MCP server's link to the human approval gate in the
// Arcade API (apps/api, routes/runs.ts):
//
//   POST /v1/orgs/:org/projects/:project/runs/:run/approvals        ask
//   GET  /v1/orgs/:org/projects/:project/runs/:run/approvals/:id    poll
//
// An agent can ask and watch. It can never decide: the API refuses a decision
// made with an API token, so nothing here (or anywhere in the CLI) grants one.
//
// Configuration comes from the environment, with the ids also accepted from
// `cloud` in .arcade/config.json:
//   ARCADE_API_URL, ARCADE_TOKEN                     required; without them the gate is "unavailable"
//   ARCADE_ORG_ID, ARCADE_PROJECT_ID                 required once the API is configured
//   ARCADE_RUN_ID                                    optional; a run is opened when it is missing
// The token only ever travels in the Authorization header, and only over https
// (plain http is accepted for localhost, for development). It is never returned.
//
// Dependency-free.

export class ApprovalError extends Error {}

const KINDS = ["code", "destructive", "ship"];
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);
const ID = /^[\w.-]{1,80}$/;

/** `{ available: false, reason }` or `{ available: true, apiUrl, token, orgId, projectId, runId }`. */
export function approvalConfig(env = process.env, cloud = {}) {
  const missing = ["ARCADE_API_URL", "ARCADE_TOKEN"].filter((k) => !env[k]);
  if (missing.length) {
    return { available: false, reason: `${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not set, so this server has no approval gate to reach. Nobody has been asked. Ask the person directly, or configure the Arcade API.` };
  }
  let url;
  try {
    url = new URL(env.ARCADE_API_URL);
  } catch {
    throw new ApprovalError("ARCADE_API_URL is not a URL.");
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOOPBACK.has(url.hostname))) throw new ApprovalError("ARCADE_API_URL must be https (http is accepted for localhost only), so the token is never sent in the clear.");

  const orgId = env.ARCADE_ORG_ID || cloud.orgId;
  const projectId = env.ARCADE_PROJECT_ID || cloud.projectId;
  const runId = env.ARCADE_RUN_ID || cloud.runId || null;
  const lacking = [!orgId && "ARCADE_ORG_ID", !projectId && "ARCADE_PROJECT_ID"].filter(Boolean);
  if (lacking.length) throw new ApprovalError(`The Arcade API is configured, but ${lacking.join(" and ")} ${lacking.length === 1 ? "is" : "are"} missing. Set ${lacking.length === 1 ? "it" : "them"} in the environment, or as cloud.orgId / cloud.projectId in .arcade/config.json.`);
  for (const [name, v] of [["org id", orgId], ["project id", projectId], ["run id", runId]]) if (v && !ID.test(v)) throw new ApprovalError(`The ${name} "${v}" isn't a valid id.`);

  return { available: true, apiUrl: url.href.replace(/\/+$/, ""), token: env.ARCADE_TOKEN, orgId, projectId, runId };
}

async function api(cfg, method, path, body) {
  let res;
  try {
    res = await fetch(`${cfg.apiUrl}/v1${path}`, {
      method,
      headers: { Accept: "application/json", Authorization: `Bearer ${cfg.token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw new ApprovalError(`The Arcade API at ${cfg.apiUrl} could not be reached: ${e.cause?.code ?? e.message}`);
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApprovalError(`The Arcade API answered ${res.status}${data?.error?.code ? ` (${data.error.code})` : ""}: ${data?.error?.message ?? "no detail"}`);
  return data;
}

const base = (cfg) => `/orgs/${encodeURIComponent(cfg.orgId)}/projects/${encodeURIComponent(cfg.projectId)}/runs`;

/**
 * Ask a person to approve something. Resolves with the approval as the API
 * recorded it (status "pending" until someone decides), or "unavailable" when
 * there is no API to ask.
 */
export async function requestApproval({ action, kind = "code", reason = "", target = "" }, { env = process.env, cloud } = {}) {
  if (typeof action !== "string" || !action.trim()) throw new ApprovalError("`action` is required: say what needs approving.");
  if (!KINDS.includes(kind)) throw new ApprovalError(`\`kind\` must be one of ${KINDS.join(", ")}.`);
  const cfg = approvalConfig(env, cloud);
  if (!cfg.available) return { status: "unavailable", action, reason: cfg.reason };

  let runId = cfg.runId;
  let runCreated = false;
  if (!runId) {
    runId = (await api(cfg, "POST", base(cfg), { profile: "scan", source: "mcp" })).run.id;
    runCreated = true;
  }
  const { approval } = await api(cfg, "POST", `${base(cfg)}/${encodeURIComponent(runId)}/approvals`, {
    kind,
    title: action.trim().slice(0, 200),
    reason: String(reason).slice(0, 2000),
    target: String(target).slice(0, 1000),
  });
  return { status: approval.status, approvalId: approval.id, runId, runCreated, kind: approval.kind, title: approval.title, note: "Recorded in the Arcade API. It stays pending until a signed-in person decides; poll with arcade_get_approval." };
}

/** Where a requested approval stands. */
export async function getApproval({ id, runId }, { env = process.env, cloud } = {}) {
  if (typeof id !== "string" || !ID.test(id)) throw new ApprovalError("`id` must be the approvalId that arcade_request_approval returned.");
  const cfg = approvalConfig(env, cloud);
  if (!cfg.available) return { status: "unavailable", reason: cfg.reason };
  const run = runId || cfg.runId;
  if (!run || !ID.test(run)) throw new ApprovalError("`runId` is required: pass the runId that arcade_request_approval returned.");
  const { approval } = await api(cfg, "GET", `${base(cfg)}/${encodeURIComponent(run)}/approvals/${encodeURIComponent(id)}`);
  return { status: approval.status, approvalId: approval.id, runId: run, kind: approval.kind, title: approval.title, decidedBy: approval.decidedBy ?? null, decidedAt: approval.decidedAt ?? null, note: approval.note ?? null };
}
