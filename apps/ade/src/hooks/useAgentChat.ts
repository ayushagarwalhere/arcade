"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentEvent, AgentMode, RunnableAgent } from "@arcade/core/desktop";
import { bridgeMessage } from "@arcade/core/agent-connections";

export type ChatPart =
  | { kind: "text"; text: string }
  | { kind: "tool"; id?: string; name: string; summary: string; ok?: boolean }
  | { kind: "file"; path: string; change: "edit" | "create" | "delete" }
  | { kind: "log"; text: string };

export type ChatMessage =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      agentId: string;
      agentName: string;
      parts: ChatPart[];
      status: "running" | "done" | "error" | "stopped";
      model?: string;
      error?: string;
      /** Reported by the agent for its whole session so far, not just this turn. */
      costUsd?: number;
      durationMs?: number;
    };

export interface TurnResult {
  ok: boolean;
  cancelled: boolean;
  /** Workspace-relative paths the agent changed during the turn. */
  files: string[];
  text: string;
  error?: string;
}

export interface SendOptions {
  agentId: string;
  mode: AgentMode;
  model?: string;
  /** Sent to the agent ahead of the prompt, but not shown in the thread: what Arcade knows that the agent doesn't. */
  context?: string;
  /** What the thread shows for this turn, when it should differ from the prompt (a button press, say). */
  display?: string;
  /** Each thing the agent does, as it happens — for a caller that narrates the turn somewhere else too. */
  onActivity?: (line: string) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

/** An agent reports absolute paths; the workbench speaks workspace-relative ones. */
function relativeTo(root: string, file: string): string | null {
  const norm = (p: string) => p.replace(/\\/g, "/");
  const r = norm(root).replace(/\/$/, "");
  const f = norm(file);
  if (!/^([a-zA-Z]:)?\//.test(f)) return f.replace(/^\.\//, ""); // already relative
  return f.toLowerCase().startsWith(`${r.toLowerCase()}/`) ? f.slice(r.length + 1) : null;
}

/** A tool summary with the project folder's own path taken out of it. */
function withoutRoot(root: string, summary: string): string {
  const r = root.replace(/\\/g, "/").replace(/\/$/, "").toLowerCase();
  const s = summary.replace(/\\/g, "/");
  const at = s.toLowerCase().indexOf(r);
  if (at < 0) return summary;
  return (s.slice(0, at) + s.slice(at + r.length).replace(/^\//, "")).trim() || ".";
}

/**
 * A conversation with a coding agent installed on this machine, run for real inside
 * the open folder (electron/agents-ipc.js → packages/cli/agent-runner.mjs).
 */
export function useAgentChat(root: string | null, onFilesChanged?: (files: string[]) => void) {
  const bridge = typeof window !== "undefined" ? window.arcade?.agents : undefined;
  const canRun = !!bridge?.run && !!bridge.detect && !!bridge.onEvent && !!root;

  const [agents, setAgents] = useState<RunnableAgent[] | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [running, setRunning] = useState(false);
  const runId = useRef<string | null>(null);
  // Claude Code resumes its own session (kept per folder and agent); the others are sent the conversation so far.
  const sessions = useRef<Record<string, string>>({});
  const notify = useRef(onFilesChanged);
  useEffect(() => {
    notify.current = onFilesChanged;
  });

  // In a browser there is no bridge and `agents` stays null, which is how callers tell the two apart.
  const detect = useCallback(() => {
    void bridge?.detect?.().then(setAgents, () => setAgents([]));
  }, [bridge]);

  useEffect(() => {
    detect();
    // Installing an agent happens in another window; look again on the way back.
    window.addEventListener("focus", detect);
    return () => window.removeEventListener("focus", detect);
  }, [detect]);

  // A different folder is a different conversation.
  const [shownRoot, setShownRoot] = useState(root);
  if (shownRoot !== root) {
    setShownRoot(root);
    setMessages([]);
  }
  const sessionKey = (agentId: string) => `${root}\n${agentId}`;

  const patchLast = (fn: (m: Extract<ChatMessage, { role: "assistant" }>) => Extract<ChatMessage, { role: "assistant" }>) =>
    setMessages((ms) => {
      const last = ms[ms.length - 1];
      return last?.role === "assistant" ? [...ms.slice(0, -1), fn(last)] : ms;
    });

  const send = useCallback(
    (prompt: string, opts: SendOptions): Promise<TurnResult> => {
      const failed = (error: string): TurnResult => ({ ok: false, cancelled: false, files: [], text: "", error });
      if (!bridge?.run || !bridge.onEvent || !root) return Promise.resolve(failed("Agents run on your machine, so this needs the Arcade desktop app."));
      if (runId.current) return Promise.resolve(failed("The agent is still working on the last message."));
      const agent = agents?.find((a) => a.id === opts.agentId);
      if (!agent?.runnable) return Promise.resolve(failed(`${agent?.name ?? "That agent"} isn't installed on this machine.`));

      const history = messages.flatMap((m): { role: "user" | "assistant"; text: string }[] =>
        m.role === "user" ? [{ role: "user", text: m.text }] : [{ role: "assistant", text: m.parts.flatMap((p) => (p.kind === "text" ? [p.text] : [])).join("") }],
      );
      setMessages((ms) => [...ms, { id: uid(), role: "user", text: opts.display ?? prompt }, { id: uid(), role: "assistant", agentId: agent.id, agentName: agent.name, parts: [], status: "running" }]);
      setRunning(true);

      return new Promise<TurnResult>((resolve) => {
        const files = new Set<string>();
        let text = "";
        let off = () => {};

        const finish = (r: TurnResult) => {
          off();
          runId.current = null;
          setRunning(false);
          if (r.files.length) notify.current?.(r.files);
          resolve(r);
        };

        const onEvent = (ev: AgentEvent) => {
          switch (ev.type) {
            case "start":
              if (ev.sessionId && agent.resumes) sessions.current[sessionKey(agent.id)] = ev.sessionId;
              return patchLast((m) => ({ ...m, model: ev.model ?? m.model }));
            case "text":
              text += ev.text;
              return patchLast((m) => {
                const tail = m.parts[m.parts.length - 1];
                // Deltas extend the paragraph being written; anything else starts a new one.
                if (ev.delta && tail?.kind === "text") return { ...m, parts: [...m.parts.slice(0, -1), { kind: "text", text: tail.text + ev.text }] };
                return { ...m, parts: [...m.parts, { kind: "text", text: ev.text }] };
              });
            case "tool": {
              // Agents name files by absolute path; inside the project the relative one says the same in a line.
              const summary = withoutRoot(root, ev.summary);
              opts.onActivity?.(`${ev.name}${ev.summary ? ` · ${summary}` : ""}`);
              return patchLast((m) => ({ ...m, parts: [...m.parts, { kind: "tool", id: ev.id, name: ev.name, summary: ev.summary ? summary : "" }] }));
            }
            case "tool-result":
              return patchLast((m) => ({ ...m, parts: m.parts.map((p) => (p.kind === "tool" && p.id === ev.id ? { ...p, ok: ev.ok } : p)) }));
            case "file": {
              const rel = relativeTo(root, ev.path);
              if (!rel) return;
              files.add(rel);
              return patchLast((m) => (m.parts.some((p) => p.kind === "file" && p.path === rel) ? m : { ...m, parts: [...m.parts, { kind: "file", path: rel, change: ev.kind }] }));
            }
            case "log":
              return patchLast((m) => ({ ...m, parts: [...m.parts, { kind: "log", text: ev.text }] }));
            case "done":
              if (ev.sessionId && ev.resumable) sessions.current[sessionKey(agent.id)] = ev.sessionId;
              patchLast((m) => ({ ...m, status: ev.cancelled ? "stopped" : ev.ok ? "done" : "error", error: ev.ok || ev.cancelled ? undefined : ev.error, costUsd: ev.costUsd, durationMs: ev.durationMs }));
              return finish({ ok: ev.ok, cancelled: ev.cancelled, files: [...files], text, error: ev.error });
          }
        };

        // Subscribe before starting: a fast failure can finish before `run` resolves.
        const early: { runId: string; ev: AgentEvent }[] = [];
        off = bridge.onEvent!((e) => {
          if (!runId.current) early.push(e);
          else if (e.runId === runId.current) onEvent(e.ev);
        });

        const full = opts.context ? `${opts.context}\n\n---\n\n${prompt}` : prompt;
        bridge.run!(root, { id: agent.id, prompt: full, mode: opts.mode, model: opts.model || undefined, sessionId: sessions.current[sessionKey(agent.id)], history: agent.resumes ? undefined : history }).then(
          (r) => {
            runId.current = r.runId;
            for (const e of early) if (e.runId === r.runId) onEvent(e.ev);
          },
          (e) => {
            const error = bridgeMessage(e);
            patchLast((m) => ({ ...m, status: "error", error }));
            finish(failed(error));
          },
        );
      });
    },
    [bridge, root, agents, messages],
  );

  const stop = useCallback(() => {
    if (runId.current) void bridge?.cancel?.(runId.current);
  }, [bridge]);

  /** A new conversation: the thread empties and the agent starts a fresh session instead of resuming. */
  const clear = useCallback(() => {
    if (runId.current) return;
    setMessages([]);
    for (const key of Object.keys(sessions.current)) if (key.startsWith(`${root}\n`)) delete sessions.current[key];
  }, [root]);

  return { canRun, agents, messages, running, send, stop, clear, refreshAgents: detect };
}

export type AgentChat = ReturnType<typeof useAgentChat>;
