/**
 * The last assessment of each repository, kept on the device so reopening the
 * app shows it again.
 *
 * What is stored is the result — findings with their few-line code windows, the
 * summary, and any pull request or issue that was opened. File contents are
 * never stored, and neither is a prepared patch. Nothing secret lives here:
 * the GitHub token stays in the keychain (see github/github.ts).
 *
 * AsyncStorage on Android caps a single row near 2 MB and the whole store at
 * 6 MB, so a stored assessment keeps its strongest findings up to a limit and
 * only the most recent few repositories are kept.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Finding } from "@/core/types";
import type { FixOutcome, StoredAssessment } from "./assess";

const INDEX = "arcade.assessments";
const keyOf = (repo: string) => `arcade.assessment.${repo}`;

export const MAX_STORED_FINDINGS = 150;
const MAX_STORED_REPOS = 6;

export interface StoredIndexEntry {
  repo: string;
  finishedAt: string;
  findings: number;
}

/** Rules whose match is itself a credential. */
const SECRET_RULES = new Set(["hardcoded-secret", "private-key"]);
export const REDACTED = "[not stored — this line matched a secret rule. Open the file to see it.]";

/**
 * AsyncStorage is unencrypted. For a secret rule the flagged line *is* the
 * credential, so it is dropped before the finding is written: the location is
 * kept, the text is not. These rules have no automatic rewrite, so nothing
 * later needs the original line.
 */
function withoutSecrets(f: Finding): Finding {
  if (!SECRET_RULES.has(f.ruleId ?? "")) return f;
  return {
    ...f,
    vulnerableCode: { ...f.vulnerableCode, lines: f.vulnerableCode.lines.map((l) => (l.flagged ? { ...l, text: REDACTED } : l)) },
    evidence: { ...f.evidence, requestBody: undefined, responseBody: REDACTED },
  };
}

const isAssessment = (a: unknown): a is StoredAssessment => {
  const x = a as StoredAssessment | null;
  return !!x && x.v === 1 && typeof x.meta?.repo === "string" && Array.isArray(x.findings) && !!x.surface && !!x.project;
};

/** Most recent first. */
export async function storedAssessments(): Promise<StoredIndexEntry[]> {
  try {
    const raw = JSON.parse((await AsyncStorage.getItem(INDEX)) ?? "[]");
    return Array.isArray(raw) ? raw.filter((e) => typeof e?.repo === "string") : [];
  } catch {
    return [];
  }
}

export async function loadAssessment(repo: string): Promise<StoredAssessment | null> {
  try {
    const a = JSON.parse((await AsyncStorage.getItem(keyOf(repo))) ?? "null");
    return isAssessment(a) ? a : null;
  } catch {
    return null;
  }
}

export async function loadLastAssessment(): Promise<StoredAssessment | null> {
  const [last] = await storedAssessments();
  return last ? loadAssessment(last.repo) : null;
}

/** The development fixture is never stored: it must not come back in a build that cannot mount it. */
export async function saveAssessment(a: StoredAssessment): Promise<void> {
  if (a.meta.source !== "github") return;
  try {
    const kept = a.findings.slice(0, MAX_STORED_FINDINGS).map(withoutSecrets);
    const ids = new Set(kept.map((f) => f.id));
    const outcomes = Object.fromEntries(Object.entries(a.outcomes).filter(([id]) => ids.has(id)));
    await AsyncStorage.setItem(keyOf(a.meta.repo), JSON.stringify({ ...a, findings: kept, outcomes }));

    const index = (await storedAssessments()).filter((e) => e.repo !== a.meta.repo);
    index.unshift({ repo: a.meta.repo, finishedAt: a.meta.finishedAt, findings: a.meta.totalFindings });
    for (const stale of index.splice(MAX_STORED_REPOS)) await AsyncStorage.removeItem(keyOf(stale.repo));
    await AsyncStorage.setItem(INDEX, JSON.stringify(index));
  } catch {
    /* storage full or unavailable: the assessment lasts for this launch only */
  }
}

export async function saveOutcome(repo: string, findingId: string, outcome: FixOutcome): Promise<void> {
  const a = await loadAssessment(repo);
  if (!a) return;
  try {
    await AsyncStorage.setItem(keyOf(repo), JSON.stringify({ ...a, outcomes: { ...a.outcomes, [findingId]: outcome } }));
  } catch {
    /* as above */
  }
}

export async function forgetAssessment(repo: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyOf(repo));
    await AsyncStorage.setItem(INDEX, JSON.stringify((await storedAssessments()).filter((e) => e.repo !== repo)));
  } catch {
    /* nothing to forget */
  }
}
