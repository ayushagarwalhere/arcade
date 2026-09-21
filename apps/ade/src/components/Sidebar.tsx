"use client";
import { useState } from "react";
import {
  Activity as ActivityIcon,
  ChevronDown,
  ChevronRight,
  FileSearch,
  Files,
  GitBranch,
  GitCompareArrows,
  Globe,
  House,
  LayoutDashboard,
  ListChecks,
  Loader2,
  Network,
  Plug,
  Search,
  Settings,
  ShieldAlert,
} from "lucide-react";
import type { RunnableAgent } from "@arcade/core/desktop";
import type { Git } from "@/hooks/useGit";
import ScmPanel from "./ScmPanel";
import SettingsPanel from "./SettingsPanel";
import type { ArcadeState, Finding, RemediationFile } from "@arcade/core/types";
import type { WorkspaceFs } from "@arcade/core/fs";
import type { AgentConnection } from "@arcade/core/agent-connections";
import type { AgentConnections } from "@/hooks/useAgentConnections";
import { SEVERITY } from "./atoms";
import FileTree, { type FileDecoration } from "./FileTree";
import SearchPanel from "./SearchPanel";
import { SITE } from "@arcade/ui/lib/site";

export type View = "overview" | "surface" | "findings" | "evidence" | "timeline" | "browser" | "diff";

export type Activity = "explorer" | "search" | "findings" | "scm" | "providers" | "settings";

/** The open workspace's files: null while resolving, "none" when they can't be read here. */
export interface WorkspaceFiles {
  fs: WorkspaceFs | null | "none";
  /** Every indexed file path, for search and quick open. */
  index: string[];
  indexing: boolean;
  activePath: string | null;
  decorations: Record<string, FileDecoration>;
  onOpenFile: (path: string, opts?: { preview?: boolean; line?: number }) => void;
  /** Bumped when files changed on disk outside the tree. */
  refreshKey: number;
  /** The explorer created, renamed or deleted something. */
  onChanged: () => void;
  onRemoved: (path: string) => void;
}

export const VIEW_META: Record<View, { label: string; Icon: typeof LayoutDashboard }> = {
  overview: { label: "Overview", Icon: LayoutDashboard },
  surface: { label: "Attack Surface", Icon: Network },
  findings: { label: "Findings", Icon: ListChecks },
  evidence: { label: "Evidence", Icon: FileSearch },
  timeline: { label: "Timeline", Icon: ActivityIcon },
  browser: { label: "Browser", Icon: Globe },
  diff: { label: "Changes", Icon: GitCompareArrows },
};

const ARTIFACTS: View[] = ["overview", "surface", "evidence", "timeline", "browser"];

const ACTIVITIES: { id: Activity; label: string; Icon: typeof LayoutDashboard }[] = [
  { id: "explorer", label: "Explorer", Icon: Files },
  { id: "search", label: "Search", Icon: Search },
  { id: "findings", label: "Findings", Icon: ShieldAlert },
  { id: "scm", label: "Source Control", Icon: GitBranch },
  { id: "providers", label: "Agents", Icon: Plug },
  { id: "settings", label: "Settings", Icon: Settings },
];

/* ------------------------------------------------------------ activity bar */

