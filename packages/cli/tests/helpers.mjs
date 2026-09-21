// Shared test plumbing: a throwaway vulnerable project, a CLI runner with a
// sealed environment, and fake coding agents.
//
// Safety: nothing here may ever start a real coding agent. Agent tests put a stub
// named `codex` first on a private PATH, point HOME at an empty folder (so no
// editor-extension binary is discovered), and always name `--agent codex`.

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findOnPath } from "../connect.mjs";

export const WIN = process.platform === "win32";
export const CLI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CLI = path.join(CLI_DIR, "arcade.mjs");
export const MCP = path.join(CLI_DIR, "mcp-server.mjs");

const made = [];
export function tempDir(prefix = "arcade-cli-") {
  const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  made.push(dir);
  return dir;
}
export function cleanup() {
  for (const dir of made.splice(0)) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
}

export function write(root, rel, text) {
  const fp = path.join(root, rel);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  fs.writeFileSync(fp, text);
  return fp;
}

/** The secret is assembled at runtime so this file doesn't trip secret scanners itself. */
export const FAKE_KEY = ["sk", "live", "4eC39HqLyjWDarjtT1zdp7dc"].join("_");

/**
 * A small project with one known weakness per file. Line numbers matter: the
 * tests assert them.
 */
export function makeFixture() {
  const root = tempDir();
  write(root, "package.json", '{ "name": "fixture", "version": "1.0.0" }\n');
  write(root, "src/hash.js", ['import { createHash } from "node:crypto";', "", "export function fingerprint(value) {", '  return createHash("md5").update(value).digest("hex");', "}", ""].join("\n"));
  write(root, "src/db.js", ["export async function findOrder(db, req) {", "  const id = req.query.id;", "  return db.query(`SELECT * FROM orders WHERE id = ${id}`);", "}", ""].join("\n"));
  write(root, "src/config.js", ["export const config = {", `  apiKey: "${FAKE_KEY}",`, "};", ""].join("\n"));
  // CRLF on purpose: a fix must keep the file's line endings.
  write(root, "src/tls.js", ['import https from "node:https";', "export const agent = new https.Agent({", "  rejectUnauthorized: false,", "  keepAlive: true,", "});", ""].join("\r\n"));
  write(root, "tests/legacy.test.js", 'const h = require("crypto").createHash("sha1");\n');
  write(root, "node_modules/junk/index.js", 'const h = require("crypto").createHash("md5");\n');
  return root;
}

/** An environment with no GitHub token, no colour, and a home folder with nothing in it. */
export function sealedEnv(extra = {}) {
  const home = tempDir("arcade-home-");
  // The ceiling stops git from adopting a repository above the temp folder (a home folder that is itself a repo, say).
  const env = { ...process.env, NO_COLOR: "1", HOME: home, USERPROFILE: home, GIT_CEILING_DIRECTORIES: os.tmpdir(), ...extra };
  for (const k of ["GITHUB_TOKEN", "GH_TOKEN", "ARCADE_API_URL", "ARCADE_TOKEN", "ARCADE_ORG_ID", "ARCADE_PROJECT_ID", "ARCADE_RUN_ID", "FORCE_COLOR"]) if (!(k in extra)) delete env[k];
  return env;
}

export function runCli(args, { cwd, env } = {}) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, env: env ?? sealedEnv(), encoding: "utf8", windowsHide: true, timeout: 60000 });
  return {
    status: r.status,
    stdout: r.stdout,
    stderr: r.stderr,
    json() {
      try {
        return JSON.parse(r.stdout);
      } catch (e) {
        throw new Error(`stdout is not JSON (${e.message}):\n${r.stdout}\n--- stderr ---\n${r.stderr}`);
      }
    },
  };
}

/* -------------------------------------------------------------- fake agents */

/** PATH for agent tests: the stub's folder first, then only what the OS and git need. */
export function stubPath(stubDir) {
  const parts = [stubDir];
  if (WIN) parts.push(path.join(process.env.SystemRoot || "C:\\Windows", "System32"));
  else parts.push("/usr/bin", "/bin");
  const git = findOnPath("git");
  if (git) parts.push(path.dirname(git));
  return parts.join(path.delimiter);
}

/** A `codex` that prints fixed Codex-style JSONL and exits. No Node involved: on Windows this is the .cmd-via-shell path. */
export function fakeCodex(lines) {
  const dir = tempDir("arcade-stub-");
  if (WIN) fs.writeFileSync(path.join(dir, "codex.cmd"), ["@echo off", ...lines.map((l) => `echo ${l}`), ""].join("\r\n"));
  else {
    fs.writeFileSync(path.join(dir, "codex"), ["#!/bin/sh", "cat > /dev/null", ...lines.map((l) => `echo '${l}'`), ""].join("\n"));
    fs.chmodSync(path.join(dir, "codex"), 0o755);
  }
  return dir;
}

/** A `codex` backed by a Node script (run with this Node), for stubs that need to read stdin or edit files. */
export function fakeCodexScript(source) {
  const dir = tempDir("arcade-stub-");
  const script = path.join(dir, "fake-codex.mjs");
  fs.writeFileSync(script, source);
  if (WIN) fs.writeFileSync(path.join(dir, "codex.cmd"), `@echo off\r\n"${process.execPath}" "${script}" %*\r\n`);
  else {
    fs.writeFileSync(path.join(dir, "codex"), `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
    fs.chmodSync(path.join(dir, "codex"), 0o755);
  }
  return dir;
}

/* ---------------------------------------------------------------------- MCP */

/** Drive the MCP server over stdio: `call(method, params)` resolves with the JSON-RPC response. */
export function startMcp({ cwd, env } = {}) {
  const child = spawn(process.execPath, [MCP], { cwd, env: env ?? sealedEnv(), windowsHide: true });
  const waiting = new Map();
  let buf = "";
  let nextId = 1;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      waiting.get(msg.id)?.(msg);
      waiting.delete(msg.id);
    }
  });
  let stderr = "";
  child.stderr.on("data", (c) => (stderr += c));
  return {
    call(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`MCP ${method} timed out. stderr: ${stderr}`)), 30000);
        waiting.set(id, (msg) => (clearTimeout(timer), resolve(msg)));
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });
    },
    /** tools/call, with the text content parsed back into an object. */
    async tool(name, args = {}) {
      const res = await this.call("tools/call", { name, arguments: args });
      if (res.error) return { error: res.error };
      return { result: JSON.parse(res.result.content[0].text) };
    },
    notify: (method, params) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`),
    close: () => new Promise((resolve) => (child.once("close", resolve), child.stdin.end())),
  };
}
