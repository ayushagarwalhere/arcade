import { describe, expect, it } from "vitest";
import { finding, harness } from "./helpers";

describe("authentication", () => {
  it("rejects requests with no credential, and unknown API tokens", async () => {
    const { call } = harness();
    expect((await call(null, "GET", "/me")).status).toBe(401);
    expect((await call({ bearer: "arc_not-a-real-token" }, "GET", "/me")).status).toBe(401);
  });

  it("refuses dev auth when it is not switched on", async () => {
    const { call } = harness({ env: { ARCADE_AUTH: "", COGNITO_USER_POOL_ID: "us-east-1_abc123", COGNITO_CLIENT_IDS: "client" } });
    expect((await call("ada", "GET", "/me")).status).toBe(401);
  });

  it("leaves /health open", async () => {
    const { app } = harness();
    expect((await app.request("/health")).status).toBe(200);
  });
});

describe("tenant isolation", () => {
  it("hides an org, its projects and its runs from non-members", async () => {
    const { call, seed } = harness();
    const { org, runPath } = await seed("ada");
    // 404, not 403: an outsider learns nothing about which org ids exist.
    expect((await call("mallory", "GET", `/orgs/${org.id}`)).status).toBe(404);
    expect((await call("mallory", "GET", `/orgs/${org.id}/projects`)).status).toBe(404);
    expect((await call("mallory", "GET", runPath)).status).toBe(404);
    expect((await call("mallory", "PUT", `${runPath}/findings`, { findings: [finding("ARC-001")] })).status).toBe(404);
  });

  it("does not serve one org's run through another org's path", async () => {
    const { call, seed } = harness();
    const a = await seed("ada");
    const b = await seed("mallory");
    const crossed = `/orgs/${b.org.id}/projects/${a.project.id}/runs/${a.run.id}`;
    expect((await call("mallory", "GET", crossed)).status).toBe(404);
  });

  it("lists only the caller's orgs", async () => {
    const { call, seed } = harness();
    await seed("ada");
    await seed("grace");
    const me = await call("ada", "GET", "/me");
    expect(me.body.orgs).toHaveLength(1);
    expect(me.body.orgs[0].role).toBe("owner");
  });
});

describe("roles", () => {
  it("lets a viewer read but not write", async () => {
    const { call, seed } = harness();
    const { org, runPath } = await seed("ada");
    await call("ada", "PUT", `/orgs/${org.id}/members/vic`, { role: "viewer" });
    expect((await call("vic", "GET", runPath)).status).toBe(200);
    expect((await call("vic", "POST", `/orgs/${org.id}/projects`, { name: "x" })).status).toBe(403);
  });

  it("stops an admin granting owner, and keeps the last owner in place", async () => {
    const { call, seed } = harness();
    const { org } = await seed("ada");
    await call("ada", "PUT", `/orgs/${org.id}/members/bob`, { role: "admin" });
    expect((await call("bob", "PUT", `/orgs/${org.id}/members/eve`, { role: "owner" })).status).toBe(403);
    expect((await call("bob", "PUT", `/orgs/${org.id}/members/ada`, { role: "member" })).status).toBe(403);
    expect((await call("ada", "PUT", `/orgs/${org.id}/members/ada`, { role: "member" })).status).toBe(409);
    expect((await call("ada", "DELETE", `/orgs/${org.id}/members/ada`)).status).toBe(409);
  });
});

