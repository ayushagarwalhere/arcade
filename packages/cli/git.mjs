// Arcade git — the real version-control operations behind the desktop app's
// Source Control view, the security loop's commits, and `arcade fix --commit`.
//
// Everything runs the user's own `git` with execFile: no shell, so nothing here
// can be turned into a second command. Callers pass structured values (a folder,
// relative paths, a branch name, a message); they never pass git arguments.
//   - paths must be relative, stay inside the folder, and always follow a `--`
//   - branch names are checked by `git check-ref-format` before use
//   - a push token travels in the child's environment (GIT_CONFIG_*), so it never
//     appears in argv or gets written to .git/config
//
// Dependency-free.

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export class GitError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const MAX_BUFFER = 32 * 1024 * 1024;
const MAX_DIFF = 2 * 1024 * 1024;

function git(cwd, args, { env, input, allowFail = false, maxBuffer = MAX_BUFFER } = {}) {
  return new Promise((resolve, reject) => {
    const child = execFile(
      "git",
      // Never page, never prompt, never let a repo's config pick an external diff tool.
      ["-c", "core.pager=", "-c", "core.quotepath=false", "-c", "diff.external=", ...args],
      { cwd, maxBuffer, windowsHide: true, env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C", ...env } },
      (err, stdout, stderr) => {
        if (err && err.code === "ENOENT") return reject(new GitError("git isn't installed (or isn't on PATH). Install it from https://git-scm.com.", "NO_GIT"));
        if (err && !allowFail) return reject(new GitError((stderr || err.message).trim().split("\n").slice(-6).join("\n"), err.code));
        resolve({ stdout, stderr, code: err ? (typeof err.code === "number" ? err.code : 1) : 0 });
      },
    );
    if (input != null) child.stdin.end(input);
  });
}

/** A path the caller named: relative, inside the repo, and not something git would read as an option. */
function safePath(root, rel) {
  if (typeof rel !== "string" || !rel || rel.includes("\0")) throw new GitError("That isn't a file path.", "BAD_PATH");
  const norm = rel.replace(/\\/g, "/");
  if (path.isAbsolute(norm) || norm.startsWith("-") || norm.startsWith(":")) throw new GitError(`"${rel}" isn't a path inside this project.`, "BAD_PATH");
  const inside = path.relative(root, path.resolve(root, norm));
  if (inside.startsWith("..") || path.isAbsolute(inside)) throw new GitError(`"${rel}" is outside this project.`, "BAD_PATH");
  return norm;
}

const safePaths = (root, paths) => {
  if (!Array.isArray(paths) || !paths.length) throw new GitError("No files were named.", "BAD_PATH");
  return paths.map((p) => safePath(root, p));
};

async function safeBranch(root, name) {
  if (typeof name !== "string" || !name || name.startsWith("-") || name.length > 200) throw new GitError("That isn't a branch name.", "BAD_BRANCH");
  const r = await git(root, ["check-ref-format", "--branch", name], { allowFail: true });
  if (r.code !== 0) throw new GitError(`"${name}" isn't a valid branch name.`, "BAD_BRANCH");
  return name;
}

const line = async (root, args) => (await git(root, args, { allowFail: true })).stdout.trim();

/* --------------------------------------------------------------------- read */

/** What this folder is, as far as git is concerned. Never throws for "not a repo". */
export async function gitInfo(root) {
  let top;
  try {
    top = (await git(root, ["rev-parse", "--show-toplevel"])).stdout.trim();
  } catch (e) {
    if (e.code === "NO_GIT") return { installed: false, repo: false };
    return { installed: true, repo: false };
  }
  // A folder inside someone else's repository is not "this project's repo". Both sides go through the
  // OS's own resolver, which also expands Windows 8.3 short names (C:\PROGRA~1) the way git reports them.
  const real = (p) => {
    try {
      return fs.realpathSync.native(p);
    } catch {
      return path.resolve(p);
    }
  };
  const same = real(top).toLowerCase() === real(root).toLowerCase();
  if (!same) return { installed: true, repo: false, parentRepo: top };

  const [branch, head, remote, upstream, name, email] = await Promise.all([
    line(root, ["symbolic-ref", "--quiet", "--short", "HEAD"]),
    line(root, ["rev-parse", "--short", "HEAD"]),
    line(root, ["remote", "get-url", "origin"]),
    line(root, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]),
    line(root, ["config", "user.name"]),
    line(root, ["config", "user.email"]),
  ]);
  let ahead = 0;
  let behind = 0;
  if (upstream) {
    const [a, b] = (await line(root, ["rev-list", "--left-right", "--count", `${upstream}...HEAD`])).split(/\s+/).map(Number);
    behind = a || 0;
    ahead = b || 0;
  }
  return { installed: true, repo: true, branch: branch || null, detached: !branch, head: head || null, remote: remote || null, upstream: upstream || null, ahead, behind, user: name && email ? { name, email } : null };
}

