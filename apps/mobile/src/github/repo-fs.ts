/**
 * A GitHub repository read straight from the API — nothing is cloned. Same
 * approach as packages/core/src/github-fs.ts: the whole tree comes from one
 * recursive git/trees call, file contents are fetched per blob and kept for
 * the session. Very large repositories come back truncated by GitHub, in which
 * case the deepest paths are simply missing.
 */
import { useEffect, useState } from "react";
import { MAX_TEXT_BYTES, isImagePath, type FsEntry } from "@/core/fs";
import { GithubAuthError, disconnectGithub, githubFetch, githubToken } from "./github";

interface TreeItem {
  path: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
}

export type RepoFile = { kind: "text"; text: string; size: number } | { kind: "binary"; size: number } | { kind: "too-large"; size: number };

const trees = new Map<string, Promise<TreeItem[]>>();
const files = new Map<string, Promise<RepoFile>>();

async function token() {
  const t = await githubToken();
  if (!t) throw new GithubAuthError();
  return t;
}

function loadTree(repo: string) {
  let tree = trees.get(repo);
  if (!tree) {
    tree = token()
      .then((t) => githubFetch(t, `/repos/${repo}/git/trees/HEAD?recursive=1`))
      .then((res) => res.json())
      .then((body: { tree: TreeItem[] }) => body.tree);
    trees.set(repo, tree);
    tree.catch(() => trees.delete(repo)); // let the next listing retry
  }
  return tree;
}

export async function listDir(repo: string, dir: string): Promise<FsEntry[]> {
  const prefix = dir ? `${dir}/` : "";
  const entries: FsEntry[] = [];
  for (const item of await loadTree(repo)) {
    if (!item.path.startsWith(prefix) || item.path.indexOf("/", prefix.length) >= 0) continue;
    entries.push({ name: item.path.slice(prefix.length), path: item.path, kind: item.type === "blob" ? "file" : "dir" });
  }
  // Folders first, then by name — the same order the ADE's file tree uses.
  return entries.sort((a, b) => (a.kind !== b.kind ? (a.kind === "dir" ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })));
}

async function readBlob(repo: string, item: TreeItem): Promise<RepoFile> {
  const size = item.size ?? 0;
  if (isImagePath(item.path)) return { kind: "binary", size };
  if (size > MAX_TEXT_BYTES) return { kind: "too-large", size };
  const res = await githubFetch(await token(), `/repos/${repo}/git/blobs/${item.sha}`, "application/vnd.github.raw+json");
  const text = await res.text();
  if (text.slice(0, 8000).includes("\u0000")) return { kind: "binary", size };
  return { kind: "text", size, text };
}

export async function readFile(repo: string, path: string): Promise<RepoFile> {
  const item = (await loadTree(repo)).find((i) => i.path === path && i.type === "blob");
  if (!item) throw new Error(`No such file: ${path}`);
  const key = `${repo}@${item.sha}`;
  let content = files.get(key);
  if (!content) {
    content = readBlob(repo, item);
    files.set(key, content);
    content.catch(() => files.delete(key));
  }
  return content;
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
        if (live) setResult({ error: e instanceof GithubAuthError ? "GitHub is no longer connected." : "Couldn't load this from GitHub." });
      },
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { ...result, loading: !result.data && !result.error };
}
