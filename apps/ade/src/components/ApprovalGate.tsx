"use client";
import { GitCompareArrows, Lock, ShieldCheck, TriangleAlert } from "lucide-react";
import type { Approval } from "@arcade/core/types";

/** Inline approval request, rendered in the agent thread where the run paused. */
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
  const Icon = destructive ? TriangleAlert : ship ? ShieldCheck : Lock;

  return (
    <div className={`animate-fade-in overflow-hidden rounded-md border bg-ade-editor ${destructive ? "border-red-500/40" : "border-violet-400/40"}`}>
      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium ${destructive ? "bg-red-500/10 text-red-300" : "bg-violet-500/10 text-violet-300"}`}>
        <Icon className="h-3 w-3" />
        {destructive ? "Destructive action — waiting for you" : "Approval required — run paused"}
      </div>

      <div className="px-2.5 py-2">
        <div className="text-[13px] font-medium text-white">{approval.title}</div>
        <p className="mt-0.5 text-[12px] leading-5 text-ade-muted">{approval.reason}</p>
        <div className="mt-2 break-words rounded border border-ade-line bg-ade-base px-2 py-1.5 font-mono text-[11.5px] leading-5 text-ade-fg/85">{approval.target}</div>
        {approval.evidence && <p className="mt-2 text-[11.5px] leading-5 text-emerald-300/90">{approval.evidence}</p>}
      </div>

      <div className="flex items-center gap-1.5 border-t border-ade-line px-2.5 py-2">
        {!destructive && (
          <button
            onClick={onReviewDiff}
            className="flex h-6 items-center gap-1.5 rounded px-1.5 text-[12px] text-ade-muted transition hover:bg-white/[0.06] hover:text-ade-fg"
          >
            <GitCompareArrows className="h-3.5 w-3.5" /> Review diff
          </button>
        )}
        <span className="flex-1" />
        <button
          onClick={() => onReject(approval.id)}
          className="h-6 rounded border border-ade-line px-2.5 text-[12px] text-ade-fg/85 transition hover:bg-white/[0.06]"
        >
          {destructive ? "Deny" : "Reject"}
        </button>
        <button
          onClick={() => onApprove(approval.id)}
          className={`h-6 rounded px-2.5 text-[12px] font-medium text-black transition ${destructive ? "bg-red-400 hover:bg-red-300" : "bg-ade-fg hover:bg-white"}`}
        >
          {approval.approveLabel ?? (destructive ? "Allow once" : "Approve")}
        </button>
      </div>
    </div>
  );
}
