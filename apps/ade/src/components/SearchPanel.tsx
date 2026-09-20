"use client";
import { useRef, useState } from "react";
import { CaseSensitive, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { baseName, dirName, searchFiles, type SearchHit, type WorkspaceFs } from "@arcade/core/fs";
import { FileIcon } from "./FileTree";

/** Plain-text search across the workspace's indexed files. Runs on Enter. */
export default function SearchPanel({
  fs,
  files,
  indexing,
  onOpen,
}: {
  fs: WorkspaceFs | null;
  files: string[];
  indexing: boolean;
  onOpen: (path: string, line: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [status, setStatus] = useState<"idle" | "searching" | "done" | "truncated">("idle");
  const [searched, setSearched] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const runId = useRef(0);

  const search = (q: string, caseSensitive: boolean) => {
    const id = ++runId.current;
    setHits([]);
    setCollapsed(new Set());
    setSearched(q);
    if (!fs || !q) return setStatus("idle");
    setStatus("searching");
    searchFiles(fs, files, q, { matchCase: caseSensitive }, () => runId.current !== id, (hit) => setHits((h) => [...h, hit])).then((r) => {
      if (runId.current === id) setStatus(r.truncated ? "truncated" : "done");
    });
  };

  const total = hits.reduce((n, h) => n + h.matches.length, 0);

  if (!fs) return <p className="px-4 text-[12px] leading-5 text-ade-faint">Open a folder to search its files.</p>;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-2">
        <div className="flex h-7 items-center rounded border border-ade-line bg-ade-editor pr-1 transition focus-within:border-white/25">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search(query, matchCase)}
            placeholder="Search"
            aria-label="Search files"
            className="h-full min-w-0 flex-1 bg-transparent px-2 text-[13px] text-ade-fg outline-none placeholder:text-ade-faint"
          />
          <button
            onClick={() => {
              setMatchCase(!matchCase);
              if (searched) search(query, !matchCase);
            }}
            title="Match case"
            aria-pressed={matchCase}
            className={`grid h-5 w-5 place-items-center rounded transition ${matchCase ? "bg-white/15 text-white" : "text-ade-muted hover:bg-white/10"}`}
          >
            <CaseSensitive className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] text-ade-faint">
          {status === "searching" && <Loader2 className="h-3 w-3 animate-spin" />}
          {status === "idle"
            ? `${indexing ? "Indexing… " : ""}${files.length.toLocaleString()} files · Enter to search`
            : `${total.toLocaleString()} result${total === 1 ? "" : "s"} in ${hits.length} file${hits.length === 1 ? "" : "s"}${status === "truncated" ? " — showing the first matches only" : ""}`}
        </p>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto pb-2">
        {hits.map((hit) => {
          const closed = collapsed.has(hit.path);
          return (
            <div key={hit.path}>
              <button
                onClick={() =>
                  setCollapsed((prev) => {
                    const next = new Set(prev);
                    if (!next.delete(hit.path)) next.add(hit.path);
                    return next;
                  })
                }
                title={hit.path}
                className="flex h-[22px] w-full items-center gap-1 pl-2 pr-2 text-left text-[13px] text-ade-fg/90 hover:bg-white/[0.045]"
              >
                {closed ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ade-muted" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ade-muted" />}
                <FileIcon path={hit.path} />
                <span className="shrink-0">{baseName(hit.path)}</span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-ade-faint">{dirName(hit.path)}</span>
                <span className="shrink-0 rounded-full bg-white/10 px-1.5 text-[10px] leading-4 text-ade-fg/80">{hit.matches.length}</span>
              </button>
              {!closed &&
                hit.matches.map((m) => {
                  const lead = m.text.length - m.text.trimStart().length;
                  const col = Math.max(0, m.col - lead);
                  const text = m.text.trim();
                  return (
                    <button
                      key={m.line}
                      onClick={() => onOpen(hit.path, m.line)}
                      className="block h-[22px] w-full truncate pl-8 pr-2 text-left font-mono text-[11.5px] leading-[22px] text-ade-muted hover:bg-white/[0.045] hover:text-ade-fg"
                    >
                      {text.slice(0, col)}
                      <mark className="rounded-sm bg-amber-300/25 text-amber-100">{text.slice(col, col + searched.length)}</mark>
                      {text.slice(col + searched.length)}
                    </button>
                  );
                })}
            </div>
          );
        })}
        {status === "done" && !hits.length && <p className="px-4 text-[12px] text-ade-faint">No results for “{searched}”.</p>}
      </div>
    </div>
  );
}