const STATUS_NAME = { M: "modified", A: "added", D: "deleted", R: "renamed", C: "copied", U: "conflicted", T: "type-changed", "?": "untracked" };

/** Working-tree and index changes, one row per file and side. */
export async function gitStatus(root) {
  const { stdout } = await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  const staged = [];
  const unstaged = [];
  const parts = stdout.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i];
    if (entry.length < 4) continue;
    const x = entry[0];
    const y = entry[1];
    const file = entry.slice(3);
    let from;
    if (x === "R" || x === "C") from = parts[++i]; // the original path follows a rename
    if (x === "?" && y === "?") {
      unstaged.push({ path: file, status: "untracked", code: "U" });
      continue;
    }
    const conflicted = x === "U" || y === "U" || (x === "A" && y === "A") || (x === "D" && y === "D");
    if (conflicted) {
      unstaged.push({ path: file, status: "conflicted", code: "!" });
      continue;
    }
    if (x !== " ") staged.push({ path: file, status: STATUS_NAME[x] ?? "modified", code: x, from });
    if (y !== " ") unstaged.push({ path: file, status: STATUS_NAME[y] ?? "modified", code: y });
  }
  return { staged, unstaged, clean: !staged.length && !unstaged.length };
}

/** Unified diff of one file: index→working tree, or HEAD→index when `staged`. */
export async function gitDiff(root, rel, { staged = false } = {}) {
  const file = safePath(root, rel);
  const args = ["diff", "--no-color", "--no-ext-diff", ...(staged ? ["--cached"] : []), "--", file];
  const { stdout } = await git(root, args, { maxBuffer: MAX_DIFF * 4 });
  return stdout.length > MAX_DIFF ? { text: stdout.slice(0, MAX_DIFF), truncated: true } : { text: stdout, truncated: false };
}

/** A file's text as of HEAD — the "before" side of a diff editor. null when it isn't in HEAD. */
export async function gitShow(root, rel, ref = "HEAD") {
  const file = safePath(root, rel);
  if (!/^[A-Za-z0-9][A-Za-z0-9._/@^~-]*$/.test(ref)) throw new GitError("That isn't a git revision.", "BAD_REF");
  const r = await git(root, ["show", `${ref}:${file}`], { allowFail: true, maxBuffer: MAX_DIFF * 4 });
  return r.code === 0 ? r.stdout : null;
}

export async function gitLog(root, limit = 30) {
  const n = Math.max(1, Math.min(200, Number(limit) || 30));
  const r = await git(root, ["log", `-n${n}`, "--pretty=format:%H%x1f%h%x1f%an%x1f%aI%x1f%s%x1e"], { allowFail: true });
  return r.stdout
    .split("\x1e")
    .map((row) => row.trim().split("\x1f"))
    .filter((c) => c.length === 5)
    .map(([sha, short, author, date, subject]) => ({ sha, short, author, date, subject }));
}

export async function gitBranches(root) {
  const { stdout } = await git(root, ["for-each-ref", "--format=%(refname:short)%09%(HEAD)", "refs/heads"]);
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((row) => {
      const [name, head] = row.split("\t");
      return { name, current: head === "*" };
    });
}

/* -------------------------------------------------------------------- write */

