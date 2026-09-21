// A real terminal for the renderer.
//
// Each line the user enters runs in their own shell, in the session's working
// directory, with its output streamed back as it is produced. The session keeps
// its directory between commands (`cd` is handled here), and a running command
// can be interrupted. There is deliberately no pty: a native module would have
// to be rebuilt for every platform the app ships on. The cost is that full-screen
// programs (vim, htop) don't work here; builds, tests, git and package managers do.
//
// A terminal runs whatever is typed into it; that is what it is for. What this
// bridge does guarantee is that a session can only be opened on a folder the user
// picked, and that the security loop's test command is detected here, from the
// project's own manifest, never supplied by the page.

const { ipcMain } = require("electron");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const WIN = process.platform === "win32";
const MAX_CHUNK = 64 * 1024;
const MAX_SESSIONS = 8;

function findOnPath(bin) {
  const exts = WIN ? (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";") : [""];
  for (const dir of (process.env.PATH || process.env.Path || "").split(path.delimiter)) {
    for (const ext of exts) {
      const fp = path.join(dir, bin + ext);
      try {
        if (dir && fs.statSync(fp).isFile()) return fp;
      } catch {
        /* not here */
      }
    }
  }
  return null;
}

/** The shells this machine has, in the order a developer on it would expect. */
function shells() {
  if (!WIN) {
    const sh = process.env.SHELL || "/bin/sh";
    return [{ id: path.basename(sh), name: path.basename(sh), exe: sh, args: (line) => ["-lc", line] }];
  }
  const utf8 = "[Console]::OutputEncoding=[Text.Encoding]::UTF8;";
  const out = [];
  const pwsh = findOnPath("pwsh");
  if (pwsh) out.push({ id: "pwsh", name: "PowerShell 7", exe: pwsh, args: (line) => ["-NoLogo", "-Command", `${utf8} ${line}`] });
  out.push({ id: "powershell", name: "Windows PowerShell", exe: "powershell.exe", args: (line) => ["-NoLogo", "-Command", `${utf8} ${line}`] });
  out.push({ id: "cmd", name: "Command Prompt", exe: process.env.ComSpec || "cmd.exe", args: (line) => ["/d", "/s", "/c", `chcp 65001>nul & ${line}`], verbatim: true });
  const bash = [path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "bin", "bash.exe")].find((p) => fs.existsSync(p));
  if (bash) out.push({ id: "bash", name: "Git Bash", exe: bash, args: (line) => ["-lc", line] });
  return out;
}

function killTree(child) {
  if (!child || child.exitCode != null || !child.pid) return;
  if (WIN) spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" }).on("error", () => {});
  else {
    try {
      process.kill(-child.pid, "SIGINT");
    } catch {
      child.kill("SIGINT");
    }
  }
}

