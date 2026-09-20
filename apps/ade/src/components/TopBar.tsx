"use client";
import { Loader2, Lock, PanelBottom, PanelLeft, PanelRight, Play, RotateCcw, Search, ShieldCheck } from "lucide-react";
import type { ArcadeState, Approval } from "@arcade/core/types";
import type { GithubRepo } from "@arcade/core/github";
import { LogoMark } from "@arcade/ui/components/logo";
import GithubConnect from "@arcade/ui/components/GithubConnect";
import ThemeToggle from "@arcade/ui/components/ThemeToggle";

export interface Layout {
  sidebar: boolean;
  panel: boolean;
  agent: boolean;
}

export default function TopBar({
  state,
  workspace,
  running,
  pendingApproval,
  layout,
  onToggle,
  onPalette,
  onHome,
  onStart,
  onReset,
  onShowApproval,
  onOpenRepo,
}: {
  onOpenRepo: (r: GithubRepo) => void;
  onHome: () => void;
  state: ArcadeState;
  workspace: string;
  running: boolean;
  pendingApproval?: Approval;
  layout: Layout;
  onToggle: (k: keyof Layout) => void;
  onPalette: () => void;
  onStart: () => void;
  onReset: () => void;
  onShowApproval: () => void;
}) {
  const started = state.phase !== "idle";
  const done = state.phase === "verified" && !pendingApproval;

  const TOGGLES: { k: keyof Layout; label: string; Icon: typeof PanelLeft }[] = [
    { k: "sidebar", label: "Toggle sidebar (Ctrl+B)", Icon: PanelLeft },
    { k: "panel", label: "Toggle panel (Ctrl+J)", Icon: PanelBottom },
    { k: "agent", label: "Toggle agent (Ctrl+L)", Icon: PanelRight },
  ];

  return (
    <header className="grid h-9 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-ade-line bg-ade-chrome px-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <button onClick={onHome} title="Close workspace" className="flex shrink-0 items-center gap-2 rounded px-1 py-0.5 transition hover:bg-white/[0.06]">
          <LogoMark className="h-4 w-4 text-emerald-400" />
          <span className="text-[12.5px] font-medium text-ade-fg">Arcade</span>
        </button>
        <span className="hidden truncate text-[12px] text-ade-faint sm:block">{state.project.repo}</span>
      </div>

      {/* Command center */}
      <button
        onClick={onPalette}
        className="flex h-6 w-[min(420px,44vw)] items-center justify-center gap-2 rounded-md border border-ade-line bg-ade-raised px-2 text-[12px] text-ade-muted transition hover:border-white/15 hover:text-ade-fg"
      >
        <Search className="h-3 w-3 shrink-0" />
        <span className="truncate">
          {state.project.name} — {workspace}
        </span>
        <kbd className="ml-1 hidden rounded border border-ade-line px-1 font-sans text-[10px] text-ade-faint md:block">Ctrl K</kbd>
      </button>

      <div className="flex items-center justify-end gap-1">
        <GithubConnect variant="ade" onOpenRepo={onOpenRepo} />
        {pendingApproval ? (
          <button
            onClick={onShowApproval}
            className="flex h-6 items-center gap-1.5 rounded-md bg-violet-500/15 px-2 text-[12px] font-medium text-violet-200 transition hover:bg-violet-500/25"
          >
            <Lock className="h-3 w-3" /> Approval needed
          </button>
        ) : done ? (
          <span className="flex h-6 items-center gap-1.5 px-2 text-[12px] text-emerald-300">
            <ShieldCheck className="h-3.5 w-3.5" /> Verified
          </span>
        ) : running ? (
          <span className="flex h-6 items-center gap-1.5 px-2 text-[12px] text-ade-muted">
            <Loader2 className="h-3 w-3 animate-spin" /> Running
          </span>
        ) : (
          <button
            onClick={onStart}
            className="flex h-6 items-center gap-1.5 rounded-md bg-ade-fg px-2.5 text-[12px] font-medium text-black transition hover:bg-white"
          >
            <Play className="h-3 w-3" fill="currentColor" /> {started ? "Resume" : "Run"}
          </button>
        )}
        <button
          onClick={onReset}
          title="Reset the run"
          aria-label="Reset the run"
          className="grid h-6 w-6 place-items-center rounded-md text-ade-muted transition hover:bg-white/[0.06] hover:text-ade-fg"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>

        <span className="mx-1 h-4 w-px bg-ade-line" />

        <ThemeToggle variant="ade" />

        {TOGGLES.map(({ k, label, Icon }) => (
          <button
            key={k}
            onClick={() => onToggle(k)}
            title={label}
            aria-label={label}
            aria-pressed={layout[k]}
            className={`grid h-6 w-6 place-items-center rounded-md transition hover:bg-white/[0.06] ${layout[k] ? "text-ade-fg" : "text-ade-faint"}`}
          >
            <Icon className="h-[15px] w-[15px]" strokeWidth={1.7} />
          </button>
        ))}
      </div>
    </header>
  );
}
