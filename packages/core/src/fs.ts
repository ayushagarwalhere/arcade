/**
 * A workspace's files.
 *
 * One interface, three backends: the desktop shell (IPC, see
 * electron/workspace-ipc.js), a browser directory handle (File System Access
 * API), and an in-memory tree for the bundled sample. Paths are relative to the
 * workspace root and always "/"-separated; "" is the root.
 *
 * Reading is universal. Writing is optional: a backend that can change files
 * carries a `write` half (the desktop app, and a browser folder once the user
 * grants read-write access); a GitHub repository read over the API does not.
 */

export interface FsEntry {
  name: string;
  path: string;
  kind: "file" | "dir";
}

export type FileContent =
  | { kind: "text"; text: string; size: number }
  | { kind: "image"; url: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "too-large"; size: number };

export interface WorkspaceFs {
  list(dir: string): Promise<FsEntry[]>;
  read(file: string): Promise<FileContent>;
  /** Present when this backend can change files. */
  write?: WorkspaceWriter;
}

export interface WorkspaceWriter {
  /** Save text, creating the file (and its folders) when needed. */
  save(file: string, text: string): Promise<void>;
  /** A new, empty file or folder. Fails if something is already there. */
  create(path: string, kind: "file" | "dir"): Promise<void>;
  rename?(from: string, to: string): Promise<void>;
  /** The desktop app sends it to the OS trash; a browser folder deletes it. */
  remove(path: string): Promise<void>;
  /** Show it in the OS file manager (desktop only). */
  reveal?(path: string): Promise<void>;
}

export const MAX_TEXT_BYTES = 1.5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "avif"]);

/** Hidden from the tree entirely. */
const HIDDEN = new Set([".git", ".DS_Store", "Thumbs.db"]);
/** Shown (dimmed) in the tree, but never crawled for quick-open or search. */
export const HEAVY_DIRS = new Set(["node_modules", ".next", "dist", "build", "out", "release", "target", "vendor", ".venv", "venv", "__pycache__", ".turbo", ".cache", "coverage"]);

export const extOf = (p: string) => {
  const name = p.slice(p.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
};
export const baseName = (p: string) => p.slice(p.lastIndexOf("/") + 1);
export const dirName = (p: string) => (p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "");
const join = (dir: string, name: string) => (dir ? `${dir}/${name}` : name);

/** Folders first, then case-insensitive by name — the order VS Code uses. */
function arrange(dir: string, raw: { name: string; kind: "file" | "dir" }[]): FsEntry[] {
  return raw
    .filter((e) => !HIDDEN.has(e.name))
    .map((e) => ({ ...e, path: join(dir, e.name) }))
    .sort((a, b) => (a.kind !== b.kind ? (a.kind === "dir" ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })));
}

/* ---------------------------------------------------------------- backends */

export interface DesktopFsBridge {
  listDir(root: string, rel: string): Promise<{ name: string; kind: "file" | "dir" }[]>;
  readFile(root: string, rel: string): Promise<FileContent>;
  // Older desktop builds only read; the write half is there when all of these are.
  writeFile?(root: string, rel: string, text: string): Promise<unknown>;
  createEntry?(root: string, rel: string, kind: "file" | "dir"): Promise<void>;
  renameEntry?(root: string, from: string, to: string): Promise<void>;
  trashEntry?(root: string, rel: string): Promise<void>;
  revealEntry?(root: string, rel: string): Promise<void>;
}

export function desktopFs(bridge: DesktopFsBridge, root: string): WorkspaceFs {
  const { writeFile, createEntry, renameEntry, trashEntry, revealEntry } = bridge;
  return {
    list: async (dir) => arrange(dir, await bridge.listDir(root, dir)),
    read: (file) => bridge.readFile(root, file),
    write:
      writeFile && createEntry && trashEntry
        ? {
            save: async (file, text) => void (await writeFile(root, file, text)),
            create: (path, kind) => createEntry(root, path, kind),
            rename: renameEntry && ((from, to) => renameEntry(root, from, to)),
            remove: (path) => trashEntry(root, path),
            reveal: revealEntry && ((path) => revealEntry(root, path)),
          }
        : undefined,
  };
}

