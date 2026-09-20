"use client";
import { useRef, useState } from "react";
import { ChevronRight, Play, ShieldAlert, ShieldCheck } from "lucide-react";
import type { WorkspaceFs } from "@arcade/core/fs";
import { runAssessment, type Assessment, type PipelineProgress } from "@arcade/orchestrator/pipeline";
import { AGENT_META } from "@arcade/core/demo";
import { AGENT_ICON, SEVERITY } from "./atoms";
import type { AgentKind } from "@arcade/core/types";

const AGENT_ORDER: AgentKind[] = ["mapper", "attacker", "defender", "remediator", "verifier"];

type Profile = "full" | "scan-only";
type Scope = "all" | "source";

const CARD =
  "flex-1 rounded-md border px-3.5 py-3 text-left transition focus-visible:outline-none disabled:opacity-50";
const on = "border-white/25 bg-ade-raised";
const off = "border-ade-line bg-ade-base hover:border-white/15 hover:bg-ade-raised";

/**
 * The step between importing a folder and the workbench: choose how the
 * sandboxed assessment runs, then launch all five agents against the code.
 */
export default function AssessmentLaunch({
  project,
  fs,
  onLaunch,
  onDismiss,
}: {
  project: { name: string; path: string };
  fs: WorkspaceFs;
  onLaunch: (assessment: Assessment) => void;
  onDismiss: () => void;
}) {
  const [profile, setProfile] = useState<Profile>("full");
  const [scope, setScope] = useState<Scope>("source");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<PipelineProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const launch = async () => {
    setError(null);
    setBusy(true);
    cancelled.current = false;
    try {
      const assessment = await runAssessment(
        fs,
        { profile, scope, projectName: project.name, projectPath: project.path },
        (p) => !cancelled.current && setProgress(p),
        () => cancelled.current,
      );
      if (!cancelled.current) onLaunch(assessment);
    } catch (e) {
      if (!cancelled.current) setError(e instanceof Error ? e.message : "The assessment could not be started.");
    } finally {
      if (!cancelled.current) setBusy(false);
    }
  };

  const cancel = () => {
    cancelled.current = true;
    setBusy(false);
    setProgress(null);
  };

  const pct = progress && progress.totalFiles ? Math.min(100, Math.round((progress.filesScanned / progress.totalFiles) * 100)) : null;

  return (
    <div className="absolute inset-0 z-40 grid place-items-center overflow-y-auto bg-ade-editor/95 px-6 py-10 backdrop-blur-sm">
      <div className="w-full max-w-[640px] animate-fade-in">
        <div className="flex items-center gap-2.5">
          <ShieldAlert className="h-5 w-5 text-ade-fg" strokeWidth={1.7} />
          <h1 className="text-[19px] font-semibold tracking-tight text-white">Assess this workspace</h1>
        </div>
        <p className="mt-1.5 text-[13px] text-ade-muted">
          Arcade will map <span className="text-ade-fg/85">{project.name}</span>, reproduce weaknesses in a sandbox, and propose fixes — pausing for your approval before anything changes.
        </p>

        {/* Sandbox guarantee */}
        <div className="mt-5 flex items-start gap-3 rounded-md border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-3">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" strokeWidth={1.8} />
          <p className="text-[12.5px] leading-5 text-emerald-100/80">
            <span className="font-semibold text-emerald-200">Sandboxed &amp; read-only.</span> The assessment analyses your source in an isolated process. It never executes your code, changes files, or makes network calls. Fixes are proposals; applying or merging them waits behind an approval gate.
          </p>
        </div>

        {!busy ? (
          <>
            {/* Profile */}
            <div className="mt-6">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Assessment</span>
              <div className="mt-2 flex gap-2">
                <button onClick={() => setProfile("full")} className={`${CARD} ${profile === "full" ? on : off}`}>
                  <span className="block text-[13px] text-ade-fg">Full loop</span>
                  <span className="mt-0.5 block text-[11.5px] leading-4 text-ade-faint">Map → attack → fix → verify, all five agents</span>
                </button>
                <button onClick={() => setProfile("scan-only")} className={`${CARD} ${profile === "scan-only" ? on : off}`}>
                  <span className="block text-[13px] text-ade-fg">Scan only</span>
                  <span className="mt-0.5 block text-[11.5px] leading-4 text-ade-faint">Map &amp; attack — find and report, no fixes</span>
                </button>
              </div>
            </div>

            {/* Scope */}
            <div className="mt-4">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">Scope</span>
              <div className="mt-2 flex gap-2">
                <button onClick={() => setScope("source")} className={`${CARD} ${scope === "source" ? on : off}`}>
                  <span className="block text-[13px] text-ade-fg">Source only</span>
                  <span className="mt-0.5 block text-[11.5px] leading-4 text-ade-faint">Skip tests, fixtures &amp; docs</span>
                </button>
                <button onClick={() => setScope("all")} className={`${CARD} ${scope === "all" ? on : off}`}>
                  <span className="block text-[13px] text-ade-fg">Whole workspace</span>
                  <span className="mt-0.5 block text-[11.5px] leading-4 text-ade-faint">Every analysable file</span>
                </button>
              </div>
            </div>

            {/* Agent lineup */}
            <div className="mt-5 rounded-md border border-ade-line bg-ade-base px-3.5 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">The agents that will run</span>
              <div className="mt-2.5 flex flex-wrap items-center gap-x-1 gap-y-2">
                {AGENT_ORDER.map((kind, i) => {
                  const Icon = AGENT_ICON[kind];
                  const dim = profile === "scan-only" && (kind === "remediator" || kind === "verifier");
                  return (
                    <span key={kind} className="flex items-center gap-1">
                      <span className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-[12px] ${dim ? "opacity-35" : "bg-white/[0.05] text-ade-fg/85"}`} title={AGENT_META[kind].role}>
                        <Icon className="h-3.5 w-3.5 text-ade-muted" />
                        {AGENT_META[kind].name}
                      </span>
                      {i < AGENT_ORDER.length - 1 && <ChevronRight className="h-3 w-3 text-ade-faint" />}
                    </span>
                  );
                })}
              </div>
            </div>

            {error && <p className="mt-4 text-[12.5px] text-amber-200/90">{error}</p>}

            <div className="mt-6 flex items-center gap-2">
              <button
                onClick={launch}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-ade-fg px-4 text-[13px] font-medium text-black transition hover:bg-white"
              >
                <Play className="h-3.5 w-3.5" strokeWidth={2.2} />
                Launch assessment
              </button>
              <button onClick={onDismiss} className="h-9 rounded-md px-3 text-[13px] text-ade-muted transition hover:text-ade-fg">
                Not now — just browse
              </button>
            </div>
          </>
        ) : (
          /* Running */
          <div className="mt-6 rounded-md border border-ade-line bg-ade-base px-4 py-5">
            <div className="flex items-center gap-3">
              <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-ade-fg">{progress?.label ?? "Starting…"}</div>
                <div className="mt-0.5 font-mono text-[11.5px] text-ade-faint">
                  {progress ? `${progress.filesScanned} files · ${progress.findings} findings` : "preparing sandbox"}
                </div>
              </div>
              <button onClick={cancel} className="h-7 shrink-0 rounded px-2.5 text-[12px] text-ade-muted transition hover:text-ade-fg">
                Cancel
              </button>
            </div>
            <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className={`h-full rounded-full bg-amber-400/70 transition-all duration-300 ${pct == null ? "w-1/3 animate-pulse" : ""}`}
                style={pct == null ? undefined : { width: `${pct}%` }}
              />
            </div>
            <p className="mt-3 text-[11.5px] leading-4 text-ade-faint">
              Reading your source statically. Nothing is executed and no files are modified.
            </p>
          </div>
        )}

        {/* Severity legend — quietly sets expectations for the findings to come. */}
        <div className="mt-5 flex items-center gap-3 text-[11px] text-white/40">
          {(Object.keys(SEVERITY) as (keyof typeof SEVERITY)[]).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY[s].dot}`} />
              {SEVERITY[s].label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
