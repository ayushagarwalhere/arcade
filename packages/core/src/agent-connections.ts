/**
 * Coding-agent connections — whether Claude Code and Codex are installed on
 * this machine, and whether Arcade's MCP server is registered with them.
 *
 * Only the desktop shell can see or change this (electron/agents-ipc.js, backed
 * by packages/cli/connect.mjs). In a browser there is no bridge, and the provider list
 * stays a preview.
 */

export interface AgentConnection {
  /** Matches the `AgentProvider` id: "claude-code" | "codex". */
  id: string;
  name: string;
  installed: boolean;
  connected: boolean;
  /** Connected, but to an Arcade server somewhere else on disk. Connecting again repoints it. */
  outdated: boolean;
  /** The agent's own config file, where the registration lives. */
  configPath: string;
  /** Where to get the agent when it isn't installed. */
  install: string;
  /** Set when the agent's config couldn't be read; it is left untouched. */
  error?: string;
}

export interface AgentsBridge {
  status(): Promise<AgentConnection[]>;
  connect(id: string): Promise<AgentConnection>;
  disconnect(id: string): Promise<AgentConnection>;
}

/** Electron prefixes errors thrown in the main process; show only what we wrote. */
export const bridgeMessage = (e: unknown) =>
  (e instanceof Error ? e.message : String(e)).replace(/^Error invoking remote method '[^']+': (\w*Error: )?/, "");
