"use client";
import { CircleX, GitBranch, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import type { ArcadeState, Finding } from "@arcade/core/types";
import type { GitInfo } from "@arcade/core/desktop";
import { formatBytes } from "@arcade/core/fs";
import type { FileInfo } from "./CodeView";
import { phaseLabel } from "./views/Overview";

const ITEM = "flex h-full items-center gap-1 px-2 transition hover:bg-white/[0.07]";

export default function StatusBar({
  state,
  findings,
  running,
  progress,
  mode,
  git,
  changeCount,
  agentName,
  file,
  cursor,
  editable,
  unsaved,
  onProblems,
  onScm,
  onProviders,
}: {
  /** What the findings on screen are: the bundled sample, a project not assessed yet, or a real assessment. */
  mode: "sample" | "unassessed" | "live";
  /** The opened folder's repository, when it is one. */
  git: GitInfo | null;
  changeCount: number;
  /** The installed agent the pane will run; null when there is none. */
  agentName: string | null;
  /** The file in the active editor tab, once it has loaded. */
  file?: FileInfo;
  cursor?: { line: number; column: number };
  editable: boolean;
  unsaved: number;
  state: ArcadeState;
  findings: Finding[];
  running: boolean;
  progress: number;
  onProblems: () => void;
  onScm: () => void;
  onProviders: () => void;
}) {
  const errors = findings.filter((f) => f.severity === "critical" || f.severity === "high").length;
  const verified = state.phase === "verified";

  return (
    <footer className="flex h-[22px] shrink-0 items-center border-t border-ade-line bg-ade-chrome text-[11.5px] text-ade-muted">
      <span
        className={`flex h-full items-center gap-1.5 px-2.5 font-mono text-[11px] ${mode === "sample" ? "bg-amber-400/15 text-amber-200" : "bg-emerald-500/15 text-emerald-300"}`}
        title={mode === "sample" ? "A scripted walkthrough on a bundled example project. Nothing is executing." : "Findings come from static analysis of this project's source. Nothing is executed during a scan."}
      >
        <ShieldCheck className="h-3 w-3" /> {mode === "sample" ? "sample run" : "static analysis"}
      </span>
      {git?.repo && (
        <button onClick={onScm} className={ITEM} title="Source control">
          <GitBranch className="h-3 w-3" /> {git.detached ? `detached @ ${git.head}` : git.branch}
          {changeCount > 0 && <span className="text-amber-300/90">●{changeCount}</span>}
          {(git.ahead ?? 0) > 0 && <span>↑{git.ahead}</span>}
          {(git.behind ?? 0) > 0 && <span>↓{git.behind}</span>}
        </button>
      )}
      {mode !== "unassessed" && (
        <button onClick={onProblems} className={ITEM} title="Show problems">
          <CircleX className="h-3 w-3" /> {errors}
          <TriangleAlert className="ml-1 h-3 w-3" /> {findings.length - errors}
        </button>
      )}
      <span className="flex min-w-0 items-center gap-1.5 px-2">
        {running && <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
        <span className={`truncate ${verified ? "text-emerald-300/90" : ""}`}>{mode === "unassessed" ? "Not assessed yet" : phaseLabel(state)}</span>
        {running && progress < 1 && <span className="font-mono text-[10.5px] text-ade-faint">{Math.round(progress * 100)}%</span>}
      </span>

      <span className="flex-1" />
      {unsaved > 0 && <span className="hidden h-full items-center px-2 text-amber-200/90 md:flex">{unsaved} unsaved</span>}
      {file && (
        <>
          {cursor && (
            <span className="hidden h-full items-center px-2 md:flex">
              Ln {cursor.line}, Col {cursor.column}
            </span>
          )}
          {file.lines != null && <span className="hidden h-full items-center px-2 xl:flex">{file.lines.toLocaleString()} lines</span>}
          <span className="hidden h-full items-center px-2 lg:flex">{formatBytes(file.size)}</span>
          <span className="hidden h-full items-center px-2 xl:flex">UTF-8</span>
          <span className="hidden h-full items-center px-2 md:flex">{file.language}</span>
          {!editable && (
            <span className="hidden h-full items-center px-2 xl:flex" title="This workspace can't be written to from here (a repository read from GitHub, or the bundled sample)">
              Read-only
            </span>
          )}
        </>
      )}
      <button onClick={onProviders} className={`${ITEM} hidden sm:flex`} title="Agents">
        {agentName ?? "No agent on this machine"}
      </button>
      <span className="hidden h-full items-center px-2.5 sm:flex">Arcade 0.2.0</span>
    </footer>
  );
}
