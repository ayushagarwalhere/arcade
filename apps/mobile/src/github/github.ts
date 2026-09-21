/**
 * GitHub connection — the mobile counterpart of packages/core/src/github.ts,
 * with the same two ways in:
 *  - A personal access token, which works everywhere.
 *  - Device flow. A native app has no CORS, so unlike the browser build it can
 *    call github.com's OAuth endpoints itself. Needs EXPO_PUBLIC_GITHUB_CLIENT_ID
 *    — an OAuth app with device flow enabled (the same one the desktop app uses).
 *
 * The session is kept in the device keychain (expo-secure-store). The web
 * preview has no keychain and falls back to localStorage, as the site does.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export interface GithubUser {
  login: string;
  name: string | null;
  avatarUrl: string;
  url: string;
}

export interface GithubRepo {
  id: number;
  name: string;
  fullName: string;
  private: boolean;
  description: string | null;
  defaultBranch: string;
  url: string;
}

export type GithubState = { status: "loading" } | { status: "disconnected" } | { status: "connected"; user: GithubUser; token: string };

/** The token was rejected: mistyped, expired or revoked. */
export class GithubAuthError extends Error {}

const CLIENT_ID = process.env.EXPO_PUBLIC_GITHUB_CLIENT_ID ?? "";
/** `repo` covers private repositories; reading the profile needs no scope. */
const SCOPE = "repo";
export const NEW_TOKEN_URL = `https://github.com/settings/tokens/new?scopes=${SCOPE}&description=Arcade`;

/* ---------------------------------------------------------------------- api */

/** GitHub is refusing requests for now: the hourly quota is spent, or a secondary limit asked us to back off. */
export class GithubRateLimitError extends Error {
  constructor(
    /** When requests are accepted again, if GitHub said. */
    readonly resetAt: Date | null,
  ) {
    super(
      resetAt
        ? `GitHub's API rate limit is used up. It resets at ${resetAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}.`
        : "GitHub asked Arcade to slow down. Wait a minute and try again.",
    );
  }
}

/** Any other refusal, with GitHub's own explanation when it sent one. */
export class GithubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** A 403/429 is a rate limit when the quota header says zero or GitHub names a retry delay. */
function rateLimitOf(res: Response): GithubRateLimitError | null {
  if (res.status !== 403 && res.status !== 429) return null;
  const retryAfter = Number(res.headers.get("retry-after"));
  if (retryAfter > 0) return new GithubRateLimitError(new Date(Date.now() + retryAfter * 1000));
  if (res.headers.get("x-ratelimit-remaining") === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    return new GithubRateLimitError(reset > 0 ? new Date(reset * 1000) : null);
  }
  return res.status === 429 ? new GithubRateLimitError(null) : null;
}

export async function githubFetch(token: string, path: string, accept = "application/vnd.github+json", init?: { method?: string; body?: unknown }) {
  const res = await fetch(`https://api.github.com${path}`, {
    method: init?.method ?? "GET",
    headers: {
      Accept: accept,
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401) throw new GithubAuthError();
  const limited = rateLimitOf(res);
  if (limited) throw limited;
  if (!res.ok) {
    let detail = "";
    try {
      detail = String(((await res.json()) as { message?: string }).message ?? "");
    } catch {
      /* no body */
    }
    throw new GithubApiError(detail ? `GitHub responded ${res.status} — ${detail}` : `GitHub responded ${res.status}`, res.status);
  }
  return res;
}

/** What is left of this hour's core API quota. Asking does not count against it. */
export async function githubRateLimit(token: string): Promise<{ remaining: number; limit: number; resetAt: Date }> {
  const body = (await (await githubFetch(token, "/rate_limit")).json()) as { resources: { core: { remaining: number; limit: number; reset: number } } };
  const core = body.resources.core;
  return { remaining: core.remaining, limit: core.limit, resetAt: new Date(core.reset * 1000) };
}

const api = async <T,>(token: string, path: string): Promise<T> => (await githubFetch(token, path)).json();

async function fetchUser(token: string): Promise<GithubUser> {
  const u = await api<{ login: string; name: string | null; avatar_url: string; html_url: string }>(token, "/user");
  return { login: u.login, name: u.name, avatarUrl: u.avatar_url, url: u.html_url };
}

/** The 100 most recently pushed repositories — search covers the rest of what people reach for. */
async function fetchRepos(token: string): Promise<GithubRepo[]> {
  const repos = await api<{ id: number; name: string; full_name: string; private: boolean; description: string | null; default_branch: string; html_url: string }[]>(
    token,
    "/user/repos?per_page=100&sort=pushed&affiliation=owner,collaborator,organization_member",
  );
  return repos.map((r) => ({ id: r.id, name: r.name, fullName: r.full_name, private: r.private, description: r.description, defaultBranch: r.default_branch, url: r.html_url }));
}

/* ------------------------------------------------------------------ session */

interface Session {
  token: string;
  user: GithubUser;
}

// SecureStore keys allow only [A-Za-z0-9._-].
const KEY = "arcade.github";
const web = Platform.OS === "web";

async function loadSession(): Promise<Session | null> {
  try {
    const raw = web ? localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY);
    const s = raw ? JSON.parse(raw) : null;
    return s && typeof s.token === "string" && typeof s.user?.login === "string" ? s : null;
  } catch {
    return null;
  }
}

async function saveSession(s: Session | null) {
  try {
    if (web) {
      if (s) localStorage.setItem(KEY, JSON.stringify(s));
      else localStorage.removeItem(KEY);
    } else if (s) await SecureStore.setItemAsync(KEY, JSON.stringify(s));
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    /* storage unavailable; the connection lasts for this launch only */
  }
}

/* -------------------------------------------------------------------- store */

const LOADING: GithubState = { status: "loading" };
let state: GithubState = LOADING;
let booting: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: GithubState) {
  state = next;
  listeners.forEach((l) => l());
}

