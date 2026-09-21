"use client";
import { useEffect, useRef } from "react";
import { Check, CircleX, Loader2, Play, Plus, RotateCcw, TriangleAlert, X } from "lucide-react";
import type { AgentKind, Approval, ArcadeState, Finding, RemediationFile, TerminalLine } from "@arcade/core/types";
import type { AgentChat } from "@/hooks/useAgentChat";
import { AGENT_ICON } from "./atoms";
import ApprovalGate from "./ApprovalGate";
import AgentChatView from "./AgentChat";
import { ChangeRow } from "./Sidebar";

const ORDER: AgentKind[] = ["mapper", "attacker", "defender", "remediator", "verifier"];

interface Group {
  agent: AgentKind;
  lines: TerminalLine[];
}

/** Consecutive terminal lines from one agent become one step in the thread. */
function groupLines(lines: TerminalLine[]): Group[] {
  const groups: Group[] = [];
  for (const l of lines) {
    if (l.agent === "system") continue;
    const last = groups[groups.length - 1];
    if (last && last.agent === l.agent) last.lines.push(l);
    else groups.push({ agent: l.agent, lines: [l] });
  }
  return groups;
}

function ThreadLine({ l }: { l: TerminalLine }) {
  switch (l.kind) {
    case "cmd":
      return (
        <div className="overflow-x-auto whitespace-nowrap rounded border border-ade-line bg-ade-editor px-2 py-1 font-mono text-[11.5px] text-ade-fg scrollbar-none">
          <span className="select-none text-ade-faint">$ </span>
          {l.text}
        </div>
      );
    case "sub":
      return <p className="ml-0.5 border-l border-ade-line pl-2.5 font-mono text-[11px] leading-5 text-ade-muted">{l.text}</p>;
    case "ok":
      return (
        <p className="flex gap-1.5 text-[12.5px] leading-5 text-emerald-300/90">
          <Check className="mt-[3px] h-3.5 w-3.5 shrink-0" /> {l.text}
        </p>
      );
    case "warn":
      return (
        <p className="flex gap-1.5 text-[12.5px] leading-5 text-amber-200/90">
          <TriangleAlert className="mt-[3px] h-3.5 w-3.5 shrink-0" /> {l.text}
        </p>
      );
    case "err":
      return (
        <p className="flex gap-1.5 rounded border border-red-500/30 bg-red-500/[0.07] px-2 py-1 text-[12.5px] leading-5 text-red-200">
          <CircleX className="mt-[3px] h-3.5 w-3.5 shrink-0 text-red-400" /> {l.text}
        </p>
      );
    case "plain":
      return <p className="text-[12px] leading-5 text-ade-muted">{l.text}</p>;
    default:
      return <p className="text-[12.5px] leading-5 text-ade-fg/90">{l.text}</p>;
  }
}

function Approved({ text }: { text: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[11.5px] text-ade-muted">
      <Check className="h-3 w-3 text-emerald-400" /> You approved · {text}
    </div>
  );
}

export type AgentTab = "agent" | "run";

