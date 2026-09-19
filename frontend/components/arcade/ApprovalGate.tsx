"use client";
import { AlertTriangle, GitCompareArrows, Lock, ShieldCheck, X } from "lucide-react";
import type { Approval } from "@/lib/arcade/types";

export default function ApprovalGate({
  approval,
  onApprove,
  onReject,
  onReviewDiff,
}: {
  approval: Approval;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onReviewDiff: () => void;
}) {
  const destructive = approval.kind === "destructive";
  const ship = approval.kind === "ship";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-[460px] overflow-hidden rounded-2xl border border-white/12 bg-ink-850 shadow-2xl">
        <div
          className={`flex items-center gap-2.5 border-b px-5 py-3.5 ${
            destructive ? "border-red-500/25 bg-red-500/[0.06]" : "border-violet-500/25 bg-violet-500/[0.06]"
          }`}
        >
          <span
            className={`grid h-7 w-7 place-items-center rounded-lg ${
              destructive ? "bg-red-500/15 text-red-300" : "bg-violet-500/15 text-violet-300"
            }`}
          >
            {destructive ? <AlertTriangle className="h-4 w-4" /> : ship ? <ShieldCheck className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </span>
          <div className="flex-1">
            <div className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${destructive ? "text-red-300" : "text-violet-300"}`}>
              {destructive ? "Destructive action" : "Approval required"}
            </div>
          </div>
          <button onClick={() => onReject(approval.id)} className="text-white/40 transition hover:text-white/80" aria-label="Dismiss">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4">
          <h2 className="text-[17px] font-semibold text-white">{approval.title}</h2>
          <p className="mt-1.5 text-[13px] leading-6 text-white/60">{approval.reason}</p>

          <div className="mt-3.5 rounded-lg border border-white/10 bg-black/40 px-3.5 py-2.5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-white/35">
              {destructive ? "Target" : "Files / target"}
            </div>
            <div className="mt-1 break-words font-mono text-[12px] text-white/80">{approval.target}</div>
          </div>

          {ship && (
            <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/[0.05] px-3.5 py-2.5 text-[12px] text-emerald-200/90">
              ARC-001 verified fixed · original exploit returns 403 · 156/156 tests pass
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            {!destructive && (
              <button
                onClick={onReviewDiff}
                className="flex items-center gap-1.5 rounded-lg border border-white/12 px-3.5 py-2.5 text-[13px] font-medium text-white/80 transition hover:bg-white/[0.05]"
              >
                <GitCompareArrows className="h-4 w-4" /> Review diff
              </button>
            )}
            <div className="flex-1" />
            <button
              onClick={() => onReject(approval.id)}
              className="rounded-lg border border-white/12 px-3.5 py-2.5 text-[13px] font-medium text-white/70 transition hover:bg-white/[0.05]"
            >
              {destructive ? "Deny" : "Reject"}
            </button>
            <button
              onClick={() => onApprove(approval.id)}
              className={`rounded-lg px-4 py-2.5 text-[13px] font-semibold text-black transition ${
                destructive ? "bg-red-400 hover:bg-red-300" : "bg-emerald-400 hover:bg-emerald-300"
              }`}
            >
              {destructive ? "Allow once" : ship ? "Approve & merge" : "Approve"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
