/**
 * The real half of the security loop.
 *
 * The assessment (packages/orchestrator) finds the weaknesses and ranks the fixes;
 * that part only reads source. Everything after it changes something — a branch, a
 * file, a commit, a push — so it runs here, for real, and every line it prints is the
 * outcome of something that just happened:
 *
 *   approve → branch → fix (your agent, or the rule's own rewrite) → the project's
 *   tests → re-check the weakness → commit → approve → push → pull request
 *
 * Where it runs decides how far it can go, and it says so rather than pretending:
 *   - a folder in the desktop app: all of it, with your git and your agent
 *   - a repository opened from GitHub: the rule's rewrite, committed to a new branch
 *     through the API, and a pull request (no agent or tests: nothing is cloned)
 *   - a folder in a browser: the rule's rewrite is saved to the file, and re-checked
 *
 * A fix is only ever committed to a branch Arcade created for it. Rules that have
 * no real rewrite (most of them only know how to leave a FIXME) are never "fixed"
 * by this code: they go to an agent, or back to you.
 */
import type { GateDef } from "@arcade/core/engine";
import type { ArcadeRun } from "@arcade/core/store";
import type { GitBridge, TerminalBridge } from "@arcade/core/desktop";
import type { WorkspaceFs } from "@arcade/core/fs";
import type { Finding, RemediationFile, TerminalLine, TestResult } from "@arcade/core/types";
import { applyEdit, diffTexts, isConcrete, matchRule, ruleEdit, ruleOf, verifyFile } from "@arcade/core/fixes";
import { RULES } from "@arcade/core/rules";
import { commitFiles, githubRepoOf, openPullRequest, repoAccess } from "@arcade/core/github-write";
import type { SendOptions, TurnResult } from "@/hooks/useAgentChat";

type Emit = ArcadeRun["apply"];

export type LoopWorkspace = { kind: "local"; root: string } | { kind: "github"; repo: string } | { kind: "browser" };

export interface LoopContext {
  finding: Finding;
  fs: WorkspaceFs;
  workspace: LoopWorkspace;
  git?: GitBridge;
  terminal?: TerminalBridge;
  /** The installed agent the user picked, when there is one to run. */
  agent?: { id: string; name: string; model?: string };
  askAgent?: (prompt: string, opts: SendOptions) => Promise<TurnResult>;
  githubToken: () => Promise<string | null>;
  shipMode: "ask" | "auto";
  runTests: boolean;
  emit: Emit;
  /** Ask the person, and wait. Resolves true on approve, false on reject. */
  gate: (id: string, def: GateDef) => Promise<boolean>;
  /** Files changed on disk: the editor, tree and source control should look again. */
  filesChanged: (files: string[]) => void;
  /** Bring the agent's conversation forward while it works. */
  showAgent?: () => void;
  showRun?: () => void;
}

const clock = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const MAX_TEST_LINES = 60;

/** Run one command in a fresh terminal session and wait for it to exit. */
function runCommand(terminal: TerminalBridge, root: string, command: string, onLine: (line: string) => void): Promise<{ code: number; ms: number }> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let id = "";
    let buffer = "";
    const early: Parameters<Parameters<TerminalBridge["onEvent"]>[0]>[0][] = [];
    const handle = (e: (typeof early)[number]) => {
      if (e.kind === "exit") {
        if (buffer.trim()) onLine(buffer);
        off();
        void terminal.close(id);
        return resolve({ code: e.code, ms: Date.now() - started });
      }
      buffer += e.data;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) onLine(l);
    };
    const off = terminal.onEvent((e) => (id ? e.id === id && handle(e) : early.push(e)));
    terminal
      .open(root)
      .then((s) => {
        id = s.id;
        for (const e of early) if (e.id === id) handle(e);
        return terminal.exec(id, command);
      })
      .catch((e) => {
        off();
        reject(e);
      });
  });
}

// eslint-disable-next-line no-control-regex -- stripping terminal colour codes is the point
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");

