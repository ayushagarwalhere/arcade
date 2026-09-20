/**
 * Saves a finished assessment to the Arcade API (apps/api), where it lands in DynamoDB.
 *
 * Platform-neutral on purpose — the ADE, the desktop app and the CLI can all call it.
 * The caller supplies the bearer token (a Cognito session token or an `arc_` API token),
 * so no cloud credential ever exists on the client.
 */
import type { Finding } from "./types";

export interface CloudConfig {
  /** Base URL of the Arcade API, with or without a trailing slash. */
  apiUrl: string;
  getToken: () => string | Promise<string>;
  fetch?: typeof fetch;
}

export interface SaveInput {
  projectName: string;
  repo?: string;
  profile: "full" | "scan-only";
  filesScanned: number;
  findings: Finding[];
}

export interface SavedRun {
  orgId: string;
  projectId: string;
  runId: string;
  stored: number;
  /** How many findings the false-positive classifier scored on the way in. */
  scored: number;
}

export class CloudError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/** The API accepts at most 100 findings per request; stay well inside the body limit too. */
const CHUNK = 50;

export async function saveAssessment(cfg: CloudConfig, input: SaveInput): Promise<SavedRun> {
  const doFetch = cfg.fetch ?? fetch;
  const base = `${cfg.apiUrl.replace(/\/+$/, "")}/v1`;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await doFetch(`${base}${path}`, {
      method,
      headers: { authorization: `Bearer ${await cfg.getToken()}`, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as (T & { error?: { code: string; message: string } }) | null;
    if (!res.ok || !json) throw new CloudError(res.status, json?.error?.code ?? "unknown", json?.error?.message ?? `The Arcade API answered ${res.status}`);
    return json;
  }

  // A first-time user has no organisation yet: give them a personal one.
  const me = await call<{ user: { email?: string }; orgs: { id: string }[] }>("GET", "/me");
  const orgId = me.orgs[0]?.id ?? (await call<{ org: { id: string } }>("POST", "/orgs", { name: `${me.user.email?.split("@")[0] ?? "My"} workspace`.slice(0, 120) })).org.id;

  // One project per workspace name, reused across scans so runs accumulate as history.
  const name = input.projectName.trim().slice(0, 120) || "Untitled project";
  const { projects } = await call<{ projects: { id: string; name: string }[] }>("GET", `/orgs/${orgId}/projects`);
  const projectId = projects.find((p) => p.name === name)?.id ?? (await call<{ project: { id: string } }>("POST", `/orgs/${orgId}/projects`, { name, repo: input.repo?.slice(0, 300) })).project.id;

  const runs = `/orgs/${orgId}/projects/${projectId}/runs`;
  const { run } = await call<{ run: { id: string } }>("POST", runs, { profile: input.profile === "full" ? "full" : "scan", source: "ade" });

  let stored = 0;
  let scored = 0;
  for (let i = 0; i < input.findings.length; i += CHUNK) {
    const r = await call<{ stored: number; scored: number }>("PUT", `${runs}/${run.id}/findings`, { findings: input.findings.slice(i, i + CHUNK) });
    stored += r.stored;
    scored += r.scored;
  }

  const count = (s: Finding["severity"]) => input.findings.filter((f) => f.severity === s).length;
  await call("POST", `${runs}/${run.id}/events`, { actor: "mapper", kind: "map", text: `Scanned ${input.filesScanned} files · ${input.findings.length} findings` });
  await call("PATCH", `${runs}/${run.id}`, {
    status: "completed",
    // Static analysis explains findings; it does not attack or verify, so the record must not claim it did.
    phase: "defended",
    counts: { files: input.filesScanned, findings: input.findings.length, critical: count("critical"), high: count("high"), medium: count("medium"), low: count("low") },
  });

  return { orgId, projectId, runId: run.id, stored, scored };
}
