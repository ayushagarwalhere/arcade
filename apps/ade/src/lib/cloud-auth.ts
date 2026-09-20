/**
 * Sign-in for the ADE: Amazon Cognito's hosted UI with the authorization-code + PKCE flow.
 *
 * The ADE is a static site, so it is a *public* client: there is no secret, and PKCE is what
 * proves the page that finishes the sign-in is the one that started it. Tokens are kept in
 * sessionStorage — they end with the tab, and are never written anywhere longer-lived.
 */
import { useSyncExternalStore } from "react";

const env = {
  apiUrl: process.env.NEXT_PUBLIC_ARCADE_API_URL ?? "",
  clientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID ?? "",
  domain: (process.env.NEXT_PUBLIC_COGNITO_HOSTED_UI_DOMAIN ?? "").replace(/\/+$/, ""),
};

/** False when the site was built without the backend settings; the UI then hides sign-in entirely. */
export const cloudConfigured = Boolean(env.apiUrl && env.clientId && env.domain);
export const apiUrl = env.apiUrl;

interface Session {
  idToken: string;
  refreshToken?: string;
  /** Epoch ms. */
  expiresAt: number;
  email?: string;
}

const KEY = "arcade.cloud.session";
const PKCE_KEY = "arcade.cloud.pkce";

const redirectUri = () => `${window.location.origin}/arcade/`;
const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const random = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));

/* ------------------------------------------------------------------- store */

let current: Session | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function read(): Session | null {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    try {
      current = JSON.parse(sessionStorage.getItem(KEY) ?? "null");
    } catch {
      current = null;
    }
  }
  return current;
}

function write(s: Session | null) {
  current = s;
  loaded = true;
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the session lasts until reload */
  }
  listeners.forEach((l) => l());
}

export function useCloudSession(): { email?: string } | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => null,
  );
}

/* -------------------------------------------------------------------- flow */

function emailOf(idToken: string): string | undefined {
  try {
    const payload = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return (JSON.parse(atob(payload)) as { email?: string }).email; // display only — the API verifies the token itself
  } catch {
    return undefined;
  }
}

async function exchange(params: Record<string, string>): Promise<Session> {
  const res = await fetch(`${env.domain}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.clientId, ...params }),
  });
  if (!res.ok) throw new Error("Sign-in could not be completed");
  const t = (await res.json()) as { id_token: string; refresh_token?: string; expires_in: number };
  return { idToken: t.id_token, refreshToken: t.refresh_token ?? params.refresh_token, expiresAt: Date.now() + t.expires_in * 1000, email: emailOf(t.id_token) };
}

export async function signIn() {
  const verifier = random(48);
  const state = random(16);
  sessionStorage.setItem(PKCE_KEY, JSON.stringify({ verifier, state }));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const q = new URLSearchParams({ response_type: "code", client_id: env.clientId, redirect_uri: redirectUri(), scope: "openid email profile", state, code_challenge: challenge, code_challenge_method: "S256" });
  window.location.assign(`${env.domain}/oauth2/authorize?${q}`);
}

/** Call once on load: finishes a sign-in if the hosted UI just redirected back with a code. */
export async function completeSignIn(): Promise<void> {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  if (!code) return;
  const returnedState = url.searchParams.get("state");
  const pkce = JSON.parse(sessionStorage.getItem(PKCE_KEY) ?? "null") as { verifier: string; state: string } | null;
  sessionStorage.removeItem(PKCE_KEY);
  // Strip the one-time code from the address bar whatever happens next.
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  // The state must be the one this tab generated; anything else is not our sign-in, so ignore it.
  if (!pkce || !returnedState || pkce.state !== returnedState) return;
  write(await exchange({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: pkce.verifier }));
}

/** A valid token for the API, refreshed when it is about to expire. Throws when signed out. */
export async function getToken(): Promise<string> {
  let s = read();
  if (!s) throw new Error("Not signed in");
  if (s.expiresAt - Date.now() < 60_000) {
    if (!s.refreshToken) {
      write(null);
      throw new Error("Your session has expired — sign in again");
    }
    s = await exchange({ grant_type: "refresh_token", refresh_token: s.refreshToken });
    write(s);
  }
  return s.idToken;
}

export function signOut() {
  write(null);
  const q = new URLSearchParams({ client_id: env.clientId, logout_uri: redirectUri() });
  window.location.assign(`${env.domain}/logout?${q}`);
}
