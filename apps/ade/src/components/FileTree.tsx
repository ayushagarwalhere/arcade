"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, CopyMinus, File, FileCode, FileImage, FileJson, FileLock, FileTerminal, FileText, Folder, FolderOpen, RotateCw, Settings } from "lucide-react";
import { HEAVY_DIRS, baseName, dirName, extOf, isImagePath, type FsEntry, type WorkspaceFs } from "@arcade/core/fs";

export interface FileDecoration {
  badge: string;
  tone: "red" | "amber" | "green";
  title?: string;
}

const TONE = { red: "text-red-300", amber: "text-amber-300", green: "text-emerald-300" } as const;

/* -------------------------------------------------------------------- icons */

const CODE_COLOR: Record<string, string> = {
  ts: "#4b9fe0", tsx: "#4b9fe0", mts: "#4b9fe0", js: "#e2c94f", jsx: "#e2c94f", mjs: "#e2c94f", cjs: "#e2c94f",
  py: "#5a9fd4", go: "#6ad1e3", rs: "#e0926a", rb: "#e0605a", php: "#9d8fe0", java: "#e08a4b", kt: "#b58ce8", swift: "#f08a5d",
  c: "#7aa7d8", h: "#7aa7d8", cpp: "#7aa7d8", cs: "#7bc47f", css: "#56a8f5", scss: "#e07aa8", html: "#e8834a", vue: "#5fc49a", svelte: "#f0683c",
  sql: "#d9b86a", prisma: "#8aa4c8", graphql: "#e06ab0",
};
const SHELL = new Set(["sh", "bash", "zsh", "ps1", "bat", "cmd"]);
const CONFIG = new Set(["yml", "yaml", "toml", "ini", "conf", "config"]);
const DOCS = new Set(["md", "mdx", "txt", "rst", "log"]);

export function FileIcon({ path, className = "h-3.5 w-3.5" }: { path: string; className?: string }) {
  const ext = extOf(path);
  const name = baseName(path).toLowerCase();
  const props = { className: `${className} shrink-0`, strokeWidth: 1.7 };
  if (isImagePath(path)) return <FileImage {...props} style={{ color: "#b58ce8" }} />;
  if (name.startsWith(".env") || name.endsWith(".pem") || name.endsWith(".key")) return <FileLock {...props} style={{ color: "#d9b86a" }} />;
  if (ext === "json" || ext === "jsonc") return <FileJson {...props} style={{ color: "#d9c46a" }} />;
  if (ext === "lock" || name.startsWith(".") || CONFIG.has(ext)) return <Settings {...props} style={{ color: "#7d8a94" }} />;
  if (SHELL.has(ext) || name === "dockerfile" || name === "makefile") return <FileTerminal {...props} style={{ color: "#8fbf7f" }} />;
  if (DOCS.has(ext)) return <FileText {...props} style={{ color: "#6fa8c9" }} />;
  if (CODE_COLOR[ext]) return <FileCode {...props} style={{ color: CODE_COLOR[ext] }} />;
  return <File {...props} style={{ color: "#8c8c8c" }} />;
}

/* --------------------------------------------------------------------- tree */

interface Loaded {
  stamp: symbol;
  entries: FsEntry[] | null; // null: couldn't be read
}

const ancestors = (path: string) => {
  const out: string[] = [];
  for (let d = dirName(path); d; d = dirName(d)) out.push(d);
  return out;
};

const INDENT = 10;

