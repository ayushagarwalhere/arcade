"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, FileText, Hash, Search } from "lucide-react";
import { FLAT, docHref } from "@/lib/docs/nav";
import type { SearchHit } from "@/lib/docs/search";

type SearchFn = (query: string) => SearchHit[];

/** Search dialog. Mounted only while open, so its state resets each time. */
export default function DocsSearch({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [searchFn, setSearchFn] = useState<SearchFn | null>(null);
  const list = useRef<HTMLDivElement>(null);

  // The index carries every page's text, so it loads on first open rather than with the shell.
  useEffect(() => {
    let live = true;
    import("@/lib/docs/search").then((m) => live && setSearchFn(() => m.search));
    return () => {
      live = false;
    };
  }, []);

  const q = query.trim();
  const hits: SearchHit[] = q
    ? (searchFn?.(q) ?? [])
    : FLAT.slice(0, 6).map((n) => ({ slug: n.slug, page: n.label, group: n.group, text: "", snippet: "" }));
  const active = Math.min(index, hits.length - 1);

  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (hit?: SearchHit) => {
    if (!hit) return;
    onClose();
    router.push(docHref(hit.slug));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Search the docs"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-full max-w-[600px] overflow-hidden rounded-xl border border-white/12 bg-ink-900 shadow-pop"
      >
        <div className="flex items-center gap-3 border-b border-white/[0.08] px-4">
          <Search className="h-4 w-4 shrink-0 text-white/40" />
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex(Math.min(active + 1, hits.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex(Math.max(active - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                go(hits[active]);
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Search the docs"
            className="h-12 w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/35"
          />
          <kbd className="shrink-0 rounded border border-white/12 px-1.5 py-0.5 text-[11px] text-white/40">Esc</kbd>
        </div>

        <div ref={list} className="scrollbar-thin max-h-[52vh] overflow-y-auto p-2">
          {!q && <div className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/30">Suggested</div>}
          {hits.map((hit, i) => {
            const Icon = hit.section ? Hash : FileText;
            return (
              <button
                key={hit.slug}
                data-active={i === active}
                onMouseMove={() => setIndex(i)}
                onClick={() => go(hit)}
                className={`flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-left ${i === active ? "bg-white/[0.07]" : ""}`}
              >
                <Icon className={`mt-[3px] h-4 w-4 shrink-0 ${i === active ? "text-emerald-300" : "text-white/35"}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-white/90">
                    {hit.section ?? hit.page}
                    {hit.section && <span className="text-white/35"> — {hit.page}</span>}
                  </span>
                  {hit.snippet && <span className="mt-0.5 block truncate text-[12.5px] text-white/40">{hit.snippet}</span>}
                </span>
                <span className="mt-0.5 hidden shrink-0 text-[11px] text-white/30 sm:block">{hit.group}</span>
              </button>
            );
          })}
          {q && searchFn && !hits.length && (
            <div className="px-3 py-8 text-center text-[14px] text-white/45">
              No results for <span className="text-white/80">&ldquo;{q}&rdquo;</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-white/[0.08] px-4 py-2 text-[11.5px] text-white/35">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded border border-white/12 px-1">↑</kbd>
            <kbd className="rounded border border-white/12 px-1">↓</kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <CornerDownLeft className="h-3 w-3" /> open
          </span>
        </div>
      </div>
    </div>
  );
}
