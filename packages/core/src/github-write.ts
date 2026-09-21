/**
 * Writing to GitHub through the API — a real commit on a new branch, and the
 * pull request that proposes it.
 *
 * This is how a fix lands for a repository that was opened straight from GitHub
 * (nothing is cloned, so there is no local git to run), and how the desktop app
 * opens the pull request after it has pushed a branch itself.
 *
 * Deliberately small and platform-neutral: plain `fetch` and a token, no React
 * and no storage, so the browser build, the desktop app and the mobile app share
 * it. Nothing here ever writes to the default branch: every commit goes to a
 * branch this module creates, and merging stays a human decision on GitHub.
 */

export class GithubWriteError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface FileChange {
  path: string;
  /** New text of the file; null deletes it. */
  content: string | null;
}

export interface CommitResult {
  branch: string;
  sha: string;
  url: string;
}

export interface PullRequest {
  number: number;
  url: string;
  /** True when an open pull request for this branch already existed. */
  existing: boolean;
}

const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

async function call<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = (await res.json()) as { message?: string; errors?: { message?: string }[] };
      detail = [j.message, ...(j.errors ?? []).map((e) => e.message)].filter(Boolean).join(" · ");
    } catch {
      /* no body */
    }
    const hint =
      res.status === 401 ? "GitHub rejected the token — reconnect GitHub."
      : res.status === 403 || res.status === 404 ? "GitHub refused the write. The token needs the `repo` scope and push access to this repository."
      : "";
    throw new GithubWriteError([`GitHub responded ${res.status}`, detail, hint].filter(Boolean).join(" — "), res.status);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

const checkRepo = (repo: string) => {
  if (!REPO.test(repo)) throw new GithubWriteError(`"${repo}" is not an owner/name repository.`, 0);
};

/** The repository's default branch and whether this token may push to it. */
export async function repoAccess(token: string, repo: string): Promise<{ defaultBranch: string; canPush: boolean }> {
  checkRepo(repo);
  const r = await call<{ default_branch: string; permissions?: { push?: boolean } }>(token, "GET", `/repos/${repo}`);
  return { defaultBranch: r.default_branch, canPush: !!r.permissions?.push };
}

/**
 * Commit `files` to `branch`, creating the branch from `base` (the default branch
 * when omitted) if it does not exist yet. One commit, built with the Git Data API:
 * blobs → tree → commit → ref.
 */
export async function commitFiles(token: string, repo: string, opts: { branch: string; base?: string; message: string; files: FileChange[] }): Promise<CommitResult> {
  checkRepo(repo);
  if (!opts.files.length) throw new GithubWriteError("There is nothing to commit.", 0);
  const enc = encodeURIComponent;

  // Where the new commit hangs: the branch itself if it exists, otherwise the base.
  let parent: string;
  let branchExists = true;
  try {
    parent = (await call<{ object: { sha: string } }>(token, "GET", `/repos/${repo}/git/ref/heads/${opts.branch.split("/").map(enc).join("/")}`)).object.sha;
  } catch (e) {
    if (!(e instanceof GithubWriteError) || e.status !== 404) throw e;
    branchExists = false;
    const base = opts.base ?? (await repoAccess(token, repo)).defaultBranch;
    parent = (await call<{ object: { sha: string } }>(token, "GET", `/repos/${repo}/git/ref/heads/${base.split("/").map(enc).join("/")}`)).object.sha;
  }
  if (branchExists && opts.base && opts.branch === opts.base) throw new GithubWriteError("Arcade never commits straight to the base branch.", 0);

  const baseTree = (await call<{ tree: { sha: string } }>(token, "GET", `/repos/${repo}/git/commits/${parent}`)).tree.sha;

  const tree = await Promise.all(
    opts.files.map(async (f) => {
      if (f.content == null) return { path: f.path, mode: "100644" as const, type: "blob" as const, sha: null };
      const blob = await call<{ sha: string }>(token, "POST", `/repos/${repo}/git/blobs`, { content: f.content, encoding: "utf-8" });
      return { path: f.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha };
    }),
  );
  const newTree = await call<{ sha: string }>(token, "POST", `/repos/${repo}/git/trees`, { base_tree: baseTree, tree });
  const commit = await call<{ sha: string; html_url: string }>(token, "POST", `/repos/${repo}/git/commits`, { message: opts.message, tree: newTree.sha, parents: [parent] });

  if (branchExists) await call(token, "PATCH", `/repos/${repo}/git/refs/heads/${opts.branch.split("/").map(enc).join("/")}`, { sha: commit.sha, force: false });
  else await call(token, "POST", `/repos/${repo}/git/refs`, { ref: `refs/heads/${opts.branch}`, sha: commit.sha });

  return { branch: opts.branch, sha: commit.sha, url: commit.html_url };
}

/** Open a pull request for `head`, or return the one already open for it. */
export async function openPullRequest(token: string, repo: string, opts: { head: string; base?: string; title: string; body: string; draft?: boolean }): Promise<PullRequest> {
  checkRepo(repo);
  const base = opts.base ?? (await repoAccess(token, repo)).defaultBranch;
  const owner = repo.split("/")[0];
  const open = await call<{ number: number; html_url: string }[]>(token, "GET", `/repos/${repo}/pulls?state=open&head=${encodeURIComponent(`${owner}:${opts.head}`)}&base=${encodeURIComponent(base)}`);
  if (open[0]) return { number: open[0].number, url: open[0].html_url, existing: true };
  const pr = await call<{ number: number; html_url: string }>(token, "POST", `/repos/${repo}/pulls`, { head: opts.head, base, title: opts.title, body: opts.body, draft: !!opts.draft });
  return { number: pr.number, url: pr.html_url, existing: false };
}

/** `owner/name` from a git remote URL (https or ssh), or null when it isn't github.com. */
export function githubRepoOf(remoteUrl: string | null | undefined): string | null {
  if (!remoteUrl) return null;
  const m = /github\.com[:/]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(remoteUrl.trim());
  return m ? `${m[1]}/${m[2]}` : null;
}
