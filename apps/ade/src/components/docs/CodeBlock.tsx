"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

/* A deliberately small highlighter: enough to make shell sessions, JSON and
   diffs readable without shipping a grammar engine. */

const JSON_TOKEN = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g;

function jsonLine(line: string) {
  const out: React.ReactNode[] = [];
  let last = 0;
  for (const m of line.matchAll(JSON_TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push(line.slice(last, at));
    if (m[1] && m[2]) out.push(<span key={at} className="text-sky-300/90">{m[1]}</span>, m[2]);
    else if (m[1]) out.push(<span key={at} className="text-emerald-300/90">{m[1]}</span>);
    else if (m[3]) out.push(<span key={at} className="text-violet-300">{m[3]}</span>);
    else out.push(<span key={at} className="text-amber-300/90">{m[4]}</span>);
    last = at + m[0].length;
  }
  if (last < line.length) out.push(line.slice(last));
  return out;
}

function shellLine(line: string) {
  if (/^\s*#/.test(line)) return <span className="text-white/35">{line}</span>;
  const prompt = /^(\$|>) /.exec(line);
  const body = prompt ? line.slice(2) : line;
  const hash = body.search(/\s{2,}#\s/);
  const cmd = hash >= 0 ? body.slice(0, hash) : body;
  return (
    <>
      {prompt && <span className="select-none text-white/30">{prompt[1]} </span>}
      <span className={prompt ? "text-white/90" : undefined}>{cmd}</span>
      {hash >= 0 && <span className="text-white/35">{body.slice(hash)}</span>}
    </>
  );
}

function diffLine(line: string) {
  if (line.startsWith("@@")) return <span className="text-violet-300">{line}</span>;
  if (line.startsWith("+")) return <span className="text-emerald-300">{line}</span>;
  if (line.startsWith("-")) return <span className="text-red-300">{line}</span>;
  return line;
}

function render(line: string, lang: string): React.ReactNode {
  if (lang === "json") return jsonLine(line);
  if (lang === "bash" || lang === "powershell") return shellLine(line);
  if (lang === "diff") return diffLine(line);
  return line;
}

/** What "copy" should put on the clipboard: commands only, without prompts or sample output. */
function copyText(code: string, lang: string): string {
  if (lang !== "bash") return code;
  const lines = code.split("\n");
  const prompted = lines.filter((l) => l.startsWith("$ "));
  return prompted.length ? prompted.map((l) => l.slice(2).replace(/\s{2,}#\s.*$/, "")).join("\n") : code;
}

export default function CodeBlock({ code, lang, title }: { code: string; lang: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText(code, lang));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable (insecure context) — nothing useful to do */
    }
  };

  return (
    <div className="group relative mt-5 overflow-hidden rounded-xl border border-white/10 bg-ink-900">
      {title && (
        <div className="flex h-9 items-center border-b border-white/[0.07] bg-white/[0.02] px-4 font-mono text-[12px] text-white/45">{title}</div>
      )}
      <button
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy code"}
        className={`absolute right-2 z-10 grid h-7 w-7 place-items-center rounded-md border border-white/10 bg-ink-800 text-white/50 opacity-0 transition hover:text-white focus-visible:opacity-100 group-hover:opacity-100 ${title ? "top-10" : "top-2"}`}
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre className="scrollbar-thin overflow-x-auto p-4 font-mono text-[13px] leading-[1.75] text-white/70">
        <code>
          {code.split("\n").map((line, i) => (
            <span key={i} className="block min-h-[1.75em]">
              {render(line, lang)}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}
