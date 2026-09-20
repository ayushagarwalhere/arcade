"use client";
import {
  BadgeCheck,
  FileSearch,
  Map as MapIcon,
  ShieldCheck,
  Swords,
  UserCheck,
  Wrench,
  FlaskConical,
  Lock,
  Info,
} from "lucide-react";
import type { TimelineEvent, TimelineKind } from "@arcade/core/types";

const KIND: Record<TimelineKind, { Icon: typeof MapIcon; color: string }> = {
  map: { Icon: MapIcon, color: "text-violet-300 bg-violet-500/12" },
  attack: { Icon: Swords, color: "text-red-300 bg-red-500/12" },
  evidence: { Icon: FileSearch, color: "text-red-300 bg-red-500/12" },
  defend: { Icon: ShieldCheck, color: "text-emerald-300 bg-emerald-500/12" },
  approve: { Icon: Lock, color: "text-violet-300 bg-violet-500/12" },
  remediate: { Icon: Wrench, color: "text-amber-300 bg-amber-400/12" },
  test: { Icon: FlaskConical, color: "text-cyan-300 bg-cyan-500/12" },
  verify: { Icon: BadgeCheck, color: "text-emerald-300 bg-emerald-500/12" },
  human: { Icon: UserCheck, color: "text-white bg-white/10" },
  info: { Icon: Info, color: "text-white/60 bg-white/[0.06]" },
};

export default function TimelineList({ events, empty = "Nothing yet." }: { events: TimelineEvent[]; empty?: string }) {
  if (!events.length) {
    return <div className="rounded-md border border-dashed border-ade-line bg-ade-base p-6 text-center text-[13px] text-white/45">{empty}</div>;
  }
  return (
    <ol className="relative">
      {events.map((e, i) => {
        const k = KIND[e.kind];
        const last = i === events.length - 1;
        return (
          <li key={i} className="relative flex animate-fade-in gap-3.5 pb-4">
            {!last && <span className="absolute left-[15px] top-8 h-[calc(100%-16px)] w-px bg-ade-line" />}
            <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded ${k.color}`}>
              <k.Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-[11px] text-white/40">{e.time}</span>
                <span className="text-[12px] font-medium text-white/85">{e.actor}</span>
              </div>
              <p className="mt-0.5 text-[13px] leading-5 text-white/60">{e.text}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
