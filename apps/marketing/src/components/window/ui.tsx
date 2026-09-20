import { Check } from "lucide-react";

export type Status = "done" | "running" | "queued";

export function StatusDot({ s }: { s: Status }) {
  if (s === "running")
    return <span className="mt-[5px] h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />;
  if (s === "done") return <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-emerald-400" />;
  return <span className="mt-[7px] h-2 w-2 shrink-0 rounded-full bg-white/25" />;
}

export function PanelTitle({ title, right }: { title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 pb-3 pt-4 text-[14px] font-medium text-white">
      {title}
      {right}
    </div>
  );
}

export function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "red" | "green" | "amber" | "violet" }) {
  const tones = {
    neutral: "bg-white/[0.07] text-white/70",
    red: "bg-red-500/15 text-red-300",
    green: "bg-emerald-500/15 text-emerald-300",
    amber: "bg-amber-500/15 text-amber-300",
    violet: "bg-violet-500/15 text-violet-300",
  };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function StatRow({ label, value, tone }: { label: string; value: string; tone?: "red" | "green" | "amber" }) {
  const c = tone === "red" ? "text-red-300" : tone === "green" ? "text-emerald-300" : tone === "amber" ? "text-amber-300" : "text-white";
  return (
    <div className="flex items-center justify-between border-b border-white/[0.06] px-5 py-3 text-[13px]">
      <span className="text-white/55">{label}</span>
      <span className={`font-medium ${c}`}>{value}</span>
    </div>
  );
}

const TRAIL = [
  { t: "Discovered", d: "Attacker agent · 00:41", h: "map a3f9" },
  { t: "Reproduced", d: "Sandbox replay · 00:58", h: "exploit A-0142" },
  { t: "Fix proposed", d: "Defender agent · 01:12", h: "3 mitigations" },
  { t: "Fix applied", d: "Remediation agent · 01:40", h: "commit 3f9a1c2" },
  { t: "Verified", d: "Independent verifier · 02:05", h: "0 / 212 payloads" },
];

/** Vertical timeline: how a finding was discovered, reproduced, fixed and verified. */
export function EvidenceTrail({ done, compact = false }: { done: number; compact?: boolean }) {
  return (
    <ol className={compact ? "space-y-3" : "space-y-4"}>
      {TRAIL.map((s, i) => {
        const complete = i < done;
        const active = i === done;
        return (
          <li key={s.t} data-stagger className="relative flex gap-3">
            {i < TRAIL.length - 1 && <span className={`absolute left-[9px] top-6 h-[calc(100%-4px)] w-px ${complete ? "bg-emerald-400/40" : "bg-white/10"}`} />}
            <span
              className={`relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full border transition-colors duration-500 ${
                complete ? "border-emerald-400 bg-emerald-400 text-black" : active ? "border-amber-400" : "border-white/20"
              }`}
            >
              {complete ? <Check className="h-3 w-3" strokeWidth={3} /> : active ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" /> : null}
            </span>
            <div className="min-w-0">
              <div className={`text-[13px] font-medium ${complete || active ? "text-white" : "text-white/40"}`}>{s.t}</div>
              <div className="truncate text-[12px] text-white/40">{complete ? `${s.d} · ${s.h}` : active ? "In progress…" : "Waiting"}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}