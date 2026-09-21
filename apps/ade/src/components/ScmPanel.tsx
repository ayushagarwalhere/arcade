"use client";
import { useEffect, useState } from "react";
import { ArrowUp, Check, GitBranch, GitPullRequest, Loader2, Minus, Plus, RefreshCw, Undo2 } from "lucide-react";
import type { GitChange, GitCommit } from "@arcade/core/desktop";
import { githubToken, useGithub } from "@arcade/core/github";
import { githubRepoOf, openPullRequest } from "@arcade/core/github-write";
import type { Git } from "@/hooks/useGit";

const ROW = "group flex h-[22px] w-full items-center gap-1.5 pl-5 pr-1.5 text-left text-[13px] text-ade-fg/75 transition hover:bg-white/[0.04] hover:text-ade-fg";
const ICON_BTN = "grid h-5 w-5 shrink-0 place-items-center rounded text-ade-muted transition hover:bg-white/10 hover:text-ade-fg disabled:opacity-40";
const BTN = "flex h-7 items-center justify-center gap-1.5 rounded px-2.5 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50";

const CODE_TONE: Record<string, string> = { M: "text-amber-300", A: "text-emerald-400", U: "text-emerald-400", D: "text-red-400", R: "text-sky-300", C: "text-sky-300", "!": "text-red-400", T: "text-amber-300" };

function Heading({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex h-[22px] items-center gap-1 border-t border-ade-line px-3 text-[11px] font-semibold uppercase tracking-wide text-ade-fg/80">
      <span className="flex-1 truncate">{children}</span>
      {right}
    </div>
  );
}

function ChangeLine({ change, onOpen, actions }: { change: GitChange; onOpen: () => void; actions: React.ReactNode }) {
  const slash = change.path.lastIndexOf("/");
  return (
    <div className={ROW} title={`${change.path} · ${change.status}`}>
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
        <span className={`truncate ${change.status === "deleted" ? "line-through opacity-70" : ""}`}>{change.path.slice(slash + 1)}</span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-ade-faint">{slash > 0 ? change.path.slice(0, slash) : ""}</span>
      </button>
      <span className="hidden items-center group-hover:flex">{actions}</span>
      <span className={`w-3 shrink-0 text-center text-[11px] font-semibold ${CODE_TONE[change.code] ?? "text-ade-muted"}`}>{change.code}</span>
    </div>
  );
}

/**
 * Source Control, backed by the real repository in the opened folder: what changed,
 * stage / unstage / discard, commit, branch, push, and open the pull request.
 */
