/**
 * The desktop shell's bridges that do real work on the user's machine: git in
 * the opened folder, running an installed coding agent, and a terminal.
 *
 * These are the types of what electron/preload.js exposes as `window.arcade`.
 * None of it exists in a browser — there is no git, no agent CLI and no shell to
 * reach from a web page — so callers check for the bridge and say so plainly
 * when it is missing instead of pretending.
 */

/* ---------------------------------------------------------------------- git */

/** Every git call resolves (never rejects): failures come back as data with git's own message. */
export type GitResult<T> = { ok: true; value: T } | { ok: false; error: string; code?: string | number };

export interface GitInfo {
  /** false when git itself isn't installed. */
  installed: boolean;
  repo: boolean;
  /** Set when the folder sits inside another repository rather than being one. */
  parentRepo?: string;
  branch?: string | null;
  detached?: boolean;
  head?: string | null;
  remote?: string | null;
  upstream?: string | null;
  ahead?: number;
  behind?: number;
  /** null until `git config user.name / user.email` are set; a commit needs them. */
  user?: { name: string; email: string } | null;
}

export type GitFileStatus = "modified" | "added" | "deleted" | "renamed" | "copied" | "conflicted" | "type-changed" | "untracked";

export interface GitChange {
  path: string;
  status: GitFileStatus;
  /** One letter, as a source-control gutter shows it. */
  code: string;
  from?: string;
}

export interface GitStatus {
  staged: GitChange[];
  unstaged: GitChange[];
  clean: boolean;
}

export interface GitCommit {
  sha: string;
  short: string;
  author: string;
  date: string;
  subject: string;
}

export interface GitBridge {
  info(root: string): Promise<GitResult<GitInfo>>;
  status(root: string): Promise<GitResult<GitStatus>>;
  diff(root: string, path: string, staged?: boolean): Promise<GitResult<{ text: string; truncated: boolean }>>;
  /** The file's text at HEAD; null when it isn't in HEAD (a new file). */
  show(root: string, path: string): Promise<GitResult<string | null>>;
  log(root: string, limit?: number): Promise<GitResult<GitCommit[]>>;
  branches(root: string): Promise<GitResult<{ name: string; current: boolean }[]>>;
  init(root: string): Promise<GitResult<GitInfo>>;
  /** No paths stages everything. */
  stage(root: string, paths?: string[]): Promise<GitResult<void>>;
  unstage(root: string, paths: string[]): Promise<GitResult<void>>;
  /** Not undoable: restores tracked files and deletes the named untracked ones. */
  discard(root: string, paths: string[]): Promise<GitResult<void>>;
  checkout(root: string, branch: string, create?: boolean): Promise<GitResult<GitInfo>>;
  commit(root: string, message: string, opts?: { all?: boolean; paths?: string[] }): Promise<GitResult<{ sha: string; short: string; files: number; branch: string | null }>>;
  /** Authenticated in the main process with the connected GitHub account, when there is one. */
  push(root: string, branch?: string): Promise<GitResult<{ branch: string; remote: string }>>;
}

/* ------------------------------------------------------------------- agents */

/** An agent CLI Arcade knows how to drive, and whether it is on this machine. */
export interface RunnableAgent {
  id: string;
  name: string;
  runnable: boolean;
  binary: string | null;
  install: string;
  /** Follow-ups continue the agent's own session rather than re-sending the conversation. */
  resumes: boolean;
}

/** "read" may look at the project; "edit" may also change files in it. */
export type AgentMode = "read" | "edit";

export type AgentEvent =
  | { type: "start"; sessionId?: string; model?: string }
  | { type: "text"; text: string; delta: boolean }
  | { type: "tool"; id?: string; name: string; summary: string }
  | { type: "tool-result"; id?: string; ok: boolean }
  | { type: "file"; path: string; kind: "edit" | "create" | "delete" }
  | { type: "log"; text: string }
  | { type: "done"; ok: boolean; cancelled: boolean; exitCode?: number | null; sessionId?: string; resumable?: boolean; costUsd?: number; durationMs?: number; error?: string };

export interface AgentRunRequest {
  id: string;
  prompt: string;
  mode: AgentMode;
  model?: string;
  sessionId?: string;
  history?: { role: "user" | "assistant"; text: string }[];
}

export interface AgentRunBridge {
  detect(): Promise<RunnableAgent[]>;
  run(root: string, request: AgentRunRequest): Promise<{ runId: string }>;
  cancel(runId: string): Promise<void>;
  onEvent(handler: (e: { runId: string; ev: AgentEvent }) => void): () => void;
}

/* ----------------------------------------------------------------- terminal */

export type TerminalEvent = { id: string } & ({ kind: "out" | "err"; data: string } | { kind: "exit"; code: number; cwd: string });

export interface TerminalBridge {
  shells(): Promise<{ id: string; name: string }[]>;
  open(root: string, shellId?: string): Promise<{ id: string; cwd: string; shell: { id: string; name: string } }>;
  /** Starts the command; its output and exit arrive through `onEvent`. */
  exec(id: string, line: string): Promise<void>;
  interrupt(id: string): Promise<void>;
  close(id: string): Promise<void>;
  /** The project's own test command, read from its manifest by the main process. */
  detectTests(root: string): Promise<{ command: string; source: string } | null>;
  onEvent(handler: (e: TerminalEvent) => void): () => void;
}

/** Unwrap a GitResult, throwing git's message. */
export function unwrap<T>(r: GitResult<T>): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
