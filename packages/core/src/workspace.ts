/**
 * Opening a workspace — folder pickers and the "previous workspaces" list.
 *
 * In the desktop shell the pickers are native dialogs exposed by
 * electron/preload.js. In a browser they fall back to the File System Access
 * API (Chromium only). Nothing here reads file contents.
 */
import type { AgentsBridge } from "./agent-connections";
import type { GithubBridge } from "./github";
import { rememberHandle } from "./workspace-fs";

export interface WorkspaceRef {
  name: string;
  /** Absolute path in the desktop app; just the folder name in a browser; `github.com/owner/repo` for a GitHub repository. */
  path: string;
  openedAt: number;
}

interface DesktopBridge {
  desktop: true;
  platform: string;
  openFolder?: () => Promise<{ name: string; path: string } | null>;
  createFolder?: () => Promise<{ name: string; path: string } | null>;
  github?: GithubBridge;
  agents?: AgentsBridge;
  sandbox?: SandboxBridge;
}

/** Real Docker sandboxes — desktop only, because Docker runs on the user's machine (electron/sandbox-ipc.js). */
export interface SandboxBridge {
  available: () => Promise<{ available: boolean; reason?: string }>;
  /** Runs the project's own test command in a throwaway, network-isolated container. */
  test: (root: string) => Promise<{ ok: true; passed: boolean; exitCode: number; timedOut: boolean; durationMs: number; sandboxId: string; image: string; network: string } | { ok: false; error: string }>;
  onEvent: (handler: (e: { kind: "step"; step: string; detail: string } | { kind: "output"; line: string }) => void) => () => void;
}

interface DirectoryHandle {
  name: string;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirectoryHandle>;
}

declare global {
  interface Window {
    arcade?: DesktopBridge;
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<DirectoryHandle>;
  }
}

export class FolderAccessUnavailable extends Error {}

export const isDesktop = () => typeof window !== "undefined" && !!window.arcade?.desktop;

const ref = (f: { name: string; path: string }): WorkspaceRef => ({ ...f, openedAt: Date.now() });

/** A dismissed picker resolves to null rather than throwing. */
async function cancellable<T>(pick: () => Promise<T>): Promise<T | null> {
  try {
    return await pick();
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return null;
    throw e;
  }
}

export async function openFolder(): Promise<WorkspaceRef | null> {
  if (window.arcade?.openFolder) {
    const f = await window.arcade.openFolder();
    return f && ref(f);
  }
  if (!window.showDirectoryPicker) throw new FolderAccessUnavailable();
  const dir = await cancellable(() => window.showDirectoryPicker!());
  if (dir) rememberHandle(dir.name, dir);
  return dir && ref({ name: dir.name, path: dir.name });
}

/** `name` is only used in a browser; the desktop dialog asks for it itself. */
export async function createFolder(name: string): Promise<WorkspaceRef | null> {
  if (window.arcade?.createFolder) {
    const f = await window.arcade.createFolder();
    return f && ref(f);
  }
  if (!window.showDirectoryPicker) throw new FolderAccessUnavailable();
  const parent = await cancellable(() => window.showDirectoryPicker!({ mode: "readwrite" }));
  if (!parent) return null;
  const dir = await parent.getDirectoryHandle(name, { create: true });
  rememberHandle(`${parent.name}/${dir.name}`, dir);
  return ref({ name: dir.name, path: `${parent.name}/${dir.name}` });
}

/* ------------------------------------------------------------------ recents */

const KEY = "arcade.recentWorkspaces";
const MAX = 8;

export function loadRecents(): WorkspaceRef[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((r) => r && typeof r.name === "string" && typeof r.path === "string") : [];
  } catch {
    return [];
  }
}

export function rememberWorkspace(w: WorkspaceRef) {
  try {
    const next = [w, ...loadRecents().filter((r) => r.path !== w.path)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked; recents are a convenience */
  }
}