export function ActivityBar({
  activity,
  sidebarOpen,
  onActivity,
  findingCount,
  changeCount,
}: {
  activity: Activity;
  sidebarOpen: boolean;
  onActivity: (a: Activity) => void;
  findingCount: number;
  changeCount: number;
}) {
  return (
    <nav className="flex h-full w-11 shrink-0 flex-col items-center border-r border-ade-line bg-ade-chrome py-1">
      {ACTIVITIES.map(({ id, label, Icon }) => {
        const active = sidebarOpen && activity === id;
        const badge = id === "findings" ? findingCount : id === "scm" ? changeCount : 0;
        return (
          <button
            key={id}
            title={label}
            aria-label={label}
            onClick={() => onActivity(id)}
            // Settings sits at the foot of the bar, where an editor keeps it.
            className={`relative grid h-10 w-full place-items-center transition ${id === "settings" ? "mt-auto" : ""} ${active ? "text-white" : "text-ade-faint hover:text-ade-fg"}`}
          >
            {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-r bg-white" />}
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
            {badge > 0 && (
              <span className="absolute right-1.5 top-1.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-ade-fg px-0.5 text-[9px] font-semibold leading-none text-black">
                {badge}
              </span>
            )}
          </button>
        );
      })}
      <a
        href={SITE.home}
        title="Back to arcade.dev"
        aria-label="Back to arcade.dev"
        className="grid h-10 w-full place-items-center text-ade-faint transition hover:text-ade-fg"
      >
        <House className="h-[18px] w-[18px]" strokeWidth={1.6} />
      </a>
    </nav>
  );
}

/* ----------------------------------------------------------------- sidebar */

function Section({ title, right, children, defaultOpen = true }: { title: string; right?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-ade-line first:border-t-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex h-[22px] w-full items-center gap-0.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-ade-fg/80 hover:text-white"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className="flex-1 truncate text-left">{title}</span>
        {right}
      </button>
      {open && <div className="pb-2">{children}</div>}
    </div>
  );
}

const ROW = "flex h-[22px] w-full items-center gap-1.5 pl-5 pr-2 text-left text-[13px] transition";
const rowTone = (active: boolean) => (active ? "bg-white/[0.08] text-white" : "text-ade-fg/75 hover:bg-white/[0.04] hover:text-ade-fg");

export function ChangeRow({ file, onClick, className = "" }: { file: RemediationFile; onClick: () => void; className?: string }) {
  const slash = file.path.lastIndexOf("/");
  const name = file.path.slice(slash + 1);
  const dir = slash > 0 ? file.path.slice(0, slash) : "";
  return (
    <button onClick={onClick} title={file.path} className={`${ROW} ${rowTone(false)} ${className}`}>
      <span className="truncate">{name}</span>
      <span className="min-w-0 flex-1 truncate text-[11.5px] text-ade-faint">{dir}</span>
      <span className="font-mono text-[10.5px] text-emerald-400/90">+{file.additions}</span>
      {file.deletions > 0 && <span className="font-mono text-[10.5px] text-red-400/90">−{file.deletions}</span>}
      <span className={`w-3 text-center text-[11px] font-semibold ${file.status === "A" ? "text-emerald-400" : "text-amber-300"}`}>{file.status}</span>
    </button>
  );
}

/** Claude Code or Codex in the desktop app: the row reflects, and changes, the agent's real config. */
function AgentRow({ agent, busy, onChange }: { agent: AgentConnection; busy: boolean; onChange: (id: string, connected: boolean) => void }) {
  if (!agent.installed) {
    return (
      <a href={agent.install} target="_blank" rel="noreferrer" title={`${agent.name} isn't installed on this machine`} className={`${ROW} ${rowTone(false)}`}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/20" />
        <span className="flex-1 truncate">{agent.name}</span>
        <span className="text-[11px] text-ade-faint">install</span>
      </a>
    );
  }
  const on = agent.connected && !agent.outdated;
  return (
    <button
      onClick={() => onChange(agent.id, !on)}
      disabled={busy || !!agent.error}
      title={agent.error ?? (agent.outdated ? `Connected to an Arcade server somewhere else on disk · ${agent.configPath}` : agent.configPath)}
      className={`group ${ROW} ${rowTone(false)}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${agent.error ? "bg-red-400" : agent.outdated ? "bg-amber-300" : on ? "bg-emerald-400" : "bg-white/20"}`} />
      <span className="flex-1 truncate">{agent.name}</span>
      {busy ? (
        <Loader2 className="h-3 w-3 animate-spin text-ade-muted" />
      ) : agent.error ? (
        <span className="text-[11px] text-red-300/90">config unreadable</span>
      ) : on ? (
        <>
          <span className="text-[11px] text-emerald-300/90 group-hover:hidden">connected</span>
          <span className="hidden text-[11px] text-ade-muted group-hover:inline">disconnect</span>
        </>
      ) : (
        <span className={`text-[11px] ${agent.outdated ? "text-amber-200/90" : "text-ade-faint"}`}>{agent.outdated ? "reconnect" : "connect"}</span>
      )}
    </button>
  );
}

export default function Sidebar({
  state,
  activity,
  view,
  onView,
  activeWorkspace,
  onWorkspace,
  findings,
  selectedFinding,
  onOpenFinding,
  changes,
  files,
  agents,
  live,
  sample,
  git,
  runnable,
  onOpenDiff,
  onGitChanged,
}: {
  /** A real project has been assessed (as opposed to the bundled sample playing). */
  live: boolean;
  /** The bundled sample project is open, rather than a folder or repository of the user's. */
  sample: boolean;
  git: Git;
  /** Agent CLIs found on this machine; null in a browser. */
  runnable: RunnableAgent[] | null;
  onOpenDiff: (path: string, staged: boolean) => void;
  onGitChanged: () => void;
  files: WorkspaceFiles;
  state: ArcadeState;
  activity: Activity;
  view: View | null;
  onView: (v: View) => void;
  activeWorkspace: string;
  onWorkspace: (id: string) => void;
  findings: Finding[];
  selectedFinding: string;
  onOpenFinding: (id: string) => void;
  changes: RemediationFile[];
  agents: AgentConnections;
}) {
  const title = ACTIVITIES.find((a) => a.id === activity)!.label;

  return (
    <div className="flex h-full min-w-0 flex-col bg-ade-base">
      <div className="flex h-[35px] shrink-0 items-center px-4 text-[11px] uppercase tracking-wide text-ade-muted">{title}</div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        {activity === "explorer" && (
          <>
            {files.fs && files.fs !== "none" ? (
              <FileTree fs={files.fs} title={state.project.name} activePath={files.activePath} decorations={files.decorations} refreshKey={files.refreshKey} onOpen={files.onOpenFile} onChanged={files.onChanged} onRemoved={files.onRemoved} />
            ) : (
              <Section title={state.project.name}>
                <p className="px-5 text-[12px] leading-5 text-ade-faint">
                  {files.fs === "none" ? "Arcade can't read this workspace's files here. Open the folder again from the welcome screen to grant access." : "Loading files…"}
                </p>
              </Section>
            )}

            {/* The sample ships a list of queued runs to show the idea; a real project has the one run you started. */}
            {!live && (
              <Section title="Security runs · sample">
                {state.workspaces.map((w) => (
                  <button key={w.id} onClick={() => onWorkspace(w.id)} className={`${ROW} ${rowTone(activeWorkspace === w.id)}`}>
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        w.status === "active" ? "bg-emerald-400" : w.status === "queued" ? "bg-white/25" : "bg-violet-400"
                      }`}
                    />
                    <span className="truncate">{w.name}</span>
                    <span className="min-w-0 flex-1 truncate text-right font-mono text-[10.5px] text-ade-faint">{w.status}</span>
                  </button>
                ))}
              </Section>
            )}

            <Section title="Run artifacts">
              {/* The Browser view is a mock storefront that belongs to the sample project only. */}
              {ARTIFACTS.filter((id) => id !== "browser" || sample).map((id) => {
                const { label, Icon } = VIEW_META[id];
                return (
                  <button key={id} onClick={() => onView(id)} className={`${ROW} ${rowTone(view === id)}`}>
                    <Icon className="h-3.5 w-3.5 shrink-0 text-ade-muted" strokeWidth={1.7} />
                    <span className="truncate">{label}</span>
                  </button>
                );
              })}
            </Section>

            <Section title={live ? "How this was analysed" : "Target environment · sample"}>
              <dl className="space-y-1 pl-5 pr-3 pt-0.5 text-[12px]">
                {(live
                  ? [
                      ["method", "static analysis"],
                      ["executes code", "no"],
                      ["network", "none"],
                      ["fixes run", git.available ? "on a branch, with your tests" : "desktop app only"],
                    ]
                  : [
                      ["sandbox", state.environment.sandboxId],
                      ["host", state.environment.host],
                      ["network", state.environment.network],
                      ["isolation", state.environment.isolated ? "isolated · disposable" : "shared"],
                    ]
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3">
                    <dt className="text-ade-faint">{k}</dt>
                    <dd className="truncate font-mono text-[11.5px] text-ade-fg/80">{v}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          </>
        )}

        {activity === "search" && (
          <SearchPanel
            fs={files.fs && files.fs !== "none" ? files.fs : null}
            files={files.index}
            indexing={files.indexing}
            onOpen={(path, line) => files.onOpenFile(path, { preview: true, line })}
          />
        )}

        {activity === "findings" && (
          <Section title={`Open findings · ${findings.length}`}>
            {findings.length === 0 && <p className="px-5 text-[12px] leading-5 text-ade-faint">{live ? "No weaknesses matched the rule set. That isn't proof of security, only that none of the current rules fired." : "Nothing yet. Assess the project (Run, top right) to find what is weak."}</p>}
            {findings.map((f) => (
              <button
                key={f.id}
                onClick={() => onOpenFinding(f.id)}
                title={f.title}
                className={`${ROW} ${rowTone(view === "findings" && selectedFinding === f.id)}`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${SEVERITY[f.severity].dot}`} />
                <span className="shrink-0 font-mono text-[11px] text-ade-muted">{f.id}</span>
                <span className="truncate">{f.title}</span>
              </button>
            ))}
          </Section>
        )}

        {activity === "scm" && git.available && <ScmPanel git={git} onOpenDiff={onOpenDiff} onChanged={onGitChanged} />}

        {/* No local git to run (a browser, the sample, a repository read from GitHub): show the fix the run proposes. */}
        {activity === "scm" && !git.available && (
          <>
            <div className="px-3 pb-3">
              <div className="flex items-center gap-1.5 font-mono text-[11.5px] text-ade-muted">
                <GitBranch className="h-3.5 w-3.5" /> {state.finding.remediation.branch}
              </div>
              <div className="mt-2 rounded border border-ade-line bg-ade-editor px-2 py-1.5 text-[12px] leading-5 text-ade-fg/80">
                {changes.length ? state.finding.remediation.summary : <span className="text-ade-faint">No proposed commit yet</span>}
              </div>
            </div>
            <Section title={`Changes · ${changes.length}`}>
              {changes.length ? (
                changes.map((f) => <ChangeRow key={f.path} file={f} onClick={() => onView("diff")} />)
              ) : (
                <p className="px-5 text-[12px] leading-5 text-ade-faint">The remediator proposes a fix once the defender has ranked mitigations.</p>
              )}
            </Section>
          </>
        )}

        {activity === "providers" && (
          <>
            {/* Direction one: Arcade runs the agent. Found by looking for its CLI on this machine, nothing is assumed. */}
            <Section title="Agents Arcade can run">
              {runnable ? (
                runnable.map((a) =>
                  a.runnable ? (
                    <div key={a.id} title={a.binary ?? ""} className={`${ROW} ${rowTone(false)}`}>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                      <span className="flex-1 truncate">{a.name}</span>
                      <span className="text-[11px] text-emerald-300/90">ready</span>
                    </div>
                  ) : (
                    <a key={a.id} href={a.install} target="_blank" rel="noreferrer" title={`${a.name}'s command-line tool wasn't found on this machine`} className={`${ROW} ${rowTone(false)}`}>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white/20" />
                      <span className="flex-1 truncate">{a.name}</span>
                      <span className="text-[11px] text-ade-faint">install</span>
                    </a>
                  ),
                )
              ) : (
                <p className="px-5 text-[12px] leading-5 text-ade-faint">Agents are programs on your computer, so a web page can&apos;t see or start them. The desktop app lists the ones you have here.</p>
              )}
              {runnable && (
                <p className="px-5 pt-2 text-[12px] leading-5 text-ade-faint">
                  A ready agent answers in the Agent pane (Ctrl+L) and writes the fixes the security loop can&apos;t write itself. It runs as you, with your sign-in and your plan. Pick the default in Settings.
                </p>
              )}
            </Section>

            {/* Direction two: the agent calls Arcade, through the MCP server registered in its own config. */}
            <Section title="Agents that can call Arcade">
              {agents.list ? (
                agents.list.map((agent) => <AgentRow key={agent.id} agent={agent} busy={agents.busy === agent.id} onChange={agents.setConnected} />)
              ) : (
                <p className="px-5 text-[12px] leading-5 text-ade-faint">
                  In the desktop app, or from a terminal with <span className="font-mono">arcade connect</span>.
                </p>
              )}
              {agents.error && <p className="px-5 pt-2 text-[12px] leading-5 text-red-300/90">{agents.error}</p>}
              {agents.list && (
                <p className="px-5 pt-2 text-[12px] leading-5 text-ade-faint">Connecting adds Arcade&apos;s MCP server to the agent&apos;s own config, so it can scan a project and read the findings back while you work in it. Restart the agent to pick it up.</p>
              )}
            </Section>
          </>
        )}

        {activity === "settings" && <SettingsPanel agents={runnable} />}
      </div>
    </div>
  );
}
