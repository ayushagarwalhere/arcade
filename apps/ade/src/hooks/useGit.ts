"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GitBridge, GitInfo, GitResult, GitStatus } from "@arcade/core/desktop";

export interface Git {
  /** false in a browser, or for a workspace that isn't a local folder: there is no git to run. */
  available: boolean;
  root: string | null;
  info: GitInfo | null;
  status: GitStatus | null;
  /** The operation in flight, for disabling buttons and showing a spinner. */
  busy: string | null;
  error: string | null;
  refresh: () => Promise<void>;
  clearError: () => void;
  /** Run one git operation, then refresh. Resolves to its value, or null when it failed (see `error`). */
  act: <T>(label: string, op: (git: GitBridge, root: string) => Promise<GitResult<T>>) => Promise<T | null>;
}

/** Real git state for a local workspace folder, kept fresh on window focus and after every operation. */
export function useGit(root: string | null): Git {
  const bridge = typeof window !== "undefined" ? window.arcade?.git : undefined;
  const available = !!bridge && !!root;
  const [info, setInfo] = useState<GitInfo | null>(null);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    if (!bridge || !root) return;
    const mine = ++seq.current;
    const i = await bridge.info(root);
    if (mine !== seq.current) return; // a newer refresh (or another folder) has taken over
    if (!i.ok) {
      setInfo(null);
      setStatus(null);
      setError(i.error);
      return;
    }
    setInfo(i.value);
    if (!i.value.repo) return setStatus(null);
    const s = await bridge.status(root);
    if (mine !== seq.current) return;
    if (s.ok) setStatus(s.value);
    else setError(s.error);
  }, [bridge, root]);

  // A different folder starts from nothing, rather than showing the last one's branch while it loads.
  const [shownRoot, setShownRoot] = useState(root);
  if (shownRoot !== root) {
    setShownRoot(root);
    setInfo(null);
    setStatus(null);
    setError(null);
  }

  useEffect(() => {
    if (!available) return;
    const counter = seq;
    // Commits, checkouts and edits made outside the app show up when you come back to it.
    const onFocus = () => void refresh();
    const first = setTimeout(onFocus, 0); // the first read, as an event like the rest
    window.addEventListener("focus", onFocus);
    return () => {
      clearTimeout(first);
      window.removeEventListener("focus", onFocus);
      counter.current++; // retire a refresh still in flight for the old folder
    };
  }, [available, refresh]);

  const act: Git["act"] = useCallback(
    async (label, op) => {
      if (!bridge || !root) return null;
      setBusy(label);
      setError(null);
      try {
        const r = await op(bridge, root);
        if (!r.ok) {
          setError(r.error);
          return null;
        }
        return r.value;
      } finally {
        setBusy(null);
        await refresh();
      }
    },
    [bridge, root, refresh],
  );

  return { available, root, info, status, busy, error, refresh, clearError: () => setError(null), act };
}
