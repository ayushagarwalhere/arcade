// Arcade Node file system — the scanner's read-only `WorkspaceFs` over a real folder.
//
// Same contract as the desktop backend (apps/ade/electron/workspace-ipc.js) behind
// the same adapter (`desktopFs` in packages/core/src/fs.ts), so the CLI, the MCP
// server and the app index a project identically:
//   - paths are relative to the root and "/"-separated; "" is the root
//   - every path is resolved, symlinks included, and must still be inside the root
//   - a file is text, binary (a NUL in the first 8000 bytes) or too-large (> 1.5 MB)
//   - sockets, devices and dangling links are not listed
// Images are reported as binary without being read: the scanner never opens them,
// and a terminal has no use for a data URL.
//
// It only ever lists and reads. Nothing here writes, deletes or executes.
//
// Dependency-free.

import fs from "node:fs";
import path from "node:path";
import { desktopFs, MAX_TEXT_BYTES } from "./engine.mjs";

export class FsError extends Error {}

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp", ".avif"]);

/** Arcade's own state folder is never part of the project being analysed. */
export const STATE_DIR = ".arcade";

const outside = (within) => within === ".." || within.startsWith(`..${path.sep}`) || path.isAbsolute(within);

/** Absolute, symlink-resolved path of `rel` — or an error if it leaves the root. */
export async function resolveInside(root, rel) {
  if (typeof root !== "string" || typeof rel !== "string" || rel.includes("\0")) throw new FsError("That isn't a path.");
  // Lexical check first, so a path that points out never even reaches the disk (and can't probe what exists there).
  if (outside(path.relative(path.resolve(root), path.resolve(root, rel || ".")))) throw new FsError(`"${rel}" is outside the project.`);
  const [realRoot, realTarget] = await Promise.all([fs.promises.realpath(root), fs.promises.realpath(path.resolve(root, rel || "."))]);
  if (outside(path.relative(realRoot, realTarget))) throw new FsError(`"${rel}" is outside the project.`);
  return realTarget;
}

async function listDir(root, rel) {
  const dir = await resolveInside(root, rel);
  const out = [];
  for (const ent of await fs.promises.readdir(dir, { withFileTypes: true })) {
    let isDir = ent.isDirectory();
    if (ent.isSymbolicLink()) {
      try {
        isDir = (await fs.promises.stat(path.join(dir, ent.name))).isDirectory();
      } catch {
        continue; // dangling link
      }
    } else if (!isDir && !ent.isFile()) continue;
    out.push({ name: ent.name, kind: isDir ? "dir" : "file" });
  }
  return out;
}

async function readFile(root, rel) {
  const file = await resolveInside(root, rel);
  const { size } = await fs.promises.stat(file);
  if (IMAGE_EXT.has(path.extname(file).toLowerCase())) return { kind: "binary", size };
  if (size > MAX_TEXT_BYTES) return { kind: "too-large", size };
  const data = await fs.promises.readFile(file);
  if (data.subarray(0, 8000).includes(0)) return { kind: "binary", size };
  return { kind: "text", size, text: data.toString("utf8") };
}

/* ------------------------------------------------------------------- ignore */

const globToRegExp = (glob) =>
  glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*\/|\*\*|\*|\?/g, (m) => (m === "**/" ? "(?:.*/)?" : m === "**" ? ".*" : m === "*" ? "[^/]*" : "[^/]"));

/**
 * gitignore-flavoured globs → a predicate over workspace paths.
 *   "fixtures"       a file or folder with that name, at any depth
 *   "legacy/"        folders only
 *   "src/gen/**"     anchored at the project root; `**` spans folders
 */
export function compileIgnore(patterns = []) {
  const tests = [];
  for (const raw of patterns) {
    if (typeof raw !== "string") continue;
    let p = raw.trim().replace(/\\/g, "/");
    if (!p || p.startsWith("#")) continue;
    const dirOnly = p.endsWith("/");
    p = p.replace(/^\.?\/+/, "").replace(/\/+$/, "");
    if (!p) continue;
    const anchored = p.includes("/");
    const re = new RegExp(`^${anchored ? "" : "(?:.*/)?"}${globToRegExp(p)}$`);
    tests.push((rel, kind) => (!dirOnly || kind === "dir") && re.test(rel));
  }
  return (rel, kind) => tests.some((t) => t(rel, kind));
}

/* ----------------------------------------------------------------------- fs */

/**
 * A `WorkspaceFs` rooted at `root`. `ignore` globs (from .arcade/config.json) hide
 * files and folders from listing, so they are never crawled or scanned.
 */
export function nodeFs(root, { ignore = [] } = {}) {
  const abs = path.resolve(root);
  if (!fs.statSync(abs, { throwIfNoEntry: false })?.isDirectory()) throw new FsError(`${abs} is not a folder.`);
  const inner = desktopFs({ listDir, readFile }, abs);
  const ignored = compileIgnore(ignore);
  return {
    root: abs,
    list: async (dir) => (await inner.list(dir)).filter((e) => !(e.path === STATE_DIR && e.kind === "dir") && !ignored(e.path, e.kind)),
    read: (file) => inner.read(file),
  };
}
