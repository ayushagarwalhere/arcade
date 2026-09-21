"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, CircleX, Eye, FilePen, FilePlus, FileX, Loader2, Pencil, Square, Wrench } from "lucide-react";
import type { Finding } from "@arcade/core/types";
import type { AgentChat as Chat, ChatMessage, ChatPart } from "@/hooks/useAgentChat";
import { updateSettings, useSettings } from "@/lib/settings";

/* ----------------------------------------------------------------- markdown */
// Agents answer in Markdown. This covers what they actually use — fences, inline code,
// bold, headings and lists — without pulling a parser into the bundle.

function Inline({ text }: { text: string }) {
  const parts = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("`") && p.endsWith("`") && p.length > 2 ? (
          <code key={i} className="rounded bg-white/[0.07] px-1 py-px font-mono text-[11.5px] text-ade-fg">
            {p.slice(1, -1)}
          </code>
        ) : p.startsWith("**") && p.endsWith("**") && p.length > 4 ? (
          <strong key={i} className="font-semibold text-ade-fg">
            {p.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

function Markdown({ text }: { text: string }) {
  const blocks = text.split(/```/);
  return (
    <div className="space-y-1.5 text-[12.5px] leading-[1.55] text-ade-fg/90">
      {blocks.map((block, i) => {
        if (i % 2 === 1) {
          const nl = block.indexOf("\n");
          const code = nl >= 0 ? block.slice(nl + 1) : block;
          return (
            <pre key={i} className="scrollbar-thin overflow-x-auto rounded border border-ade-line bg-ade-editor px-2 py-1.5 font-mono text-[11.5px] leading-[1.5] text-ade-fg">
              {code.replace(/\n$/, "")}
            </pre>
          );
        }
        return block
          .split(/\n{2,}/)
          .filter((p) => p.trim())
          .map((para, k) => {
            const lines = para.split("\n");
            const isList = lines.every((l) => /^\s*(?:[-*•]|\d+[.)])\s+/.test(l));
            if (isList) {
              return (
                <ul key={`${i}-${k}`} className="space-y-0.5 pl-1">
                  {lines.map((l, j) => (
                    <li key={j} className="flex gap-1.5">
                      <span className="select-none text-ade-faint">{/^\s*\d/.test(l) ? `${l.trim().match(/^\d+/)![0]}.` : "•"}</span>
                      <span className="min-w-0">
                        <Inline text={l.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "")} />
                      </span>
                    </li>
                  ))}
                </ul>
              );
            }
            const heading = /^#{1,6}\s+(.*)$/.exec(para.trim());
            if (heading && lines.length === 1) {
              return (
                <p key={`${i}-${k}`} className="pt-1 font-semibold text-ade-fg">
                  <Inline text={heading[1]} />
                </p>
              );
            }
            return (
              <p key={`${i}-${k}`} className="whitespace-pre-wrap break-words">
                <Inline text={para} />
              </p>
            );
          });
      })}
    </div>
  );
}

/* -------------------------------------------------------------------- parts */

const FILE_ICON = { edit: FilePen, create: FilePlus, delete: FileX };

function Part({ part, onOpenFile }: { part: ChatPart; onOpenFile: (path: string) => void }) {
  if (part.kind === "text") return <Markdown text={part.text} />;
  if (part.kind === "tool") {
    return (
      <div className="flex items-center gap-1.5 font-mono text-[11px] leading-5 text-ade-muted">
        {part.ok === undefined ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : part.ok ? <Wrench className="h-3 w-3 shrink-0 text-ade-faint" /> : <CircleX className="h-3 w-3 shrink-0 text-red-400" />}
        <span className="shrink-0 text-ade-fg/80">{part.name}</span>
        <span className="truncate" title={part.summary}>
          {part.summary}
        </span>
      </div>
    );
  }
  if (part.kind === "file") {
    const Icon = FILE_ICON[part.change];
    return (
      <button onClick={() => part.change !== "delete" && onOpenFile(part.path)} title={part.path} className="flex max-w-full items-center gap-1.5 rounded border border-ade-line bg-ade-editor px-2 py-1 text-left text-[11.5px] text-ade-fg/90 transition hover:border-white/20">
        <Icon className={`h-3 w-3 shrink-0 ${part.change === "delete" ? "text-red-400" : part.change === "create" ? "text-emerald-400" : "text-amber-300"}`} />
        <span className="truncate font-mono">{part.path}</span>
        <span className="shrink-0 text-ade-faint">{part.change === "edit" ? "edited" : part.change === "create" ? "created" : "deleted"}</span>
      </button>
    );
  }
  return <p className="break-words font-mono text-[10.5px] leading-4 text-ade-faint">{part.text}</p>;
}

function Assistant({ m, onOpenFile }: { m: Extract<ChatMessage, { role: "assistant" }>; onOpenFile: (path: string) => void }) {
  const meta = [m.model, m.durationMs != null ? `${(m.durationMs / 1000).toFixed(1)}s` : null, m.costUsd != null ? `session $${m.costUsd.toFixed(2)}` : null].filter(Boolean).join(" · ");
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11.5px]">
        <span className="font-medium text-ade-fg">{m.agentName}</span>
        <span className="flex-1" />
        {m.status === "running" ? <Loader2 className="h-3 w-3 animate-spin text-amber-200" /> : m.status === "done" ? <Check className="h-3 w-3 text-emerald-400" /> : null}
      </div>
      {m.parts.map((p, i) => (
        <Part key={i} part={p} onOpenFile={onOpenFile} />
      ))}
      {m.status === "running" && m.parts.length === 0 && <p className="text-[12px] text-ade-faint">Starting {m.agentName}…</p>}
      {m.status === "stopped" && <p className="text-[11.5px] text-ade-muted">Stopped.</p>}
      {m.status === "error" && (
        <p className="flex gap-1.5 whitespace-pre-wrap break-words rounded border border-red-500/30 bg-red-500/[0.07] px-2 py-1 text-[12px] leading-5 text-red-200">
          <CircleX className="mt-[3px] h-3.5 w-3.5 shrink-0 text-red-400" /> {m.error ?? "The agent stopped with an error."}
        </p>
      )}
      {m.status !== "running" && meta && <p className="font-mono text-[10.5px] text-ade-faint">{meta}</p>}
    </div>
  );
}

/* --------------------------------------------------------------------- chat */

/** What Arcade knows that the agent doesn't: sent ahead of the prompt, never shown in the thread. */
export function findingContext(f: Finding | undefined, activeFile: string | null): string | undefined {
  const lines: string[] = ["You are working inside the Arcade security workbench, in the user's project folder."];
  if (activeFile) lines.push(`The file open in the editor is: ${activeFile}`);
  if (f && f.id !== "ARC-000" && f.vulnerableCode.path) {
    const flagged = f.vulnerableCode.lines.find((l) => l.flagged);
    lines.push(
      `The finding selected in Arcade is ${f.id}: ${f.title} (${f.cwe}, severity ${f.severity}).`,
      `Location: ${f.vulnerableCode.path}${flagged ? `:${flagged.no}` : ""}`,
      ...(flagged ? [`Flagged line: ${flagged.text.trim()}`] : []),
      `Why it matters: ${f.summary}`,
    );
  }
  return lines.length > 1 ? lines.join("\n") : undefined;
}

export default function AgentChat({
  chat,
  projectName,
  finding,
  activeFile,
  onOpenFile,
  onScan,
}: {
  chat: Chat;
  projectName: string;
  /** The finding selected in the workbench, offered as a one-click prompt and sent as context. */
  finding?: Finding;
  activeFile: string | null;
  onOpenFile: (path: string) => void;
  onScan: () => void;
}) {
  const settings = useSettings();
  const [draft, setDraft] = useState("");
  const [picking, setPicking] = useState(false);
  const thread = useRef<HTMLDivElement>(null);

  const runnable = chat.agents?.filter((a) => a.runnable) ?? [];
  const agent = runnable.find((a) => a.id === settings.agentId) ?? runnable[0];
  const realFinding = finding && finding.id !== "ARC-000" && finding.vulnerableCode.path ? finding : undefined;

  const lastLen = chat.messages.length ? JSON.stringify(chat.messages[chat.messages.length - 1]).length : 0;
  useEffect(() => {
    if (thread.current) thread.current.scrollTop = thread.current.scrollHeight;
  }, [chat.messages.length, lastLen]);

  const send = (prompt: string, display?: string) => {
    if (!agent || chat.running || !prompt.trim()) return;
    setDraft("");
    void chat.send(prompt.trim(), { agentId: agent.id, mode: settings.agentMode, model: settings.agentModel, context: findingContext(realFinding, activeFile), display });
  };

  // Nothing to talk to: say exactly why, and what would change it.
  if (!chat.canRun || (chat.agents && runnable.length === 0)) {
    return (
      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-4 py-6 text-[12.5px] leading-[1.55] text-ade-muted">
        <p className="text-[13px] text-ade-fg/90">{chat.canRun ? "No coding agent found on this machine" : "The agent runs on your machine"}</p>
        {chat.canRun ? (
          <>
            <p className="mt-2">Arcade drives the agent you already use, by running its own command-line tool inside this folder. Install one, sign in to it once, and it will appear here.</p>
            <ul className="mt-3 space-y-1">
              {chat.agents?.map((a) => (
                <li key={a.id} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
                  <span className="flex-1 text-ade-fg/80">{a.name}</span>
                  <a href={a.install} target="_blank" rel="noreferrer" className="text-ade-fg/80 underline hover:text-white">
                    install
                  </a>
                </li>
              ))}
            </ul>
            <button onClick={() => void chat.refreshAgents()} className="mt-4 h-7 rounded border border-ade-line px-2.5 text-[12px] text-ade-fg transition hover:bg-ade-raised">
              Look again
            </button>
          </>
        ) : (
          <p className="mt-2">Claude Code, Codex and the other agents are programs on your computer, and a web page can&apos;t start them. Open this project in the Arcade desktop app to chat with an agent and let it make changes here. Scanning works in the browser too.</p>
        )}
        <button onClick={onScan} className="mt-4 block h-7 rounded bg-ade-fg px-2.5 text-[12px] font-medium text-black transition hover:bg-white">
          Scan {projectName}
        </button>
      </div>
    );
  }

  return (
    <>
      <div ref={thread} className="scrollbar-thin min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {chat.messages.length === 0 && (
          <div className="pt-4">
            <p className="text-center text-[13px] text-ade-fg/90">Ask {agent?.name ?? "your agent"} about {projectName}</p>
            <p className="mx-auto mt-1 max-w-[270px] text-center text-[12px] leading-5 text-ade-muted">It runs on this machine, inside this folder{settings.agentMode === "edit" ? ", and can change files here" : ", read-only"}.</p>
            <div className="mt-4 space-y-1.5">
              {realFinding && (
                <button
                  onClick={() => send(`Fix ${realFinding.id} (${realFinding.title}) in ${realFinding.vulnerableCode.path}. Make the smallest change that closes the weakness, keep behaviour otherwise identical, and don't touch unrelated code. Then say what you changed.`, `Fix ${realFinding.id} · ${realFinding.title}`)}
                  className="block w-full rounded border border-ade-line bg-ade-editor px-2.5 py-2 text-left text-[12px] text-ade-fg/90 transition hover:border-white/20"
                >
                  Fix {realFinding.id} <span className="text-ade-faint">· {realFinding.title}</span>
                </button>
              )}
              {realFinding && (
                <button onClick={() => send(`Explain ${realFinding.id} in this codebase: how could it be reached, and what is the right fix here? Don't change any files.`, `Explain ${realFinding.id}`)} className="block w-full rounded border border-ade-line bg-ade-editor px-2.5 py-2 text-left text-[12px] text-ade-fg/90 transition hover:border-white/20">
                  Explain {realFinding.id} <span className="text-ade-faint">· no changes</span>
                </button>
              )}
              <button onClick={onScan} className="block w-full rounded border border-ade-line bg-ade-editor px-2.5 py-2 text-left text-[12px] text-ade-fg/90 transition hover:border-white/20">
                Scan this project <span className="text-ade-faint">· Arcade&apos;s static analysis</span>
              </button>
            </div>
          </div>
        )}
        {chat.messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="whitespace-pre-wrap break-words rounded-md border border-ade-line bg-ade-raised px-2.5 py-2 text-[12.5px] leading-5 text-ade-fg">
              {m.text}
            </div>
          ) : (
            <Assistant key={m.id} m={m} onOpenFile={onOpenFile} />
          ),
        )}
      </div>

      <div className="shrink-0 p-2.5 pt-0">
        <div className="rounded-md border border-ade-line bg-ade-editor transition focus-within:border-white/25">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(draft);
              }
            }}
            rows={2}
            placeholder={chat.running ? `${agent?.name} is working…` : `Message ${agent?.name ?? "the agent"} — Enter to send`}
            className="block w-full resize-none bg-transparent px-2.5 pt-2 text-[12.5px] leading-5 text-ade-fg outline-none placeholder:text-ade-faint"
          />
          <div className="relative flex items-center gap-1 px-1.5 pb-1.5">
            <button onClick={() => setPicking((p) => !p)} title="Which agent to run" className="flex h-5 items-center gap-1 rounded px-1.5 text-[11px] text-ade-muted transition hover:bg-white/[0.06] hover:text-ade-fg">
              {agent?.name ?? "Agent"} <ChevronDown className="h-3 w-3" />
            </button>
            {picking && (
              <div className="absolute bottom-7 left-1 z-20 w-52 rounded-md border border-ade-line bg-ade-raised p-1 shadow-2xl">
                {chat.agents?.map((a) => (
                  <button
                    key={a.id}
                    disabled={!a.runnable}
                    onClick={() => {
                      updateSettings({ agentId: a.id });
                      setPicking(false);
                    }}
                    className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[12px] text-ade-fg/90 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${a.runnable ? "bg-emerald-400" : "bg-white/20"}`} />
                    <span className="flex-1">{a.name}</span>
                    {!a.runnable && <span className="text-[10.5px] text-ade-faint">not installed</span>}
                    {a.id === agent?.id && <Check className="h-3 w-3 text-ade-muted" />}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => updateSettings({ agentMode: settings.agentMode === "edit" ? "read" : "edit" })}
              title={settings.agentMode === "edit" ? "The agent may change files in this folder. Click to make it read-only." : "The agent can only read. Click to let it change files."}
              className="flex h-5 items-center gap-1 rounded px-1.5 text-[11px] text-ade-muted transition hover:bg-white/[0.06] hover:text-ade-fg"
            >
              {settings.agentMode === "edit" ? <Pencil className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {settings.agentMode === "edit" ? "Can edit" : "Read-only"}
            </button>
            {settings.agentModel && <span className="truncate font-mono text-[10.5px] text-ade-faint">{settings.agentModel}</span>}
            <span className="flex-1" />
            {chat.running ? (
              <button onClick={chat.stop} aria-label="Stop" title="Stop the agent" className="grid h-5 w-5 place-items-center rounded-full bg-red-500/80 text-white transition hover:bg-red-500">
                <Square className="h-2.5 w-2.5" fill="currentColor" />
              </button>
            ) : (
              <button onClick={() => send(draft)} disabled={!draft.trim() || !agent} aria-label="Send" className="grid h-5 w-5 place-items-center rounded-full bg-ade-fg text-black transition hover:bg-white disabled:bg-ade-hover disabled:text-ade-faint">
                <ArrowUp className="h-3 w-3" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
