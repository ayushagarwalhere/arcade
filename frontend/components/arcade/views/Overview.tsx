"use client";
import { ArrowRight, ShieldCheck } from "lucide-react";
import type { ArcadeState, Finding, RunPhase } from "@/lib/arcade/types";
import { Badge, Metric, SeverityBadge, StatusBadge } from "../atoms";

const PHASE_LABEL: Record<RunPhase, string> = {
  idle: "Idle — ready to scan",
  mapping: "Mapping the application",
  mapped: "Application mapped",
  attacking: "Attacking in the sandbox",
  attacked: "Exploit reproduced",
  defending: "Analyzing the attack",
  defended: "Mitigations proposed",
  "awaiting-fix-approval": "Awaiting your approval",
  remediating: "Writing the fix",
  testing: "Running tests",
  verifying: "Independently verifying",
  verified: "Verified — safe to merge",
};

export default function Overview({
  state,
  onOpenFinding,
  onView,
}: {
  state: ArcadeState;
  onOpenFinding: (id: string) => void;
  onView: (v: "surface" | "findings" | "evidence") => void;
}) {
  const findings: Finding[] = [state.finding, ...state.secondaryFindings];
  const active: FindingStatusish[] = ["reproduced", "analyzing", "awaiting-approval", "remediating", "verifying", "verified"];
  const reproduced = findings.filter((f) => active.includes(f.status)).length;
  const critical = findings.filter((f) => f.severity === "critical").length;
  const verifiedFixes = findings.filter((f) => f.verification.outcome === "verified").length;
  const pending = state.approvals.filter((a) => a.status === "pending").length;
  const running = state.phase !== "idle" && state.phase !== "verified";

  return (
    <div className="space-y-5">
      {/* Status banner */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-white/[0.08] bg-ink-900 px-4 py-3">
        <span className={`h-2.5 w-2.5 rounded-full ${state.phase === "verified" ? "bg-emerald-400" : running ? "bg-amber-400 animate-pulse" : "bg-white/30"}`} />
        <span className="text-[13.5px] font-medium text-white">{PHASE_LABEL[state.phase]}</span>
        <span className="text-[12px] text-white/40">· {state.project.name} · {state.environment.sandboxId}</span>
        {pending > 0 && <Badge tone="violet" className="ml-auto">{pending} awaiting approval</Badge>}
      </div>

      {/* Metrics */}
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">Attack surface</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Endpoints" value={state.project.endpoints} hint="routes discovered" />
          <Metric label="Auth boundaries" value={state.project.authBoundaries} hint="session, jwt, oauth" />
          <Metric label="Integrations" value={state.project.integrations} hint="external services" />
          <Metric label="Privileged ops" value={state.project.privilegedOps} tone="amber" hint="admin / export" />
        </div>
      </div>

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">Verified findings</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="Findings" value={findings.length} hint={`${reproduced} reproduced`} />
          <Metric label="Critical" value={critical} tone="red" hint="needs a fix now" />
          <Metric label="Verified fixes" value={verifiedFixes} tone="green" hint="re-attacked & blocked" />
          <Metric label="Awaiting approval" value={pending} tone="violet" hint="human gate" />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        {/* Flagship finding highlight */}
        <div className="rounded-xl border border-white/[0.08] bg-ink-900 p-5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">Primary finding</span>
            <button onClick={() => onOpenFinding(state.finding.id)} className="flex items-center gap-1 text-[12px] text-emerald-300 hover:text-emerald-200">
              Open <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px] text-white/50">{state.finding.id}</span>
            <SeverityBadge severity={state.finding.severity} />
            <StatusBadge status={state.finding.status} />
          </div>
          <h3 className="mt-2 text-[17px] font-semibold text-white">{state.finding.title}</h3>
          <p className="mt-1.5 text-[13px] leading-6 text-white/60">{state.finding.summary}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => onView("evidence")} className="rounded-lg border border-white/12 px-3 py-1.5 text-[12px] text-white/75 hover:bg-white/[0.05]">
              View evidence
            </button>
            <button onClick={() => onView("surface")} className="rounded-lg border border-white/12 px-3 py-1.5 text-[12px] text-white/75 hover:bg-white/[0.05]">
              Show on attack surface
            </button>
          </div>
          {state.finding.verification.outcome === "verified" && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2 text-[12.5px] text-emerald-200/90">
              <ShieldCheck className="h-4 w-4 text-emerald-400" /> Verified fixed — {state.finding.verification.statusBefore} → {state.finding.verification.statusAfter}
            </div>
          )}
        </div>

        {/* Technologies + posture note */}
        <div className="rounded-xl border border-white/[0.08] bg-ink-900 p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">Application</div>
          <p className="mt-2 text-[12.5px] leading-6 text-white/55">{state.project.description}</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {state.project.technologies.map((t) => (
              <span key={t} className="rounded-md bg-white/[0.05] px-2 py-0.5 text-[11px] text-white/65">{t}</span>
            ))}
          </div>
          <div className="mt-4 border-t border-white/[0.07] pt-3 text-[11px] leading-5 text-white/40">
            Posture is measured, not scored: counts of surface, reproduced findings, and fixes that a separate agent re-attacked and could not break.
          </div>
        </div>
      </div>
    </div>
  );
}

type FindingStatusish = Finding["status"];
