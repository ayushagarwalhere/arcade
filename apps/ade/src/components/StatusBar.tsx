"use client";
import { CircleX, GitBranch, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import type { ArcadeState, Finding } from "@arcade/core/types";
import { formatBytes } from "@arcade/core/fs";
import type { FileInfo } from "./CodeView";
import { PHASE_LABEL } from "./views/Overview";

const ITEM = "flex h-full items-center gap-1 px-2 transition hover:bg-white/[0.07]";

export default function StatusBar({
  state,
  findings,
  running,
  progress,
  snapshot,
  file,
  onProblems,
  onProviders,
}: {
  /** An opened folder is showing reference data rather than a live scan of it. */
  snapshot: boolean;
  /** The file in the active editor tab, once it has loaded. */
  file?: FileInfo;
  state: ArcadeState;
  findings: Finding[];
  running: boolean;
  progress: number;
  onProblems: () => void;
  onProviders: () => void;
}) {
  const errors = findings.filter((f) => f.severity === "critical" || f.severity === "high").length;
  const provider = state.providers.find((p) => p.connected)?.name ?? "No agent connected";
  const verified = state.phase === "verified";

  return (
    <footer className="flex h-[22px] shrink-0 items-center border-t border-ade-line bg-ade-chrome text-[11.5px] text-ade-muted">
      <span className="flex h-full items-center gap-1.5 bg-emerald-500/15 px-2.5 font-mono text-[11px] text-emerald-300" title="Isolated, disposable target">
        <ShieldCheck className="h-3 w-3" /> {state.environment.sandboxId}
      </span>
      <span className={ITEM}>
        <GitBranch className="h-3 w-3" /> {state.finding.remediation.branch}
      </span>
      <button onClick={onProblems} className={ITEM} title="Show problems">
        <CircleX className="h-3 w-3" /> {errors}
        <TriangleAlert className="ml-1 h-3 w-3" /> {findings.length - errors}
      </button>
      <span className="flex min-w-0 items-center gap-1.5 px-2">
        {running && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
        <span className={`truncate ${verified ? "text-emerald-300/90" : ""}`}>{PHASE_LABEL[state.phase]}</span>
        {running && <span className="font-mono text-[10.5px] text-ade-faint">{Math.round(progress * 100)}%</span>}
      </span>

      <span className="flex-1" />
      {file && (
        <>
          {file.lines != null && <span className="hidden h-full items-center px-2 lg:flex">{file.lines.toLocaleString()} lines</span>}
          <span className="hidden h-full items-center px-2 lg:flex">{formatBytes(file.size)}</span>
          <span className="hidden h-full items-center px-2 xl:flex">UTF-8</span>
          <span className="hidden h-full items-center px-2 md:flex">{file.language}</span>
          <span className="hidden h-full items-center px-2 xl:flex" title="Files open read-only in this build">Read-only</span>
        </>
      )}
      {snapshot && (
        <span className="hidden h-full items-center px-2 text-amber-200/80 md:flex" title="Live scanning isn't wired in this build — findings come from the reference snapshot.">
          snapshot data
        </span>
      )}
      <span className="hidden h-full items-center px-2 font-mono text-[11px] md:flex">network: {state.environment.network}</span>
      <button onClick={onProviders} className={`${ITEM} hidden sm:flex`} title="Agent providers">
        {provider}
      </button>
      <span className="hidden h-full items-center px-2.5 sm:flex">Arcade ADE 0.1.0</span>
    </footer>
  );
}
