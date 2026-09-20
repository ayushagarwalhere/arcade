/** Accounts, organisations, members, projects and API tokens. */
import { Hono } from "hono";
import { z } from "zod";
import { mintToken, requireOrgRole, type AppEnv } from "../auth/auth";
import { ROLE_RANK, type Role } from "../db/store";
import { badRequest, conflict, forbidden, HttpError, notFound } from "../errors";
import { body, type Deps } from "../http";
import { monthOf, newId } from "../ids";

const role = z.enum(["viewer", "member", "admin", "owner"]);
const name = z.string().trim().min(1).max(120);
const MAX_OWNED_ORGS = 3;

export function orgRoutes({ store, config }: Deps) {
  const app = new Hono<AppEnv>();

  app.get("/me", async (c) => {
    const p = c.get("principal");
    const user = await store.upsertUser({ id: p.userId, email: p.email, createdAt: new Date().toISOString() });
    const memberships = await store.listOrgsForUser(p.userId);
    const orgs = await Promise.all(memberships.map(async (m) => ({ ...(await store.getOrg(m.orgId)), role: m.role })));
    return c.json({ user, orgs: orgs.filter((o) => o.id) });
  });

  app.post("/orgs", async (c) => {
    const p = c.get("principal");
    // A token is bound to one org; creating another is something a signed-in person does.
    if (p.token) throw forbidden("API tokens cannot create organisations");
    const input = await body(c, z.object({ name }));
    // Each org carries its own monthly model budget, and sign-up is open — so without a cap one
    // account could mint organisations to multiply its spend without limit.
    const owned = (await store.listOrgsForUser(p.userId)).filter((m) => m.role === "owner").length;
    if (owned >= MAX_OWNED_ORGS) throw new HttpError(403, "org_limit", `An account can own at most ${MAX_OWNED_ORGS} organisations`);
    const now = new Date().toISOString();
    const org = { id: newId("org"), name: input.name, createdBy: p.userId, createdAt: now };
    await store.createOrg(org, { orgId: org.id, userId: p.userId, role: "owner", createdAt: now });
    return c.json({ org: { ...org, role: "owner" } }, 201);
  });

  app.get("/orgs/:orgId", async (c) => {
    const orgId = c.req.param("orgId");
    const myRole = await requireOrgRole(c, store, orgId, "viewer");
    const org = await store.getOrg(orgId);
    if (!org) throw notFound("Organisation");
    return c.json({ org: { ...org, role: myRole } });
  });

  app.get("/orgs/:orgId/members", async (c) => {
    const orgId = c.req.param("orgId");
    await requireOrgRole(c, store, orgId, "viewer");
    return c.json({ members: await store.listMembers(orgId) });
  });

  app.put("/orgs/:orgId/members/:userId", async (c) => {
    const { orgId, userId } = c.req.param();
    const myRole = await requireOrgRole(c, store, orgId, "admin");
    const input = await body(c, z.object({ role }));
    const existing = await store.getMembership(orgId, userId);
    // Nobody hands out, or takes away, more authority than they hold themselves.
    const highest = Math.max(ROLE_RANK[input.role], existing ? ROLE_RANK[existing.role] : 0);
    if (highest > ROLE_RANK[myRole]) throw forbidden("You cannot grant or change a role above your own");
    if (existing?.role === "owner" && input.role !== "owner" && (await ownerCount(orgId)) <= 1) throw conflict("An organisation needs at least one owner");
    const membership = { orgId, userId, role: input.role, createdAt: existing?.createdAt ?? new Date().toISOString() };
    await store.putMembership(membership);
    return c.json({ member: membership });
  });

  app.delete("/orgs/:orgId/members/:userId", async (c) => {
    const { orgId, userId } = c.req.param();
    const leaving = userId === c.get("principal").userId;
    const myRole = await requireOrgRole(c, store, orgId, leaving ? "viewer" : "admin");
    const existing = await store.getMembership(orgId, userId);
    if (!existing) throw notFound("Member");
    if (!leaving && ROLE_RANK[existing.role] > ROLE_RANK[myRole]) throw forbidden("You cannot remove someone with a higher role");
    if (existing.role === "owner" && (await ownerCount(orgId)) <= 1) throw conflict("An organisation needs at least one owner");
    await store.removeMembership(orgId, userId);
    return c.body(null, 204);
  });

  const ownerCount = async (orgId: string) => (await store.listMembers(orgId)).filter((m) => m.role === "owner").length;

  /* ---------------------------------------------------------------- projects */

  app.post("/orgs/:orgId/projects", async (c) => {
    const orgId = c.req.param("orgId");
    await requireOrgRole(c, store, orgId, "member");
    const input = await body(c, z.object({ name, repo: z.string().trim().max(300).optional(), description: z.string().trim().max(2000).optional() }));
    const project = { id: newId("prj"), orgId, ...input, createdBy: c.get("principal").userId, createdAt: new Date().toISOString() };
    await store.createProject(project);
    return c.json({ project }, 201);
  });

  app.get("/orgs/:orgId/projects", async (c) => {
    const orgId = c.req.param("orgId");
    await requireOrgRole(c, store, orgId, "viewer");
    return c.json({ projects: await store.listProjects(orgId) });
  });

  app.get("/orgs/:orgId/projects/:projectId", async (c) => {
    const { orgId, projectId } = c.req.param();
    await requireOrgRole(c, store, orgId, "viewer");
    const project = await store.getProject(orgId, projectId);
    if (!project) throw notFound("Project");
    return c.json({ project });
  });

  /* ------------------------------------------------------------------ tokens */

  app.post("/orgs/:orgId/tokens", async (c) => {
    const orgId = c.req.param("orgId");
    const p = c.get("principal");
    if (p.token) throw forbidden("API tokens cannot create other tokens");
    const myRole = await requireOrgRole(c, store, orgId, "member");
    const input = await body(c, z.object({ name, role: role.default("member") }));
    if (input.role === "owner") throw badRequest("A token cannot hold the owner role");
    if (ROLE_RANK[input.role as Role] > ROLE_RANK[myRole]) throw forbidden("A token cannot outrank its creator");
    const minted = mintToken();
    const record = { id: newId("tok"), orgId, userId: p.userId, name: input.name, role: input.role as Role, hash: minted.hash, prefix: minted.prefix, createdAt: new Date().toISOString() };
    await store.createToken(record);
    const { hash: _hash, ...safe } = record;
    // The only time the token itself is ever returned.
    return c.json({ token: minted.token, record: safe }, 201);
  });

  app.get("/orgs/:orgId/tokens", async (c) => {
    const orgId = c.req.param("orgId");
    const myRole = await requireOrgRole(c, store, orgId, "member");
    const mine = c.get("principal").userId;
    const tokens = (await store.listTokens(orgId)).filter((t) => ROLE_RANK[myRole] >= ROLE_RANK.admin || t.userId === mine).map(({ hash: _hash, ...safe }) => safe);
    return c.json({ tokens });
  });

  app.delete("/orgs/:orgId/tokens/:tokenId", async (c) => {
    const { orgId, tokenId } = c.req.param();
    const myRole = await requireOrgRole(c, store, orgId, "member");
    const target = (await store.listTokens(orgId)).find((t) => t.id === tokenId);
    if (!target) throw notFound("Token");
    if (target.userId !== c.get("principal").userId && ROLE_RANK[myRole] < ROLE_RANK.admin) throw forbidden("Only an admin can revoke someone else's token");
    await store.deleteToken(orgId, tokenId);
    return c.body(null, 204);
  });

  app.get("/orgs/:orgId/usage", async (c) => {
    const orgId = c.req.param("orgId");
    await requireOrgRole(c, store, orgId, "viewer");
    const month = c.req.query("month") ?? monthOf();
    if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest("month must look like 2026-09");
    return c.json({ usage: await store.getUsage(orgId, month), budget: { monthlyTokens: config.model.monthlyTokenBudget } });
  });

  return app;
}
