"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { bridgeMessage } from "@arcade/core/agent-connections";

export interface TermLine {
  /** "in" is a command the user ran; "note" is something the terminal itself says. */
  kind: "in" | "out" | "err" | "note";
  text: string;
  cwd?: string;
}

const MAX_LINES = 4000;
const MAX_HISTORY = 200;

/**
 * A real shell session in the open folder (electron/terminal-ipc.js). Lives at page
 * level so its scrollback and working directory survive hiding the panel.
 */
export function useTerminal(root: string | null, shellId: string) {
  const bridge = typeof window !== "undefined" ? window.arcade?.terminal : undefined;
  const available = !!bridge && !!root;

  const [lines, setLines] = useState<TermLine[]>([]);
  const [cwd, setCwd] = useState(root ?? "");
  const [running, setRunning] = useState(false);
  const [shell, setShell] = useState("");
  const session = useRef<string | null>(null);
  const opening = useRef<Promise<string | null> | null>(null);
  const partial = useRef<{ out: string; err: string }>({ out: "", err: "" });
  const history = useRef<string[]>([]);

  const push = useCallback((add: TermLine[]) => setLines((ls) => (ls.length + add.length > MAX_LINES ? [...ls, ...add].slice(-MAX_LINES) : [...ls, ...add])), []);

  // One subscription for the life of the hook; events carry the session they belong to.
  useEffect(() => {
    if (!bridge) return;
    return bridge.onEvent((e) => {
      if (e.id !== session.current) return;
      if (e.kind === "exit") {
        const rest: TermLine[] = [];
        for (const k of ["out", "err"] as const) {
          if (partial.current[k]) rest.push({ kind: k, text: partial.current[k] });
          partial.current[k] = "";
        }
        if (e.code !== 0) rest.push({ kind: "note", text: `exit ${e.code}` });
        if (rest.length) push(rest);
        setCwd(e.cwd);
        setRunning(false);
        return;
      }
      // Whole lines are committed; the unfinished tail waits for its newline. A bare \r
      // (a progress bar redrawing itself) keeps only what follows it.
      const text = partial.current[e.kind] + e.data;
      const parts = text.split("\n");
      partial.current[e.kind] = (parts.pop() ?? "").split("\r").pop() ?? "";
      if (parts.length) push(parts.map((p) => ({ kind: e.kind, text: (p.replace(/\r$/, "").split("\r").pop() ?? "") })));
    });
  }, [bridge, push]);

  // A different folder, or a different shell, is a different session: clear the screen now…
  const sessionKey = `${root ?? ""}\n${shellId}`;
  const [shownKey, setShownKey] = useState(sessionKey);
  if (shownKey !== sessionKey) {
    setShownKey(sessionKey);
    setLines([]);
    setCwd(root ?? "");
    setRunning(false);
  }
  // …and close the old process once the new one is in place.
  useEffect(() => {
    const refs = { session, opening, partial };
    refs.partial.current = { out: "", err: "" };
    return () => {
      if (refs.session.current) void bridge?.close(refs.session.current);
      refs.session.current = null;
      refs.opening.current = null;
    };
  }, [bridge, root, shellId]);

  const ensure = useCallback(() => {
    if (!bridge || !root) return Promise.resolve(null);
    if (session.current) return Promise.resolve(session.current);
    return (opening.current ??= bridge.open(root, shellId || undefined).then(
      (s) => {
        session.current = s.id;
        setCwd(s.cwd);
        setShell(s.shell.name);
        return s.id;
      },
      (e) => {
        opening.current = null;
        push([{ kind: "err", text: bridgeMessage(e) }]);
        return null;
      },
    ));
  }, [bridge, root, shellId, push]);

  // Open on first use of the hook so the prompt shows the right shell and folder.
  useEffect(() => {
    if (available) void ensure();
  }, [available, ensure]);

  const exec = useCallback(
    async (line: string) => {
      const text = line.trim();
      if (!bridge || running) return;
      if (text === "clear" || text === "cls") return setLines([]);
      const id = await ensure();
      if (!id) return;
      if (text) history.current = [...history.current.filter((h) => h !== text), text].slice(-MAX_HISTORY);
      push([{ kind: "in", text, cwd }]);
      if (!text) return;
      setRunning(true);
      try {
        await bridge.exec(id, text);
      } catch (e) {
        push([{ kind: "err", text: bridgeMessage(e) }]);
        setRunning(false);
      }
    },
    [bridge, running, ensure, push, cwd],
  );

  const interrupt = useCallback(() => {
    if (session.current && running) void bridge?.interrupt(session.current);
  }, [bridge, running]);

  return { available, lines, cwd, running, shell, exec, interrupt, clear: () => setLines([]), history };
}

export type Terminal = ReturnType<typeof useTerminal>;
