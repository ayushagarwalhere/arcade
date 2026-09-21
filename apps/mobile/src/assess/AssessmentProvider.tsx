/**
 * What the app is showing, and the real work behind its approval gates.
 *
 * The shared run store starts out holding the scripted sample, so something has
 * to say whether the screens are looking at nothing, at that sample, or at a
 * real assessment. That is `mode`:
 *
 *   none    nothing loaded — screens show how to assess a repository
 *   sample  the scripted demo, labelled as such on every screen
 *   live    a static analysis of a GitHub repository, run on this phone
 *
 * In live mode the gates are not theatre. Approving "prepare a fix" reads the
 * file and rewrites it in memory; approving "commit" creates a branch and a pull
 * request on GitHub; approving "open an issue" files one. Each result is written
 * to the run's timeline through the store's `apply`, the same vocabulary the
 * sample plays, and only after it has really happened.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Finding, TimelineKind } from "@/core/types";
import { GithubWriteError } from "@/core/github-write";
import { githubToken } from "@/github/github";
import { describeGithubError, isMemoryRepo } from "@/github/repo-fs";
import { useRun } from "@/run/RunProvider";
import { IDLE_REWRITE, planFor, shortSha, type FixOutcome, type StoredAssessment } from "./assess";
import { FixBlocked, fixPlanFor, issueContext, openIssue, prepareFix, pushAccess, shipFix, type PreparedFix } from "./fix";
import { loadLastAssessment, saveAssessment, saveOutcome } from "./storage";

export type Mode = "none" | "sample" | "live";

export type FixState =
  | { stage: "preparing" }
  | { stage: "blocked"; reason: string }
  /** `canPush` null: not known (no token, or the check failed); the commit step checks again. */
  | { stage: "ready"; fix: PreparedFix; base: string | null; canPush: boolean | null }
  | { stage: "shipping"; fix: PreparedFix; base: string | null }
  | { stage: "ship-failed"; fix: PreparedFix; base: string | null; error: string };

export type IssueState = { stage: "checking" } | { stage: "confirming"; isPrivate: boolean | null } | { stage: "filing" } | { stage: "failed"; error: string };

export type GateAction = "fix" | "ship" | "issue";

interface Assess {
  mode: Mode;
  /** False until the stored assessment (if any) has been looked for. */
  restored: boolean;
  assessment: StoredAssessment | null;
  /** The findings of whatever is showing; empty when nothing is. */
  findings: Finding[];
  fixes: Record<string, FixState>;
  issues: Record<string, IssueState>;
  outcomes: Record<string, FixOutcome>;
  startSample(): void;
  leaveSample(): void;
  /** Show an assessment, storing it when it is new. */
  show(a: StoredAssessment, store: boolean): void;
  /** Each request opens an approval gate and returns its id; nothing else happens until the user decides. */
  requestFix(findingId: string): string | null;
  requestShip(findingId: string): string | null;
  /** Looks the repository up first (public? issues enabled?), so the confirmation can say so. */
  requestIssue(findingId: string): Promise<string | null>;
  decide(approvalId: string, approve: boolean): void;
}

const Ctx = createContext<Assess | null>(null);

export function useAssess() {
  const a = useContext(Ctx);
  if (!a) throw new Error("useAssess must be used inside <AssessmentProvider>");
  return a;
}

