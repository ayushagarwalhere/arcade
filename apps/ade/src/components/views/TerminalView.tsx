"use client";
import { useEffect, useRef } from "react";
import type { ArcadeState, TerminalLine } from "@arcade/core/types";

const AGENT_PREFIX: Record<string, { label: string; color: string }> = {
  mapper: { label: "mapper", color: "text-violet-300" },
  attacker: { label: "attacker", color: "text-red-300" },
  defender: { label: "defender", color: "text-emerald-300" },
  remediator: { label: "remediator", color: "text-amber-300" },
  verifier: { label: "verifier", color: "text-cyan-300" },
  system: { label: "arcade", color: "text-ade-faint" },
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
            <span className="text-violet-400">●</span> <span className="text-ade-fg">{l.text}</span>
          </span>
        );
      case "sub":
        return <span className="pl-4 text-ade-muted">└ {l.text}</span>;
      case "ok":
        return <span className="text-emerald-400">✓ {l.text}</span>;
      case "err":
        return <span className="font-medium text-red-400">✗ {l.text}</span>;
      case "warn":
        return <span className="text-amber-300">! {l.text}</span>;
      default:
        return <span className="text-ade-muted">{l.text}</span>;
    }
  })();
  return (
    <div className="flex gap-2 whitespace-pre-wrap break-words">
      <span className={`w-[74px] shrink-0 select-none text-[10.5px] ${p.color}`}>{p.label}</span>
      <span className="min-w-0 flex-1">{body}</span>
    </div>
  );
}

export default function TerminalView({ state }: { state: ArcadeState }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [state.terminal.length]);

  return (
    <div ref={ref} className="scrollbar-thin h-full overflow-y-auto px-4 py-2 font-mono text-[12px] leading-[1.7]">
      {state.terminal.map((l, i) => (
        <Line key={i} l={l} />
      ))}
      <div className="flex gap-2">
        <span className="w-[74px] shrink-0" />
        <span className="inline-block h-3.5 w-[7px] translate-y-0.5 animate-blink bg-ade-fg/70" />
      </div>
    </div>
  );
}
