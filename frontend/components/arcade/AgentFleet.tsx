"use client";
import type { AgentKind, ArcadeState } from "@/lib/arcade/types";
import { AGENT_ICON, AgentDot, Badge } from "./atoms";

const ORDER: AgentKind[] = ["mapper", "attacker", "defender", "remediator", "verifier"];

const STATUS_LABEL: Record<string, { text: string; tone: Parameters<typeof Badge>[0]["tone"] }> = {
  idle: { text: "Idle", tone: "neutral" },
  queued: { text: "Queued", tone: "neutral" },
  running: { text: "Running", tone: "amber" },
  done: { text: "Complete", tone: "green" },
  "awaiting-approval": { text: "Awaiting approval", tone: "violet" },
  blocked: { text: "Blocked", tone: "red" },
};

export default function AgentFleet({ state }: { state: ArcadeState }) {
  const running = ORDER.filter((k) => state.agents[k].status === "running").length;
  const done = ORDER.filter((k) => state.agents[k].status === "done").length;

  return (
    <aside className="flex h-full w-[300px] shrink-0 flex-col border-l border-white/[0.07] bg-ink-950">
      <header className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3.5">
        <h3 className="text-[13px] font-semibold text-white/85">Agent fleet</h3>
        <span className="text-[11px] text-white/40">
          {done}/5 done{running ? ` · ${running} running` : ""}
        </span>
      </header>

      <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto p-3">
        {ORDER.map((kind, i) => {
          const a = state.agents[kind];
          const Icon = AGENT_ICON[kind];
          const st = STATUS_LABEL[a.status];
          const active = a.status === "running" || a.status === "awaiting-approval";
          return (
            <div
              key={kind}
              className={`rounded-xl border bg-ink-900 px-3 py-3 transition ${
                active ? "border-white/20" : "border-white/[0.07]"
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`grid h-8 w-8 place-items-center rounded-lg ${
                    a.status === "done"
                      ? "bg-emerald-500/12 text-emerald-300"
                      : active
                        ? "bg-amber-400/12 text-amber-200"
                        : "bg-white/[0.05] text-white/45"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-white">{a.name}</span>
                    <span className="text-[10px] text-white/30">#{i + 1}</span>
                  </div>
                  <div className="truncate text-[10.5px] text-white/40">{a.role}</div>
                </div>
                <AgentDot status={a.status} />
              </div>

              <div className="mt-2.5 flex items-center gap-2">
                <Badge tone={st.tone}>{st.text}</Badge>
                <span className="min-w-0 flex-1 truncate text-[11px] text-white/50">{a.task}</span>
              </div>

              {(a.status === "running" || (a.progress > 0 && a.progress < 1)) && (
                <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-amber-400/80 transition-[width] duration-300"
                    style={{ width: `${Math.round(a.progress * 100)}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="border-t border-white/[0.07] px-4 py-3 text-[11px] leading-5 text-white/40">
        Agents hand off in order. Anything high-impact stops for your approval — Arcade never merges or resets on its own.
      </div>
    </aside>
  );
}
