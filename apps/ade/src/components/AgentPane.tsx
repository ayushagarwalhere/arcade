"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, CircleX, Loader2, Plus, TriangleAlert, X } from "lucide-react";
import type { AgentKind, Approval, ArcadeState, RemediationFile, TerminalLine } from "@arcade/core/types";
import { AGENT_ICON } from "./atoms";
import ApprovalGate from "./ApprovalGate";
import { ChangeRow } from "./Sidebar";

const ORDER: AgentKind[] = ["mapper", "attacker", "defender", "remediator", "verifier"];
const DEFAULT_PROMPT = "Run the security loop on this project: map it, reproduce what is exploitable, fix it, and verify the fix independently.";

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

export default function AgentPane({
  state,
  running,
  pendingApproval,
  changes,
  onStart,
  onRestart,
  onApprove,
  onReject,
  onReviewDiff,
  onProviders,
  onClose,
}: {
  state: ArcadeState;
  running: boolean;
  pendingApproval?: Approval;
  changes: RemediationFile[];
  onStart: () => void;
  onRestart: () => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onReviewDiff: () => void;
  onProviders: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const thread = useRef<HTMLDivElement>(null);

  const groups = groupLines(state.terminal);
  const started = state.phase !== "idle";
  const done = state.phase === "verified" && !pendingApproval;
  const approved = (id: string) => state.approvals.find((a) => a.id === id && a.status === "approved");
  const current = ORDER.find((k) => state.agents[k].status === "running" || state.agents[k].status === "awaiting-approval");
  const provider = state.providers.find((p) => p.connected)?.name ?? "No agent";
  const add = changes.reduce((n, f) => n + f.additions, 0);
  const del = changes.reduce((n, f) => n + f.deletions, 0);

  useEffect(() => {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight;
  }, [state.terminal.length, pendingApproval?.id, done]);

  const canSend = !running && !pendingApproval;
  const submit = () => {
    if (!canSend) return;
    if (draft.trim()) setPrompt(draft.trim());
    setDraft("");
    if (done) onRestart();
    else onStart();
  };

  return (
    <div className="flex h-full min-w-0 flex-col bg-ade-base">
      {/* Header */}
      <div className="flex h-[35px] shrink-0 items-center gap-1 border-b border-ade-line pl-3 pr-1.5">
        <span className="truncate text-[12.5px] font-medium text-ade-fg">Security run</span>
        <span className="truncate font-mono text-[11px] text-ade-faint">{state.finding.id}</span>
        <span className="flex-1" />
        <button onClick={onRestart} title="New run" aria-label="New run" className="grid h-6 w-6 place-items-center rounded text-ade-muted transition hover:bg-white/[0.06] hover:text-ade-fg">
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button onClick={onClose} title="Close (Ctrl+L)" aria-label="Close agent pane" className="grid h-6 w-6 place-items-center rounded text-ade-muted transition hover:bg-white/[0.06] hover:text-ade-fg">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

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
        {!started ? (
          <div className="pt-6 text-center">
            <p className="text-[13px] text-ade-fg/90">Secure {state.project.name}</p>
            <p className="mx-auto mt-1 max-w-[260px] text-[12px] leading-5 text-ade-muted">
              Agents map, attack, defend, remediate and verify in order. Anything high-impact stops here for your approval.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-ade-line bg-ade-raised px-2.5 py-2 text-[12.5px] leading-5 text-ade-fg">{prompt}</div>
        )}

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

        {pendingApproval && <ApprovalGate approval={pendingApproval} onApprove={onApprove} onReject={onReject} onReviewDiff={onReviewDiff} />}
      </div>

      {/* Composer */}
      <div className="shrink-0 p-2.5 pt-0">
        <div className="rounded-md border border-ade-line bg-ade-editor transition focus-within:border-white/25">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={pendingApproval ? "Waiting for your approval above…" : done ? "Start another run…" : "Plan, attack, fix — Enter runs the security loop"}
            className="block w-full resize-none bg-transparent px-2.5 pt-2 text-[12.5px] leading-5 text-ade-fg outline-none placeholder:text-ade-faint"
          />
          <div className="flex items-center gap-1 px-1.5 pb-1.5">
            <button onClick={onProviders} title="Agent providers" className="flex h-5 items-center gap-1 rounded px-1.5 text-[11px] text-ade-muted transition hover:bg-white/[0.06] hover:text-ade-fg">
              {provider} <ChevronDown className="h-3 w-3" />
            </button>
            <span className="text-[11px] text-ade-faint">5-agent loop</span>
            <span className="flex-1" />
            <button
              onClick={submit}
              disabled={!canSend}
              aria-label="Run"
              className="grid h-5 w-5 place-items-center rounded-full bg-ade-fg text-black transition hover:bg-white disabled:bg-ade-hover disabled:text-ade-faint"
            >
              {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowUp className="h-3 w-3" strokeWidth={2.5} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
