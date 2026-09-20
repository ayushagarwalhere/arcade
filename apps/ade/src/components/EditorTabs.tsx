"use client";
import { X } from "lucide-react";
import type { EditorTab } from "@/hooks/useEditorTabs";
import { baseName } from "@arcade/core/fs";
import { FileIcon, type FileDecoration } from "./FileTree";
import { VIEW_META } from "./Sidebar";

const TONE = { red: "text-red-300", amber: "text-amber-300", green: "text-emerald-300" } as const;

export default function EditorTabs({
  tabs,
  activeId,
  selectedFinding,
  changeCount,
  decorations,
  onActivate,
  onPin,
  onClose,
}: {
  tabs: EditorTab[];
  activeId: string | null;
  selectedFinding: string;
  changeCount: number;
  decorations: Record<string, FileDecoration>;
  onActivate: (id: string) => void;
  onPin: (id: string) => void;
  onClose: (id: string) => void;
}) {
  return (
    <div role="tablist" className="scrollbar-none flex h-[35px] shrink-0 overflow-x-auto bg-ade-base">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        const label = tab.kind === "file" ? baseName(tab.path) : tab.view === "findings" ? selectedFinding : VIEW_META[tab.view].label;
        const deco = tab.kind === "file" ? decorations[tab.path] : undefined;
        const ViewIcon = tab.kind === "view" ? VIEW_META[tab.view].Icon : null;
        return (
          <div
            key={tab.id}
            onAuxClick={(e) => e.button === 1 && onClose(tab.id)}
            className={`group flex shrink-0 items-center border-b border-r border-r-ade-line text-[12.5px] ${
              active ? "border-b-transparent bg-ade-editor text-white shadow-[inset_0_1px_0_0_var(--color-ade-fg)]" : "border-b-ade-line text-ade-muted hover:text-ade-fg"
            }`}
          >
            <button
              role="tab"
              aria-selected={active}
              title={tab.kind === "file" ? tab.path : undefined}
              onClick={() => onActivate(tab.id)}
              onDoubleClick={() => onPin(tab.id)}
              className="flex h-full items-center gap-1.5 pl-3"
            >
              {ViewIcon ? <ViewIcon className="h-3.5 w-3.5 shrink-0 text-ade-muted" strokeWidth={1.7} /> : tab.kind === "file" && <FileIcon path={tab.path} />}
              <span className={`${tab.kind === "view" && tab.view === "findings" ? "font-mono text-[12px]" : ""} ${tab.kind === "file" && tab.preview ? "italic" : ""} ${deco ? TONE[deco.tone] : ""}`}>
                {label}
              </span>
              {deco && <span className={`text-[11px] font-semibold ${TONE[deco.tone]}`}>{deco.badge}</span>}
              {tab.kind === "view" && tab.view === "diff" && changeCount > 0 && <span className="text-[11px] text-amber-300">{changeCount}</span>}
            </button>
            <button
              onClick={() => onClose(tab.id)}
              aria-label={`Close ${label}`}
              className={`mx-1.5 grid h-5 w-5 place-items-center rounded transition hover:bg-white/10 ${active ? "" : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100"}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
      <div className="flex-1 border-b border-ade-line" />
    </div>
  );
}