export default function AgentPane({
  state,
  running,
  pendingApproval,
  changes,
  tab,
  onTab,
  chat,
  selectedFinding,
  activeFile,
  onOpenFile,
  demo,
  onStart,
  onRestart,
  onApprove,
  onReject,
  onReviewDiff,
  onClose,
}: {
  state: ArcadeState;
  running: boolean;
  pendingApproval?: Approval;
  changes: RemediationFile[];
  tab: AgentTab;
  onTab: (t: AgentTab) => void;
  /** The conversation with a coding agent installed on this machine. */
  chat: AgentChat;
  selectedFinding?: Finding;
  activeFile: string | null;
  onOpenFile: (path: string) => void;
  /** The scripted sample is playing, not an assessment of a real project. */
  demo: boolean;
  onStart: () => void;
  onRestart: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onReviewDiff: () => void;
  onClose: () => void;
}) {
  const thread = useRef<HTMLDivElement>(null);

  const groups = groupLines(state.terminal);
  const started = state.phase !== "idle";
  const done = state.phase === "verified" && !pendingApproval;
  const approved = (id: string) => state.approvals.find((a) => a.id === id && a.status === "approved");
  const current = ORDER.find((k) => state.agents[k].status === "running" || state.agents[k].status === "awaiting-approval");
  const add = changes.reduce((n, f) => n + f.additions, 0);
  const del = changes.reduce((n, f) => n + f.deletions, 0);

  useEffect(() => {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight;
  }, [state.terminal.length, pendingApproval?.id, done, tab]);

  const TAB = "relative h-full px-2 text-[12.5px] transition";
  const header = (
    <div className="flex h-[35px] shrink-0 items-center gap-0.5 border-b border-ade-line pl-1.5 pr-1.5">
      {(["agent", "run"] as const).map((t) => (
        <button key={t} onClick={() => onTab(t)} className={`${TAB} ${tab === t ? "font-medium text-ade-fg" : "text-ade-muted hover:text-ade-fg"}`}>
          {t === "agent" ? "Agent" : "Security run"}
          {t === "run" && pendingApproval && <span className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-violet-400 align-middle" />}
          {t === "agent" && chat.running && <Loader2 className="ml-1.5 inline h-3 w-3 animate-spin align-middle text-amber-200" />}
          {tab === t && <span className="absolute inset-x-2 bottom-0 h-px bg-ade-fg" />}
        </button>
      ))}
      <span className="flex-1" />
      <button
        onClick={tab === "agent" ? chat.clear : onRestart}
        disabled={tab === "agent" && chat.running}
        title={tab === "agent" ? "New conversation" : "New run"}
        aria-label={tab === "agent" ? "New conversation" : "New run"}
        className="grid h-6 w-6 place-items-center rounded text-ade-muted transition hover:bg-white/[0.06] hover:text-ade-fg disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
      <button onClick={onClose} title="Close (Ctrl+L)" aria-label="Close agent pane" className="grid h-6 w-6 place-items-center rounded text-ade-muted transition hover:bg-white/[0.06] hover:text-ade-fg">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  if (tab === "agent") {
    return (
      <div className="flex h-full min-w-0 flex-col bg-ade-base">
        {header}
        <AgentChatView chat={chat} projectName={state.project.name} finding={selectedFinding} activeFile={activeFile} onOpenFile={onOpenFile} onScan={onStart} />
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col bg-ade-base">
      {header}

      {/* Fleet: the five agents hand off left to right */}
      <div className="shrink-0 border-b border-ade-line px-3 py-2.5">
        <div className="flex items-center">
          {ORDER.map((kind, i) => {
            const a = state.agents[kind];
            const Icon = AGENT_ICON[kind];
            const tone =
              a.status === "done"
                ? "border-emerald-400/40 text-emerald-300"
                : a.status === "running"
                  ? "border-amber-300/60 text-amber-200"
                  : a.status === "awaiting-approval"
                    ? "border-violet-400/60 text-violet-300"
                    : "border-ade-line text-ade-faint";
            return (
              <div key={kind} className="flex flex-1 items-center last:flex-none">
                <span title={`${a.name} — ${a.task}`} className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border bg-ade-editor ${tone}`}>
                  <Icon className="h-3 w-3" />
                </span>
                {i < ORDER.length - 1 && <span className={`h-px flex-1 ${a.status === "done" ? "bg-emerald-400/40" : "bg-ade-line"}`} />}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11.5px]">
          {current ? (
            <>
              <span className="font-medium text-ade-fg">{state.agents[current].name}</span>
              <span className="truncate text-ade-muted">{state.agents[current].task}</span>
            </>
          ) : (
            <span className="text-ade-muted">{done ? "All five agents complete" : started ? "Paused" : "Five agents, idle"}</span>
          )}
        </div>
      </div>

      {/* Thread */}
      <div ref={thread} className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {!started && (
          <div className="pt-6 text-center">
            <p className="text-[13px] text-ade-fg/90">Secure {state.project.name}</p>
            <p className="mx-auto mt-1 max-w-[260px] text-[12px] leading-5 text-ade-muted">
              Arcade maps the project, finds what is weak, proposes a fix, applies it on its own branch, runs your tests, re-checks the weakness and commits. Anything that changes code or leaves this machine stops here for your approval.
            </p>
          </div>
        )}
        {demo && started && <p className="rounded border border-ade-line bg-ade-raised px-2.5 py-1.5 text-[11.5px] leading-[1.45] text-ade-muted">Sample run. This is a scripted walkthrough on a bundled example project; nothing here is executing. Open a folder to run it for real.</p>}

        {groups.map((g, gi) => {
          const a = state.agents[g.agent];
          const Icon = AGENT_ICON[g.agent];
          const live = gi === groups.length - 1 && a.status === "running";
          return (
            <div key={gi} className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-[11.5px]">
                <Icon className="h-3.5 w-3.5 text-ade-muted" />
                <span className="font-medium text-ade-fg">{a.name}</span>
                <span className="truncate text-ade-faint">{a.role}</span>
                <span className="flex-1" />
                {live ? <Loader2 className="h-3 w-3 animate-spin text-amber-200" /> : a.status === "done" && <Check className="h-3 w-3 text-emerald-400" />}
              </div>
              {g.lines.map((l, li) => (
                <ThreadLine key={li} l={l} />
              ))}

              {g.agent === "defender" && approved("approve-fix") && <Approved text="apply the proposed fix" />}

              {g.agent === "remediator" && a.status === "done" && changes.length > 0 && (
                <div className="overflow-hidden rounded-md border border-ade-line bg-ade-editor">
                  <div className="flex items-center gap-2 border-b border-ade-line px-2.5 py-1.5 text-[11.5px] text-ade-muted">
                    {changes.length} files changed
                    <span className="font-mono text-emerald-400/90">+{add}</span>
                    <span className="font-mono text-red-400/90">−{del}</span>
                    <button onClick={onReviewDiff} className="ml-auto text-ade-fg/85 transition hover:text-white">
                      Review
                    </button>
                  </div>
                  <div className="py-1">
                    {changes.map((f) => (
                      <ChangeRow key={f.path} file={f} onClick={onReviewDiff} className="!pl-2.5" />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {approved("approve-merge") && <Approved text="merge to main" />}
        {approved("approve-ship") && <Approved text="push the fix" />}

        {pendingApproval && <ApprovalGate approval={pendingApproval} onApprove={onApprove} onReject={onReject} onReviewDiff={onReviewDiff} />}
      </div>

      {/* The loop takes no prompt — it runs the same steps every time — so this is a control, not a text box. */}
      <div className="shrink-0 p-2.5 pt-0">
        <button
          onClick={done ? onRestart : onStart}
          disabled={running || !!pendingApproval}
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-ade-fg text-[12.5px] font-medium text-black transition hover:bg-white disabled:bg-ade-hover disabled:text-ade-faint"
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : done ? <RotateCcw className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          {pendingApproval ? "Waiting for your approval above" : running ? "Running…" : done ? "Run again" : started ? "Resume" : demo ? "Play the sample run" : "Run the security loop"}
        </button>
      </div>
    </div>
  );
}