/** How many times any rule fires across these files — to notice a fix that trades one weakness for another. */
function countHits(files: Record<string, string>): number {
  let n = 0;
  for (const [path, text] of Object.entries(files)) for (const rule of RULES) n += matchRule(rule, path, text).length;
  return n;
}

const fixPrompt = (f: Finding) => {
  const flagged = f.vulnerableCode.lines.find((l) => l.flagged);
  const rule = ruleOf(f);
  return [
    `Fix this security finding in the project you are in.`,
    ``,
    `Finding ${f.id}: ${f.title}`,
    `Weakness: ${f.cwe} (severity: ${f.severity})`,
    `File: ${f.vulnerableCode.path}${flagged ? `, line ${flagged.no}` : ""}`,
    ...(flagged ? [`Flagged code: ${flagged.text.trim()}`] : []),
    `Why it is a problem: ${rule?.description ?? f.description}`,
    ...(f.mitigations[0] ? [`Recommended approach: ${f.mitigations[0].title} — ${f.mitigations[0].detail}`] : []),
    ``,
    `Rules for this change:`,
    `- Make the smallest change that genuinely closes the weakness. A comment, TODO or FIXME is not a fix.`,
    `- Keep the code's behaviour otherwise identical and do not touch unrelated code or formatting.`,
    `- Do not run git commands and do not commit: Arcade creates the branch and the commit itself.`,
    `- Do not add new dependencies unless the fix is impossible without one; if you must, say so.`,
    `When you are done, reply with two or three sentences: what you changed and why it closes the weakness.`,
  ].join("\n");
};

