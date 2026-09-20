/**
 * Authentication and authorization.
 *
 * Two kinds of bearer credential are accepted:
 *   - a Cognito JWT, for people signed in through the desktop, web or mobile app;
 *   - an Arcade API token (`arc_…`), for the CLI, the MCP server and CI. Tokens
 *     are scoped to one org and one role, and only their SHA-256 is stored.
 *
 * Authorization is always an org-membership check: a token cannot outrank the
 * membership of the person who created it, and stops working when they leave.
 */
import { createHash, randomBytes } from "node:crypto";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import type { Context, MiddlewareHandler } from "hono";
import type { Config } from "../env";
import { forbidden, notFound, unauthorized } from "../errors";
import { ROLE_RANK, type ApiToken, type Role, type Store } from "../db/store";

export interface Principal {
  userId: string;
  email?: string;
  via: "cognito" | "token" | "dev";
  /** Present when the caller used an API token. */
  token?: Pick<ApiToken, "id" | "orgId" | "role">;
}

export type AppEnv = { Variables: { principal: Principal } };

export const TOKEN_PREFIX = "arc_";
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function mintToken(): { token: string; hash: string; prefix: string } {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), prefix: token.slice(0, 10) };
}

/** Verifies a JWT and returns who it belongs to, or throws. */
export type JwtVerifier = (jwt: string) => Promise<{ userId: string; email?: string }>;

export function cognitoVerifier(auth: Extract<Config["auth"], { mode: "cognito" }>): JwtVerifier {
  // tokenUse null accepts both access and id tokens; only an id token carries the email.
  const verifier = CognitoJwtVerifier.create({ userPoolId: auth.userPoolId, tokenUse: null, clientId: auth.clientIds });
  return async (jwt) => {
    const claims = await verifier.verify(jwt);
    return { userId: claims.sub, email: typeof claims.email === "string" ? claims.email : undefined };
  };
}

export function authenticate(deps: { store: Store; verifyJwt?: JwtVerifier; devAuth: boolean }): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const header = c.req.header("authorization") ?? "";
    const bearer = header.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
    if (!bearer) throw unauthorized();

    let principal: Principal;
    if (bearer.startsWith(TOKEN_PREFIX)) {
      const hash = hashToken(bearer);
      const record = await deps.store.getTokenByHash(hash);
      if (!record) throw unauthorized("This API token is not valid");
      principal = { userId: record.userId, via: "token", token: { id: record.id, orgId: record.orgId, role: record.role } };
      // Best effort: a failed timestamp must not fail the request.
      void deps.store.touchToken(hash, new Date().toISOString()).catch(() => {});
    } else if (deps.devAuth && bearer.startsWith("dev:")) {
      const userId = bearer.slice(4);
      if (!/^[\w.-]{1,64}$/.test(userId)) throw unauthorized();
      principal = { userId, email: `${userId}@dev.local`, via: "dev" };
    } else {
      if (!deps.verifyJwt) throw unauthorized();
      try {
        principal = { ...(await deps.verifyJwt(bearer)), via: "cognito" };
      } catch {
        throw unauthorized("Your session has expired — sign in again");
      }
    }
    c.set("principal", principal);
    await next();
  };
}

/**
 * Resolves the caller's effective role in an org and enforces a minimum.
 * A non-member gets 404 rather than 403, so org ids cannot be probed.
 */
export async function requireOrgRole(c: Context<AppEnv>, store: Store, orgId: string, min: Role): Promise<Role> {
  const p = c.get("principal");
  if (p.token && p.token.orgId !== orgId) throw notFound("Organisation");
  const membership = await store.getMembership(orgId, p.userId);
  if (!membership) throw notFound("Organisation");
  const role = p.token && ROLE_RANK[p.token.role] < ROLE_RANK[membership.role] ? p.token.role : membership.role;
  if (ROLE_RANK[role] < ROLE_RANK[min]) throw forbidden(`This needs the ${min} role`);
  return role;
}

/** Who may decide each kind of approval. Shipping and destructive actions need an admin. */
export const APPROVER_ROLE = { code: "member", ship: "admin", destructive: "admin" } as const satisfies Record<string, Role>;
