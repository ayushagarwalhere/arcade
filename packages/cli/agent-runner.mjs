// Arcade agent runner — drives the coding agents installed on this machine.
//
// `connect.mjs` registers Arcade's MCP server *with* an agent. This module goes
// the other way: it finds the agent's own CLI, runs a prompt through it headlessly
// inside a project folder, and turns whatever that CLI prints into one small event
// vocabulary the desktop app and the `arcade agent` command both render.
//
// Two rules keep it safe to feed with text a person typed:
//   - prompt text only ever travels over stdin. npm-installed agents are `.cmd`
//     shims on Windows and have to be launched through a shell, so nothing a user
//     wrote may appear in argv. Every argument below is a fixed flag or a value
//     checked against a strict pattern.
//   - the working directory is set on the child process, never passed as an argument.
//
// Dependency-free.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findOnPath } from "./connect.mjs";

export class AgentError extends Error {}

const WIN = process.platform === "win32";
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
// A model alias or id ("sonnet", "claude-opus-5", "gpt-5.1-codex", "gemini-2.5-pro"). It reaches argv, so it is checked.
const MODEL = /^[A-Za-z0-9][A-Za-z0-9._:\-[\]]{0,79}$/;
const MAX_LINE = 4000;

/* ---------------------------------------------------------------- discovery */

/** Newest first, so the most recent editor-extension build wins. */
function newest(dir, prefix) {
  try {
    return fs
      .readdirSync(dir)
      .filter((n) => n.startsWith(prefix))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
      .map((n) => path.join(dir, n));
  } catch {
    return [];
  }
}

const exe = (name) => (WIN ? `${name}.exe` : name);

/** Places an agent's binary lives when it isn't on PATH (editor extensions, native installers). */
function claudeCandidates(home) {
  const out = [path.join(home, ".local", "bin", exe("claude")), path.join(home, ".claude", "local", exe("claude"))];
  for (const editor of [".vscode", ".vscode-insiders", ".cursor", ".windsurf"]) {
    for (const ext of newest(path.join(home, editor, "extensions"), "anthropic.claude-code-")) out.push(path.join(ext, "resources", "native-binary", exe("claude")));
  }
  return out;
}

const isFile = (fp) => {
  try {
    return fs.statSync(fp).isFile();
  } catch {
    return false;
  }
};

/* ------------------------------------------------------------------ parsers */
// Each parser takes one line of the CLI's stdout and returns zero or more events:
//   { type: "start", sessionId?, model? }
//   { type: "text", text, delta }        delta: append to the message being written
//   { type: "tool", id, name, summary }  the agent is doing something
//   { type: "tool-result", id, ok, summary? }
//   { type: "file", path, kind }         "edit" | "create" | "delete"
//   { type: "log", text }                anything unstructured
//   { type: "result", ok, sessionId?, costUsd?, durationMs?, error? }

