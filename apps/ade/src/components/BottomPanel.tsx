"use client";
import { CircleX, Info, TriangleAlert, X } from "lucide-react";
import type { ArcadeState, Finding } from "@arcade/core/types";
import { FINDING_STATUS } from "./atoms";
import TerminalView from "./views/TerminalView";

export type PanelTab = "problems" | "output" | "terminal";

const SEVERITY_ICON = {
  critical: { Icon: CircleX, color: "text-red-400" },
  high: { Icon: CircleX, color: "text-orange-400" },
  medium: { Icon: TriangleAlert, color: "text-amber-300" },
  low: { Icon: Info, color: "text-sky-300" },
} as const;

export default function BottomPanel({
  state,
  findings,
  tab,
  onTab,
  onOpenFinding,
  onClose,
}: {
  state: ArcadeState;
  findings: Finding[];
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  onOpenFinding: (id: string) => void;
  onClose: () => void;
}) {
  const TABS: { id: PanelTab; label: string; count?: number }[] = [
    { id: "problems", label: "Problems", count: findings.length },
    { id: "output", label: "Output" },
    { id: "terminal", label: "Terminal" },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-ade-base">
      <div className="flex h-[35px] shrink-0 items-center gap-4 px-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onTab(t.id)}
            className={`flex h-full items-center gap-1.5 border-b text-[11px] uppercase tracking-wide transition ${
              tab === t.id ? "border-ade-fg text-ade-fg" : "border-transparent text-ade-muted hover:text-ade-fg"
            }`}
          >
            {t.label}
            {t.count != null && <span className="rounded-full bg-white/10 px-1.5 text-[10px] leading-4 text-ade-fg/80">{t.count}</span>}
          </button>
        ))}
        <span className="flex-1" />
        {tab === "terminal" && <span className="hidden font-mono text-[11px] text-ade-faint sm:block">arcade — {state.environment.sandboxId}</span>}
        <button onClick={onClose} title="Close panel (Ctrl+J)" aria-label="Close panel" className="grid h-6 w-6 place-items-center rounded text-ade-muted transition hover:bg-white/[0.06] hover:text-ade-fg">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "terminal" && <TerminalView state={state} />}

        {tab === "problems" && (
          <div className="scrollbar-thin h-full overflow-y-auto py-1">
            {findings.map((f) => {
              const { Icon, color } = SEVERITY_ICON[f.severity];
              return (
                <button key={f.id} onClick={() => onOpenFinding(f.id)} className="flex h-[22px] w-full items-center gap-2 px-4 text-left text-[12.5px] text-ade-fg/85 transition hover:bg-white/[0.04]">
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
                  <span className="truncate">{f.title}</span>
                  <span className="shrink-0 font-mono text-[11px] text-ade-faint">{f.cwe.split(" · ")[0]}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ade-muted">{f.target}</span>
                  <span className="hidden shrink-0 text-[11px] text-ade-muted sm:block">{FINDING_STATUS[f.status].label}</span>
                  <span className="shrink-0 font-mono text-[11px] text-ade-faint">{f.id}</span>
                </button>
              );
            })}
          </div>
        )}

        {tab === "output" && (
          <div className="scrollbar-thin h-full overflow-y-auto px-4 py-2 font-mono text-[12px] leading-[1.7]">
            {state.timeline.length ? (
              state.timeline.map((e, i) => (
                <div key={i} className="flex gap-3 whitespace-pre-wrap">
                  <span className="shrink-0 text-ade-faint">[{e.time}]</span>
                  <span className="w-[84px] shrink-0 text-ade-muted">{e.actor}</span>
                  <span className="min-w-0 text-ade-fg/90">{e.text}</span>
                </div>
              ))
            ) : (
              <span className="text-ade-faint">Run events stream here once the loop starts.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
