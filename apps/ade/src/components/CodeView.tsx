"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { FileWarning, Loader2 } from "lucide-react";
import { loader } from "@monaco-editor/react";
import { formatBytes, languageOf, type FileContent, type WorkspaceFs } from "@arcade/core/fs";
import { TOKEN_COLOR, highlight } from "@arcade/core/highlight";
import CodeEditor from "./CodeEditor";

export interface FileInfo {
  path: string;
  language: string;
  size: number;
  lines?: number;
}

const LINE = 20; // px — every row is exactly this tall, which is what makes windowing trivial
const OVERSCAN = 12;

type Loaded = { fs: WorkspaceFs; path: string; content: FileContent | null };

/** One workspace file: the code editor for text, a preview for images, and a plain notice for anything else. */
export default function CodeView({
  fs,
  path,
  line,
  jump,
  flagged,
  onInfo,
  onCursor,
  onSaved,
  onError,
}: {
  fs: WorkspaceFs;
  path: string;
  /** Line to reveal and mark; `jump` changes whenever it should be revealed again. */
  line?: number;
  jump: number;
  /** Lines a finding points at. */
  flagged?: number[];
  onInfo: (info: FileInfo) => void;
  onCursor?: (pos: { line: number; column: number }) => void;
  onSaved?: (path: string) => void;
  onError?: (message: string) => void;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const current = loaded && loaded.fs === fs && loaded.path === path ? loaded : null;

  const [editorFailed, setEditorFailed] = useState(false);
  useEffect(() => {
    let live = true;
    loader.init().then(
      () => {},
      () => live && setEditorFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fs.read(path)
      .catch(() => null)
      .then((content) => {
        if (cancelled) return;
        setLoaded({ fs, path, content });
        if (content) onInfo({ path, language: languageOf(path), size: content.size, lines: content.kind === "text" ? content.text.split("\n").length : undefined });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onInfo is a fire-and-forget report
  }, [fs, path]);

  // Browser-backed images are object URLs; release them when replaced.
  const imageUrl = current?.content?.kind === "image" ? current.content.url : null;
  useEffect(() => {
    if (!imageUrl?.startsWith("blob:")) return;
    return () => URL.revokeObjectURL(imageUrl);
  }, [imageUrl]);

  if (!current) {
    return (
      <div className="grid h-full place-items-center text-ade-faint">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  const { content } = current;
  if (!content || content.kind === "binary" || content.kind === "too-large") {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <div>
          <FileWarning className="mx-auto h-6 w-6 text-ade-faint" strokeWidth={1.5} />
          <p className="mt-3 text-[13px] text-ade-fg/85">
            {!content ? "This file couldn't be read." : content.kind === "binary" ? "This file is binary, so it isn't shown in the editor." : "This file is too large to show in the editor."}
          </p>
          {content && <p className="mt-1 font-mono text-[11.5px] text-ade-faint">{formatBytes(content.size)}</p>}
        </div>
      </div>
    );
  }

  if (content.kind === "image") {
    return (
      <div className="scrollbar-thin grid h-full place-items-center overflow-auto p-8">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local file preview, not a site asset */}
        <img src={content.url} alt={path} className="max-h-full max-w-full rounded border border-ade-line bg-[repeating-conic-gradient(#222_0_25%,#1a1a1a_0_50%)] bg-[length:16px_16px] object-contain" />
      </div>
    );
  }

  // The plain viewer stands in if the editor can't load (its files are missing, say): reading still works.
  if (editorFailed) {
    // Windows line endings would otherwise render as an extra break per row.
    return <Code key={path} text={content.text.replace(/\r\n?/g, "\n")} path={path} line={line} jump={jump} flagged={flagged} />;
  }
  return <CodeEditor fs={fs} path={path} text={content.text} line={line} jump={jump} flagged={flagged} onCursor={onCursor} onSaved={onSaved} onError={onError} />;
}

function Code({ text, path, line, jump, flagged }: { text: string; path: string; line?: number; jump: number; flagged?: number[] }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);

  const lines = useMemo(() => highlight(text, path), [text, path]);
  const columns = useMemo(() => text.split("\n").reduce((max, l) => Math.max(max, l.length + (l.split("\t").length - 1) * 3), 0), [text]);
  const flaggedSet = useMemo(() => new Set(flagged), [flagged]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (el && line) el.scrollTop = Math.max(0, (line - 1) * LINE - el.clientHeight / 3);
  }, [line, jump]);

  const start = Math.max(0, Math.floor(scrollTop / LINE) - OVERSCAN);
  const end = Math.min(lines.length, Math.ceil((scrollTop + height) / LINE) + OVERSCAN);
  const gutter = `${Math.max(3, String(lines.length).length) + 2}ch`;

  return (
    <div
      ref={scroller}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="scrollbar-thin h-full overflow-auto font-mono text-[12.5px] text-[color:var(--syntax-plain)]"
      style={{ lineHeight: `${LINE}px`, tabSize: 4 }}
    >
      <div className="relative" style={{ height: lines.length * LINE + 120, minWidth: `calc(${columns}ch + ${gutter} + 48px)` }}>
        <div className="absolute inset-x-0 top-0" style={{ transform: `translateY(${start * LINE}px)` }}>
          {lines.slice(start, end).map((tokens, i) => {
            const no = start + i + 1;
            const isFlagged = flaggedSet.has(no);
            const isTarget = no === line;
            return (
              <div key={no} className={`flex whitespace-pre ${isFlagged ? "bg-red-500/[0.10]" : isTarget ? "bg-white/[0.06]" : ""}`} style={{ height: LINE }}>
                <span
                  className={`sticky left-0 z-10 shrink-0 select-none bg-ade-editor pr-4 text-right ${isFlagged ? "text-red-300" : isTarget ? "text-ade-fg" : "text-ade-faint"}`}
                  style={{ width: gutter, boxShadow: isFlagged ? "inset 2px 0 0 #f87171" : undefined }}
                >
                  {no}
                </span>
                <span className={isFlagged ? "underline decoration-red-400/70 decoration-wavy underline-offset-4" : ""}>
                  {tokens.map((t, k) => (
                    <span key={k} style={{ color: TOKEN_COLOR[t.t], fontStyle: t.t === "comment" ? "italic" : undefined }}>
                      {t.s}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