describe("abuse limits", () => {
  it("caps how many organisations one account can own, since each carries its own model budget", async () => {
    const { call } = harness();
    for (let i = 0; i < 3; i++) expect((await call("eve", "POST", "/orgs", { name: `org ${i}` })).status).toBe(201);
    const fourth = await call("eve", "POST", "/orgs", { name: "one too many" });
    expect(fourth.status).toBe(403);
    expect(fourth.body.error.code).toBe("org_limit");
    // Being a member of other people's orgs does not count against the cap.
    expect((await call("ada", "POST", "/orgs", { name: "ada's" })).status).toBe(201);
  });

  it("sends security headers on every response", async () => {
    const { app } = harness();
    const res = await app.request("/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBeTruthy();
    expect(res.headers.get("strict-transport-security")).toContain("max-age");
  });
});

describe("API tokens", () => {
  it("authenticates with a minted token, scoped to its org, and never returns the secret again", async () => {
    const { call, seed } = harness();
    const a = await seed("ada");
    const b = await seed("ada");
    const minted = await call("ada", "POST", `/orgs/${a.org.id}/tokens`, { name: "ci" });
    expect(minted.status).toBe(201);
    const bearer = { bearer: minted.body.token as string };
    expect(minted.body.record.hash).toBeUndefined();

    expect((await call(bearer, "GET", a.runPath)).status).toBe(200);
    expect((await call(bearer, "GET", b.runPath)).status).toBe(404);

    const listed = await call("ada", "GET", `/orgs/${a.org.id}/tokens`);
    expect(JSON.stringify(listed.body)).not.toContain(minted.body.token);
    expect(listed.body.tokens[0].hash).toBeUndefined();
  });

  it("stops working when revoked, or when its creator leaves the org", async () => {
    const { call, seed } = harness();
    const { org, runPath } = await seed("ada");
    await call("ada", "PUT", `/orgs/${org.id}/members/bob`, { role: "member" });
    const minted = await call("bob", "POST", `/orgs/${org.id}/tokens`, { name: "laptop" });
    const bearer = { bearer: minted.body.token as string };
    expect((await call(bearer, "GET", runPath)).status).toBe(200);

    await call("ada", "DELETE", `/orgs/${org.id}/members/bob`);
    expect((await call(bearer, "GET", runPath)).status).toBe(404);

    const mine = await call("ada", "POST", `/orgs/${org.id}/tokens`, { name: "mine" });
    await call("ada", "DELETE", `/orgs/${org.id}/tokens/${mine.body.record.id}`);
    expect((await call({ bearer: mine.body.token }, "GET", runPath)).status).toBe(401);
  });

  it("cannot outrank its creator or mint further tokens", async () => {
    const { call, seed } = harness();
    const { org } = await seed("ada");
    await call("ada", "PUT", `/orgs/${org.id}/members/bob`, { role: "member" });
    expect((await call("bob", "POST", `/orgs/${org.id}/tokens`, { name: "x", role: "admin" })).status).toBe(403);
    const minted = await call("bob", "POST", `/orgs/${org.id}/tokens`, { name: "x" });
    expect((await call({ bearer: minted.body.token }, "POST", `/orgs/${org.id}/tokens`, { name: "y" })).status).toBe(403);
  });
});

describe("runs and findings", () => {
  it("stores findings, returns the run bundle, and lists runs newest first", async () => {
    const { call, seed } = harness();
    const { org, project, runPath } = await seed();
    expect((await call("ada", "PUT", `${runPath}/findings`, { findings: [finding("ARC-001", "critical"), finding("ARC-002", "low")] })).status).toBe(200);
    await call("ada", "PATCH", runPath, { phase: "attacked", counts: { files: 40, findings: 2, critical: 1, high: 0, medium: 0, low: 1 } });

    const bundle = await call("ada", "GET", runPath);
    expect(bundle.body.findings.map((f: { id: string }) => f.id)).toEqual(["ARC-001", "ARC-002"]);
    expect(bundle.body.run.phase).toBe("attacked");
    expect(bundle.body.run.counts.files).toBe(40);

    const second = (await call("ada", "POST", `/orgs/${org.id}/projects/${project.id}/runs`, { source: "cli" })).body.run;
    const runs = await call("ada", "GET", `/orgs/${org.id}/projects/${project.id}/runs`);
    expect(runs.body.runs[0].id).toBe(second.id);
  });

  it("keeps a triage decision when the same finding is reported again", async () => {
    const { call, seed } = harness();
    const { org, runPath } = await seed();
    await call("ada", "PUT", `${runPath}/findings`, { findings: [finding("ARC-001", "critical"), finding("ARC-002", "medium")] });
    await call("ada", "PATCH", `${runPath}/findings/ARC-002`, { triage: "false-positive" });
    await call("ada", "PUT", `${runPath}/findings`, { findings: [finding("ARC-002", "medium")] });

    const open = await call("ada", "GET", `/orgs/${org.id}/findings?triage=open`);
    expect(open.body.findings.map((f: { id: string }) => f.id)).toEqual(["ARC-001"]);
    const dismissed = await call("ada", "GET", `/orgs/${org.id}/findings?triage=false-positive`);
    expect(dismissed.body.findings.map((f: { id: string }) => f.id)).toEqual(["ARC-002"]);
  });

  it("orders the triage queue most severe first", async () => {
    const { call, seed } = harness();
    const { org, runPath } = await seed();
    await call("ada", "PUT", `${runPath}/findings`, { findings: [finding("A-LOW", "low"), finding("B-CRIT", "critical"), finding("C-HIGH", "high")] });
    const open = await call("ada", "GET", `/orgs/${org.id}/findings`);
    expect(open.body.findings.map((f: { id: string }) => f.id)).toEqual(["B-CRIT", "C-HIGH", "A-LOW"]);
  });

  it("rejects malformed findings", async () => {
    const { call, seed } = harness();
    const { runPath } = await seed();
    const res = await call("ada", "PUT", `${runPath}/findings`, { findings: [{ id: "bad id!", title: "x", severity: "urgent", status: "s", cwe: "c" }] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_request");
  });
});

describe("approvals and the audit trail", () => {
  const request = { kind: "code", title: "Apply fix for ARC-001", reason: "Adds a role check", target: "src/api/admin/export.ts" };

  it("pauses the run, records the decision once, and resumes", async () => {
    const { call, seed } = harness();
    const { runPath } = await seed();
    const approval = (await call("ada", "POST", `${runPath}/approvals`, request)).body.approval;
    expect((await call("ada", "GET", runPath)).body.run.status).toBe("awaiting-approval");

    const decided = await call("ada", "POST", `${runPath}/approvals/${approval.id}/decision`, { decision: "approved" });
    expect(decided.body.approval).toMatchObject({ status: "approved", decidedBy: "ada" });
    expect((await call("ada", "POST", `${runPath}/approvals/${approval.id}/decision`, { decision: "rejected" })).status).toBe(409);
    expect((await call("ada", "GET", runPath)).body.run.status).toBe("running");
  });

  it("writes rejections to the audit trail, with the note", async () => {
    const { call, seed } = harness();
    const { runPath } = await seed();
    const approval = (await call("ada", "POST", `${runPath}/approvals`, request)).body.approval;
    await call("ada", "POST", `${runPath}/approvals/${approval.id}/decision`, { decision: "rejected", note: "wrong file" });
    const events = (await call("ada", "GET", `${runPath}/events`)).body.events as { kind: string; actor: string; text: string }[];
    const human = events.filter((e) => e.kind === "human");
    expect(human).toHaveLength(1);
    expect(human[0]).toMatchObject({ actor: "ada" });
    expect(human[0].text).toContain("Rejected");
    expect(human[0].text).toContain("wrong file");
  });

  it("never lets an API token decide an approval — agents request, people decide", async () => {
    const { call, seed } = harness();
    const { org, runPath } = await seed();
    const bearer = { bearer: (await call("ada", "POST", `/orgs/${org.id}/tokens`, { name: "agent", role: "admin" })).body.token as string };
    const approval = (await call(bearer, "POST", `${runPath}/approvals`, request)).body.approval;
    expect((await call(bearer, "POST", `${runPath}/approvals/${approval.id}/decision`, { decision: "approved" })).status).toBe(403);
    // …but the agent can watch for the person's answer.
    expect((await call(bearer, "GET", `${runPath}/approvals/${approval.id}`)).body.approval.status).toBe("pending");
  });

  it("requires an admin to approve shipping", async () => {
    const { call, seed } = harness();
    const { org, runPath } = await seed();
    await call("ada", "PUT", `/orgs/${org.id}/members/bob`, { role: "member" });
    const ship = (await call("bob", "POST", `${runPath}/approvals`, { ...request, kind: "ship", title: "Merge to main" })).body.approval;
    expect((await call("bob", "POST", `${runPath}/approvals/${ship.id}/decision`, { decision: "approved" })).status).toBe(403);
    expect((await call("ada", "POST", `${runPath}/approvals/${ship.id}/decision`, { decision: "approved" })).status).toBe(200);
  });

  it("does not let a client forge a human entry in the trail", async () => {
    const { call, seed } = harness();
    const { runPath } = await seed();
    expect((await call("ada", "POST", `${runPath}/events`, { actor: "ada", kind: "human", text: "Approved the merge" })).status).toBe(400);
    expect((await call("ada", "POST", `${runPath}/events`, { actor: "mapper", kind: "map", text: "Indexed 40 files" })).status).toBe(201);
  });
});