/** `cd` with no pty has to be done by us. Handles quotes, ~, and `cd -`-less plain paths. */
function changeDir(session, arg) {
  let target = arg.trim().replace(/^["']|["']$/g, "");
  if (!target || target === "~") target = require("os").homedir();
  else if (target.startsWith("~/") || target.startsWith("~\\")) target = path.join(require("os").homedir(), target.slice(2));
  const next = path.resolve(session.cwd, target);
  if (!fs.statSync(next, { throwIfNoEntry: false })?.isDirectory()) return `cd: no such directory: ${arg.trim()}`;
  session.cwd = next;
  return null;
}

/** The project's own test command, read from its manifest. null when none is declared. */
function detectTests(root) {
  const has = (f) => fs.existsSync(path.join(root, f));
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    const script = pkg.scripts?.test;
    if (script && !/no test specified/i.test(script)) {
      const pm = has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : has("bun.lockb") ? "bun" : "npm";
      return { command: `${pm} test`, source: "package.json" };
    }
  } catch {
    /* not a Node project */
  }
  if (has("pytest.ini") || has("conftest.py") || (has("pyproject.toml") && /pytest/.test(fs.readFileSync(path.join(root, "pyproject.toml"), "utf8")))) return { command: "python -m pytest -q", source: "pytest" };
  if (has("go.mod")) return { command: "go test ./...", source: "go.mod" };
  if (has("Cargo.toml")) return { command: "cargo test", source: "Cargo.toml" };
  return null;
}

function registerTerminalIpc({ isAllowedRoot }) {
  const sessions = new Map(); // id -> { cwd, child, shell }

  ipcMain.handle("terminal:shells", () => shells().map(({ id, name }) => ({ id, name })));

  ipcMain.handle("terminal:open", (event, root, shellId) => {
    if (!isAllowedRoot(root)) throw new Error("Workspace is not open");
    if (sessions.size >= MAX_SESSIONS) throw new Error("Too many terminals are open.");
    const all = shells();
    const shell = all.find((s) => s.id === shellId) ?? all[0];
    const id = `term-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    sessions.set(id, { cwd: root, child: null, shell });
    event.sender.once("destroyed", () => {
      killTree(sessions.get(id)?.child);
      sessions.delete(id);
    });
    return { id, cwd: root, shell: { id: shell.id, name: shell.name } };
  });

  ipcMain.handle("terminal:exec", (event, id, line) => {
    const session = sessions.get(String(id));
    if (!session) throw new Error("That terminal is closed.");
    if (session.child) throw new Error("A command is still running. Press Ctrl+C to stop it.");
    const text = String(line ?? "").trim();
    const send = (payload) => {
      if (!event.sender.isDestroyed()) event.sender.send("terminal:event", { id, ...payload });
    };
    if (!text) return send({ kind: "exit", code: 0, cwd: session.cwd });

    const cd = /^cd(?:\s+(.*))?$/i.exec(text);
    if (cd && !/[;&|]/.test(text)) {
      const err = changeDir(session, cd[1] ?? "");
      if (err) send({ kind: "err", data: `${err}\n` });
      return send({ kind: "exit", code: err ? 1 : 0, cwd: session.cwd });
    }

    const child = spawn(session.shell.exe, session.shell.args(text), {
      cwd: session.cwd,
      windowsHide: true,
      windowsVerbatimArguments: !!session.shell.verbatim,
      detached: !WIN, // its own process group, so Ctrl+C reaches what it started
      // Output isn't a TTY, so tools are told colour is wanted (this terminal renders it) — and an inherited
      // NO_COLOR is dropped, since the two together just make Node print a warning on every command.
      env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, NO_COLOR: undefined, FORCE_COLOR: "1", CLICOLOR_FORCE: "1", TERM: "xterm-256color", GIT_PAGER: "cat", PAGER: "cat" },
    });
    session.child = child;
    const pipe = (stream, kind) => {
      stream.setEncoding("utf8");
      stream.on("data", (d) => {
        for (let i = 0; i < d.length; i += MAX_CHUNK) send({ kind, data: d.slice(i, i + MAX_CHUNK) });
      });
    };
    pipe(child.stdout, "out");
    pipe(child.stderr, "err");
    child.stdin.end();
    child.on("error", (e) => {
      session.child = null;
      send({ kind: "err", data: `${e.message}\n` });
      send({ kind: "exit", code: 127, cwd: session.cwd });
    });
    child.on("close", (code, signal) => {
      if (session.child !== child) return;
      session.child = null;
      send({ kind: "exit", code: code ?? (signal ? 130 : 1), cwd: session.cwd });
    });
  });

  ipcMain.handle("terminal:interrupt", (_e, id) => killTree(sessions.get(String(id))?.child));

  ipcMain.handle("terminal:close", (_e, id) => {
    killTree(sessions.get(String(id))?.child);
    sessions.delete(String(id));
  });

  ipcMain.handle("terminal:detect-tests", (_e, root) => {
    if (!isAllowedRoot(root)) throw new Error("Workspace is not open");
    return detectTests(root);
  });
}

module.exports = { registerTerminalIpc };