interface WritableFile {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

export interface DirHandle {
  kind: "directory";
  name: string;
  values(): AsyncIterable<{ kind: "file" | "directory"; name: string }>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<DirHandle>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{ getFile(): Promise<File>; createWritable?(): Promise<WritableFile> }>;
  removeEntry?(name: string, options?: { recursive?: boolean }): Promise<void>;
  queryPermission?(d: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(d: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}

export function handleFs(root: DirHandle): WorkspaceFs {
  const dirAt = async (dir: string, create = false) => {
    let h = root;
    for (const part of dir.split("/").filter(Boolean)) h = await h.getDirectoryHandle(part, { create });
    return h;
  };
  // The folder was opened for reading. The browser asks the user once, on the first
  // write, whether this page may also change files in it.
  const writable = async () => {
    const granted = (await root.queryPermission?.({ mode: "readwrite" })) === "granted" || (await root.requestPermission?.({ mode: "readwrite" })) === "granted";
    if (!granted) throw new Error("This folder is open read-only. Allow editing when the browser asks, or use the desktop app.");
  };
  const exists = async (path: string) => {
    try {
      const dir = await dirAt(dirName(path));
      for await (const e of dir.values()) if (e.name === baseName(path)) return true;
    } catch {
      /* the folder isn't there either */
    }
    return false;
  };
  return {
    write: root.removeEntry
      ? {
          async save(file, text) {
            await writable();
            const handle = await (await dirAt(dirName(file), true)).getFileHandle(baseName(file), { create: true });
            if (!handle.createWritable) throw new Error("This browser can't save files. Use the desktop app.");
            const out = await handle.createWritable();
            await out.write(text);
            await out.close();
          },
          async create(path, kind) {
            await writable();
            if (await exists(path)) throw new Error(`${baseName(path)} already exists`);
            const dir = await dirAt(dirName(path), true);
            if (kind === "dir") await dir.getDirectoryHandle(baseName(path), { create: true });
            else await dir.getFileHandle(baseName(path), { create: true });
          },
          async remove(path) {
            await writable();
            await (await dirAt(dirName(path))).removeEntry!(baseName(path), { recursive: true });
          },
        }
      : undefined,
    async list(dir) {
      const raw: { name: string; kind: "file" | "dir" }[] = [];
      for await (const e of (await dirAt(dir)).values()) raw.push({ name: e.name, kind: e.kind === "directory" ? "dir" : "file" });
      return arrange(dir, raw);
    },
    async read(file) {
      const f = await (await (await dirAt(dirName(file))).getFileHandle(baseName(file))).getFile();
      if (IMAGE_EXT.has(extOf(file))) return f.size > MAX_IMAGE_BYTES ? { kind: "too-large", size: f.size } : { kind: "image", size: f.size, url: URL.createObjectURL(f) };
      if (f.size > MAX_TEXT_BYTES) return { kind: "too-large", size: f.size };
      const bytes = new Uint8Array(await f.arrayBuffer());
      if (bytes.subarray(0, 8000).includes(0)) return { kind: "binary", size: f.size };
      return { kind: "text", size: f.size, text: new TextDecoder().decode(bytes) };
    },
  };
}

/** An in-memory tree: keys are file paths, values their text. */
export function memoryFs(files: Record<string, string>): WorkspaceFs {
  const paths = Object.keys(files);
  return {
    async list(dir) {
      const prefix = dir ? `${dir}/` : "";
      const seen = new Map<string, "file" | "dir">();
      for (const p of paths) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        const slash = rest.indexOf("/");
        seen.set(slash < 0 ? rest : rest.slice(0, slash), slash < 0 ? "file" : "dir");
      }
      return arrange(dir, [...seen].map(([name, kind]) => ({ name, kind })));
    },
    async read(file) {
      const text = files[file];
      if (text == null) throw new Error(`No such file: ${file}`);
      return { kind: "text", text, size: new TextEncoder().encode(text).length };
    },
  };
}

/* ------------------------------------------------------------ crawl + search */

const MAX_INDEXED = 8000;

/** Every file path in the workspace, skipping heavy directories. Breadth-first so shallow files come first. */
export async function crawl(fs: WorkspaceFs, isCancelled: () => boolean, onProgress?: (files: string[]) => void): Promise<string[]> {
  const files: string[] = [];
  const queue = [""];
  let reported = 0;
  while (queue.length && files.length < MAX_INDEXED && !isCancelled()) {
    const dir = queue.shift()!;
    let entries: FsEntry[];
    try {
      entries = await fs.list(dir);
    } catch {
      continue; // unreadable directory
    }
    for (const e of entries) {
      if (e.kind === "file") files.push(e.path);
      else if (!HEAVY_DIRS.has(e.name)) queue.push(e.path);
    }
    if (onProgress && files.length - reported >= 1500) {
      reported = files.length;
      onProgress([...files]);
    }
  }
  return files;
}

export interface SearchMatch {
  line: number;
  col: number;
  text: string;
}
export interface SearchHit {
  path: string;
  matches: SearchMatch[];
}

const SEARCH_MAX_BYTES = 512 * 1024;
const SEARCH_MAX_MATCHES = 1000;
const SKIP_SEARCH_EXT = new Set([...IMAGE_EXT, "lock", "map", "woff", "woff2", "ttf", "pdf", "zip", "gz", "exe", "dll", "mp4", "mp3"]);

/** Plain-text search over the indexed files. Streams hits through `onHit` and reports whether it stopped early. */
export async function searchFiles(
  fs: WorkspaceFs,
  files: string[],
  query: string,
  opts: { matchCase: boolean },
  isCancelled: () => boolean,
  onHit: (hit: SearchHit) => void,
): Promise<{ truncated: boolean }> {
  const needle = opts.matchCase ? query : query.toLowerCase();
  let total = 0;
  for (const path of files) {
    if (isCancelled()) return { truncated: false };
    if (SKIP_SEARCH_EXT.has(extOf(path)) || baseName(path) === "package-lock.json") continue;
    let content: FileContent;
    try {
      content = await fs.read(path);
    } catch {
      continue;
    }
    if (content.kind !== "text" || content.size > SEARCH_MAX_BYTES) continue;
    const haystack = opts.matchCase ? content.text : content.text.toLowerCase();
    if (!haystack.includes(needle)) continue;

    const matches: SearchMatch[] = [];
    const lines = content.text.split("\n");
    for (let i = 0; i < lines.length && matches.length < 50; i++) {
      const col = (opts.matchCase ? lines[i] : lines[i].toLowerCase()).indexOf(needle);
      if (col >= 0) matches.push({ line: i + 1, col, text: lines[i].length > 400 ? lines[i].slice(Math.max(0, col - 60), col + 240) : lines[i] });
    }
    total += matches.length;
    onHit({ path, matches });
    if (total >= SEARCH_MAX_MATCHES) return { truncated: true };
  }
  return { truncated: false };
}

/* ---------------------------------------------------------------- languages */

const LANGUAGE: Record<string, string> = {
  ts: "TypeScript", tsx: "TypeScript JSX", mts: "TypeScript", cts: "TypeScript",
  js: "JavaScript", jsx: "JavaScript JSX", mjs: "JavaScript", cjs: "JavaScript",
  json: "JSON", jsonc: "JSON with Comments", md: "Markdown", mdx: "MDX",
  css: "CSS", scss: "SCSS", less: "Less", html: "HTML", htm: "HTML", xml: "XML", svg: "XML", vue: "Vue", svelte: "Svelte",
  py: "Python", rb: "Ruby", go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", swift: "Swift", php: "PHP",
  c: "C", h: "C", cpp: "C++", cc: "C++", hpp: "C++", cs: "C#",
  sh: "Shell Script", bash: "Shell Script", zsh: "Shell Script", ps1: "PowerShell", bat: "Batch",
  yml: "YAML", yaml: "YAML", toml: "TOML", ini: "INI", env: "Properties", sql: "SQL", graphql: "GraphQL", prisma: "Prisma",
  dockerfile: "Dockerfile", txt: "Plain Text", log: "Log",
};

export function languageOf(path: string): string {
  const name = baseName(path).toLowerCase();
  if (name === "dockerfile") return "Dockerfile";
  if (name === "makefile") return "Makefile";
  if (name.startsWith(".env")) return "Properties";
  return LANGUAGE[extOf(path)] ?? "Plain Text";
}

export const isImagePath = (path: string) => IMAGE_EXT.has(extOf(path));

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