/** `fix:ARC-003#2` → what the gate is for and which finding it concerns. */
export function parseGate(approvalId: string): { action: GateAction; findingId: string } | null {
  const m = /^(fix|ship|issue):([^#]+)#\d+$/.exec(approvalId);
  return m ? { action: m[1] as GateAction, findingId: m[2] } : null;
}

const clock = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const explain = (e: unknown) => (e instanceof FixBlocked || e instanceof GithubWriteError ? e.message : describeGithubError(e, e instanceof Error && e.message ? e.message : "Something went wrong talking to GitHub."));

export function AssessmentProvider({ children }: { children: ReactNode }) {
  const run = useRun();
  const [mode, setMode] = useState<Mode>("none");
  const [restored, setRestored] = useState(false);
  const [assessment, setAssessment] = useState<StoredAssessment | null>(null);
  const [fixes, setFixes] = useState<Record<string, FixState>>({});
  const [issues, setIssues] = useState<Record<string, IssueState>>({});
  const [outcomes, setOutcomes] = useState<Record<string, FixOutcome>>({});
  const attempt = useRef(0);
  const opened = useRef(false);

  // The latest values, for the async work below: a fix outlives the render that started it.
  const live = useRef({ assessment, fixes });
  live.current = { assessment, fixes };

  const { loadPlan, resetDemo, apply, approve, reject } = run;

  const show = useCallback(
    (a: StoredAssessment, store: boolean) => {
      opened.current = true;
      setAssessment(a);
      setFixes({});
      setIssues({});
      setOutcomes(a.outcomes);
      setMode("live");
      loadPlan(planFor(a), false);
      if (store) void saveAssessment(a);
    },
    [loadPlan],
  );

  useEffect(() => {
    let alive = true;
    loadLastAssessment().then((a) => {
      if (!alive) return;
      // Only when nothing else was opened in the meantime (a fast tap can beat the disk).
      if (a && !opened.current) show(a, false);
      setRestored(true);
    });
    return () => {
      alive = false;
    };
  }, [show]);

  const startSample = useCallback(() => {
    opened.current = true;
    resetDemo();
    setMode("sample");
  }, [resetDemo]);

  const leaveSample = useCallback(() => {
    const a = live.current.assessment;
    if (a) show(a, false);
    else {
      resetDemo();
      setMode("none");
    }
  }, [resetDemo, show]);

  const findings = useMemo(() => (mode === "live" ? (assessment?.findings ?? []) : mode === "sample" ? [run.state.finding, ...run.state.secondaryFindings] : []), [mode, assessment, run.state.finding, run.state.secondaryFindings]);

  const note = useCallback((kind: TimelineKind, text: string, actor = "Arcade") => apply({ t: "timeline", ev: { time: clock(), actor, kind, text } }), [apply]);
  const gateId = (action: GateAction, findingId: string) => `${action}:${findingId}#${++attempt.current}`;
  const findingOf = (id: string) => live.current.assessment?.findings.find((f) => f.id === id);

  const record = useCallback((findingId: string, outcome: FixOutcome) => {
    setOutcomes((o) => ({ ...o, [findingId]: outcome }));
    setAssessment((a) => (a ? { ...a, outcomes: { ...a.outcomes, [findingId]: outcome } } : a));
    const repo = live.current.assessment?.meta.repo;
    if (repo) void saveOutcome(repo, findingId, outcome);
  }, []);

  /* ------------------------------------------------------------ the gates */

  const requestFix = useCallback(
    (findingId: string) => {
      const a = live.current.assessment;
      const f = findingOf(findingId);
      if (!a || !f) return null;
      const plan = fixPlanFor(f);
      if (plan.kind === "none") return null;
      const approvalId = gateId("fix", findingId);
      apply({
        t: "gate",
        approvalId,
        def: {
          kind: "code",
          title: `Prepare a fix for ${f.id}`,
          reason: `Arcade will read ${f.vulnerableCode.path} from ${a.meta.repo} as it is now, rewrite line ${plan.line} (${plan.edit.note.toLowerCase()}), and re-run rule ${f.ruleId} on the result. This step only reads: nothing is written to GitHub.`,
          target: `${a.meta.repo} · ${f.vulnerableCode.path}:${plan.line}`,
        },
      });
      return approvalId;
    },
    [apply],
  );

  const requestShip = useCallback(
    (findingId: string) => {
      const a = live.current.assessment;
      const state = live.current.fixes[findingId];
      if (!a || !state || !("fix" in state)) return null;
      const base = state.base ?? "the default branch";
      const approvalId = gateId("ship", findingId);
      apply({
        t: "gate",
        approvalId,
        def: {
          kind: "ship",
          title: "Commit the fix and open a pull request",
          reason: `Arcade will create the branch ${state.fix.branch} in ${a.meta.repo}, commit the change to ${state.fix.path} there, and open a pull request into ${base}. ${state.base ?? "The default branch"} itself is never written to; merging stays your decision on GitHub.`,
          target: `${a.meta.repo} · new branch ${state.fix.branch} → pull request into ${base}`,
        },
      });
      return approvalId;
    },
    [apply],
  );

  const requestIssue = useCallback(
    async (findingId: string) => {
      const a = live.current.assessment;
      const f = findingOf(findingId);
      if (!a || !f) return null;
      const open = (isPrivate: boolean | null) => {
        const approvalId = gateId("issue", findingId);
        setIssues((s) => ({ ...s, [findingId]: { stage: "confirming", isPrivate } }));
        apply({
          t: "gate",
          approvalId,
          def: {
            kind: "ship",
            title: `Open a GitHub issue for ${f.id}`,
            reason:
              `Arcade will open an issue in ${a.meta.repo} describing ${f.title.toLowerCase()} at ${f.vulnerableCode.path}, with the rule, the location and the suggested mitigations.` +
              (isPrivate === false ? ` ${a.meta.repo} is public, so the issue — including the file and line — will be visible to everyone. For anything exploitable, a private security advisory is the safer place.` : ""),
            target: `${a.meta.repo} · new issue`,
          },
        });
        return approvalId;
      };
      if (isMemoryRepo(a.meta.repo)) return open(null);
      setIssues((s) => ({ ...s, [findingId]: { stage: "checking" } }));
      try {
        const token = await githubToken();
        if (!token) throw new FixBlocked("Connect GitHub in Settings first.");
        const ctx = await issueContext(token, a.meta.repo);
        if (!ctx.hasIssues) throw new FixBlocked(`Issues are turned off for ${a.meta.repo}.`);
        return open(ctx.isPrivate);
      } catch (e) {
        setIssues((s) => ({ ...s, [findingId]: { stage: "failed", error: explain(e) } }));
        return null;
      }
    },
    [apply],
  );

  const runPrepare = useCallback(
    async (f: Finding, repo: string) => {
      setFixes((s) => ({ ...s, [f.id]: { stage: "preparing" } }));
      apply({ t: "agent", kind: "remediator", patch: { status: "running", progress: 0.4, task: `Rewriting ${f.vulnerableCode.path} in memory` } });
      try {
        const fix = await prepareFix(repo, f);
        apply({ t: "agent", kind: "remediator", patch: { status: "done", progress: 1, task: `${fix.note} · ${fix.path}:${fix.line} (not committed)` } });
        apply({ t: "agent", kind: "verifier", patch: { status: "done", progress: 1, task: fix.verdict.summary } });
        note("remediate", `${f.id}: prepared a rewrite of ${fix.path}:${fix.line} in memory — ${fix.note.toLowerCase()}`);
        note("verify", `${f.id}: ${fix.verdict.summary}`);

        let access: { defaultBranch: string; canPush: boolean } | null = null;
        if (!isMemoryRepo(repo)) {
          try {
            const token = await githubToken();
            if (token) access = await pushAccess(token, repo);
          } catch {
            /* unknown for now; the commit step checks again and explains */
          }
        }
        const ready: FixState = { stage: "ready", fix, base: access?.defaultBranch ?? null, canPush: access ? access.canPush : null };
        live.current = { ...live.current, fixes: { ...live.current.fixes, [f.id]: ready } };
        setFixes((s) => ({ ...s, [f.id]: ready }));
        if (ready.canPush !== false) requestShip(f.id);
      } catch (e) {
        apply({ t: "agent", kind: "remediator", patch: { status: "idle", progress: 0, task: IDLE_REWRITE } });
        setFixes((s) => ({ ...s, [f.id]: { stage: "blocked", reason: explain(e) } }));
        note("info", `${f.id}: no fix was prepared — ${explain(e)}`);
      }
    },
    [apply, note, requestShip],
  );

  const runShip = useCallback(
    async (f: Finding, repo: string, state: Extract<FixState, { fix: PreparedFix }>) => {
      setFixes((s) => ({ ...s, [f.id]: { stage: "shipping", fix: state.fix, base: state.base } }));
      try {
        const token = await githubToken();
        if (!token && !isMemoryRepo(repo)) throw new FixBlocked("GitHub is no longer connected. Connect it in Settings, then try again.");
        const outcome = await shipFix(token ?? "", repo, f, state.fix);
        record(f.id, outcome);
        setFixes((s) => ({ ...s, [f.id]: { stage: "ready", fix: state.fix, base: state.base, canPush: true } }));
        note("remediate", outcome.existing ? `${f.id}: pull request #${outcome.number} was already open for ${outcome.branch}; nothing new was committed` : `${f.id}: committed ${shortSha(outcome.sha)} to ${outcome.branch} and opened pull request #${outcome.number}`);
      } catch (e) {
        setFixes((s) => ({ ...s, [f.id]: { stage: "ship-failed", fix: state.fix, base: state.base, error: explain(e) } }));
        note("info", `${f.id}: nothing was committed — ${explain(e)}`);
      }
    },
    [note, record],
  );

  const runIssue = useCallback(
    async (f: Finding, a: StoredAssessment) => {
      setIssues((s) => ({ ...s, [f.id]: { stage: "filing" } }));
      try {
        const token = await githubToken();
        if (!token && !isMemoryRepo(a.meta.repo)) throw new FixBlocked("GitHub is no longer connected. Connect it in Settings, then try again.");
        const outcome = await openIssue(token ?? "", a.meta, f);
        record(f.id, outcome);
        setIssues((s) => {
          const { [f.id]: _, ...rest } = s;
          return rest;
        });
        note("human", `${f.id}: opened issue #${outcome.number} in ${a.meta.repo}`, "You");
      } catch (e) {
        setIssues((s) => ({ ...s, [f.id]: { stage: "failed", error: explain(e) } }));
      }
    },
    [note, record],
  );

  const decide = useCallback(
    (approvalId: string, yes: boolean) => {
      (yes ? approve : reject)(approvalId);
      const gate = parseGate(approvalId);
      const a = live.current.assessment;
      if (!gate || !a) return; // a sample-run gate: the store plays on by itself
      const f = findingOf(gate.findingId);
      if (!f) return;

      if (!yes) {
        if (gate.action === "issue") {
          setIssues((s) => {
            const { [f.id]: _, ...rest } = s;
            return rest;
          });
        }
        note("human", `Declined: ${gate.action === "fix" ? `prepare a fix for ${f.id}` : gate.action === "ship" ? `commit the fix for ${f.id}` : `open an issue for ${f.id}`}`, "You");
        return;
      }
      if (gate.action === "fix") {
        note("human", `Approved preparing a fix for ${f.id}`, "You");
        void runPrepare(f, a.meta.repo);
      } else if (gate.action === "ship") {
        const state = live.current.fixes[f.id];
        if (!state || !("fix" in state)) return;
        note("human", `Approved committing to ${state.fix.branch} in ${a.meta.repo} and opening a pull request`, "You");
        void runShip(f, a.meta.repo, state);
      } else {
        note("human", `Approved opening an issue for ${f.id} in ${a.meta.repo}`, "You");
        void runIssue(f, a);
      }
    },
    [approve, reject, note, runPrepare, runShip, runIssue],
  );

  const value = useMemo<Assess>(
    () => ({ mode, restored, assessment: mode === "live" ? assessment : null, findings, fixes, issues, outcomes, startSample, leaveSample, show, requestFix, requestShip, requestIssue, decide }),
    [mode, restored, assessment, findings, fixes, issues, outcomes, startSample, leaveSample, show, requestFix, requestShip, requestIssue, decide],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
