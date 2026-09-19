import type { ComponentType } from "react";
import {
  Boxes,
  CreditCard,
  Database,
  FileKey,
  Globe,
  KeyRound,
  Map as MapIcon,
  Server,
  ShieldAlert,
  ShieldCheck,
  Swords,
  User,
  Wrench,
  BadgeCheck,
} from "lucide-react";
import type { AgentKind, AgentStatus, FindingStatus, Severity, SurfaceNode } from "@/lib/arcade/types";

/* ------------------------------------------------------------------ colors */

export const SEVERITY: Record<Severity, { label: string; dot: string; text: string; bg: string; ring: string }> = {
  critical: { label: "Critical", dot: "bg-red-500", text: "text-red-300", bg: "bg-red-500/12", ring: "ring-red-500/30" },
  high: { label: "High", dot: "bg-orange-500", text: "text-orange-300", bg: "bg-orange-500/12", ring: "ring-orange-500/30" },
  medium: { label: "Medium", dot: "bg-amber-400", text: "text-amber-200", bg: "bg-amber-400/12", ring: "ring-amber-400/30" },
  low: { label: "Low", dot: "bg-slate-400", text: "text-slate-300", bg: "bg-slate-400/12", ring: "ring-slate-400/25" },
};

export const FINDING_STATUS: Record<FindingStatus, { label: string; tone: Tone }> = {
  reproduced: { label: "Reproduced", tone: "red" },
  analyzing: { label: "Analyzing", tone: "violet" },
  "awaiting-approval": { label: "Awaiting approval", tone: "amber" },
  remediating: { label: "Remediating", tone: "violet" },
  verifying: { label: "Verifying", tone: "violet" },
  verified: { label: "Verified", tone: "green" },
  "verification-failed": { label: "Verification failed", tone: "red" },
};

export type Tone = "neutral" | "red" | "green" | "amber" | "violet" | "orange";

const TONES: Record<Tone, string> = {
  neutral: "bg-white/[0.06] text-white/65 ring-white/10",
  red: "bg-red-500/12 text-red-300 ring-red-500/25",
  green: "bg-emerald-500/12 text-emerald-300 ring-emerald-500/25",
  amber: "bg-amber-400/12 text-amber-200 ring-amber-400/25",
  violet: "bg-violet-500/14 text-violet-300 ring-violet-500/25",
  orange: "bg-orange-500/12 text-orange-300 ring-orange-500/25",
};

/* ------------------------------------------------------------------- icons */

export const AGENT_ICON: Record<AgentKind, ComponentType<{ className?: string }>> = {
  mapper: MapIcon,
  attacker: Swords,
  defender: ShieldCheck,
  remediator: Wrench,
  verifier: BadgeCheck,
};

export const SURFACE_ICON: Record<SurfaceNode["kind"], ComponentType<{ className?: string }>> = {
  user: User,
  browser: Globe,
  api: Server,
  auth: KeyRound,
  service: Boxes,
  database: Database,
  thirdparty: CreditCard,
  admin: ShieldAlert,
  secrets: FileKey,
};

/* --------------------------------------------------------------- components */

export function Badge({ tone = "neutral", children, className = "" }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${TONES[tone]} ${className}`}>
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY[severity];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${s.bg} ${s.text} ${s.ring}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function StatusBadge({ status }: { status: FindingStatus }) {
  const s = FINDING_STATUS[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function AgentDot({ status }: { status: AgentStatus }) {
  if (status === "running")
    return <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />;
  if (status === "awaiting-approval")
    return <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-400 animate-pulse-ring" />;
  if (status === "done") return <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400" />;
  if (status === "blocked") return <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-400" />;
  if (status === "queued") return <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-white/25" />;
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-white/25" />;
}

export function Panel({ title, right, children, className = "", bodyClass = "" }: { title?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`overflow-hidden rounded-xl border border-white/[0.08] bg-ink-900 ${className}`}>
      {title && (
        <header className="flex items-center justify-between gap-3 border-b border-white/[0.07] px-4 py-3">
          <h3 className="text-[13px] font-semibold text-white/85">{title}</h3>
          {right}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 pb-2 pt-1">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">{children}</span>
      {right}
    </div>
  );
}

export function Metric({ label, value, unit, tone = "neutral", hint }: { label: string; value: string | number; unit?: string; tone?: Tone; hint?: string }) {
  const accent = tone === "red" ? "text-red-300" : tone === "green" ? "text-emerald-300" : tone === "amber" ? "text-amber-200" : tone === "violet" ? "text-violet-300" : "text-white";
  return (
    <div className="rounded-xl border border-white/[0.08] bg-ink-900 px-4 py-3.5">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/40">{label}</div>
      <div className={`mt-2 text-[26px] font-semibold leading-none tracking-tight ${accent}`}>
        {value}
        {unit && <span className="ml-1 text-[15px] text-white/40">{unit}</span>}
      </div>
      {hint && <div className="mt-1.5 text-[11px] text-white/40">{hint}</div>}
    </div>
  );
}

export function Mono({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`font-mono text-[12px] ${className}`}>{children}</span>;
}