async function boot() {
  const s = await loadSession();
  if (!s) return set({ status: "disconnected" });
  set({ status: "connected", ...s });
  void revalidate(s);
}

/** Runs in the background: a revoked token disconnects, being offline doesn't. */
async function revalidate(s: Session) {
  try {
    const user = await fetchUser(s.token);
    if (state.status !== "connected" || state.token !== s.token) return;
    set({ status: "connected", token: s.token, user });
    await saveSession({ token: s.token, user });
  } catch (e) {
    if (e instanceof GithubAuthError) await disconnectGithub();
  }
}

const ensureBooted = () => (booting ??= boot());

function subscribe(l: () => void) {
  listeners.add(l);
  void ensureBooted();
  return () => {
    listeners.delete(l);
  };
}

export const useGithub = () =>
  useSyncExternalStore(
    subscribe,
    () => state,
    () => LOADING,
  );

/** For callers outside React: waits for the saved session to load. null when disconnected. */
export async function githubToken() {
  await ensureBooted();
  return state.status === "connected" ? state.token : null;
}

/** Throws GithubAuthError if GitHub rejects the token. */
export async function connectWithToken(token: string) {
  const user = await fetchUser(token);
  repoCache = null;
  set({ status: "connected", token, user });
  await saveSession({ token, user });
}

export async function disconnectGithub() {
  repoCache = null;
  set({ status: "disconnected" });
  await saveSession(null);
}

/* -------------------------------------------------------------- device flow */

export interface DeviceCode {
  userCode: string;
  verificationUri: string;
}

/** github.com's OAuth endpoints send no CORS headers, so the web preview can't use them. */
export const canDeviceSignIn = () => !!CLIENT_ID && !web;

async function post(url: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&"),
  });
  return res.json();
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });

/** Resolves once the user has approved the code on github.com; rejects on abort, denial or expiry. */
export async function signInWithDevice(onCode: (c: DeviceCode) => void, signal: AbortSignal) {
  const code = await post("https://github.com/login/device/code", { client_id: CLIENT_ID, scope: SCOPE });
  if (typeof code.device_code !== "string") throw new Error(String(code.error_description ?? "GitHub didn't issue a sign-in code."));
  onCode({ userCode: String(code.user_code), verificationUri: String(code.verification_uri) });

  let interval = Number(code.interval) || 5;
  for (;;) {
    await sleep(interval * 1000, signal);
    const res = await post("https://github.com/login/oauth/access_token", {
      client_id: CLIENT_ID,
      device_code: code.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });
    if (typeof res.access_token === "string") return connectWithToken(res.access_token);
    if (res.error === "slow_down") interval += 5;
    else if (res.error !== "authorization_pending") throw new Error(res.error === "access_denied" ? "Sign-in was cancelled on GitHub." : "The sign-in code expired. Try again.");
  }
}

/* -------------------------------------------------------------------- repos */

// One fetch per connection, shared by every screen that lists repositories.
let repoCache: { token: string; repos: Promise<GithubRepo[]> } | null = null;

function loadRepos(token: string) {
  if (repoCache?.token !== token) repoCache = { token, repos: fetchRepos(token) };
  return repoCache.repos;
}

export function useGithubRepos() {
  const gh = useGithub();
  const token = gh.status === "connected" ? gh.token : null;
  const [result, setResult] = useState<{ token: string; repos?: GithubRepo[]; error?: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    let live = true;
    loadRepos(token).then(
      (repos) => live && setResult({ token, repos }),
      (e) => {
        if (repoCache?.token === token) repoCache = null;
        if (e instanceof GithubAuthError) void disconnectGithub();
        else if (live) setResult({ token, error: "Couldn't load repositories from GitHub." });
      },
    );
    return () => {
      live = false;
    };
  }, [token]);

  const current = result?.token === token ? result : null;
  return { repos: current?.repos, error: current?.error, loading: !!token && !current };
}
