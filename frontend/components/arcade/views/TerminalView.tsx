"use client";
import { useEffect, useRef } from "react";
import type { ArcadeState, TerminalLine } from "@/lib/arcade/types";

const AGENT_PREFIX: Record<string, { label: string; color: string }> = {
  mapper: { label: "mapper", color: "text-violet-300" },
  attacker: { label: "attacker", color: "text-red-300" },
  defender: { label: "defender", color: "text-emerald-300" },
  remediator: { label: "remediator", color: "text-amber-300" },
  verifier: { label: "verifier", color: "text-cyan-300" },
  system: { label: "arcade", color: "text-white/45" },
};

function Line({ l }: { l: TerminalLine }) {
  const p = AGENT_PREFIX[l.agent];
  const body = (() => {
    switch (l.kind) {
      case "cmd":
        return (
          <span>
            <span className="text-emerald-400">$</span> <span className="text-white">{l.text}</span>
          </span>
        );
      case "info":
        return (
          <span>
            <span className="text-violet-400">●</span> <span className="text-white/90">{l.text}</span>
          </span>
        );
      case "sub":
        return <span className="pl-4 text-white/45">└ {l.text}</span>;
      case "ok":
        return <span className="text-emerald-400">✓ {l.text}</span>;
      case "err":
        return <span className="font-medium text-red-400">✗ {l.text}</span>;
      case "warn":
        return <span className="text-amber-300">! {l.text}</span>;
      default:
        return <span className="text-white/60">{l.text}</span>;
    }
  })();
  return (
    <div className="flex animate-fade-in gap-2 whitespace-pre-wrap break-words">
      <span className={`w-[74px] shrink-0 select-none text-[10px] leading-6 ${p.color}`}>{p.label}</span>
      <span className="min-w-0 flex-1">{body}</span>
    </div>
  );
}

export default function TerminalView({ state, height = "h-full" }: { state: ArcadeState; height?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [state.terminal.length]);

  return (
    <div className={`flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-[#0b0c0e] ${height}`}>
      <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/80" />
        <span className="ml-2 font-mono text-[11px] text-white/45">arcade — {state.environment.sandboxId}</span>
        <span className="ml-auto text-[10px] text-white/30">network: {state.environment.network}</span>
      </div>
      <div ref={ref} className="scrollbar-thin flex-1 space-y-0.5 overflow-y-auto p-4 font-mono text-[12.5px] leading-6">
        {state.terminal.map((l, i) => (
          <Line key={i} l={l} />
        ))}
        <div className="flex gap-2">
          <span className="w-[74px] shrink-0" />
          <span className="inline-block h-3.5 w-2 translate-y-1 animate-blink bg-white/70" />
        </div>
      </div>
    </div>
  );
}
