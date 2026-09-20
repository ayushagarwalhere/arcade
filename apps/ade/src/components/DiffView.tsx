"use client";
import { FileDiff, FilePlus2 } from "lucide-react";
import type { RemediationFile } from "@arcade/core/types";

export function DiffFile({ file }: { file: RemediationFile }) {
  return (
    <div className="overflow-hidden rounded-md border border-ade-line bg-ade-base">
      <div className="flex items-center gap-2.5 border-b border-ade-line bg-white/[0.02] px-4 py-2.5">
        {file.status === "A" ? <FilePlus2 className="h-4 w-4 text-emerald-400" /> : <FileDiff className="h-4 w-4 text-amber-300" />}
        <span className="flex-1 truncate font-mono text-[12.5px] text-white/85">{file.path}</span>
        <span className="text-[11px] text-emerald-400">+{file.additions}</span>
        <span className="text-[11px] text-red-400">−{file.deletions}</span>
        <span
          className={`rounded px-1.5 text-[10px] font-bold ${
            file.status === "A" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-400/15 text-amber-200"
          }`}
        >
          {file.status}
        </span>
      </div>
      <div className="overflow-x-auto font-mono text-[12.5px] leading-[1.75]">
        {file.diff.map((l, i) => {
          const bg = l.kind === "add" ? "bg-emerald-500/[0.10]" : l.kind === "del" ? "bg-red-500/[0.10]" : "";
          const tx =
            l.kind === "hunk"
              ? "text-violet-300/80"
              : l.kind === "add"
                ? "text-emerald-100"
                : l.kind === "del"
                  ? "text-red-200"
                  : "text-white/80";
          const sign = l.kind === "add" ? "+" : l.kind === "del" ? "−" : " ";
          return (
            <div key={i} className={`flex whitespace-pre ${bg}`}>
              <span className="w-10 shrink-0 select-none px-2 text-right text-white/25">{l.oldNo ?? ""}</span>
              <span className="w-10 shrink-0 select-none px-2 text-right text-white/25">{l.newNo ?? ""}</span>
              <span className={`w-5 shrink-0 select-none text-center ${l.kind === "add" ? "text-emerald-400" : l.kind === "del" ? "text-red-400" : "text-white/20"}`}>
                {l.kind === "hunk" ? "" : sign}
              </span>
              <span className={`pr-4 ${tx}`}>{l.text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DiffView({ files, commit, summary }: { files: RemediationFile[]; commit?: string; summary?: string }) {
  if (!files.length) {
    return <div className="rounded-md border border-dashed border-ade-line bg-ade-base p-8 text-center text-[13px] text-white/45">No changes yet. A diff appears after the fix is approved.</div>;
  }
  const add = files.reduce((n, f) => n + f.additions, 0);
  const del = files.reduce((n, f) => n + f.deletions, 0);
  return (
    <div className="space-y-3">
      {(commit || summary) && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-ade-line bg-ade-base px-4 py-3">
          {commit && <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-white/70">{commit}</span>}
          {summary && <span className="flex-1 text-[13px] text-white/80">{summary}</span>}
          <span className="text-[11px] text-white/45">
            {files.length} files · <span className="text-emerald-400">+{add}</span> <span className="text-red-400">−{del}</span>
          </span>
        </div>
      )}
      {files.map((f) => (
        <DiffFile key={f.path} file={f} />
      ))}
    </div>
  );
}
