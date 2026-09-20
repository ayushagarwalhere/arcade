/**
 * The analysis provider — the seam a model plugs into.
 *
 * Every agent runs on a provider. The built-in `LOCAL_PROVIDER` uses only the
 * rule set and the source already on disk, so the whole loop works offline with
 * no keys. A Bedrock-backed provider implements the same optional methods to
 * deepen the analysis; because the return shapes are identical, none of the
 * agents, beats, or views change when it is swapped in.
 *
 * The user is wiring the Bedrock calls in later — this is where they land:
 * implement `explain` / `propose` / `discover` against the model and pass the
 * provider into `runAssessment`.
 */
import type { Finding } from "@arcade/core/types";
import type { Hit } from "@arcade/core/scanner";

export interface FixProposal {
  /** The replacement for the vulnerable line, or the guard to insert. */
  code: string[];
  mode: "replace" | "insert-above" | "remove";
  rationale: string;
}

export interface AssessmentProvider {
  id: string;
  name: string;
  /** True once real model calls are wired; drives copy and the "local" badge. */
  backed: boolean;

  /** Deepen a finding's root cause / narrative. Falsy → keep the rule's text. */
  explain?(finding: Finding, source: string): Promise<Partial<Finding> | null>;

  /** Propose a concrete fix beyond the rule template. Falsy → use the rule's fix. */
  propose?(finding: Finding, source: string): Promise<FixProposal | null>;

  /** Surface weaknesses the static rules miss. Falsy → rules only. */
  discover?(hits: Hit[], sources: Record<string, string>): Promise<Hit[]>;
}

/** The default: rules + source, no network, no keys. */
export const LOCAL_PROVIDER: AssessmentProvider = {
  id: "local",
  name: "Local analysis",
  backed: false,
};

/**
 * Placeholder for the Bedrock provider. Fill the method bodies with model calls
 * (e.g. via a route handler that holds the AWS credentials) and set backed:true.
 * Left unimplemented on purpose so the loop runs today without it.
 */
export function bedrockProvider(config: { region: string; modelId: string }): AssessmentProvider {
  return {
    id: "bedrock",
    name: `Amazon Bedrock · ${config.modelId}`,
    backed: false, // flip to true when the methods below are implemented
    // async explain(finding, source) { /* call Bedrock; return { rootCause, attackNarrative, description } */ return null; },
    // async propose(finding, source) { /* call Bedrock; return a FixProposal */ return null; },
    // async discover(hits, sources) { /* call Bedrock; return extra Hits */ return []; },
  };
}
