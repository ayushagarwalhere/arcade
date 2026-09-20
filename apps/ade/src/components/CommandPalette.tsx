"use client";
import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";

export interface Command {
  id: string;
  label: string;
  group: string;
  hint?: string;
  Icon?: ComponentType<{ className?: string }>;
  run: () => void;
}

/** Quick-open overlay. Mounted only while open, so its state resets each time. */
export default function CommandPalette({ commands, onClose }: { commands: Command[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  // Capped: a workspace can contribute thousands of files.
  const results = (q ? commands.filter((c) => `${c.group} ${c.label} ${c.hint ?? ""}`.toLowerCase().includes(q)) : commands).slice(0, 80);
  const active = Math.min(index, results.length - 1);

  useEffect(() => {
    list.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (c?: Command) => {
    if (!c) return;
    onClose();
    c.run();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[9vh]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
        className="w-[min(560px,92vw)] overflow-hidden rounded-lg border border-white/12 bg-ade-raised shadow-pop"
      >
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
              setIndex(Math.min(active + 1, results.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setIndex(Math.max(active - 1, 0));
            } else if (e.key === "Enter") {
              e.preventDefault();
              choose(results[active]);
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
          placeholder="Search files, views, findings and commands"
          className="block h-10 w-full border-b border-ade-line bg-transparent px-3.5 text-[13px] text-ade-fg outline-none placeholder:text-ade-faint"
        />
        <div ref={list} className="scrollbar-thin max-h-[340px] overflow-y-auto py-1">
          {results.map((c, i) => (
            <button
              key={c.id}
              data-active={i === active}
              onMouseMove={() => setIndex(i)}
              onClick={() => choose(c)}
              className={`flex h-7 w-full items-center gap-2 px-3.5 text-left text-[13px] ${i === active ? "bg-white/[0.08] text-white" : "text-ade-fg/85"}`}
            >
              {c.Icon ? <c.Icon className="h-3.5 w-3.5 shrink-0 text-ade-muted" /> : <span className="w-3.5 shrink-0" />}
              <span className="truncate">{c.label}</span>
              {c.hint && <span className="min-w-0 flex-1 truncate text-[12px] text-ade-faint">{c.hint}</span>}
              <span className="ml-auto shrink-0 text-[11px] text-ade-faint">{c.group}</span>
            </button>
          ))}
          {!results.length && <div className="px-3.5 py-3 text-[12.5px] text-ade-muted">No matching commands</div>}
        </div>
      </div>
    </div>
  );
}
