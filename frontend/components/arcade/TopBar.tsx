"use client";
import { Play, RotateCcw, ShieldCheck, Loader2, Lock } from "lucide-react";
import type { ArcadeState, Approval } from "@/lib/arcade/types";
import type { View } from "./Sidebar";

const VIEW_LABEL: Record<View, string> = {
  overview: "Overview",
  surface: "Attack Surface",
  findings: "Findings",
  evidence: "Evidence",
  timeline: "Timeline",
  terminal: "Terminal",
  browser: "Browser",
  diff: "Diff",
};

export default function TopBar({
  state,
  view,
  running,
  progress,
  pendingApproval,
  onStart,
  onReset,
  onShowApproval,
}: {
  state: ArcadeState;
  view: View;
  running: boolean;
  progress: number;
  pendingApproval?: Approval;
  onStart: () => void;
  onReset: () => void;
  onShowApproval: () => void;
}) {
  const started = state.phase !== "idle";
  const done = state.phase === "verified" && !pendingApproval;

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-white/[0.07] bg-ink-950 px-5">
      <div className="flex min-w-0 items-center gap-2 text-[13px]">
        <span className="text-white/40">{state.project.name}</span>
        <span className="text-white/20">/</span>
        <span className="font-medium text-white">{VIEW_LABEL[view]}</span>
      </div>

      {/* progress */}
      <div className="hidden flex-1 items-center gap-3 md:flex">
        <div className="relative h-1 w-full max-w-[280px] overflow-hidden rounded-full bg-white/[0.07]">
          <div className={`h-full rounded-full transition-[width] duration-500 ${done ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2.5">
        <div className="hidden items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[11px] sm:flex">
          <span className={`h-1.5 w-1.5 rounded-full ${done ? "bg-emerald-400" : running ? "bg-amber-400" : "bg-white/40"}`} />
          <span className="text-white/60">Security: {done ? "verified" : running ? "active" : started ? "paused" : "idle"}</span>
        </div>

        {pendingApproval ? (
          <button
            onClick={onShowApproval}
            className="flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-[12.5px] font-medium text-violet-200 transition hover:bg-violet-500/20 animate-pulse-ring"
          >
            <Lock className="h-3.5 w-3.5" /> Approval needed
          </button>
        ) : done ? (
          <span className="flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[12.5px] font-medium text-emerald-200">
            <ShieldCheck className="h-3.5 w-3.5" /> Verified
          </span>
        ) : running ? (
          <span className="flex items-center gap-1.5 rounded-lg border border-white/12 px-3 py-2 text-[12.5px] text-white/70">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running…
          </span>
        ) : (
          <button
            onClick={onStart}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3.5 py-2 text-[12.5px] font-semibold text-black transition hover:bg-emerald-300"
          >
            <Play className="h-3.5 w-3.5" fill="currentColor" /> {started ? "Resume run" : "Run security demo"}
          </button>
        )}

        <button
          onClick={onReset}
          title="Reset the run"
          className="grid h-9 w-9 place-items-center rounded-lg border border-white/12 text-white/60 transition hover:bg-white/[0.05] hover:text-white"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
