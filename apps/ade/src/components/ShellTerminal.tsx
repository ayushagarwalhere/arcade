"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Terminal, TermLine } from "@/hooks/useTerminal";

/* ---------------------------------------------------------------- ANSI → spans */
// The 16 standard colours, tuned to read on both dark and light editor grounds.
const FG = ["#6b7280", "#f87171", "#34d399", "#fbbf24", "#60a5fa", "#c084fc", "#22d3ee", "#d1d5db", "#9ca3af", "#fca5a5", "#6ee7b7", "#fde68a", "#93c5fd", "#d8b4fe", "#67e8f9", "#f9fafb"];

interface Style {
  color?: string;
  fontWeight?: number;
  opacity?: number;
  fontStyle?: "italic";
  textDecoration?: "underline";
}

const xterm256 = (n: number) => {
  if (n < 16) return FG[n];
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    return `rgb(${v},${v},${v})`;
  }
  const c = n - 16;
  const step = (x: number) => (x ? 55 + x * 40 : 0);
  return `rgb(${step(Math.floor(c / 36))},${step(Math.floor(c / 6) % 6)},${step(c % 6)})`;
};

// eslint-disable-next-line no-control-regex -- parsing terminal escape codes is the point
const ESC = /\x1b\[([0-9;?]*)([ -/]*[@-~])|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

/** Split a line into styled runs. Only colour and weight are honoured; cursor movement is dropped. */
function parseAnsi(text: string): { text: string; style: Style }[] {
  const runs: { text: string; style: Style }[] = [];
  let style: Style = {};
  let last = 0;
  for (const m of text.matchAll(ESC)) {
    if (m.index > last) runs.push({ text: text.slice(last, m.index), style });
    last = m.index + m[0].length;
    if (m[2] !== "m") continue;
    const codes = (m[1] || "0").split(";").map(Number);
    for (let i = 0; i < codes.length; i++) {
      const c = codes[i];
      if (c === 0) style = {};
      else if (c === 1) style = { ...style, fontWeight: 600 };
      else if (c === 2) style = { ...style, opacity: 0.65 };
      else if (c === 3) style = { ...style, fontStyle: "italic" };
      else if (c === 4) style = { ...style, textDecoration: "underline" };
      else if (c === 22) style = { ...style, fontWeight: undefined, opacity: undefined };
      else if (c >= 30 && c <= 37) style = { ...style, color: FG[c - 30] };
      else if (c >= 90 && c <= 97) style = { ...style, color: FG[c - 82] };
      else if (c === 39) style = { ...style, color: undefined };
      else if (c === 38 && codes[i + 1] === 5) (style = { ...style, color: xterm256(codes[i + 2] ?? 7) }), (i += 2);
      else if (c === 38 && codes[i + 1] === 2) (style = { ...style, color: `rgb(${codes[i + 2] ?? 0},${codes[i + 3] ?? 0},${codes[i + 4] ?? 0})` }), (i += 4);
      else if (c === 48 && codes[i + 1] === 5) i += 2;
      else if (c === 48 && codes[i + 1] === 2) i += 4;
    }
  }
  if (last < text.length) runs.push({ text: text.slice(last), style });
  return runs;
}

const shortDir = (cwd: string) => {
  const parts = cwd.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : cwd;
};

function Row({ l }: { l: TermLine }) {
  const runs = useMemo(() => (l.kind === "in" || l.kind === "note" ? null : parseAnsi(l.text)), [l]);
  if (l.kind === "in") {
    return (
      <div className="flex gap-2 pt-1">
        <span className="shrink-0 select-none text-emerald-400">{shortDir(l.cwd ?? "")} ❯</span>
        <span className="min-w-0 whitespace-pre-wrap break-words text-ade-fg">{l.text}</span>
      </div>
    );
  }
  if (l.kind === "note") return <div className="text-[11px] text-amber-300/90">{l.text}</div>;
  return (
    <div className={`min-h-[1.6em] whitespace-pre-wrap break-words ${l.kind === "err" ? "text-red-300/90" : "text-ade-fg/85"}`}>
      {runs!.map((r, i) => (
        <span key={i} style={r.style}>
          {r.text}
        </span>
      ))}
    </div>
  );
}

/** The terminal: your own shell, in the open folder. */
export default function ShellTerminal({ term }: { term: Terminal }) {
  const [draft, setDraft] = useState("");
  const [cursor, setCursor] = useState(-1); // position in history, -1 = the live draft
  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [term.lines.length, term.running]);

  if (!term.available) {
    return (
      <div className="px-4 py-3 text-[12.5px] leading-[1.6] text-ade-muted">
        <p className="text-ade-fg/90">The terminal runs your own shell, so it needs the desktop app.</p>
        <p className="mt-1">A web page can&apos;t start programs on your computer. Open a folder in the Arcade desktop app and this becomes PowerShell, bash or zsh in that folder. The run log next door shows what Arcade itself did.</p>
      </div>
    );
  }

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const hist = term.history.current;
    if (e.key === "Enter") {
      e.preventDefault();
      void term.exec(draft);
      setDraft("");
      setCursor(-1);
    } else if (e.key === "c" && e.ctrlKey && !window.getSelection()?.toString()) {
      e.preventDefault();
      term.interrupt();
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      e.stopPropagation(); // Ctrl+L is "toggle agent" in the workbench; in a terminal it clears
      term.clear();
    } else if (e.key === "ArrowUp" && hist.length) {
      e.preventDefault();
      const next = cursor < 0 ? hist.length - 1 : Math.max(0, cursor - 1);
      setCursor(next);
      setDraft(hist[next]);
    } else if (e.key === "ArrowDown" && cursor >= 0) {
      e.preventDefault();
      const next = cursor + 1;
      if (next >= hist.length) (setCursor(-1), setDraft(""));
      else (setCursor(next), setDraft(hist[next]));
    }
  };

  return (
    <div ref={scroller} onClick={() => !window.getSelection()?.toString() && input.current?.focus()} className="arcade-term scrollbar-thin h-full cursor-text overflow-y-auto px-4 py-2 text-[12px] leading-[1.6]">
      {term.lines.length === 0 && <div className="text-ade-faint">{term.shell || "Shell"} · each command runs in this folder · Ctrl+C stops it · full-screen programs (vim, htop) aren&apos;t supported</div>}
      {term.lines.map((l, i) => (
        <Row key={i} l={l} />
      ))}
      <div className="flex gap-2 pt-1">
        <span className={`shrink-0 select-none ${term.running ? "text-amber-300" : "text-emerald-400"}`}>{term.running ? "running — Ctrl+C to stop" : `${shortDir(term.cwd)} ❯`}</span>
        <input
          ref={input}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          readOnly={term.running}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label="Terminal input"
          className="min-w-0 flex-1 bg-transparent text-ade-fg caret-ade-fg outline-none"
        />
      </div>
    </div>
  );
}
