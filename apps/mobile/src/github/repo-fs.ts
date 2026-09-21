/**
 * A GitHub repository read straight from the API — nothing is cloned. Same
 * approach as packages/core/src/github-fs.ts: the whole tree comes from one
 * recursive git/trees call, file contents are fetched per blob and kept for
 * the session. Very large repositories come back truncated by GitHub, in which
 * case the deepest paths are simply missing (and `truncated` says so).
 */
import { useEffect, useState } from "react";
import { MAX_TEXT_BYTES, isImagePath, type FsEntry } from "@/core/fs";
import { GithubAuthError, GithubRateLimitError, disconnectGithub, githubFetch, githubToken } from "./github";

interface TreeItem {
  path: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
}

export interface RepoTree {
  items: TreeItem[];
  /** The commit this tree was read at, when it was pinned; null for a plain HEAD listing. */
  commit: string | null;
  /** GitHub cut the listing short: the repository is too large for one tree call. */
  truncated: boolean;
}

export type RepoFile = { kind: "text"; text: string; size: number } | { kind: "binary"; size: number } | { kind: "too-large"; size: number };

const trees = new Map<string, Promise<RepoTree>>();

/**
 * File contents by blob SHA. Bounded, because an assessment reads every source
 * file of a repository on a phone: the oldest entries go once the total passes
 * the budget. A SHA never changes meaning, so a hit is always valid.
 */
const BLOB_BUDGET_BYTES = 32 * 1024 * 1024;
const blobs = new Map<string, { content: Promise<RepoFile>; bytes: number }>();
let blobBytes = 0;

function remember(key: string, content: Promise<RepoFile>) {
  const entry = { content, bytes: 0 };
  blobs.set(key, entry);
  content.then(
    (file) => {
      if (blobs.get(key) !== entry) return;
      entry.bytes = file.kind === "text" ? file.text.length : 0;
      blobBytes += entry.bytes;
      for (const [k, e] of blobs) {
        if (blobBytes <= BLOB_BUDGET_BYTES || k === key) break;
        blobs.delete(k);
        blobBytes -= e.bytes;
      }
    },
    () => {
      if (blobs.get(key) === entry) blobs.delete(key); // let the next read retry
    },
  );
}

async function token() {
  const t = await githubToken();
  if (!t) throw new GithubAuthError();
  return t;
}

/* ------------------------------------------------- development-only fixtures */

/** In-memory repositories, mounted only by development builds to exercise the app without GitHub. */
const memory = new Map<string, Record<string, string>>();

export const isMemoryRepo = (repo: string) => memory.has(repo);

export function mountMemoryRepo(repo: string, files: Record<string, string>) {
  if (!__DEV__) return;
  memory.set(repo, files);
  trees.delete(repo);
}

function memoryTree(files: Record<string, string>): RepoTree {
  const items: TreeItem[] = [];
  const dirs = new Set<string>();
  for (const path of Object.keys(files)) {
    const parts = path.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
    items.push({ path, type: "blob", sha: `memory:${path}`, size: files[path].length });
  }
  for (const dir of dirs) items.push({ path: dir, type: "tree", sha: `memory:${dir}/` });
  return { items, commit: null, truncated: false };
}

/* --------------------------------------------------------------------- tree */

async function fetchTree(repo: string, ref: string, commit: string | null): Promise<RepoTree> {
  const res = await githubFetch(await token(), `/repos/${repo}/git/trees/${ref}?recursive=1`);
  const body = (await res.json()) as { tree: TreeItem[]; truncated?: boolean };
  return { items: body.tree, commit, truncated: !!body.truncated };
}

export function loadTree(repo: string): Promise<RepoTree> {
  let tree = trees.get(repo);
  if (!tree) {
    const files = memory.get(repo);
    tree = files ? Promise.resolve(memoryTree(files)) : fetchTree(repo, "HEAD", null);
    trees.set(repo, tree);
    tree.catch(() => trees.get(repo) === tree && trees.delete(repo)); // let the next listing retry
  }
  return tree;
}

/**
 * Re-read the repository at the default branch's current commit and keep that
 * tree for the session. An assessment pins first so its findings name an exact
 * commit; a fix pins again so it never patches a stale copy of a file.
 */
export function pinHead(repo: string): Promise<RepoTree> {
  const files = memory.get(repo);
  const tree = files
    ? Promise.resolve(memoryTree(files))
    : (async () => {
        const sha = (await (await githubFetch(await token(), `/repos/${repo}/commits/HEAD`, "application/vnd.github.sha")).text()).trim();
        return fetchTree(repo, sha, sha);
      })();
  trees.set(repo, tree);
  tree.catch(() => trees.get(repo) === tree && trees.delete(repo));
  return tree;
}

export async function listDir(repo: string, dir: string): Promise<FsEntry[]> {
  const prefix = dir ? `${dir}/` : "";
  const entries: FsEntry[] = [];
  for (const item of (await loadTree(repo)).items) {
    if (!item.path.startsWith(prefix) || item.path.indexOf("/", prefix.length) >= 0) continue;
    entries.push({ name: item.path.slice(prefix.length), path: item.path, kind: item.type === "blob" ? "file" : "dir" });
  }
  // Folders first, then by name — the same order the ADE's file tree uses.
  return entries.sort((a, b) => (a.kind !== b.kind ? (a.kind === "dir" ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })));
}

/* -------------------------------------------------------------------- blobs */

async function readBlob(repo: string, item: TreeItem): Promise<RepoFile> {
  const size = item.size ?? 0;
  if (isImagePath(item.path)) return { kind: "binary", size };
  if (size > MAX_TEXT_BYTES) return { kind: "too-large", size };
  const files = memory.get(repo);
  const text = files ? files[item.path] : await (await githubFetch(await token(), `/repos/${repo}/git/blobs/${item.sha}`, "application/vnd.github.raw+json")).text();
  if (text.slice(0, 8000).includes("\u0000")) return { kind: "binary", size };
  return { kind: "text", size, text };
}

/** The blob SHA of a file in the tree that is loaded now, or null when it is not there. */
export async function blobShaOf(repo: string, path: string): Promise<string | null> {
  return (await loadTree(repo)).items.find((i) => i.path === path && i.type === "blob")?.sha ?? null;
}

export async function readFile(repo: string, path: string): Promise<RepoFile> {
  const item = (await loadTree(repo)).items.find((i) => i.path === path && i.type === "blob");
  if (!item) throw new Error(`No such file: ${path}`);
  const key = `${repo}@${item.sha}`;
  const hit = blobs.get(key);
  if (hit) return hit.content;
  const content = readBlob(repo, item);
  remember(key, content);
  return content;
}

/** What to tell the user when a GitHub read fails. */
export function describeGithubError(e: unknown, fallback = "Couldn't load this from GitHub."): string {
  if (e instanceof GithubAuthError) return "GitHub is no longer connected.";
  if (e instanceof GithubRateLimitError) return e.message;
  return fallback;
}

/** Loads on mount and whenever the inputs change; a rejected token disconnects. */
export function useRepoData<T>(load: () => Promise<T>, deps: unknown[]) {
  const [result, setResult] = useState<{ data?: T; error?: string }>({});
  useEffect(() => {
    let live = true;
    setResult({});
    load().then(
      (data) => live && setResult({ data }),
      (e) => {
        if (e instanceof GithubAuthError) void disconnectGithub();
        if (live) setResult({ error: describeGithubError(e) });
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { ...result, loading: !result.data && !result.error };
}
