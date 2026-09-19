"use client";
import Link from "next/link";
import {
  Activity,
  ChevronDown,
  FileSearch,
  GitCompareArrows,
  Globe,
  LayoutDashboard,
  ListChecks,
  Network,
  Plug,
  ScrollText,
  TerminalSquare,
} from "lucide-react";
import type { ArcadeState } from "@/lib/arcade/types";
import { LogoMark } from "@/components/logo";
import { AGENT_ICON, Badge } from "./atoms";

export type View =
  | "overview"
  | "surface"
  | "findings"
  | "evidence"
  | "timeline"
  | "terminal"
  | "browser"
  | "diff";

const SECURITY: { id: View; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", Icon: LayoutDashboard },
  { id: "surface", label: "Attack Surface", Icon: Network },
  { id: "findings", label: "Findings", Icon: ListChecks },
  { id: "evidence", label: "Evidence", Icon: FileSearch },
  { id: "timeline", label: "Timeline", Icon: Activity },
];

const TOOLS: { id: View; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: "terminal", label: "Terminal", Icon: TerminalSquare },
  { id: "browser", label: "Browser", Icon: Globe },
  { id: "diff", label: "Diff", Icon: GitCompareArrows },
];

export default function Sidebar({
  state,
  view,
  onView,
  activeWorkspace,
  onWorkspace,
  onToggleProvider,
}: {
  state: ArcadeState;
  view: View;
  onView: (v: View) => void;
  activeWorkspace: string;
  onWorkspace: (id: string) => void;
  onToggleProvider: (id: string, connected: boolean) => void;
}) {
  const openFindings = 1 + state.secondaryFindings.length;

  const NavButton = ({ id, label, Icon, count }: { id: View; label: string; Icon: typeof LayoutDashboard; count?: number }) => (
    <button
      onClick={() => onView(id)}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition ${
        view === id ? "bg-white/[0.08] text-white" : "text-white/55 hover:bg-white/[0.04] hover:text-white/90"
      }`}
    >
      <Icon className={`h-[15px] w-[15px] ${view === id ? "text-emerald-400" : "text-white/40"}`} />
      <span className="flex-1 text-left">{label}</span>
      {count != null && <span className="rounded-full bg-white/10 px-1.5 text-[10px] text-white/60">{count}</span>}
    </button>
  );

  return (
    <aside className="flex h-full w-[248px] shrink-0 flex-col border-r border-white/[0.07] bg-ink-950">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="text-emerald-400">
          <LogoMark className="h-6 w-6" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight">Arcade</span>
        <Badge tone="neutral" className="ml-auto text-[9px]">
          ADE
        </Badge>
      </div>

      {/* Project switcher */}
      <div className="px-3">
        <button className="flex w-full items-center gap-2.5 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2 text-left hover:border-white/20">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-emerald-500/15 text-[11px] font-bold text-emerald-300">ac</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-white">{state.project.name}</span>
            <span className="block truncate text-[10px] text-white/40">{state.project.repo}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-white/40" />
        </button>
      </div>

      <div className="scrollbar-thin mt-4 flex-1 overflow-y-auto px-3 pb-3">
        {/* Workspaces */}
        <div className="px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Security runs</div>
        <div className="space-y-1">
          {state.workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => onWorkspace(w.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition ${
                activeWorkspace === w.id ? "bg-white/[0.06]" : "hover:bg-white/[0.03]"
              }`}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  w.status === "active" ? "bg-emerald-400" : w.status === "queued" ? "bg-white/25" : "bg-violet-400"
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] text-white/85">{w.name}</span>
                <span className="block truncate font-mono text-[10px] text-white/40">{w.branch}</span>
              </span>
              <span className="flex -space-x-1">
                {w.agents.slice(0, 3).map((a) => {
                  const Icon = AGENT_ICON[a];
                  return (
                    <span key={a} className="grid h-4 w-4 place-items-center rounded-full bg-ink-800 ring-1 ring-ink-950">
                      <Icon className="h-2.5 w-2.5 text-white/50" />
                    </span>
                  );
                })}
              </span>
            </button>
          ))}
        </div>

        {/* Security nav */}
        <div className="mt-5 px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Security</div>
        <div className="space-y-0.5">
          {SECURITY.map((n) => (
            <NavButton key={n.id} {...n} count={n.id === "findings" ? openFindings : undefined} />
          ))}
        </div>

        {/* Tools nav */}
        <div className="mt-5 px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Tools</div>
        <div className="space-y-0.5">
          {TOOLS.map((n) => (
            <NavButton key={n.id} {...n} />
          ))}
        </div>

        {/* Bring your own agent */}
        <div className="mt-5 flex items-center gap-1.5 px-1 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
          <Plug className="h-3 w-3" /> Agent providers
        </div>
        <div className="space-y-1">
          {state.providers.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] text-white/70 hover:bg-white/[0.03]"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${p.connected ? "bg-emerald-400" : "bg-white/20"}`} />
              <span className="flex-1">{p.name}</span>
              <input
                type="checkbox"
                checked={p.connected}
                onChange={(e) => onToggleProvider(p.id, e.target.checked)}
                className="peer sr-only"
              />
              <span className="text-[10px] text-white/35 peer-checked:text-emerald-300">{p.connected ? "connected" : "connect"}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Environment + back link */}
      <div className="border-t border-white/[0.07] px-3 py-3">
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.04] px-3 py-2.5">
          <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-emerald-300/80">Target environment</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <Badge tone="green">Isolated</Badge>
            <Badge tone="green">Disposable</Badge>
            <Badge tone="neutral">{state.environment.host}</Badge>
          </div>
          <div className="mt-1.5 font-mono text-[10px] text-white/40">
            {state.environment.sandboxId} · network: {state.environment.network}
          </div>
        </div>
        <Link href="/" className="mt-2.5 block px-1 text-[11px] text-white/40 transition hover:text-white/70">
          ← Back to arcade.dev
        </Link>
      </div>
    </aside>
  );
}