const clip = (s, n = 160) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function json(line) {
  const t = line.trim();
  if (!t.startsWith("{")) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

/** One line describing a tool call, from the inputs agents commonly use. */
function toolSummary(name, input = {}) {
  const target = input.file_path ?? input.path ?? input.notebook_path ?? input.filePath;
  if (target) return clip(target);
  if (input.command) return clip(Array.isArray(input.command) ? input.command.join(" ") : input.command);
  if (input.pattern) return clip(`${input.pattern}${input.glob ? ` in ${input.glob}` : ""}`);
  if (input.query) return clip(input.query);
  if (input.url) return clip(input.url);
  if (input.description) return clip(input.description);
  return "";
}

const EDIT_TOOLS = { Edit: "edit", MultiEdit: "edit", NotebookEdit: "edit", Write: "create", write_file: "create", replace: "edit", edit: "edit" };

function fileEvents(name, input = {}) {
  const kind = EDIT_TOOLS[name];
  const target = input.file_path ?? input.path ?? input.notebook_path ?? input.filePath;
  return kind && typeof target === "string" ? [{ type: "file", path: target, kind }] : [];
}

/** Claude Code `--output-format stream-json` (Cursor's agent CLI prints the same shape). */
function claudeParser() {
  let streamed = false; // text for the current block already arrived as deltas
  return (line) => {
    const m = json(line);
    if (!m) return line.trim() ? [{ type: "log", text: line }] : [];
    if (m.type === "system" && m.subtype === "init") return [{ type: "start", sessionId: m.session_id, model: m.model }];
    if (m.type === "stream_event") {
      const d = m.event?.delta;
      if (m.event?.type === "content_block_delta" && d?.type === "text_delta" && d.text) {
        streamed = true;
        return [{ type: "text", text: d.text, delta: true }];
      }
      return [];
    }
    if (m.type === "assistant") {
      const out = [];
      for (const block of m.message?.content ?? []) {
        if (block.type === "text" && block.text) {
          if (streamed) streamed = false;
          else out.push({ type: "text", text: block.text, delta: false });
        } else if (block.type === "tool_use") {
          out.push({ type: "tool", id: block.id, name: block.name, summary: toolSummary(block.name, block.input) }, ...fileEvents(block.name, block.input));
        }
      }
      return out;
    }
    if (m.type === "user") {
      const out = [];
      for (const block of Array.isArray(m.message?.content) ? m.message.content : []) {
        if (block.type === "tool_result") out.push({ type: "tool-result", id: block.tool_use_id, ok: !block.is_error });
      }
      return out;
    }
    if (m.type === "result") {
      const ok = m.subtype === "success" && !m.is_error;
      return [{ type: "result", ok, sessionId: m.session_id, costUsd: m.total_cost_usd, durationMs: m.duration_ms, error: ok ? undefined : clip(m.result ?? m.subtype ?? "The agent stopped with an error", 400) }];
    }
    return [];
  };
}

/** Codex `exec --json`: thread / turn / item events. */
function codexParser() {
  return (line) => {
    const m = json(line);
    if (!m) return line.trim() ? [{ type: "log", text: line }] : [];
    if (m.type === "thread.started") return [{ type: "start", sessionId: m.thread_id }];
    if (m.type === "error" || m.type === "turn.failed") return [{ type: "result", ok: false, error: clip(m.message ?? m.error?.message ?? "Codex reported an error", 400) }];
    if (m.type === "turn.completed") return [{ type: "result", ok: true }];
    const item = m.item;
    if (!item) return [];
    const done = m.type === "item.completed";
    if (item.type === "agent_message") return done && item.text ? [{ type: "text", text: item.text, delta: false }] : [];
    if (item.type === "command_execution") {
      if (m.type === "item.started") return [{ type: "tool", id: item.id, name: "Shell", summary: clip(item.command) }];
      return done ? [{ type: "tool-result", id: item.id, ok: (item.exit_code ?? 0) === 0 }] : [];
    }
    if (item.type === "file_change" && done) {
      return (item.changes ?? []).map((c) => ({ type: "file", path: c.path, kind: c.kind === "add" ? "create" : c.kind === "delete" ? "delete" : "edit" }));
    }
    if (item.type === "mcp_tool_call" && m.type === "item.started") return [{ type: "tool", id: item.id, name: `${item.server}.${item.tool}`, summary: "" }];
    if (item.type === "web_search" && done) return [{ type: "tool", id: item.id, name: "WebSearch", summary: clip(item.query) }];
    return [];
  };
}

/** Gemini CLI `--output-format stream-json`. */
function geminiParser() {
  return (line) => {
    const m = json(line);
    if (!m) return line.trim() ? [{ type: "log", text: line }] : [];
    if (m.type === "init") return [{ type: "start", sessionId: m.session_id, model: m.model }];
    if (m.type === "message" && m.role === "assistant" && m.content) return [{ type: "text", text: String(m.content), delta: !!m.delta }];
    if (m.type === "tool_use") return [{ type: "tool", id: m.tool_id, name: m.tool_name, summary: toolSummary(m.tool_name, m.parameters) }, ...fileEvents(m.tool_name, m.parameters)];
    if (m.type === "tool_result") return [{ type: "tool-result", id: m.tool_id, ok: m.status !== "error" }];
    if (m.type === "error") return [{ type: "log", text: clip(m.message, 400) }];
    if (m.type === "result") return [{ type: "result", ok: m.status !== "error", durationMs: m.stats?.duration_ms, error: m.status === "error" ? clip(m.error?.message ?? "Gemini reported an error", 400) : undefined }];
    return [];
  };
}

/** A CLI with no machine-readable mode: every line it prints is the answer. */
function textParser() {
  return (line) => [{ type: "text", text: `${line}\n`, delta: true }];
}

/* ------------------------------------------------------------------ runners */

// `mode` is "read" (look, don't touch) or "edit" (may change files in the folder).
const RUNNERS = [
  {
    id: "claude-code",
    name: "Claude Code",
    bin: "claude",
    install: "https://claude.com/claude-code",
    candidates: claudeCandidates,
    resumes: true,
    args: ({ mode, sessionId, model }) => [
      "-p",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--permission-mode",
      mode === "edit" ? "acceptEdits" : "plan",
      ...(model ? ["--model", model] : []),
      ...(sessionId ? ["--resume", sessionId] : []),
    ],
    parser: claudeParser,
  },
  {
    id: "codex",
    name: "Codex",
    bin: "codex",
    install: "https://github.com/openai/codex",
    candidates: () => [],
    args: ({ mode, model }) => ["exec", "--json", "--skip-git-repo-check", "--sandbox", mode === "edit" ? "workspace-write" : "read-only", ...(model ? ["--model", model] : []), "-"],
    parser: codexParser,
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    bin: "gemini",
    install: "https://github.com/google-gemini/gemini-cli",
    candidates: () => [],
    args: ({ mode, model }) => ["--output-format", "stream-json", "--approval-mode", mode === "edit" ? "auto_edit" : "default", ...(model ? ["--model", model] : [])],
    parser: geminiParser,
  },
  {
    id: "cursor",
    name: "Cursor CLI",
    bin: "cursor-agent",
    install: "https://cursor.com/cli",
    candidates: (home) => [path.join(home, ".local", "bin", exe("cursor-agent"))],
    args: ({ mode }) => ["-p", "--output-format", "stream-json", ...(mode === "edit" ? ["--force"] : [])],
    parser: claudeParser,
  },
  {
    id: "opencode",
    name: "OpenCode",
    bin: "opencode",
    install: "https://opencode.ai",
    candidates: (home) => [path.join(home, ".opencode", "bin", exe("opencode"))],
    args: () => ["run"],
    parser: textParser,
  },
];

export const RUNNER_IDS = RUNNERS.map((r) => r.id);

const ALIASES = { claude: "claude-code", claudecode: "claude-code", "cursor-agent": "cursor", "gemini-cli": "gemini" };

function runnerFor(id) {
  const key = String(id).toLowerCase();
  const runner = RUNNERS.find((r) => r.id === (ALIASES[key] ?? key));
  if (!runner) throw new AgentError(`Unknown agent "${id}". Arcade can run: ${RUNNER_IDS.join(", ")}.`);
  return runner;
}

const context = (opts = {}) => ({ home: opts.home || os.homedir(), env: opts.env || process.env });

/** Absolute path of the agent's CLI, or null. Nothing is executed. */
export function findAgentBinary(id, opts) {
  const runner = runnerFor(id);
  const { home, env } = context(opts);
  return findOnPath(runner.bin, env) ?? runner.candidates(home).find(isFile) ?? null;
}

/** Every agent Arcade knows how to drive, and whether its CLI is on this machine. */
export function detectAgents(opts) {
  return RUNNERS.map((r) => {
    const binary = findAgentBinary(r.id, opts);
    return { id: r.id, name: r.name, runnable: !!binary, binary, install: r.install, resumes: !!r.resumes };
  });
}

/* ---------------------------------------------------------------------- run */

/** The child must not inherit switches that change how a nested CLI behaves. */
function childEnv(env) {
  const out = { ...env };
  for (const k of ["ELECTRON_RUN_AS_NODE", "CLAUDECODE", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_CODE_SSE_PORT"]) delete out[k];
  return out;
}

function killTree(child) {
  if (child.exitCode != null || !child.pid) return;
  if (WIN) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("error", () => {});
  else child.kill("SIGTERM");
}

/** cmd.exe quoting for our own fixed arguments and the binary's path. */
const quote = (s) => (/[\s&()^%!"]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/**
 * Agents other than Claude Code don't resume a session headlessly, so a follow-up
 * carries the conversation so far in its prompt instead.
 */
function withHistory(prompt, history = []) {
  if (!history.length) return prompt;
  const past = history.map((t) => `${t.role === "user" ? "User" : "Assistant"}: ${t.text}`).join("\n\n");
  return `This continues an earlier conversation.\n\n<conversation>\n${past}\n</conversation>\n\n${prompt}`;
}

/**
 * Run one prompt through an agent inside `cwd`. Events stream through `onEvent`;
 * the promise settles when the process exits. Abort `signal` to stop it.
 */
export function runAgent({ id, cwd, prompt, mode = "read", model, sessionId, history, onEvent = () => {}, signal, home, env }) {
  const runner = runnerFor(id);
  if (typeof prompt !== "string" || !prompt.trim()) throw new AgentError("There is no prompt to send.");
  if (mode !== "read" && mode !== "edit") throw new AgentError(`Unknown mode "${mode}".`);
  if (sessionId != null && !SESSION_ID.test(sessionId)) throw new AgentError("That session id isn't one an agent issued.");
  if (model != null && model !== "" && !MODEL.test(model)) throw new AgentError(`"${model}" isn't a model name.`);
  if (!fs.statSync(cwd, { throwIfNoEntry: false })?.isDirectory()) throw new AgentError(`${cwd} is not a folder.`);

  const binary = findAgentBinary(runner.id, { home, env });
  if (!binary) throw new AgentError(`${runner.name} isn't installed on this machine. Install it from ${runner.install}, sign in once, then try again.`);

  const resume = runner.resumes ? sessionId : undefined;
  const args = runner.args({ mode, sessionId: resume, model: model || undefined });
  const viaShell = WIN && /\.(cmd|bat)$/i.test(binary);
  // Through a shell, the whole command line is ours to build: one string of fixed, quoted pieces.
  // (Handing Node an args array together with `shell: true` is deprecated — it joins them unescaped.)
  const child = viaShell
    ? spawn([binary, ...args].map(quote).join(" "), { cwd, env: childEnv(env || process.env), shell: true, windowsHide: true })
    : spawn(binary, args, { cwd, env: childEnv(env || process.env), windowsHide: true });

  return new Promise((resolve, reject) => {
    const parse = runner.parser();
    const started = Date.now();
    let result = null;
    let session = resume;
    let stderr = "";
    let settled = false;

    const emit = (ev) => {
      if (ev.type === "start" && ev.sessionId) session = ev.sessionId;
      if (ev.type === "result") {
        result = ev;
        if (ev.sessionId) session = ev.sessionId;
        return; // reported once, from the exit handler
      }
      onEvent(ev);
    };

    const lines = (stream, handle) => {
      let buf = "";
      stream.setEncoding("utf8");
      stream.on("data", (chunk) => {
        buf += chunk;
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          handle(buf.slice(0, nl).replace(/\r$/, ""));
          buf = buf.slice(nl + 1);
        }
        if (buf.length > 1024 * 1024) (handle(buf), (buf = "")); // a CLI that never breaks its lines
      });
      stream.on("end", () => buf && handle(buf));
    };

    lines(child.stdout, (line) => {
      for (const ev of parse(line)) emit(ev);
    });
    lines(child.stderr, (line) => {
      stderr = `${stderr}${line}\n`.slice(-MAX_LINE);
      if (line.trim()) onEvent({ type: "log", text: line.slice(0, MAX_LINE) });
    });

    const abort = () => killTree(child);
    if (signal) {
      if (signal.aborted) abort();
      else signal.addEventListener("abort", abort, { once: true });
    }

    child.on("error", (e) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      reject(new AgentError(`Could not start ${runner.name}: ${e.message}`));
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", abort);
      const cancelled = !!signal?.aborted;
      const ok = !cancelled && (result ? result.ok : code === 0);
      const error = cancelled ? "Stopped." : ok ? undefined : (result?.error ?? clip(stderr, 400)) || `${runner.name} exited with code ${code}.`;
      const done = { ok, cancelled, exitCode: code, sessionId: session, resumable: !!runner.resumes && !!session, costUsd: result?.costUsd, durationMs: result?.durationMs ?? Date.now() - started, error };
      onEvent({ type: "done", ...done });
      resolve(done);
    });

    child.stdin.on("error", () => {}); // a CLI that exits before reading its prompt
    child.stdin.end(runner.resumes ? prompt : withHistory(prompt, history));
  });
}
