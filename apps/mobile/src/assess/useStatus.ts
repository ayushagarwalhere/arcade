import { useMemo } from "react";
import { useRun } from "@/run/RunProvider";
import { useAssess } from "./AssessmentProvider";
import type { StatusContext } from "./status";

/** Everything `statusOf` needs, from the two providers. */
export function useStatusContext(): StatusContext {
  const { mode, fixes, issues, outcomes } = useAssess();
  const { approvals } = useRun().state;
  return useMemo(() => ({ mode, fixes, issues, outcomes, approvals }), [mode, fixes, issues, outcomes, approvals]);
}
