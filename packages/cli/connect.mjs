// Arcade connector — registers the Arcade MCP server with coding agents.
//
// Claude Code and Codex each keep their user-level MCP servers in a file they
// own: `~/.claude.json` (JSON, `mcpServers`) and `~/.codex/config.toml` (TOML,
// `[mcp_servers.<name>]`). Connecting writes one `arcade` entry into that file
// and touches nothing else; disconnecting removes it again. The files are
// edited directly rather than through the `claude` / `codex` CLIs because
// editor-extension and desktop installs don't put those on PATH.
//
// Dependency-free, and shared by the CLI (`arcade connect`) and the desktop
// app (electron/agents-ipc.js).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NAME = "arcade";

export class ConnectError extends Error {}

/** How an agent should launch the MCP server: `node <this folder>/mcp-server.mjs`. */
export function defaultServer() {
  return { command: "node", args: [fileURLToPath(new URL("./mcp-server.mjs", import.meta.url))] };
}

/** Absolute path of an executable on PATH, or null. Nothing is executed. */
export function findOnPath(bin, env = process.env) {
  const exts = process.platform === "win32" ? ["", ...(env.PATHEXT || ".EXE;.CMD;.BAT").split(";")] : [""];
  for (const dir of (env.PATH || env.Path || "").split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const fp = path.join(dir, bin + ext);
      try {
        if (fs.statSync(fp).isFile()) return fp;
      } catch {
        /* not here */
      }
    }
  }
  return null;
}

const exists = (fp) => fs.existsSync(fp);
const sameServer = (a, b) => a.command === b.command && JSON.stringify(a.args || []) === JSON.stringify(b.args || []);

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return "";
    throw e;
  }
}

/** Replace the file in one step so the agent never reads a half-written config. */
function writeAtomic(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let mode = 0o600;
  try {
    mode = fs.statSync(file).mode & 0o777;
  } catch {
    /* new file */
  }
  const tmp = `${file}.${NAME}-${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, { mode });
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    fs.rmSync(tmp, { force: true });
    throw e;
  }
}

/* -------------------------------------------------------------- Claude Code */

function claudeFile({ home, env }) {
  return path.join(env.CLAUDE_CONFIG_DIR || home, ".claude.json");
}

/** The whole config, parsed. Anything unreadable stops here: it is never overwritten. */
function readClaude(file) {
  const text = readText(file);
  if (!text.trim()) return {};
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new ConnectError(`${file} is not valid JSON, so Arcade left it alone.`);
  }
  if (!json || typeof json !== "object" || Array.isArray(json)) throw new ConnectError(`${file} has an unexpected shape, so Arcade left it alone.`);
  return json;
}

const claude = {
  id: "claude-code",
  name: "Claude Code",
  bin: "claude",
  install: "https://claude.com/claude-code",
  file: claudeFile,
  installed: (ctx) => !!findOnPath("claude", ctx.env) || exists(claudeFile(ctx)) || exists(ctx.env.CLAUDE_CONFIG_DIR || path.join(ctx.home, ".claude")),
  read(ctx) {
    const entry = readClaude(claudeFile(ctx)).mcpServers?.[NAME];
    return entry && typeof entry === "object" ? { command: entry.command, args: entry.args } : null;
  },
  write(ctx, server) {
    const file = claudeFile(ctx);
    const json = readClaude(file);
    const servers = { ...json.mcpServers };
    if (server) servers[NAME] = { type: "stdio", command: server.command, args: server.args, env: server.env || {} };
    else delete servers[NAME];
    writeAtomic(file, JSON.stringify({ ...json, mcpServers: servers }, null, 2));
  },
};

/* -------------------------------------------------------------------- Codex */

const HEADER = /^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/;
const tableName = (raw) => raw.replace(/["']/g, "").replace(/\s*\.\s*/g, ".");
const isOurs = (name) => name === `mcp_servers.${NAME}` || name.startsWith(`mcp_servers.${NAME}.`);

function codexFile({ home, env }) {
  return path.join(env.CODEX_HOME || path.join(home, ".codex"), "config.toml");
}

/**
 * Split a config.toml into the lines of our tables and everything else. Only
 * the `[mcp_servers.arcade]` table form is understood (it is what Codex itself
 * writes); an inline or dotted-key registration is reported, not rewritten.
 */
function splitCodex(file) {
  const text = readText(file);
  const kept = [];
  const ours = [];
  let table = "";
  let mine = false;
  // Blank lines and comments at the end of our table introduce the next one;
  // hand them back, minus a blank that would double the one above our table.
  const handBack = () => {
    let n = ours.length;
    while (n > 0 && /^\s*(#.*)?$/.test(ours[n - 1])) n--;
    const tail = ours.splice(n);
    while (tail.length && !tail[0].trim() && kept.length && !kept[kept.length - 1].trim()) tail.shift();
    kept.push(...tail);
  };
  for (const line of text.split(/\r?\n/)) {
    const m = HEADER.exec(line);
    if (m) {
      if (mine) handBack();
      table = tableName(m[1]);
      mine = isOurs(table);
    } else if (
      (table === "" && new RegExp(`^\\s*mcp_servers\\s*\\.\\s*["']?${NAME}["']?\\s*[.=]`).test(line)) ||
      (table === "mcp_servers" && new RegExp(`^\\s*["']?${NAME}["']?\\s*[.=]`).test(line))
    ) {
      throw new ConnectError(`${file} already registers "${NAME}" in a form Arcade doesn't edit. Remove that entry and try again.`);
    }
    (mine ? ours : kept).push(line);
  }
  if (mine) handBack();
  return { kept, ours, eol: text.includes("\r\n") ? "\r\n" : "\n" };
}

