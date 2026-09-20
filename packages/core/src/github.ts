/**
 * GitHub connection — shared by the site navbar and the ADE.
 *
 * The app is a static export with no backend, so the OAuth web flow (which
 * needs a client secret) is out. There are two ways in:
 *  - Device flow, desktop only. github.com's OAuth endpoints send no CORS
 *    headers, so the Electron main process makes those calls (electron/main.js).
 *    Needs NEXT_PUBLIC_GITHUB_CLIENT_ID — an OAuth app with device flow enabled.
 *  - A personal access token, anywhere. api.github.com does allow CORS.
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import type { WorkspaceRef } from "./workspace";

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

/** Exposed by electron/preload.js. Responses are GitHub's JSON, untouched. */
export interface GithubBridge {
  deviceCode: (clientId: string, scope: string) => Promise<Record<string, unknown>>;
  deviceToken: (clientId: string, deviceCode: string) => Promise<Record<string, unknown>>;
  loadSession: () => Promise<string | null>;
  saveSession: (session: string | null) => Promise<void>;
}

/** The token was rejected: mistyped, expired or revoked. */
export class GithubAuthError extends Error {}

const CLIENT_ID = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID ?? "";
/** `repo` covers private repositories; reading the profile needs no scope. */
const SCOPE = "repo";
export const NEW_TOKEN_URL = `https://github.com/settings/tokens/new?scopes=${SCOPE}&description=Arcade`;

/* ---------------------------------------------------------------------- api */

export async function githubFetch(token: string, path: string, accept = "application/vnd.github+json") {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: accept, Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (res.status === 401) throw new GithubAuthError();
  if (!res.ok) throw new Error(`GitHub responded ${res.status}`);
  return res;
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

const KEY = "arcade.github";

// The desktop shell encrypts the session with the OS keychain; a browser only has localStorage.
async function loadSession(): Promise<Session | null> {
  try {
    const raw = window.arcade?.github ? await window.arcade.github.loadSession() : localStorage.getItem(KEY);
    const s = raw ? JSON.parse(raw) : null;
    return s && typeof s.token === "string" && typeof s.user?.login === "string" ? s : null;
  } catch {
    return null;
  }
}

async function saveSession(s: Session | null) {
  try {
    const raw = s && JSON.stringify(s);
    if (window.arcade?.github) await window.arcade.github.saveSession(raw);
    else if (raw) localStorage.setItem(KEY, raw);
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked; the connection lasts for this session only */
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

export const canDeviceSignIn = () => !!CLIENT_ID && typeof window !== "undefined" && !!window.arcade?.github;

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });

/** Resolves once the user has approved the code on github.com; rejects on abort, denial or expiry. */
export async function signInWithDevice(onCode: (c: DeviceCode) => void, signal: AbortSignal) {
  const bridge = window.arcade!.github!;
  const code = await bridge.deviceCode(CLIENT_ID, SCOPE);
  if (typeof code.device_code !== "string") throw new Error(String(code.error_description ?? "GitHub didn't issue a sign-in code."));
  onCode({ userCode: String(code.user_code), verificationUri: String(code.verification_uri) });

  let interval = Number(code.interval) || 5;
  for (;;) {
    await sleep(interval * 1000, signal);
    const res = await bridge.deviceToken(CLIENT_ID, code.device_code);
    if (typeof res.access_token === "string") return connectWithToken(res.access_token);
    if (res.error === "slow_down") interval += 5;
    else if (res.error !== "authorization_pending") throw new Error(res.error === "access_denied" ? "Sign-in was cancelled on GitHub." : "The sign-in code expired. Try again.");
  }
}

/* -------------------------------------------------------------------- repos */

// One fetch per connection, shared by the navbar menu and the welcome screen.
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

export const repoWorkspace = (r: GithubRepo): WorkspaceRef => ({ name: r.name, path: `github.com/${r.fullName}`, openedAt: Date.now() });