/** Carry the top finding from "fix proposed" to "fix shipped", as far as this workspace allows. */
export async function runLiveLoop(ctx: LoopContext): Promise<void> {
  const { finding: f, emit, fs } = ctx;
  const path = f.vulnerableCode.path;
  const term = (agent: TerminalLine["agent"], kind: TerminalLine["kind"], text: string) => emit({ t: "term", line: { agent, kind, text } });
  const time = (actor: string, kind: "remediate" | "test" | "verify" | "human" | "approve", text: string) => emit({ t: "timeline", ev: { time: clock(), actor, kind, text } });
  const stop = (agentTask: string) => {
    emit({ t: "agent", kind: "remediator", patch: { status: "idle", task: agentTask, progress: 0 } });
    emit({ t: "finding", patch: { status: "reproduced" } });
    emit({ t: "phase", phase: "defended" });
  };

  /* ---- 0. What kind of fix is possible here? ------------------------------ */
  const edit = ruleEdit(f);
  const rewrite = edit && isConcrete(edit.edit) ? edit : null;
  const canAgent = ctx.workspace.kind === "local" && !!ctx.agent && !!ctx.askAgent;
  const canWrite = ctx.workspace.kind === "github" || !!fs.write;

  if (!rewrite && !canAgent) {
    term("remediator", "warn", `${f.id} has no automatic rewrite: the "${ruleOf(f)?.id ?? "unknown"}" rule can describe the fix but not write it.`);
    term("remediator", "plain", ctx.workspace.kind === "local" ? "Install a coding agent (Claude Code, Codex, Gemini CLI…) and run this again, or fix the flagged line yourself — Arcade will re-check it." : "In the Arcade desktop app a coding agent can write this fix. Here, fix the flagged line yourself and scan again.");
    return stop("No automatic fix for this rule");
  }
  if (!canWrite) {
    term("remediator", "warn", "This workspace is read-only here, so the fix can't be applied. The proposed change is in the Changes view.");
    return stop("Workspace is read-only");
  }

  /* ---- 1. Approval: changing code ---------------------------------------- */
  // A rule that can rewrite the line itself does so: it is instant, deterministic and free. The agent
  // is for everything the rules can only describe.
  const useAgent = canAgent && !rewrite;
  const how = useAgent ? `${ctx.agent!.name} will write the fix` : `Arcade will apply the rule's rewrite: ${rewrite!.edit.note.toLowerCase()}`;
  const where = ctx.workspace.kind === "local" ? `on a new branch, ${f.remediation.branch}` : ctx.workspace.kind === "github" ? `as a commit on a new branch of ${ctx.workspace.repo}` : "by saving the file in this folder";
  emit({ t: "finding", patch: { status: "awaiting-approval" } });
  emit({ t: "agent", kind: "remediator", patch: { status: "awaiting-approval", task: "Waiting for you to approve the fix" } });
  const approved = await ctx.gate("approve-fix", { kind: "code", title: `Fix ${f.id} in ${path}`, reason: `${how}, ${where}. Nothing is pushed or merged without asking you again.`, target: path, approveLabel: "Approve the fix" });
  if (!approved) return stop("Fix not approved");
  time("You", "human", `Approved fixing ${f.id}`);

  emit({ t: "phase", phase: "remediating" });
  emit({ t: "finding", patch: { status: "remediating" } });
  emit({ t: "agent", kind: "remediator", patch: { status: "running", task: "Applying the fix", progress: 0.1 } });

  /* ---- GitHub-hosted repository: no clone, so no agent and no tests ------- */
  if (ctx.workspace.kind === "github") return shipThroughApi(ctx, ctx.workspace.repo, rewrite!, { term, time, stop });

  /* ---- 2. Branch ---------------------------------------------------------- */
  const root = ctx.workspace.kind === "local" ? ctx.workspace.root : null;
  let branch: string | null = null;
  let originalBranch: string | null = null;
  let hasRemote = false;
  let remoteUrl: string | null = null;
  if (root && ctx.git) {
    const info = await ctx.git.info(root);
    if (info.ok && info.value.repo) {
      originalBranch = info.value.branch ?? null;
      hasRemote = !!info.value.remote;
      remoteUrl = info.value.remote ?? null;
      const existing = await ctx.git.branches(root);
      const taken = new Set(existing.ok ? existing.value.map((b) => b.name) : []);
      branch = f.remediation.branch;
      for (let n = 2; taken.has(branch); n++) branch = `${f.remediation.branch}-${n}`;
      term("remediator", "cmd", `git checkout -b ${branch}`);
      const co = await ctx.git.checkout(root, branch, true);
      if (!co.ok) {
        term("remediator", "err", co.error);
        return stop("Could not create the fix branch");
      }
      term("remediator", "sub", `on ${branch}${originalBranch ? ` (from ${originalBranch})` : ""}`);
    } else {
      term("remediator", "info", info.ok && !info.value.installed ? "git isn't installed, so the fix will be applied without a branch or commit." : "This folder isn't a git repository, so the fix will be applied without a branch or commit.");
    }
  }
  /** Leave the repository as it was found when the fix doesn't pan out before anything was written. */
  const abandonBranch = async () => {
    if (!root || !ctx.git || !branch || !originalBranch) return;
    await ctx.git.checkout(root, originalBranch, false);
    term("remediator", "sub", `back on ${originalBranch}`);
  };

  /* ---- 3. The fix --------------------------------------------------------- */
  const before = await fs.read(path).catch(() => null);
  if (!before || before.kind !== "text") {
    term("remediator", "err", `${path} can't be read any more.`);
    await abandonBranch();
    return stop("The flagged file is gone");
  }
  const originals: Record<string, string | null> = { [path]: before.text };
  let changed: string[] = [];
  let fixedBy = "";

  if (useAgent) {
    const agent = ctx.agent!;
    term("remediator", "cmd", `${agent.id} · edit mode · ${path}`);
    ctx.showAgent?.();
    // Snapshot git's view first, so every file the agent touches can be diffed — not just the ones it reports.
    const dirtyBefore = root && ctx.git && branch ? await ctx.git.status(root) : null;
    const known = new Set(dirtyBefore?.ok ? [...dirtyBefore.value.staged, ...dirtyBefore.value.unstaged].map((c) => c.path) : []);
    const turn = await ctx.askAgent!(fixPrompt(f), { agentId: agent.id, mode: "edit", model: agent.model, display: `Fix ${f.id} · ${f.title}`, onActivity: (line) => term("remediator", "sub", line.slice(0, 200)) });
    ctx.showRun?.();
    if (!turn.ok) {
      term("remediator", turn.cancelled ? "warn" : "err", turn.cancelled ? "You stopped the agent." : `${agent.name} failed: ${turn.error ?? "unknown error"}`);
      if (!turn.files.length) await abandonBranch();
      return stop(turn.cancelled ? "Stopped" : "The agent failed");
    }
    const touched = new Set(turn.files);
    if (root && ctx.git && branch) {
      const after = await ctx.git.status(root);
      if (after.ok) for (const c of [...after.value.staged, ...after.value.unstaged]) if (!known.has(c.path)) touched.add(c.path);
    }
    changed = [...touched];
    fixedBy = agent.name;
    // The agent's own account of the change: its closing paragraph, cut at a sentence if it runs long.
    const said = turn.text.trim().split(/\n{2,}/).filter(Boolean).pop()?.replace(/\s+/g, " ") ?? "";
    if (said) term("remediator", "plain", said.length > 420 ? `${said.slice(0, 420).replace(/[^.!?]*$/, "").trim() || said.slice(0, 420)} …` : said);
  } else {
    const patched = applyEdit(before.text, rewrite!.line, rewrite!.edit);
    await fs.write!.save(path, patched);
    changed = [path];
    fixedBy = "the rule's rewrite";
    term("remediator", "sub", `${rewrite!.edit.note} · ${path}:${rewrite!.line}`);
  }

  if (!changed.length) {
    term("remediator", "warn", "No file was changed, so there is nothing to verify or commit.");
    await abandonBranch();
    return stop("No changes were made");
  }
  ctx.filesChanged(changed);

  // Real diffs, from what is on disk now against what was there before.
  const files: RemediationFile[] = [];
  const texts: Record<string, string> = {};
  for (const p of changed) {
    let old = originals[p];
    if (old === undefined && root && ctx.git) {
      const head = await ctx.git.show(root, p);
      old = head.ok ? head.value : null;
    }
    const now = await fs.read(p).catch(() => null);
    const text = now?.kind === "text" ? now.text : null;
    if (text != null) texts[p] = text;
    if (old == null && text == null) continue;
    files.push(diffTexts(p, old ?? null, text));
  }
  const adds = files.reduce((n, x) => n + x.additions, 0);
  const dels = files.reduce((n, x) => n + x.deletions, 0);
  for (const file of files) term("remediator", "sub", `${file.status}  ${file.path}  +${file.additions} -${file.deletions}`);
  emit({ t: "finding", patch: { remediation: { ...f.remediation, branch: branch ?? "", files, tests: [], commit: "", commands: branch ? [`git checkout -b ${branch}`] : [] } } });
  time("Remediator", "remediate", `${fixedBy} changed ${files.length} file${files.length === 1 ? "" : "s"} (+${adds} −${dels})${branch ? ` on ${branch}` : ""}`);
  emit({ t: "agent", kind: "remediator", patch: { progress: 0.5, task: "Running the project's tests" } });

  /* ---- 4. The project's own tests ---------------------------------------- */
  emit({ t: "phase", phase: "testing" });
  const tests: TestResult[] = [];
  let testsOk = true;
  let testNote = "tests not run";
  if (!ctx.runTests) term("remediator", "info", "Tests before commit are turned off in Settings.");
  else if (!root || !ctx.terminal) term("remediator", "info", "Tests can only run in the desktop app, on a local folder.");
  else {
    const detected = await ctx.terminal.detectTests(root).catch(() => null);
    if (!detected) {
      term("remediator", "info", "No test command is declared in this project (package.json, pytest, go.mod, Cargo.toml), so none were run.");
      testNote = "no test command in the project";
    } else {
      term("remediator", "cmd", detected.command);
      const tail: string[] = [];
      let r: { code: number; ms: number };
      try {
        r = await runCommand(ctx.terminal, root, detected.command, (l) => {
          tail.push(stripAnsi(l).slice(0, 300));
          if (tail.length > MAX_TEST_LINES) tail.shift();
        });
      } catch (e) {
        r = { code: 1, ms: 0 };
        tail.push(e instanceof Error ? e.message : "The test command could not be started");
      }
      // The end of the output is where a runner puts its summary and its failures.
      for (const l of tail.slice(-(r.code === 0 ? 6 : 25))) term("remediator", "sub", l);
      testsOk = r.code === 0;
      tests.push({ name: detected.command, suite: detected.source, passed: testsOk, ms: r.ms });
      testNote = `${detected.command} ${testsOk ? "passed" : `failed (exit ${r.code})`} in ${(r.ms / 1000).toFixed(1)}s`;
      term("remediator", testsOk ? "ok" : "err", testNote);
      time("Remediator", "test", testNote);
    }
  }
  emit({ t: "finding", patch: { remediation: { ...f.remediation, branch: branch ?? "", files, tests, commit: "", commands: [] } } });
  emit({ t: "agent", kind: "remediator", patch: { status: "done", task: testsOk ? "Fix applied" : "Fix applied · tests failing", progress: 1 } });

  /* ---- 5. Re-check the weakness ------------------------------------------ */
  emit({ t: "phase", phase: "verifying" });
  emit({ t: "finding", patch: { status: "verifying" } });
  emit({ t: "agent", kind: "verifier", patch: { status: "running", task: `Re-running ${ruleOf(f)?.id ?? "the rule"} over the patched file`, progress: 0.4 } });
  term("verifier", "cmd", `arcade verify ${f.id}`);
  const verdict = verifyFile(f, texts[path] ?? null);
  const hitsBefore = countHits(Object.fromEntries(Object.entries(originals).filter((e): e is [string, string] => e[1] != null)));
  const hitsAfter = countHits(Object.fromEntries(Object.keys(originals).filter((p) => texts[p] != null).map((p) => [p, texts[p]])));
  term("verifier", verdict.closed ? "ok" : "err", verdict.summary);
  if (hitsAfter > hitsBefore) term("verifier", "warn", `The patched file matches ${hitsAfter - hitsBefore} more rule${hitsAfter - hitsBefore === 1 ? "" : "s"} than before — review the change.`);

  const good = verdict.closed && testsOk;
  emit({
    t: "verify",
    patch: { outcome: verdict.closed ? "verified" : "failed", independent: true, replaySummary: verdict.summary, statusBefore: "present", statusAfter: verdict.closed ? "gone" : "still present", mutatedPayloads: 0, mutatedSucceeded: 0, regressionPassed: tests.filter((x) => x.passed).length, regressionTotal: tests.length },
  });
  time("Verifier", "verify", verdict.closed ? `${f.id} re-checked: the flagged code is gone` : `${f.id} re-checked: still present`);

  if (!good) {
    emit({ t: "finding", patch: { status: "verification-failed" } });
    emit({ t: "agent", kind: "verifier", patch: { status: "done", task: verdict.closed ? "Closed, but tests fail" : "Not closed", progress: 1 } });
    term("verifier", "warn", `Nothing was committed. The changes are in your working tree${branch ? ` on ${branch}` : ""} for you to review, fix or discard in Source Control.`);
    return;
  }

  /* ---- 6. Commit ---------------------------------------------------------- */
  let sha = "";
  if (root && ctx.git && branch) {
    const message = `${f.remediation.summary}\n\n${f.id}: ${f.title} (${f.cwe.split("·")[0].trim()})\nFile: ${path}\nFixed by ${fixedBy}; re-checked by Arcade (${verdict.closed ? "closed" : "open"}); ${testNote}.`;
    term("verifier", "cmd", `git commit -m "${f.remediation.summary}"`);
    const c = await ctx.git.commit(root, message, { paths: changed });
    if (!c.ok) {
      term("verifier", "err", c.error);
      emit({ t: "agent", kind: "verifier", patch: { status: "done", task: "Verified · commit failed", progress: 1 } });
      emit({ t: "finding", patch: { status: "verified" } });
      return;
    }
    sha = c.value.short;
    term("verifier", "ok", `committed ${sha} on ${branch} · ${c.value.files} file${c.value.files === 1 ? "" : "s"}`);
    emit({ t: "finding", patch: { remediation: { ...f.remediation, branch, files, tests, commit: sha, commands: [] } } });
    time("Verifier", "verify", `Committed ${sha} on ${branch}`);
    ctx.filesChanged([]);
  }
  emit({ t: "finding", patch: { status: "verified" } });
  emit({ t: "agent", kind: "verifier", patch: { status: "done", task: sha ? `Verified · committed ${sha}` : "Verified", progress: 1 } });
  emit({ t: "phase", phase: "verified" });

  /* ---- 7. Ship: push + pull request -------------------------------------- */
  if (!root || !ctx.git || !branch || !sha) return;
  if (!hasRemote) {
    term("system", "info", `This repository has no "origin" remote, so the fix stays local on ${branch}. Merge it when you're ready: git checkout ${originalBranch ?? "main"} && git merge ${branch}`);
    return;
  }
  const ghRepo = githubRepoOf(remoteUrl);
  if (ctx.shipMode === "ask") {
    const ship = await ctx.gate("approve-ship", {
      kind: "ship",
      title: ghRepo ? `Push ${branch} and open a pull request` : `Push ${branch} to origin`,
      reason: ghRepo ? `This sends the commit to ${ghRepo} and opens a pull request against its default branch. Merging stays your decision on GitHub.` : "This sends the commit to the repository's origin remote.",
      target: `${branch} → origin${ghRepo ? ` (${ghRepo})` : ""}`,
      evidence: `${f.id} re-checked: closed · ${testNote} · commit ${sha}`,
      approveLabel: ghRepo ? "Push & open PR" : "Push",
    });
    if (!ship) {
      term("system", "info", `Not pushed. The fix is committed locally on ${branch} (${sha}).`);
      return;
    }
    time("You", "human", `Approved pushing ${branch}`);
  }
  term("system", "cmd", `git push --set-upstream origin ${branch}`);
  const pushed = await ctx.git.push(root, branch);
  if (!pushed.ok) {
    term("system", "err", pushed.error);
    return;
  }
  term("system", "ok", `pushed ${branch} to origin`);
  ctx.filesChanged([]);

  if (!ghRepo) return;
  const token = await ctx.githubToken();
  if (!token) {
    term("system", "info", `Connect GitHub (top bar) to open pull requests from here. For now: https://github.com/${ghRepo}/compare/${encodeURIComponent(branch)}?expand=1`);
    return;
  }
  try {
    const pr = await openPullRequest(token, ghRepo, { head: branch, title: f.remediation.summary, body: prBody(f, fixedBy, verdict.summary, testNote) });
    term("system", "ok", `pull request #${pr.number} ${pr.existing ? "already open" : "opened"} · ${pr.url}`);
    time("Arcade", "approve", `Pull request #${pr.number}: ${pr.url}`);
  } catch (e) {
    term("system", "err", e instanceof Error ? e.message : "Could not open the pull request");
  }
}