/** `key = value` out of our table, for the values Arcade writes (strings and string arrays). */
function tomlValue(lines, key) {
  for (const line of lines) {
    if (HEADER.test(line) && tableName(HEADER.exec(line)[1]) !== `mcp_servers.${NAME}`) break;
    const m = new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*$`).exec(line);
    if (!m) continue;
    if (/^'[^']*'$/.test(m[1])) return m[1].slice(1, -1);
    try {
      return JSON.parse(m[1]);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

const codex = {
  id: "codex",
  name: "Codex",
  bin: "codex",
  install: "https://github.com/openai/codex",
  file: codexFile,
  installed: (ctx) => !!findOnPath("codex", ctx.env) || exists(path.dirname(codexFile(ctx))),
  read(ctx) {
    const { ours } = splitCodex(codexFile(ctx));
    return ours.length ? { command: tomlValue(ours, "command"), args: tomlValue(ours, "args") } : null;
  },
  write(ctx, server) {
    const file = codexFile(ctx);
    const { kept, eol } = splitCodex(file);
    while (kept.length && !kept[kept.length - 1].trim()) kept.pop();
    if (server) {
      // A JSON string is also a valid TOML basic string.
      const block = [`[mcp_servers.${NAME}]`, `command = ${JSON.stringify(server.command)}`, `args = ${JSON.stringify(server.args || [])}`];
      const env = Object.entries(server.env || {});
      if (env.length) block.push("", `[mcp_servers.${NAME}.env]`, ...env.map(([k, v]) => `${k} = ${JSON.stringify(String(v))}`));
      if (kept.length) kept.push("");
      kept.push(...block);
    }
    writeAtomic(file, kept.length ? kept.join(eol) + eol : "");
  },
};

/* ---------------------------------------------------------------------- API */

const AGENTS = [claude, codex];
const ALIASES = { claude: "claude-code", "claude-code": "claude-code", claudecode: "claude-code", codex: "codex" };

export const AGENT_IDS = AGENTS.map((a) => a.id);

function agentFor(id) {
  const agent = AGENTS.find((a) => a.id === ALIASES[String(id).toLowerCase()]);
  if (!agent) throw new ConnectError(`Unknown agent "${id}". Arcade connects to: ${AGENT_IDS.join(", ")}.`);
  return agent;
}

const context = (opts = {}) => ({ home: opts.home || os.homedir(), env: opts.env || process.env, server: opts.server || defaultServer() });

/**
 * Where one agent stands. `outdated` means it is connected, but to a server
 * somewhere else on disk (the app moved, say) — connecting again repoints it.
 */
export function agentStatus(id, opts) {
  const agent = agentFor(id);
  const ctx = context(opts);
  const status = { id: agent.id, name: agent.name, installed: agent.installed(ctx), connected: false, outdated: false, configPath: agent.file(ctx), install: agent.install };
  try {
    const entry = agent.read(ctx);
    status.connected = !!entry;
    status.outdated = !!entry && typeof entry.command === "string" && Array.isArray(entry.args) && !sameServer(entry, ctx.server);
  } catch (e) {
    status.error = e.message;
  }
  return status;
}

export const listAgents = (opts) => AGENT_IDS.map((id) => agentStatus(id, opts));

export function connectAgent(id, opts) {
  const agent = agentFor(id);
  const ctx = context(opts);
  if (!agent.installed(ctx)) throw new ConnectError(`${agent.name} doesn't look installed on this machine. Install it from ${agent.install}, run it once, then connect.`);
  agent.write(ctx, ctx.server);
  return agentStatus(id, opts);
}

export function disconnectAgent(id, opts) {
  const agent = agentFor(id);
  const ctx = context(opts);
  if (agent.read(ctx)) agent.write(ctx, null);
  return agentStatus(id, opts);
}
