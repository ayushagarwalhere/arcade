// Real git for the renderer: the Source Control view, and the commits the
// security loop makes once a fix is verified.
//
// The work is done by the same module the CLI uses (packages/cli/git.mjs), which
// runs the user's own `git` without a shell and checks every path and branch name.
// Two rules keep this bridge narrow:
//   - the renderer names an opened folder plus structured values (relative paths,
//     a branch name, a commit message). It never supplies git arguments, and
//   - a push is authenticated here, with the token this process decrypts from the
//     keychain-backed GitHub session. The renderer never sends a token over IPC.

const { app, ipcMain } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

const bundledCli = () => (app.isPackaged ? path.join(process.resourcesPath, "cli") : path.join(__dirname, "..", "..", "..", "packages", "cli"));

let mod; // Promise<module>, loaded once
const load = () => (mod ??= import(pathToFileURL(path.join(bundledCli(), "git.mjs")).href));

function registerGitIpc({ isAllowedRoot, githubToken }) {
  /** Every handler: check the folder, run the operation, and hand errors back as data. */
  const handle = (channel, run) =>
    ipcMain.handle(channel, async (_e, root, ...args) => {
      if (!isAllowedRoot(root)) return { ok: false, error: "Workspace is not open" };
      try {
        return { ok: true, value: await run(await load(), root, ...args) };
      } catch (e) {
        return { ok: false, error: e.message, code: e.code };
      }
    });

  handle("git:info", (g, root) => g.gitInfo(root));
  handle("git:status", (g, root) => g.gitStatus(root));
  handle("git:diff", (g, root, rel, staged) => g.gitDiff(root, rel, { staged: !!staged }));
  handle("git:show", (g, root, rel) => g.gitShow(root, rel));
  handle("git:log", (g, root, limit) => g.gitLog(root, limit));
  handle("git:branches", (g, root) => g.gitBranches(root));
  handle("git:init", (g, root) => g.gitInit(root));
  handle("git:stage", (g, root, paths) => (paths ? g.gitStage(root, paths) : g.gitStageAll(root)));
  handle("git:unstage", (g, root, paths) => g.gitUnstage(root, paths));
  handle("git:discard", (g, root, paths) => g.gitDiscard(root, paths));
  handle("git:checkout", (g, root, branch, create) => g.gitCheckout(root, branch, { create: !!create }));
  handle("git:commit", (g, root, message, opts) => g.gitCommit(root, message, { all: !!opts?.all, paths: Array.isArray(opts?.paths) ? opts.paths : undefined }));
  handle("git:push", async (g, root, branch) => g.gitPush(root, { branch: branch || undefined, token: await githubToken() }));
}

module.exports = { registerGitIpc };