export async function gitInit(root) {
  await git(root, ["init"]);
  return gitInfo(root);
}

export async function gitStage(root, paths) {
  await git(root, ["add", "--", ...safePaths(root, paths)]);
}

export async function gitStageAll(root) {
  await git(root, ["add", "--all"]);
}

export async function gitUnstage(root, paths) {
  const files = safePaths(root, paths);
  // Before the first commit there is no HEAD to reset to.
  const hasHead = (await git(root, ["rev-parse", "--verify", "--quiet", "HEAD"], { allowFail: true })).code === 0;
  await git(root, hasHead ? ["reset", "--quiet", "HEAD", "--", ...files] : ["rm", "--cached", "--quiet", "--", ...files]);
}

/** Throw away working-tree changes to tracked files; delete the named untracked ones. Not undoable. */
export async function gitDiscard(root, paths) {
  const files = safePaths(root, paths);
  const { unstaged } = await gitStatus(root);
  const untracked = new Set(unstaged.filter((f) => f.status === "untracked").map((f) => f.path));
  const tracked = files.filter((f) => !untracked.has(f));
  if (tracked.length) await git(root, ["checkout", "--", ...tracked]);
  for (const f of files) if (untracked.has(f)) await fs.promises.rm(path.resolve(root, f), { force: true });
}

/** Switch to a branch, creating it from the current HEAD when `create`. */
export async function gitCheckout(root, name, { create = false } = {}) {
  const branch = await safeBranch(root, name);
  await git(root, create ? ["checkout", "-b", branch] : ["checkout", branch]);
  return gitInfo(root);
}

/** Commit what is staged (or everything, with `all`). The message goes in on stdin. */
export async function gitCommit(root, message, { all = false, paths } = {}) {
  if (typeof message !== "string" || !message.trim()) throw new GitError("A commit needs a message.", "NO_MESSAGE");
  const info = await gitInfo(root);
  if (!info.user) throw new GitError('git doesn\'t know who you are yet. Run: git config --global user.name "Your Name" and git config --global user.email you@example.com', "NO_IDENTITY");
  if (paths?.length) await gitStage(root, paths);
  else if (all) await gitStageAll(root);
  const { staged } = await gitStatus(root);
  if (!staged.length) throw new GitError("There is nothing staged to commit.", "NOTHING_STAGED");
  await git(root, ["commit", "--quiet", "-F", "-"], { input: message });
  const [sha, short] = await Promise.all([line(root, ["rev-parse", "HEAD"]), line(root, ["rev-parse", "--short", "HEAD"])]);
  return { sha, short, files: staged.length, branch: info.branch };
}

/** Credentials for one command only: an Authorization header scoped to github.com. */
function tokenEnv(token) {
  if (!token) return {};
  const basic = Buffer.from(`x-access-token:${token}`).toString("base64");
  return { GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}` };
}

/**
 * Push the current branch (or `branch`) to origin and set its upstream. With a
 * GitHub `token` and an https github.com remote, that token authenticates the
 * push; otherwise git uses whatever credentials the machine already has.
 */
export async function gitPush(root, { branch, token } = {}) {
  const info = await gitInfo(root);
  if (!info.repo) throw new GitError("This folder isn't a git repository.", "NOT_REPO");
  if (!info.remote) throw new GitError('This repository has no "origin" remote to push to.', "NO_REMOTE");
  const name = await safeBranch(root, branch ?? info.branch ?? "");
  const useToken = token && /^https:\/\/github\.com\//i.test(info.remote);
  try {
    await git(root, ["push", "--set-upstream", "origin", `${name}:${name}`], { env: useToken ? tokenEnv(token) : {} });
  } catch (e) {
    const msg = String(e.message);
    if (/could not read Username|Authentication failed|terminal prompts disabled|403|Permission denied/i.test(msg)) {
      throw new GitError(`GitHub didn't accept the push for ${name}. Connect GitHub in Arcade (or sign in with your git credential helper) with an account that can push to this repository.`, "AUTH");
    }
    throw e;
  }
  return { branch: name, remote: info.remote };
}
