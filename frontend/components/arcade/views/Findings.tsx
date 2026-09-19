"use client";
import { useState } from "react";
import { ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import type { ArcadeState, Finding, RunPhase } from "@/lib/arcade/types";
import { Badge, SeverityBadge, StatusBadge } from "../atoms";
import DiffView from "../DiffView";
import TimelineList from "../TimelineList";

const TABS = ["Overview", "Attack Path", "Evidence", "Code", "Remediation", "Verification", "Timeline"] as const;
type Tab = (typeof TABS)[number];

const REMEDIATED: RunPhase[] = ["remediating", "testing", "verifying", "verified"];

export default function Findings({
  state,
  selectedId,
  onSelect,
}: {
  state: ArcadeState;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const all: Finding[] = [state.finding, ...state.secondaryFindings];
  const finding = all.find((f) => f.id === selectedId) ?? state.finding;
  const isFlagship = finding.id === state.finding.id;
  const [tab, setTab] = useState<Tab>("Overview");

  const fixApproved = isFlagship && REMEDIATED.includes(state.phase);
  const verified = isFlagship && finding.verification.outcome === "verified";

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* List */}
      <div className="space-y-1.5">
        <div className="px-1 pb-1 text-[11px] text-white/45">{all.length} findings</div>
        {all.map((f) => (
          <button
            key={f.id}
            onClick={() => onSelect(f.id)}
            className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
              f.id === selectedId ? "border-white/25 bg-white/[0.05]" : "border-white/[0.07] bg-ink-900 hover:border-white/15"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] text-white/40">{f.id}</span>
              <SeverityBadge severity={f.severity} />
            </div>
            <div className="mt-1.5 text-[13px] font-medium leading-5 text-white/90">{f.title}</div>
            <div className="mt-1.5 flex items-center gap-2">
              <StatusBadge status={f.status} />
              <span className="truncate font-mono text-[10.5px] text-white/35">{f.target}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Detail */}
      <div className="min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-ink-900">
        <div className="border-b border-white/[0.07] px-5 py-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono text-[13px] text-white/50">{finding.id}</span>
            <SeverityBadge severity={finding.severity} />
            <StatusBadge status={finding.status} />
            <span className="ml-auto font-mono text-[11px] text-white/40">{finding.cwe}</span>
          </div>
          <h2 className="mt-2 text-[18px] font-semibold text-white">{finding.title}</h2>
          <div className="mt-1 font-mono text-[12px] text-white/50">{finding.target}</div>
        </div>

        <div className="scrollbar-none flex gap-1 overflow-x-auto border-b border-white/[0.07] px-3">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`whitespace-nowrap px-3 py-2.5 text-[12.5px] transition ${
                tab === t ? "border-b-2 border-emerald-400 text-white" : "text-white/45 hover:text-white/80"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "Overview" && (
            <div className="space-y-4">
              <p className="text-[13.5px] leading-6 text-white/75">{finding.summary}</p>
              <p className="text-[13px] leading-6 text-white/55">{finding.description}</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Fact k="Severity" v={finding.severity} />
                <Fact k="Discovered by" v={finding.agent} />
                <Fact k="Target" v={finding.target} mono />
                <Fact k="Created" v={finding.createdAt} />
              </div>
            </div>
          )}

          {tab === "Attack Path" && (
            <div className="space-y-4">
              {finding.attackNarrative ? (
                <p className="text-[13.5px] leading-6 text-white/75">{finding.attackNarrative}</p>
              ) : (
                <p className="text-[13px] text-white/50">{finding.summary}</p>
              )}
              {isFlagship && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {["User", "Browser", "API Gateway", "Admin Export", "PostgreSQL"].map((n, i, arr) => (
                    <span key={n} className="flex items-center gap-1.5">
                      <span className={`rounded-lg px-2.5 py-1.5 text-[12px] ${i >= 3 ? "bg-red-500/12 text-red-200 ring-1 ring-red-500/25" : "bg-white/[0.05] text-white/70"}`}>{n}</span>
                      {i < arr.length - 1 && <ArrowRight className="h-3.5 w-3.5 text-white/30" />}
                    </span>
                  ))}
                </div>
              )}
              {isFlagship && (
                <div>
                  <div className="mb-2 text-[12px] font-semibold text-white/60">Mitigations ranked by the defender</div>
                  <div className="space-y-2">
                    {finding.mitigations.map((m) => (
                      <div key={m.title} className={`rounded-lg border px-3.5 py-2.5 ${m.recommended ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-white/[0.07] bg-ink-850"}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-white/90">{m.title}</span>
                          {m.recommended && <Badge tone="green">Recommended</Badge>}
                          <Badge tone="neutral" className="ml-auto capitalize">
                            {m.effort} effort
                          </Badge>
                        </div>
                        <p className="mt-1 text-[12px] leading-5 text-white/55">{m.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === "Evidence" &&
            (finding.evidence.artifact ? (
              <div className="space-y-3">
                <div className="overflow-hidden rounded-lg border border-white/[0.08]">
                  <div className="border-b border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[11px] uppercase tracking-wide text-white/40">Request</div>
                  <div className="space-y-0.5 p-3 font-mono text-[12px]">
                    <div><span className="text-emerald-400">{finding.evidence.method}</span> <span className="text-white/85">{finding.evidence.target}</span></div>
                    {finding.evidence.requestHeaders.map((h) => (
                      <div key={h} className="text-white/50">{h}</div>
                    ))}
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border border-red-500/20">
                  <div className="flex items-center border-b border-white/[0.07] bg-white/[0.02] px-3 py-2 text-[11px] uppercase tracking-wide text-white/40">
                    Response<span className="ml-auto font-mono font-bold text-red-300">{finding.evidence.statusBefore}</span>
                  </div>
                  <div className="p-3 font-mono text-[12px] leading-6 text-white/75">{finding.evidence.responseBody}</div>
                </div>
                <div className="font-mono text-[11px] text-white/35">{finding.evidence.artifact}</div>
              </div>
            ) : (
              <Empty text="No reproduction captured for this finding yet." />
            ))}

          {tab === "Code" &&
            (finding.vulnerableCode.lines.length ? (
              <div className="overflow-hidden rounded-lg border border-white/[0.08]">
                <div className="border-b border-white/[0.07] bg-white/[0.02] px-3 py-2 font-mono text-[12px] text-white/60">{finding.vulnerableCode.path}</div>
                <div className="font-mono text-[12.5px] leading-[1.85]">
                  {finding.vulnerableCode.lines.map((l) => (
                    <div key={l.no} className={`flex whitespace-pre ${l.flagged ? "bg-red-500/[0.08]" : ""}`}>
                      <span className="w-10 shrink-0 select-none px-2 text-right text-white/25">{l.no}</span>
                      <span className={l.flagged ? "text-red-200 underline decoration-red-400/60 decoration-wavy underline-offset-4" : "text-white/80"}>{l.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Empty text="Vulnerable source not extracted for this finding." />
            ))}

          {tab === "Remediation" &&
            (fixApproved && finding.remediation.files.length ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-white/[0.08] bg-ink-850 px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Root cause</div>
                  <p className="mt-1 text-[13px] leading-6 text-white/70">{finding.remediation.rootCause}</p>
                </div>
                <DiffView files={finding.remediation.files} commit={finding.remediation.commit} summary={finding.remediation.summary} />
                <div className="rounded-lg border border-white/[0.08] bg-ink-850 p-4">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">Tests</div>
                  <div className="space-y-1.5">
                    {finding.remediation.tests.map((t) => (
                      <div key={t.name} className="flex items-center gap-2 text-[12.5px]">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-white/80">{t.name}</span>
                        <span className="font-mono text-[11px] text-white/35">{t.suite}</span>
                        <span className="ml-auto font-mono text-[11px] text-white/40">{t.ms}ms</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <Empty text={isFlagship ? "The fix is proposed but not yet approved. Approve it to generate the diff and run tests." : "This finding has no approved remediation yet."} />
            ))}

          {tab === "Verification" &&
            (verified ? (
              <div className="space-y-4">
                <div className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3.5">
                  <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  <div>
                    <div className="text-[15px] font-semibold text-emerald-300">Verified</div>
                    <div className="text-[12px] text-white/55">{finding.verification.replaySummary}</div>
                  </div>
                  {finding.verification.independent && <Badge tone="violet" className="ml-auto">Independent verifier</Badge>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-white/[0.08] bg-ink-850 p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40">Original exploit</div>
                    <div className="mt-2 flex items-center gap-3 font-mono text-[15px]">
                      <span className="text-red-300 line-through">{finding.verification.statusBefore}</span>
                      <ArrowRight className="h-4 w-4 text-white/40" />
                      <span className="font-bold text-emerald-300">{finding.verification.statusAfter}</span>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/[0.08] bg-ink-850 p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40">Adversarial replay</div>
                    <div className="mt-2 text-[13px] text-white/75">
                      {finding.verification.mutatedSucceeded}/{finding.verification.mutatedPayloads} mutated payloads succeeded ·{" "}
                      {finding.verification.regressionPassed}/{finding.verification.regressionTotal} tests pass
                    </div>
                  </div>
                </div>
              </div>
            ) : finding.status === "verification-failed" ? (
              <div className="flex items-center gap-3 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3.5">
                <XCircle className="h-6 w-6 text-red-400" />
                <div className="text-[14px] text-red-200">Verification failed — the original exploit still succeeds. Finding stays open.</div>
              </div>
            ) : (
              <Empty text="Not verified yet. A separate agent re-runs the original attack after the fix." />
            ))}

          {tab === "Timeline" && <TimelineList events={finding.timeline} empty="No timeline events for this finding yet." />}
        </div>
      </div>
    </div>
  );
}

function Fact({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-ink-850 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-white/35">{k}</div>
      <div className={`mt-0.5 text-[12.5px] capitalize text-white/80 ${mono ? "font-mono normal-case" : ""}`}>{v}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-white/12 bg-ink-850 p-8 text-center text-[13px] text-white/50">{text}</div>;
}