const prBody = (f: Finding, fixedBy: string, verdict: string, testNote: string) =>
  [
    `## ${f.id}: ${f.title}`,
    ``,
    `**Weakness:** ${f.cwe} · severity ${f.severity}`,
    `**Where:** \`${f.vulnerableCode.path}\``,
    ``,
    f.summary,
    ``,
    `### What this changes`,
    `${f.remediation.summary}. Written by ${fixedBy}.`,
    ``,
    `### How it was checked`,
    `- ${verdict}`,
    `- Tests: ${testNote}`,
    ``,
    `Static analysis can miss context. Please review the change before merging.`,
  ].join("\n");

/** A repository opened from GitHub: apply the rule's rewrite in memory, re-check it, and land it as a branch + pull request. */
async function shipThroughApi(
  ctx: LoopContext,
  repo: string,
  rewrite: NonNullable<ReturnType<typeof ruleEdit>>,
  h: { term: (a: TerminalLine["agent"], k: TerminalLine["kind"], t: string) => void; time: (actor: string, kind: "remediate" | "verify" | "human" | "approve", text: string) => void; stop: (task: string) => void },
) {
  const { finding: f, emit, fs } = ctx;
  const path = f.vulnerableCode.path;
  const token = await ctx.githubToken();
  if (!token) {
    h.term("remediator", "err", "GitHub isn't connected any more, so the fix can't be committed.");
    return h.stop("GitHub is disconnected");
  }
  try {
    const access = await repoAccess(token, repo);
    if (!access.canPush) {
      h.term("remediator", "err", `Your GitHub token can read ${repo} but not push to it. Use a token with the repo scope on a repository you can write to, or fork it first.`);
      return h.stop("No push access");
    }
    const before = await fs.read(path);
    if (before.kind !== "text") throw new Error(`${path} can't be read`);
    const patched = applyEdit(before.text, rewrite.line, rewrite.edit);
    const file = diffTexts(path, before.text, patched);
    h.term("remediator", "sub", `${rewrite.edit.note} · ${path}:${rewrite.line}  +${file.additions} -${file.deletions}`);
    emit({ t: "finding", patch: { remediation: { ...f.remediation, files: [file], tests: [], commit: "" } } });
    emit({ t: "agent", kind: "remediator", patch: { status: "done", task: "Rewrite prepared", progress: 1 } });

    emit({ t: "phase", phase: "verifying" });
    emit({ t: "finding", patch: { status: "verifying" } });
    emit({ t: "agent", kind: "verifier", patch: { status: "running", task: "Re-checking the patched file", progress: 0.5 } });
    const verdict = verifyFile(f, patched);
    h.term("verifier", verdict.closed ? "ok" : "err", verdict.summary);
    emit({ t: "verify", patch: { outcome: verdict.closed ? "verified" : "failed", independent: true, replaySummary: verdict.summary, statusBefore: "present", statusAfter: verdict.closed ? "gone" : "still present", mutatedPayloads: 0, mutatedSucceeded: 0, regressionPassed: 0, regressionTotal: 0 } });
    if (!verdict.closed) {
      emit({ t: "finding", patch: { status: "verification-failed" } });
      emit({ t: "agent", kind: "verifier", patch: { status: "done", task: "Not closed", progress: 1 } });
      return;
    }
    h.term("verifier", "info", "Tests were not run: this repository is read through the GitHub API and nothing is cloned. The pull request's own checks will run them.");
    emit({ t: "agent", kind: "verifier", patch: { status: "done", task: "Re-checked · closed", progress: 1 } });

    const branch = f.remediation.branch;
    const ship =
      ctx.shipMode === "auto" ||
      (await ctx.gate("approve-ship", {
        kind: "ship",
        title: `Commit to ${repo} and open a pull request`,
        reason: `This creates the branch ${branch} on ${repo} with one commit and opens a pull request against ${access.defaultBranch}. Nothing is written to ${access.defaultBranch}.`,
        target: `${branch} → ${repo}`,
        evidence: `${f.id} re-checked: closed · tests not run here`,
        approveLabel: "Commit & open PR",
      }));
    if (!ship) {
      h.term("system", "info", "Nothing was written to GitHub.");
      emit({ t: "finding", patch: { status: "verified" } });
      return;
    }
    const commit = await commitFiles(token, repo, { branch, base: access.defaultBranch, message: `${f.remediation.summary}\n\n${f.id}: ${f.title}\nFile: ${path}`, files: [{ path, content: patched }] });
    h.term("system", "ok", `committed ${commit.sha.slice(0, 7)} to ${branch} on ${repo}`);
    emit({ t: "finding", patch: { status: "verified", remediation: { ...f.remediation, files: [file], tests: [], commit: commit.sha.slice(0, 7) } } });
    const pr = await openPullRequest(token, repo, { head: branch, base: access.defaultBranch, title: f.remediation.summary, body: prBody(f, "the rule's rewrite", verdict.summary, "not run here (no clone); see this pull request's checks") });
    h.term("system", "ok", `pull request #${pr.number} ${pr.existing ? "already open" : "opened"} · ${pr.url}`);
    h.time("Arcade", "approve", `Pull request #${pr.number}: ${pr.url}`);
    emit({ t: "phase", phase: "verified" });
  } catch (e) {
    h.term("system", "err", e instanceof Error ? e.message : "The GitHub request failed");
    h.stop("GitHub request failed");
  }
}
