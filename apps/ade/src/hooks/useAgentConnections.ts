"use client";
import { useCallback, useEffect, useState } from "react";
import { bridgeMessage, type AgentConnection } from "@arcade/core/agent-connections";

export interface AgentConnections {
  /** null outside the desktop app, where connections can't be seen or changed. */
  list: AgentConnection[] | null;
  /** The agent id being connected or disconnected right now. */
  busy: string | null;
  error: string | null;
  setConnected: (id: string, connected: boolean) => void;
}

/** Real Claude Code / Codex connection state, re-read whenever the window regains focus. */
export function useAgentConnections(): AgentConnections {
  const [list, setList] = useState<AgentConnection[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const bridge = window.arcade?.agents;
    if (!bridge) return;
    // Installing an agent, or editing its config, happens outside this window.
    const refresh = () => bridge.status().then(setList, () => {});
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  const setConnected = useCallback(async (id: string, connected: boolean) => {
    const bridge = window.arcade?.agents;
    if (!bridge) return;
    setBusy(id);
    setError(null);
    try {
      const next = await (connected ? bridge.connect(id) : bridge.disconnect(id));
      setList((l) => l && l.map((a) => (a.id === next.id ? next : a)));
    } catch (e) {
      setError(bridgeMessage(e));
    } finally {
      setBusy(null);
    }
  }, []);

  return { list, busy, error, setConnected };
}
