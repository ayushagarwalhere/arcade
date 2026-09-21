/**
 * What to call a finding's state. The sample run uses the engine's statuses
 * ("Reproduced", "Verified"…); a static analysis has reproduced and verified
 * nothing, so a real finding is described by what has actually happened to it.
 */
import type { Approval, Finding } from "@/core/types";
import { FINDING_STATUS, type Tone } from "@/ui/atoms";
import { parseGate, type FixState, type IssueState, type Mode } from "./AssessmentProvider";
import type { FixOutcome } from "./assess";

export interface StatusContext {
  mode: Mode;
  fixes: Record<string, FixState>;
  issues: Record<string, IssueState>;
  outcomes: Record<string, FixOutcome>;
  approvals: Approval[];
}

export function statusOf(f: Finding, ctx: StatusContext): { label: string; tone: Tone } {
  if (ctx.mode !== "live") return FINDING_STATUS[f.status];
  const outcome = ctx.outcomes[f.id];
  if (outcome?.kind === "pull-request") return { label: `Pull request #${outcome.number} open`, tone: "violet" };
  if (outcome?.kind === "issue") return { label: `Issue #${outcome.number} opened`, tone: "neutral" };
  if (ctx.approvals.some((a) => a.status === "pending" && parseGate(a.id)?.findingId === f.id)) return { label: "Awaiting your approval", tone: "amber" };
  const fix = ctx.fixes[f.id];
  if (fix?.stage === "preparing") return { label: "Preparing fix", tone: "violet" };
  if (fix?.stage === "shipping") return { label: "Committing", tone: "violet" };
  if (fix?.stage === "ready" || fix?.stage === "ship-failed") return { label: "Fix prepared · not committed", tone: "amber" };
  return { label: "Open", tone: "red" };
}

/** A finding still needs attention until a pull request or an issue exists for it. */
export const isOpen = (f: Finding, ctx: StatusContext) => (ctx.mode === "live" ? !ctx.outcomes[f.id] : f.verification.outcome !== "verified");
