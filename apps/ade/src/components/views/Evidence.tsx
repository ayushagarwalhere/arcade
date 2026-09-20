"use client";
import { useState } from "react";
import { Copy, Download, FileSearch } from "lucide-react";
import type { ArcadeState } from "@arcade/core/types";
import { Badge, SeverityBadge } from "../atoms";
import TimelineList from "../TimelineList";

export default function Evidence({ state }: { state: ArcadeState }) {
  const f = state.finding;
  const ev = f.evidence;
  const [copied, setCopied] = useState(false);
  const AFTER_ATTACK = ["attacked", "defending", "defended", "awaiting-fix-approval", "remediating", "testing", "verifying", "verified"];
  const captured = AFTER_ATTACK.includes(state.phase) && !!ev.artifact;

  const curl = `curl -i -X ${ev.method} '${ev.target}' \\\n  -H 'Cookie: session=<standard-user>' \\\n  -H 'Content-Type: application/json'${ev.requestBody ? ` \\\n  -d '${ev.requestBody}'` : ""}`;

  const copyCurl = async () => {
    try {
      await navigator.clipboard.writeText(curl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked; ignore */
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(f, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${f.id}-evidence.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!captured) {
    return (
      <div className="rounded-md border border-dashed border-ade-line bg-ade-base p-10 text-center">
        <FileSearch className="mx-auto h-6 w-6 text-white/30" />
        <p className="mt-3 text-[13px] text-white/50">No evidence captured yet. Run the attacker to reproduce an exploit.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-[13px] text-white/50">{f.id}</span>
          <h2 className="text-[16px] font-semibold text-white">{f.title}</h2>
          <SeverityBadge severity={f.severity} />
        </div>

        {/* Request */}
        <div className="overflow-hidden rounded-md border border-ade-line bg-ade-base">
          <div className="flex items-center gap-2 border-b border-ade-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">
            Request
            <Badge tone="red" className="ml-auto">
              reproduced
            </Badge>
          </div>
          <div className="space-y-1 p-4 font-mono text-[12.5px]">
            <div>
              <span className="text-emerald-400">{ev.method}</span> <span className="text-white/85">{ev.target}</span>
            </div>
            {ev.requestHeaders.map((h) => (
              <div key={h} className="text-white/55">
                {h}
              </div>
            ))}
            {ev.requestBody && <div className="pt-1 text-white/70">{ev.requestBody}</div>}
          </div>
        </div>

        {/* Response */}
        <div className="overflow-hidden rounded-md border border-red-500/20 bg-ade-base">
          <div className="flex items-center gap-2 border-b border-ade-line px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">
            Response
            <span className="ml-auto font-mono text-[12px] font-bold text-red-300">{ev.statusBefore}</span>
          </div>
          <div className="p-4 font-mono text-[12.5px] leading-6 text-white/75">{ev.responseBody}</div>
          <div className="border-t border-ade-line bg-red-500/[0.05] px-4 py-2.5 text-[12px] text-red-200/90">
            Unauthorized access confirmed — a standard user read privileged data.
          </div>
        </div>

        {/* Reproduction */}
        <div className="rounded-md border border-ade-line bg-ade-base p-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/40">Reproduction</div>
          <ol className="space-y-1.5">
            {ev.steps.map((s, i) => (
              <li key={i} className="flex gap-2.5 text-[13px] text-white/70">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-white/15 text-[11px] text-white/50">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={copyCurl} className="flex items-center gap-1.5 rounded border border-ade-line px-3 py-1.5 text-[12px] text-white/75 transition hover:bg-white/[0.05]">
              <Copy className="h-3.5 w-3.5" /> {copied ? "Copied cURL" : "Copy repro cURL"}
            </button>
            <button onClick={exportJson} className="flex items-center gap-1.5 rounded border border-ade-line px-3 py-1.5 text-[12px] text-white/75 transition hover:bg-white/[0.05]">
              <Download className="h-3.5 w-3.5" /> Export evidence JSON
            </button>
            <span className="font-mono text-[11px] text-white/35">{ev.artifact}</span>
          </div>
        </div>
      </div>

      {/* Evidence timeline */}
      <div className="rounded-md border border-ade-line bg-ade-base p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-[13px] font-semibold text-white/85">Evidence trail</div>
          <span className="text-[11px] text-white/40">captured {ev.capturedAt}</span>
        </div>
        <TimelineList events={f.timeline} empty="The evidence trail fills in as the run progresses." />
      </div>
    </div>
  );
}
