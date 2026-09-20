/**
 * Resolves an opened workspace to a file system the explorer can read.
 *
 * Desktop: the main process re-checks that the folder is one the user picked.
 * Browser: the directory handle from the picker, kept in memory for this
 * session and in IndexedDB so a previous workspace can be reopened (the
 * browser re-asks for permission, which needs the click that got us here).
 */
import { desktopFs, handleFs, type DesktopFsBridge, type DirHandle, type WorkspaceFs } from "./fs";
import { githubFsFor, isGithubWorkspace } from "./github-fs";
import type { WorkspaceRef } from "./workspace";

type FsBridge = DesktopFsBridge & { reopenFolder(root: string): Promise<{ name: string; path: string } | null> };

const handles = new Map<string, DirHandle>();

const DB = "arcade";
const STORE = "workspace-handles";

function idb<T>(mode: IDBTransactionMode, op: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => resolve(undefined);
      open.onsuccess = () => {
        const req = op(open.result.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
      };
    } catch {
      resolve(undefined); // storage blocked; reopening just won't be available
    }
  });
}

/** Called by the browser pickers in workspace.ts with the handle they were given. */
export function rememberHandle(path: string, handle: unknown) {
  handles.set(path, handle as DirHandle);
  void idb("readwrite", (s) => s.put(handle, path));
}

/** null when the files can't be reached (no access granted, folder gone, or not a local folder). */
export async function fsFor(w: WorkspaceRef): Promise<WorkspaceFs | null> {
  // A GitHub repository is read over the API, in the desktop app and the browser alike.
  if (isGithubWorkspace(w)) return githubFsFor(w);

  const bridge = window.arcade as unknown as Partial<FsBridge> | undefined;
  if (bridge?.listDir && bridge.readFile && bridge.reopenFolder) {
    return (await bridge.reopenFolder(w.path)) ? desktopFs(bridge as FsBridge, w.path) : null;
  }

  const handle = handles.get(w.path) ?? (await idb<DirHandle>("readonly", (s) => s.get(w.path)));
  if (!handle || handle.kind !== "directory") return null;
  try {
    const granted = (await handle.queryPermission?.({ mode: "read" })) === "granted" || (await handle.requestPermission?.({ mode: "read" })) === "granted";
    if (!granted) return null;
  } catch {
    return null;
  }
  handles.set(w.path, handle);
  return handleFs(handle);
}
