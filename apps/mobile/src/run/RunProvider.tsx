/**
 * One Arcade run for the whole app. The web ADE calls useArcadeRun() once in
 * its page; here every tab and the approval sheet need the same run, so it
 * lives in context.
 */
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import * as Haptics from "expo-haptics";
import { useArcadeRun, type ArcadeRun } from "@/core/store";

const RunContext = createContext<ArcadeRun | null>(null);

export function RunProvider({ children }: { children: ReactNode }) {
  const run = useArcadeRun();
  useGateHaptics(run);
  return <RunContext.Provider value={run}>{children}</RunContext.Provider>;
}

export function useRun() {
  const run = useContext(RunContext);
  if (!run) throw new Error("useRun must be used inside <RunProvider>");
  return run;
}

/** A buzz when the run pauses for you, and another when the fix is verified. */
function useGateHaptics(run: ArcadeRun) {
  const pendingId = run.pendingApproval?.id;
  useEffect(() => {
    if (!pendingId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }, [pendingId]);

  const outcome = run.state.finding.verification.outcome;
  const last = useRef(outcome);
  useEffect(() => {
    if (outcome === "verified" && last.current !== "verified") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    last.current = outcome;
  }, [outcome]);
}
