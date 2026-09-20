/**
 * The false-positive scorer: P(true positive) for each finding.
 *
 * `sagemakerScorer` calls the classifier hosted on SageMaker Serverless Inference
 * (infra/lib/ml-stack.ts). Scoring is advisory — it ranks and annotates findings,
 * and never hides one — so every failure here degrades to "no score", not an error:
 * a cold or unavailable endpoint must never stop findings from being saved.
 */
import { InvokeEndpointCommand, SageMakerRuntimeClient } from "@aws-sdk/client-sagemaker-runtime";
import { findingText } from "@arcade/core/finding-text";
import type { Finding } from "@arcade/core/types";

export interface FindingScore {
  /** 0..1 — the model's estimate that this finding is a real weakness. */
  pTruePositive: number;
  /** Which model produced it, so predictions stay auditable across retrains. */
  model: string;
  at: string;
}

export interface ScoreClient {
  readonly model: string;
  /** One score per text, in order. Rejects if the endpoint cannot answer in time. */
  score(texts: string[]): Promise<number[]>;
}

const BATCH = 32;

export function sagemakerScorer(opts: { endpointName: string; region: string; timeoutMs?: number }): ScoreClient {
  const client = new SageMakerRuntimeClient({ region: opts.region, maxAttempts: 2 });
  return {
    model: opts.endpointName,
    async score(texts) {
      const out: number[] = [];
      for (let i = 0; i < texts.length; i += BATCH) {
        const res = await client.send(new InvokeEndpointCommand({ EndpointName: opts.endpointName, ContentType: "application/json", Accept: "application/json", Body: JSON.stringify({ inputs: texts.slice(i, i + BATCH) }) }), {
          abortSignal: AbortSignal.timeout(opts.timeoutMs ?? 25_000),
        });
        const parsed = JSON.parse(new TextDecoder().decode(res.Body)) as { scores?: unknown };
        const scores = parsed.scores;
        if (!Array.isArray(scores) || scores.length !== Math.min(BATCH, texts.length - i) || !scores.every((s) => typeof s === "number" && s >= 0 && s <= 1)) {
          throw new Error("The classifier returned an unexpected response");
        }
        out.push(...(scores as number[]));
      }
      return out;
    },
  };
}

/** What the model reads for a finding, or null when the finding lacks what it was trained on. */
export function scorable(finding: Finding): string | null {
  const code = finding.vulnerableCode;
  if (!finding.ruleId || !code?.path || !code.lines?.some((l) => l.flagged)) return null;
  return findingText(finding.ruleId, code.path, code.lines);
}

/** Score what can be scored; never throws. Returns a score per finding id. */
export async function scoreFindings(scorer: ScoreClient | undefined, findings: Finding[]): Promise<Map<string, FindingScore>> {
  const result = new Map<string, FindingScore>();
  if (!scorer) return result;
  const items = findings.map((f) => ({ id: f.id, text: scorable(f) })).filter((x): x is { id: string; text: string } => x.text !== null);
  if (!items.length) return result;
  try {
    const scores = await scorer.score(items.map((x) => x.text));
    const at = new Date().toISOString();
    items.forEach((x, i) => result.set(x.id, { pTruePositive: scores[i], model: scorer.model, at }));
  } catch (e) {
    console.warn("false-positive scoring skipped", { reason: e instanceof Error ? e.message : String(e), findings: items.length });
  }
  return result;
}
