// Arcade SARIF — a saved scan as SARIF 2.1.0, the format GitHub code scanning
// (github/codeql-action/upload-sarif) and most CI dashboards ingest.
//
// Every rule in the engine is declared, whether or not it fired, so rule indexes
// stay stable between runs. Paths are relative URIs against %SRCROOT%; when the
// scanned folder sits inside a larger repository they are prefixed so they still
// resolve from the repository root. Findings already fixed and verified are left
// out. Credential findings carry no code snippet.
//
// Pure: takes a scan record, returns an object.

import { RULES } from "./engine.mjs";

const LEVEL = { critical: "error", high: "error", medium: "warning", low: "note" };
/** GitHub buckets alerts by this CVSS-like number: ≥9 critical, ≥7 high, ≥4 medium, else low. */
const SECURITY_SEVERITY = { critical: "9.5", high: "8.0", medium: "5.5", low: "3.0" };

const cweId = (cwe) => /CWE-\d+/.exec(cwe)?.[0] ?? null;
const uri = (p) => p.split("/").map(encodeURIComponent).join("/");
const pascal = (id) => id.replace(/(^|-)(\w)/g, (_m, _d, c) => c.toUpperCase());

function ruleDescriptor(rule) {
  const cwe = cweId(rule.cwe);
  const fixes = rule.mitigations.map((m) => `- **${m.title}**${m.recommended ? " (recommended)" : ""}: ${m.detail}`).join("\n");
  return {
    id: rule.id,
    name: pascal(rule.id),
    shortDescription: { text: rule.title },
    fullDescription: { text: rule.summary },
    help: {
      text: `${rule.description}\n\nHow to fix:\n${rule.mitigations.map((m) => `- ${m.title}: ${m.detail}`).join("\n")}`,
      markdown: `${rule.description}\n\n**How to fix**\n\n${fixes}`,
    },
    ...(cwe ? { helpUri: `https://cwe.mitre.org/data/definitions/${cwe.slice(4)}.html` } : {}),
    defaultConfiguration: { level: LEVEL[rule.severity] },
    properties: {
      tags: ["security", rule.category, ...(cwe ? [`external/cwe/${cwe.toLowerCase()}`] : [])],
      precision: "medium",
      "security-severity": SECURITY_SEVERITY[rule.severity],
    },
  };
}

/** @param scan the record `runScan` returns / `loadScan` reads */
export function toSarif(scan) {
  const index = new Map(RULES.map((r, i) => [r.id, i]));
  const prefix = scan.repoPrefix ? `${scan.repoPrefix.replace(/\/+$/, "")}/` : "";
  const results = scan.findings
    .filter((f) => f.status !== "fixed")
    .map((f) => ({
      ruleId: f.ruleId,
      ...(index.has(f.ruleId) ? { ruleIndex: index.get(f.ruleId) } : {}),
      level: LEVEL[f.severity] ?? "warning",
      message: { text: `${f.title}. ${f.summary}` },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: uri(prefix + f.file), uriBaseId: "%SRCROOT%" },
            region: { startLine: f.line, startColumn: f.column, ...(f.redacted ? {} : { snippet: { text: f.excerpt } }) },
          },
        },
      ],
      partialFingerprints: { "arcadeFinding/v1": f.fingerprint },
      properties: { arcadeId: f.id, severity: f.severity, automaticRewrite: f.fix?.kind === "rewrite" },
    }));

  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "Arcade",
            semanticVersion: scan.tool.version,
            informationUri: "https://github.com/ayushagarwalhere/arcade",
            rules: RULES.map(ruleDescriptor),
          },
        },
        columnKind: "utf16CodeUnits",
        invocations: [{ executionSuccessful: true, endTimeUtc: scan.scannedAt }],
        results,
      },
    ],
  };
}
