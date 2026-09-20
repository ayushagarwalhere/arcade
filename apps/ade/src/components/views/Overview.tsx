"use client";
import { ArrowRight, Check, Loader2, ShieldCheck } from "lucide-react";
import type { AgentKind, ArcadeState, Finding, RunPhase } from "@arcade/core/types";
import { AGENT_ICON, SEVERITY, SeverityBadge, StatusBadge } from "../atoms";

export const PHASE_LABEL: Record<RunPhase, string> = {
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

const LOOP: { kind: AgentKind; step: string }[] = [
  { kind: "mapper", step: "Map" },
  { kind: "attacker", step: "Attack" },
  { kind: "defender", step: "Defend" },
  { kind: "remediator", step: "Remediate" },
  { kind: "verifier", step: "Verify" },
];

function Stats({ title, rows }: { title: string; rows: [string, string | number, string?][] }) {
  return (
    <div>
      <h3 className="pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ade-muted">{title}</h3>
      <dl className="border-t border-ade-line">
        {rows.map(([k, v, tone]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 border-b border-ade-line py-1.5 text-[13px]">
            <dt className="text-ade-fg/75">{k}</dt>
            <dd className={`font-mono text-[12.5px] ${tone ?? "text-white"}`}>{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

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
  const active: Finding["status"][] = ["reproduced", "analyzing", "awaiting-approval", "remediating", "verifying", "verified"];
  const reproduced = findings.filter((f) => active.includes(f.status)).length;
  const critical = findings.filter((f) => f.severity === "critical").length;
  const verifiedFixes = findings.filter((f) => f.verification.outcome === "verified").length;
  const pending = state.approvals.filter((a) => a.status === "pending").length;
  const f = state.finding;

  return (
    <div className="mx-auto max-w-[860px]">
      <div className="font-mono text-[11.5px] text-ade-muted">
        {state.project.repo} · {state.environment.sandboxId}
      </div>
      <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-white">{PHASE_LABEL[state.phase]}</h1>
      <p className="mt-1.5 text-[13px] leading-6 text-ade-muted">{state.project.description}</p>

      {/* The loop */}
      <ol className="mt-5 grid grid-cols-5 overflow-hidden rounded-md border border-ade-line">
        {LOOP.map(({ kind, step }, i) => {
          const a = state.agents[kind];
          const Icon = AGENT_ICON[kind];
          const live = a.status === "running" || a.status === "awaiting-approval";
          return (
            <li key={kind} className={`min-w-0 px-3 py-2.5 ${i ? "border-l border-ade-line" : ""} ${live ? "bg-ade-raised" : "bg-ade-base"}`}>
              <div className="flex items-center gap-1.5 text-[12.5px]">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${a.status === "done" ? "text-emerald-400" : live ? "text-amber-200" : "text-ade-faint"}`} />
                <span className={`truncate font-medium ${a.status === "idle" ? "text-ade-muted" : "text-white"}`}>{step}</span>
                <span className="flex-1" />
                {a.status === "done" && <Check className="h-3 w-3 shrink-0 text-emerald-400" />}
                {a.status === "running" && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-amber-200" />}
              </div>
              <div className="mt-1 truncate text-[11.5px] text-ade-muted" title={a.task}>
                {a.task}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="mt-7 grid gap-x-10 gap-y-6 sm:grid-cols-2">
        <Stats
          title="Attack surface"
          rows={[
            ["Endpoints", state.project.endpoints],
            ["Auth boundaries", state.project.authBoundaries],
            ["Integrations", state.project.integrations],
            ["Privileged operations", state.project.privilegedOps, "text-amber-200"],
          ]}
        />
        <Stats
          title="Findings"
          rows={[
            ["Open", `${findings.length} · ${reproduced} reproduced`],
            ["Critical", critical, "text-red-300"],
            ["Verified fixes", verifiedFixes, "text-emerald-300"],
            ["Awaiting approval", pending, pending ? "text-violet-300" : undefined],
          ]}
        />
      </div>

      {/* Primary finding */}
      <h3 className="mt-7 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ade-muted">Primary finding</h3>
      <div className="relative overflow-hidden rounded-md border border-ade-line bg-ade-base py-3.5 pl-5 pr-4">
        <span className={`absolute inset-y-0 left-0 w-[3px] ${SEVERITY[f.severity].dot}`} />
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px] text-ade-muted">{f.id}</span>
          <SeverityBadge severity={f.severity} />
          <StatusBadge status={f.status} />
          <span className="ml-auto font-mono text-[11.5px] text-ade-faint">{f.target}</span>
        </div>
        <button onClick={() => onOpenFinding(f.id)} className="mt-2 block text-left text-[15px] font-semibold text-white hover:underline">
          {f.title}
        </button>
        <p className="mt-1 text-[13px] leading-6 text-ade-fg/75">{f.summary}</p>
        {f.verification.outcome === "verified" && (
          <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-emerald-300/90">
            <ShieldCheck className="h-3.5 w-3.5" /> Verified fixed — {f.verification.statusBefore} → {f.verification.statusAfter}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
          {(
            [
              ["Open finding", () => onOpenFinding(f.id)],
              ["View evidence", () => onView("evidence")],
              ["Show on attack surface", () => onView("surface")],
            ] as const
          ).map(([label, go]) => (
            <button key={label} onClick={go} className="flex items-center gap-1 text-ade-fg/85 transition hover:text-white">
              {label} <ArrowRight className="h-3 w-3" />
            </button>
          ))}
        </div>
      </div>

      <h3 className="mt-7 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ade-muted">Stack</h3>
      <div className="flex flex-wrap gap-1.5">
        {state.project.technologies.map((t) => (
          <span key={t} className="rounded border border-ade-line px-1.5 py-0.5 font-mono text-[11.5px] text-ade-fg/80">
            {t}
          </span>
        ))}
      </div>
      <p className="mt-4 text-[12px] leading-5 text-ade-faint">
        Posture is measured, not scored: counts of surface, reproduced findings, and fixes that a separate agent re-attacked and could not break.
      </p>
    </div>
  );
}