export default function ScmPanel({ git, onOpenDiff, onChanged }: { git: Git; onOpenDiff: (path: string, staged: boolean) => void; onChanged: () => void }) {
  const { info, status, busy } = git;
  const gh = useGithub();
  const [message, setMessage] = useState("");
  const [branching, setBranching] = useState(false);
  const [newBranch, setNewBranch] = useState("");
  const [branches, setBranches] = useState<{ name: string; current: boolean }[]>([]);
  const [log, setLog] = useState<GitCommit[]>([]);
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  // Remembered with the branch it belongs to, so switching branches stops showing it.
  const [openedPr, setPr] = useState<{ branch: string; url: string; number: number; existing: boolean } | null>(null);
  const [prError, setPrError] = useState<string | null>(null);

  const head = info?.head ?? "";
  const branch = info?.branch ?? "";
  const pr = openedPr?.branch === branch ? openedPr : null;
  useEffect(() => {
    if (!info?.repo) return;
    const bridge = window.arcade?.git;
    if (!bridge || !git.root) return;
    let live = true;
    // Read-only lookups go straight to the bridge: they change nothing, so there is nothing to refresh after them.
    void bridge.log(git.root, 12).then((l) => live && l.ok && setLog(l.value));
    void bridge.branches(git.root).then((b) => live && b.ok && setBranches(b.value));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload history when HEAD or the branch moves, not on every status tick
  }, [info?.repo, head, branch]);

  if (!git.available) {
    return <p className="px-4 text-[12px] leading-5 text-ade-faint">Source control runs your own git, so it needs the Arcade desktop app and a folder on this machine. A repository opened straight from GitHub gets its fixes as pull requests instead.</p>;
  }
  if (!info) {
    return (
      <div className="flex items-center gap-2 px-4 text-[12px] text-ade-faint">
        <Loader2 className="h-3 w-3 animate-spin" /> Reading the repository…
      </div>
    );
  }
  if (!info.installed) {
    return (
      <p className="px-4 text-[12px] leading-5 text-amber-200/90">
        git isn&apos;t installed (or isn&apos;t on PATH). Install it from{" "}
        <a href="https://git-scm.com" target="_blank" rel="noreferrer" className="underline">
          git-scm.com
        </a>{" "}
        and reopen Arcade.
      </p>
    );
  }
  if (!info.repo) {
    return (
      <div className="px-4">
        <p className="text-[12px] leading-5 text-ade-faint">
          {info.parentRepo
            ? `This folder has no repository of its own. It sits inside one at ${info.parentRepo} (a home folder under version control does this to everything in it). Give this project its own repository, or open ${info.parentRepo} to work in that one.`
            : "This folder isn't a git repository yet."}
        </p>
        <button onClick={() => void git.act("init", (g, root) => g.init(root))} disabled={!!busy} className={`${BTN} mt-3 w-full bg-ade-fg text-black hover:bg-white`}>
          {busy === "init" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />} Initialize repository{info.parentRepo ? " here" : ""}
        </button>
        {git.error && <p className="mt-2 text-[12px] leading-5 text-red-300/90">{git.error}</p>}
      </div>
    );
  }

  const staged = status?.staged ?? [];
  const unstaged = status?.unstaged ?? [];
  const canCommit = !!message.trim() && (staged.length > 0 || unstaged.length > 0) && !busy;
  const repo = githubRepoOf(info.remote);
  const needsPush = !!info.remote && (!info.upstream || (info.ahead ?? 0) > 0);

  const commit = async () => {
    if (!canCommit) return;
    // Like VS Code's smart commit: with nothing staged, the commit takes every change.
    const done = await git.act("commit", (g, root) => g.commit(root, message.trim(), { all: staged.length === 0 }));
    if (done) {
      setMessage("");
      onChanged();
    }
  };

  const after = async (p: Promise<unknown>) => {
    await p;
    onChanged();
  };

  const createBranch = async () => {
    const name = newBranch.trim();
    if (!name) return;
    const ok = await git.act("checkout", (g, root) => g.checkout(root, name, true));
    if (ok) {
      setBranching(false);
      setNewBranch("");
      onChanged();
    }
  };

  const openPr = async () => {
    setPrError(null);
    const token = await githubToken();
    if (!token || !repo || !info.branch) return;
    try {
      const subject = log[0]?.subject ?? info.branch;
      const opened = await openPullRequest(token, repo, { head: info.branch, title: subject, body: `Opened from Arcade.\n\nBranch \`${info.branch}\` · ${log[0]?.short ?? ""}` });
      setPr({ branch: info.branch, ...opened });
    } catch (e) {
      setPrError(e instanceof Error ? e.message : "Could not open the pull request");
    }
  };

  return (
    <div className="pb-3">
      {/* Branch */}
      <div className="px-3 pb-2">
        <div className="flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 shrink-0 text-ade-muted" />
          {info.detached ? (
            <span className="truncate font-mono text-[11.5px] text-amber-200/90">detached @ {info.head}</span>
          ) : (
            <select
              value={info.branch ?? ""}
              disabled={!!busy}
              onChange={(e) => void after(git.act("checkout", (g, root) => g.checkout(root, e.target.value, false)))}
              className="min-w-0 flex-1 truncate rounded bg-transparent font-mono text-[11.5px] text-ade-fg outline-none hover:bg-white/[0.06]"
            >
              {(branches.length ? branches : [{ name: info.branch ?? "", current: true }]).map((b) => (
                <option key={b.name} value={b.name} className="bg-ade-raised">
                  {b.name}
                </option>
              ))}
            </select>
          )}
          {(info.ahead ?? 0) > 0 && <span className="font-mono text-[10.5px] text-ade-muted">↑{info.ahead}</span>}
          {(info.behind ?? 0) > 0 && <span className="font-mono text-[10.5px] text-ade-muted">↓{info.behind}</span>}
          <button onClick={() => setBranching((b) => !b)} title="New branch" aria-label="New branch" className={ICON_BTN}>
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => void git.refresh()} title="Refresh" aria-label="Refresh" className={ICON_BTN}>
            <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
          </button>
        </div>
        {branching && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void createBranch();
            }}
            className="mt-1.5 flex gap-1"
          >
            <input autoFocus value={newBranch} onChange={(e) => setNewBranch(e.target.value)} placeholder="new-branch-name" spellCheck={false} className="h-6 min-w-0 flex-1 rounded border border-ade-line bg-ade-editor px-1.5 font-mono text-[11.5px] text-ade-fg outline-none focus:border-white/25" />
            <button type="submit" disabled={!newBranch.trim() || !!busy} className={`${BTN} !h-6 bg-ade-raised text-ade-fg hover:bg-ade-hover`}>
              Create
            </button>
          </form>
        )}
      </div>

      {/* Commit */}
      <div className="px-3 pb-3">
        {!info.user && <p className="mb-2 rounded border border-amber-400/30 bg-amber-400/[0.06] px-2 py-1.5 text-[11.5px] leading-[1.45] text-amber-200/90">git doesn&apos;t know who you are yet. In the terminal, set <span className="font-mono">git config --global user.name</span> and <span className="font-mono">user.email</span>.</p>}
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void commit();
            }
          }}
          rows={2}
          placeholder={`Message (Ctrl+Enter to commit on "${info.branch ?? "HEAD"}")`}
          className="block w-full resize-y rounded border border-ade-line bg-ade-editor px-2 py-1.5 text-[12.5px] leading-5 text-ade-fg outline-none placeholder:text-ade-faint focus:border-white/25"
        />
        <div className="mt-1.5 flex gap-1.5">
          <button onClick={() => void commit()} disabled={!canCommit} className={`${BTN} flex-1 bg-ade-fg text-black hover:bg-white`}>
            {busy === "commit" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            {staged.length ? `Commit ${staged.length} staged` : "Commit all"}
          </button>
          {info.remote && (
            <button onClick={() => void git.act("push", (g, root) => g.push(root))} disabled={!!busy || !needsPush} title={needsPush ? `Push ${info.branch} to origin` : "Nothing to push"} className={`${BTN} border border-ade-line text-ade-fg hover:bg-ade-raised`}>
              {busy === "push" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUp className="h-3.5 w-3.5" />} Push
            </button>
          )}
        </div>
        {repo && !needsPush && info.upstream && !pr && (
          <button
            onClick={() => void openPr()}
            disabled={gh.status !== "connected"}
            title={gh.status === "connected" ? `Open a pull request for ${info.branch} on ${repo}` : "Connect GitHub (top bar) to open pull requests"}
            className={`${BTN} mt-1.5 w-full border border-ade-line text-ade-fg hover:bg-ade-raised`}
          >
            <GitPullRequest className="h-3.5 w-3.5" /> Open pull request
          </button>
        )}
        {pr && (
          <a href={pr.url} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center gap-1.5 rounded border border-emerald-400/30 bg-emerald-400/[0.06] px-2 py-1.5 text-[12px] text-emerald-200 hover:bg-emerald-400/[0.1]">
            <GitPullRequest className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              Pull request #{pr.number} {pr.existing ? "is already open" : "opened"}
            </span>
          </a>
        )}
        {(git.error || prError) && (
          <p className="mt-2 whitespace-pre-wrap break-words rounded border border-red-500/30 bg-red-500/[0.07] px-2 py-1.5 text-[11.5px] leading-[1.45] text-red-200">
            {git.error ?? prError}
            <button onClick={() => (git.clearError(), setPrError(null))} className="ml-2 underline opacity-80 hover:opacity-100">
              dismiss
            </button>
          </p>
        )}
      </div>

      {/* Changes */}
      {staged.length > 0 && (
        <>
          <Heading
            right={
              <button onClick={() => void after(git.act("unstage", (g, root) => g.unstage(root, staged.map((c) => c.path))))} title="Unstage all" aria-label="Unstage all" className={ICON_BTN}>
                <Minus className="h-3.5 w-3.5" />
              </button>
            }
          >
            Staged changes · {staged.length}
          </Heading>
          {staged.map((c) => (
            <ChangeLine
              key={`s:${c.path}`}
              change={c}
              onOpen={() => onOpenDiff(c.path, true)}
              actions={
                <button onClick={() => void after(git.act("unstage", (g, root) => g.unstage(root, [c.path])))} title="Unstage" aria-label={`Unstage ${c.path}`} className={ICON_BTN}>
                  <Minus className="h-3.5 w-3.5" />
                </button>
              }
            />
          ))}
        </>
      )}

      <Heading
        right={
          unstaged.length > 0 && (
            <button onClick={() => void after(git.act("stage", (g, root) => g.stage(root)))} title="Stage all" aria-label="Stage all" className={ICON_BTN}>
              <Plus className="h-3.5 w-3.5" />
            </button>
          )
        }
      >
        Changes · {unstaged.length}
      </Heading>
      {unstaged.length === 0 && <p className="px-5 py-1 text-[12px] leading-5 text-ade-faint">{staged.length ? "Everything is staged." : "No changes. The working tree is clean."}</p>}
      {unstaged.map((c) => (
        <div key={`u:${c.path}`}>
          <ChangeLine
            change={c}
            onOpen={() => onOpenDiff(c.path, false)}
            actions={
              <>
                <button onClick={() => setConfirmDiscard(c.path)} title="Discard changes" aria-label={`Discard changes to ${c.path}`} className={ICON_BTN}>
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => void after(git.act("stage", (g, root) => g.stage(root, [c.path])))} title="Stage" aria-label={`Stage ${c.path}`} className={ICON_BTN}>
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </>
            }
          />
          {confirmDiscard === c.path && (
            <div className="mx-3 my-1 rounded border border-red-500/30 bg-red-500/[0.07] px-2 py-1.5 text-[11.5px] leading-[1.45] text-red-100">
              {c.status === "untracked" ? "Delete this untracked file?" : "Throw away your changes to this file?"} This can&apos;t be undone.
              <div className="mt-1.5 flex gap-1.5">
                <button
                  onClick={() => {
                    setConfirmDiscard(null);
                    void after(git.act("discard", (g, root) => g.discard(root, [c.path])));
                  }}
                  className={`${BTN} !h-6 bg-red-500/80 text-white hover:bg-red-500`}
                >
                  Discard
                </button>
                <button onClick={() => setConfirmDiscard(null)} className={`${BTN} !h-6 border border-ade-line text-ade-fg hover:bg-ade-raised`}>
                  Keep
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* History */}
      {log.length > 0 && (
        <>
          <div className="mt-2" />
          <Heading>Recent commits</Heading>
          {log.map((c) => (
            <div key={c.sha} title={`${c.sha}\n${c.author} · ${new Date(c.date).toLocaleString()}`} className="flex h-[22px] items-center gap-2 pl-5 pr-2 text-[12.5px] text-ade-fg/75">
              <span className="shrink-0 font-mono text-[11px] text-ade-faint">{c.short}</span>
              <span className="truncate">{c.subject}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
