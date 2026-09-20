/**
 * Request and response shapes for the model endpoints.
 *
 * The response schemas double as the structured-output contract handed to the
 * model, so what the model may return and what the API promises its clients are
 * the same definition.
 */
import { z } from "zod";

const severity = z.enum(["critical", "high", "medium", "low"]);

const mitigation = z.object({
  title: z.string(),
  detail: z.string(),
  recommended: z.boolean(),
  effort: z.enum(["low", "medium", "high"]),
});

/** The part of a Finding the model needs — never the whole record. */
export const findingContext = z.object({
  id: z.string().max(40),
  title: z.string().max(300),
  severity,
  cwe: z.string().max(200),
  summary: z.string().max(2000),
  description: z.string().max(4000),
  path: z.string().max(1000),
  /** 1-based line of the weakness in the original file. */
  line: z.number().int().positive(),
});

/** A file, or a window of one. `startLine` is the file line number of the first line of `text`. */
const sourceWindow = z.object({
  text: z.string(),
  startLine: z.number().int().positive().default(1),
});

export const explainRequest = z.object({ finding: findingContext, source: sourceWindow });
export const explainResponse = z.object({
  description: z.string(),
  attackNarrative: z.string(),
  rootCause: z.string(),
  mitigations: z.array(mitigation),
});

export const proposeRequest = z.object({ finding: findingContext, source: sourceWindow });
export const proposeResponse = z.object({
  mode: z.enum(["replace", "insert-above", "remove"]),
  code: z.array(z.string()),
  rationale: z.string(),
});

export const discoverRequest = z.object({
  /** What the static rules already found, so the model does not repeat it. */
  known: z.array(z.object({ ruleId: z.string().max(80), path: z.string().max(1000), line: z.number().int().positive() })).max(400),
  files: z.array(z.object({ path: z.string().max(1000), text: z.string() })).min(1).max(40),
});

export const discoveredHit = z.object({
  path: z.string(),
  line: z.number().int(),
  title: z.string(),
  severity,
  cwe: z.string(),
  category: z.enum(["authz", "injection", "secrets", "crypto", "xss", "transport", "ssrf", "path", "config"]),
  surface: z.enum(["user", "browser", "api", "auth", "service", "database", "thirdparty", "admin", "secrets"]),
  summary: z.string(),
  description: z.string(),
  attackNarrative: z.string(),
  mitigations: z.array(mitigation),
  fix: z.object({ mode: z.enum(["replace", "insert-above", "remove"]), code: z.array(z.string()), rationale: z.string() }),
});
export const discoverResponse = z.object({ hits: z.array(discoveredHit) });

export type ExplainResponse = z.infer<typeof explainResponse>;
export type ProposeResponse = z.infer<typeof proposeResponse>;
export type DiscoverResponse = z.infer<typeof discoverResponse>;
export type DiscoveredHit = z.infer<typeof discoveredHit>;
