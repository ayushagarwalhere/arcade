"use client";
import { useState } from "react";
import { ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import type { ArcadeState, Finding, RunPhase } from "@arcade/core/types";
import { Badge, SeverityBadge, StatusBadge } from "../atoms";
import DiffView from "../DiffView";
import TimelineList from "../TimelineList";

const TABS = ["Overview", "Attack Path", "Evidence", "Code", "Remediation", "Verification", "Timeline"] as const;
type Tab = (typeof TABS)[number];

const REMEDIATED: RunPhase[] = ["remediating", "testing", "verifying", "verified"];

/** One finding, opened from the sidebar, the Problems panel or the palette. */
export default function Findings({
  state,
  selectedId,
  onOpenFile,
}: {
  state: ArcadeState;
  selectedId: string;
  /** Present when the finding's source file can be opened in the editor. */
  onOpenFile?: (path: string, line: number) => void;
}) {
  const all: Finding[] = [state.finding, ...state.secondaryFindings];
  const finding = all.find((f) => f.id === selectedId) ?? state.finding;
  const isFlagship = finding.id === state.finding.id;
  const [tab, setTab] = useState<Tab>("Overview");

  const fixApproved = isFlagship && REMEDIATED.includes(state.phase);
  const verified = isFlagship && finding.verification.outcome === "verified";

  return (
    <div className="mx-auto max-w-[920px]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12px] text-ade-muted">{finding.id}</span>
          <SeverityBadge severity={finding.severity} />
          <StatusBadge status={finding.status} />
          <span className="ml-auto font-mono text-[11.5px] text-ade-faint">{finding.cwe}</span>
        </div>
        <h1 className="mt-2 text-[20px] font-semibold tracking-tight text-white">{finding.title}</h1>
        <div className="mt-1 font-mono text-[12px] text-ade-muted">{finding.target}</div>

        <div className="scrollbar-none mt-4 flex gap-4 overflow-x-auto border-b border-ade-line">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px whitespace-nowrap border-b pb-2 text-[12.5px] transition ${
                tab === t ? "border-ade-fg text-white" : "border-transparent text-ade-muted hover:text-ade-fg"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="pt-5">
          {tab === "Overview" && (
            <div className="space-y-4">
              <p className="text-[13.5px] leading-6 text-white/75">{finding.summary}</p>
              {finding.description !== finding.summary && <p className="text-[13px] leading-6 text-white/55">{finding.description}</p>}
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
                      <span className={`rounded px-2.5 py-1.5 text-[12px] ${i >= 3 ? "bg-red-500/12 text-red-200 ring-1 ring-red-500/25" : "bg-white/[0.05] text-white/70"}`}>{n}</span>
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
                      <div key={m.title} className={`rounded border px-3.5 py-2.5 ${m.recommended ? "border-emerald-500/25 bg-emerald-500/[0.05]" : "border-ade-line bg-ade-raised"}`}>
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
                <div className="overflow-hidden rounded border border-ade-line">
                  <div className="border-b border-ade-line bg-white/[0.02] px-3 py-2 text-[11px] uppercase tracking-wide text-white/40">Request</div>
                  <div className="space-y-0.5 p-3 font-mono text-[12px]">
                    <div><span className="text-emerald-400">{finding.evidence.method}</span> <span className="text-white/85">{finding.evidence.target}</span></div>
                    {finding.evidence.requestHeaders.map((h) => (
                      <div key={h} className="text-white/50">{h}</div>
                    ))}
                  </div>
                </div>
                <div className="overflow-hidden rounded border border-red-500/20">
                  <div className="flex items-center border-b border-ade-line bg-white/[0.02] px-3 py-2 text-[11px] uppercase tracking-wide text-white/40">
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
              <div className="overflow-hidden rounded border border-ade-line">
                <div className="flex items-center border-b border-ade-line bg-white/[0.02] px-3 py-2 font-mono text-[12px] text-white/60">
                  {finding.vulnerableCode.path}
                  {onOpenFile && (
                    <button
                      onClick={() => onOpenFile(finding.vulnerableCode.path, (finding.vulnerableCode.lines.find((l) => l.flagged) ?? finding.vulnerableCode.lines[0]).no)}
                      className="ml-auto font-sans text-[12px] text-ade-fg/85 transition hover:text-white"
                    >
                      Open in editor
                    </button>
                  )}
                </div>
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
                <div className="rounded border border-ade-line bg-ade-raised px-4 py-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-white/40">Root cause</div>
                  <p className="mt-1 text-[13px] leading-6 text-white/70">{finding.remediation.rootCause}</p>
                </div>
                <DiffView files={finding.remediation.files} commit={finding.remediation.commit} summary={finding.remediation.summary} />
                <div className="rounded border border-ade-line bg-ade-raised p-4">
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
                <div className="flex items-center gap-3 rounded-md border border-emerald-500/25 bg-emerald-500/[0.06] px-4 py-3.5">
                  <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  <div>
                    <div className="text-[15px] font-semibold text-emerald-300">Verified</div>
                    <div className="text-[12px] text-white/55">{finding.verification.replaySummary}</div>
                  </div>
                  {finding.verification.independent && <Badge tone="violet" className="ml-auto">Independent verifier</Badge>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded border border-ade-line bg-ade-raised p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40">Original exploit</div>
                    <div className="mt-2 flex items-center gap-3 font-mono text-[15px]">
                      <span className="text-red-300 line-through">{finding.verification.statusBefore}</span>
                      <ArrowRight className="h-4 w-4 text-white/40" />
                      <span className="font-bold text-emerald-300">{finding.verification.statusAfter}</span>
                    </div>
                  </div>
                  <div className="rounded border border-ade-line bg-ade-raised p-4">
                    <div className="text-[11px] uppercase tracking-wide text-white/40">Adversarial replay</div>
                    <div className="mt-2 text-[13px] text-white/75">
                      {finding.verification.mutatedSucceeded}/{finding.verification.mutatedPayloads} mutated payloads succeeded ·{" "}
                      {finding.verification.regressionPassed}/{finding.verification.regressionTotal} tests pass
                    </div>
                  </div>
                </div>
              </div>
            ) : finding.status === "verification-failed" ? (
              <div className="flex items-center gap-3 rounded-md border border-red-500/25 bg-red-500/[0.06] px-4 py-3.5">
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
    <div className="rounded border border-ade-line bg-ade-raised px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-white/35">{k}</div>
      <div className={`mt-0.5 text-[12.5px] capitalize text-white/80 ${mono ? "font-mono normal-case" : ""}`}>{v}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded border border-dashed border-ade-line bg-ade-raised p-8 text-center text-[13px] text-white/50">{text}</div>;
}
