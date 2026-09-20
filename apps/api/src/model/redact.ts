/**
 * Secret redaction, applied to every piece of source before it reaches a model.
 *
 * Arcade scans repositories that contain leaked credentials — that is often the
 * finding — so the model must be able to reason about "a secret is here"
 * without ever receiving the secret. Replacements keep each line in place, so
 * line numbers in the redacted text still match the file on disk.
 */
const TOKEN_PATTERNS: [kind: string, re: RegExp][] = [
  ["aws-access-key", /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
  ["github-token", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
  ["stripe-key", /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g],
  ["slack-token", /\bxox[abeprs]-[A-Za-z0-9-]{10,}\b/g],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/g],
  ["anthropic-key", /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g],
  ["openai-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/g],
  ["jwt", /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
  ["url-credentials", /(?<=:\/\/[^\s:/@]{1,64}:)[^\s@/]{3,}(?=@)/g],
];

/** `password = "…"`, `apiKey: '…'`, `SECRET_KEY=…` — keep the name, drop the value. */
const ASSIGNMENT = /((?:pass(?:word|wd)?|secret|token|api[_-]?key|private[_-]?key|access[_-]?key|client[_-]?secret|auth)\w*["']?\s*[:=]\s*)(["'`])([^"'`\n]{8,})\2/gi;
const ENV_ASSIGNMENT = /^(\s*(?:export\s+)?[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_KEY|PRIVATE_KEY|ACCESS_KEY)[A-Z0-9_]*\s*=\s*)(\S{8,})\s*$/gm;

const KEY_BEGIN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const KEY_END = /-----END [A-Z ]*PRIVATE KEY-----/;

export interface Redaction {
  text: string;
  /** How many values were replaced, by kind — counts only, never the values. */
  counts: Record<string, number>;
}

export function redact(source: string): Redaction {
  const counts: Record<string, number> = {};
  const bump = (kind: string) => {
    counts[kind] = (counts[kind] ?? 0) + 1;
  };

  // Private key bodies span lines; blank each body line rather than collapsing the block.
  let inKey = false;
  const lines = source.split("\n").map((line) => {
    if (inKey) {
      if (KEY_END.test(line)) {
        inKey = false;
        return line;
      }
      return "[REDACTED:private-key]";
    }
    if (KEY_BEGIN.test(line)) {
      bump("private-key");
      inKey = !KEY_END.test(line);
    }
    return line;
  });

  let text = lines.join("\n");
  for (const [kind, re] of TOKEN_PATTERNS) {
    text = text.replace(re, () => {
      bump(kind);
      return `[REDACTED:${kind}]`;
    });
  }
  const placeholder = /^\[REDACTED:|^(?:process\.env|import\.meta|os\.environ|\$\{|<)/;
  text = text.replace(ASSIGNMENT, (whole, lead: string, quote: string, value: string) => {
    if (placeholder.test(value)) return whole;
    bump("assigned-secret");
    return `${lead}${quote}[REDACTED:assigned-secret]${quote}`;
  });
  text = text.replace(ENV_ASSIGNMENT, (whole, lead: string, value: string) => {
    if (placeholder.test(value.replace(/^["']/, ""))) return whole;
    bump("env-secret");
    return `${lead}[REDACTED:env-secret]`;
  });

  return { text, counts };
}