export default function FileTree({
  fs,
  title,
  activePath,
  decorations,
  onOpen,
}: {
  fs: WorkspaceFs;
  title: string;
  activePath: string | null;
  decorations: Record<string, FileDecoration>;
  onOpen: (path: string, opts: { preview: boolean }) => void;
}) {
  const [open, setOpen] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [nodes, setNodes] = useState<Record<string, Loaded>>({});
  const [version, setVersion] = useState(0);
  const container = useRef<HTMLDivElement>(null);
  const inflight = useRef(new Set<string>());
  const pendingReveal = useRef<string | null>(null);

  // A new file system (or a refresh) re-stamps the cache: listings are refetched
  // in place, so the tree keeps its shape instead of collapsing.
  const stamp = useMemo(() => Symbol(), [fs, version]); // eslint-disable-line react-hooks/exhaustive-deps

  // Opening a file from search or the palette expands the tree down to it.
  const [revealed, setRevealed] = useState<string | null>(null);
  if (activePath !== revealed) {
    setRevealed(activePath);
    if (activePath) setExpanded((prev) => new Set([...prev, ...ancestors(activePath)]));
  }

  useEffect(() => {
    for (const dir of ["", ...expanded]) {
      const key = `${version}:${dir}`;
      if (nodes[dir]?.stamp === stamp || inflight.current.has(key)) continue;
      inflight.current.add(key);
      fs.list(dir)
        .then((entries): Loaded => ({ stamp, entries }))
        .catch((): Loaded => ({ stamp, entries: null }))
        .then((loaded) => {
          inflight.current.delete(key);
          setNodes((n) => ({ ...n, [dir]: loaded }));
        });
    }
  }, [fs, stamp, version, expanded, nodes]);

  useEffect(() => {
    pendingReveal.current = activePath;
  }, [activePath]);
  useEffect(() => {
    if (!pendingReveal.current) return;
    const row = container.current?.querySelector(`[data-path="${CSS.escape(pendingReveal.current)}"]`);
    if (row) {
      row.scrollIntoView({ block: "nearest" });
      pendingReveal.current = null;
    }
  }, [activePath, nodes, expanded]);

  const decoratedDirs = useMemo(() => {
    const dirs = new Map<string, FileDecoration["tone"]>();
    for (const [path, d] of Object.entries(decorations)) for (const a of ancestors(path)) if (!dirs.has(a) || d.tone === "red") dirs.set(a, d.tone);
    return dirs;
  }, [decorations]);

  const toggle = (dir: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(dir)) next.add(dir);
      return next;
    });

  const rows: { entry: FsEntry; depth: number }[] = [];
  const walk = (dir: string, depth: number) => {
    for (const entry of nodes[dir]?.entries ?? []) {
      rows.push({ entry, depth });
      if (entry.kind === "dir" && expanded.has(entry.path)) walk(entry.path, depth + 1);
    }
  };
  walk("", 0);
  const root = nodes[""];

  return (
    <div className="border-t border-ade-line first:border-t-0">
      <div className="group flex h-[22px] items-center pr-1.5 text-ade-fg/80 hover:text-white">
        <button onClick={() => setOpen(!open)} className="flex h-full min-w-0 flex-1 items-center gap-0.5 px-1 text-[11px] font-semibold uppercase tracking-wide">
          {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          <span className="truncate">{title}</span>
        </button>
        {open && (
          <span className="flex opacity-0 transition group-focus-within:opacity-100 group-hover:opacity-100">
            <button onClick={() => setVersion((v) => v + 1)} title="Refresh explorer" aria-label="Refresh explorer" className="grid h-5 w-5 place-items-center rounded text-ade-muted hover:bg-white/10 hover:text-ade-fg">
              <RotateCw className="h-3 w-3" />
            </button>
            <button onClick={() => setExpanded(new Set())} title="Collapse folders" aria-label="Collapse folders" className="grid h-5 w-5 place-items-center rounded text-ade-muted hover:bg-white/10 hover:text-ade-fg">
              <CopyMinus className="h-3 w-3" />
            </button>
          </span>
        )}
      </div>

      {open && (
        <div ref={container} role="tree" className="pb-2">
          {rows.map(({ entry, depth }) => {
            const isDir = entry.kind === "dir";
            const isOpen = isDir && expanded.has(entry.path);
            const active = entry.path === activePath;
            const deco = decorations[entry.path];
            const dirTone = isDir ? decoratedDirs.get(entry.path) : undefined;
            const dim = isDir && HEAVY_DIRS.has(entry.name);
            const Dir = isOpen ? FolderOpen : Folder;
            return (
              <button
                key={entry.path}
                role="treeitem"
                aria-expanded={isDir ? isOpen : undefined}
                aria-selected={active}
                data-path={entry.path}
                title={deco?.title ?? entry.path}
                onClick={() => (isDir ? toggle(entry.path) : onOpen(entry.path, { preview: true }))}
                onDoubleClick={() => !isDir && onOpen(entry.path, { preview: false })}
                style={{ paddingLeft: 6 + depth * INDENT }}
                className={`relative flex h-[22px] w-full items-center gap-1 pr-2 text-left text-[13px] transition-colors ${
                  active ? "bg-white/[0.09] text-white" : "text-ade-fg/80 hover:bg-white/[0.045] hover:text-ade-fg"
                } ${dim ? "opacity-50" : ""}`}
              >
                {Array.from({ length: depth }, (_, i) => (
                  <span key={i} className="absolute inset-y-0 w-px bg-white/[0.07]" style={{ left: 13 + i * INDENT }} />
                ))}
                {isDir ? (
                  <>
                    {isOpen ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ade-muted" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ade-muted" />}
                    <Dir className="h-3.5 w-3.5 shrink-0 text-ade-muted" strokeWidth={1.7} />
                  </>
                ) : (
                  <>
                    <span className="w-3.5 shrink-0" />
                    <FileIcon path={entry.path} />
                  </>
                )}
                <span className={`min-w-0 flex-1 truncate ${deco ? TONE[deco.tone] : dirTone ? TONE[dirTone] : ""}`}>{entry.name}</span>
                {deco && <span className={`shrink-0 text-[11px] font-semibold ${TONE[deco.tone]}`}>{deco.badge}</span>}
                {dirTone && !deco && <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${TONE[dirTone]}`} />}
              </button>
            );
          })}

          {!root && <p className="px-5 py-1 text-[12px] text-ade-faint">Loading…</p>}
          {root && root.entries === null && <p className="px-5 py-1 text-[12px] leading-5 text-amber-200/80">This folder couldn&apos;t be read.</p>}
          {root?.entries?.length === 0 && <p className="px-5 py-1 text-[12px] text-ade-faint">This folder is empty.</p>}
        </div>
      )}
    </div>
  );
}
