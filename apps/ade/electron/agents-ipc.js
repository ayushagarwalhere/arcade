// Coding agents for the renderer, in both directions: registering Arcade's MCP
// server with Claude Code / Codex (connect / disconnect), and running an installed
// agent's own CLI inside the open project (detect / run / cancel).
//
// The work is done by the same connector the CLI uses (packages/cli/connect.mjs), which
// edits only the `arcade` entry of each agent's own config file. The renderer
// names an agent and nothing else: what gets registered is decided here.

const { app, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");
const { pathToFileURL } = require("url");

// The CLI lives in packages/cli in the repo, and under resources/ in a
// packaged app (see `extraResources` in package.json).
const bundledCli = () => (app.isPackaged ? path.join(process.resourcesPath, "cli") : path.join(__dirname, "..", "..", "..", "packages", "cli"));

// A packaged app's own folder isn't a safe thing to register: the portable
// build unpacks to a new temp folder on every launch. Agents are pointed at a
// copy in userData instead, which stays put.
const stableCli = () => (app.isPackaged ? path.join(app.getPath("userData"), "connector") : bundledCli());

function syncCli() {
  if (!app.isPackaged) return;
  fs.mkdirSync(stableCli(), { recursive: true });
  for (const f of fs.readdirSync(bundledCli())) {
    if (f.endsWith(".mjs")) fs.copyFileSync(path.join(bundledCli(), f), path.join(stableCli(), f));
  }
}

let connector; // Promise<module>, loaded once
const loadConnector = () => (connector ??= import(pathToFileURL(path.join(bundledCli(), "connect.mjs")).href));

/** How an agent should launch the server: Node when there is one, otherwise this app running as Node. */
function serverSpec({ findOnPath }) {
  const script = path.join(stableCli(), "mcp-server.mjs");
  if (findOnPath("node")) return { command: "node", args: [script] };
  if (process.env.PORTABLE_EXECUTABLE_FILE) throw new Error("Connecting from the portable app needs Node.js on your PATH. Install Node.js, or use the Arcade installer.");
  return { command: process.execPath, args: [script], env: { ELECTRON_RUN_AS_NODE: "1" } };
}

function registerAgentsIpc({ isAllowedRoot }) {
  // Keep an already-registered copy in step with this version of the app.
  try {
    if (fs.existsSync(stableCli())) syncCli();
  } catch (e) {
    console.error(`[arcade] could not refresh the agent connector: ${e.message}`);
  }

  ipcMain.handle("agents:status", async () => {
    const c = await loadConnector();
    let server;
    try {
      server = serverSpec(c);
    } catch {
      /* status still works; connecting will explain */
    }
    return c.listAgents({ server });
  });

  ipcMain.handle("agents:connect", async (_e, id) => {
    const c = await loadConnector();
    const server = serverSpec(c);
    syncCli();
    return c.connectAgent(String(id), { server });
  });

  ipcMain.handle("agents:disconnect", async (_e, id) => {
    const c = await loadConnector();
    return c.disconnectAgent(String(id));
  });

  /* ---- Running an agent (packages/cli/agent-runner.mjs) -------------------
   * The renderer names an opened folder, an agent, and what to say to it. Which
   * binary runs, with which arguments, is decided by the runner: prompt text only
   * ever reaches the agent over stdin.
   */
  const runs = new Map(); // runId -> AbortController
  const MAX_RUNS = 3;
  const MAX_PROMPT = 200_000;

  ipcMain.handle("agents:detect", async () => (await loadRunner()).detectAgents());

  ipcMain.handle("agents:run", async (event, root, req) => {
    if (!isAllowedRoot(root)) throw new Error("Workspace is not open");
    if (runs.size >= MAX_RUNS) throw new Error("Too many agents are running. Stop one first.");
    const prompt = String(req?.prompt ?? "");
    if (prompt.length > MAX_PROMPT) throw new Error("That prompt is too long.");
    const history = Array.isArray(req?.history) ? req.history.slice(-20).map((t) => ({ role: t?.role === "user" ? "user" : "assistant", text: String(t?.text ?? "").slice(0, 8000) })) : undefined;

    const r = await loadRunner();
    const runId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const ac = new AbortController();
    const send = (ev) => {
      if (!event.sender.isDestroyed()) event.sender.send("agents:event", { runId, ev });
    };

    // Validation errors throw here, before a run id exists; the run itself reports through events.
    const run = r.runAgent({ id: String(req?.id), cwd: root, prompt, mode: req?.mode === "edit" ? "edit" : "read", model: req?.model ? String(req.model) : undefined, sessionId: req?.sessionId ? String(req.sessionId) : undefined, history, signal: ac.signal, onEvent: send });
    runs.set(runId, ac);
    event.sender.once("destroyed", () => ac.abort());
    run
      .catch((e) => send({ type: "done", ok: false, cancelled: false, error: e.message }))
      .finally(() => runs.delete(runId));
    return { runId };
  });

  ipcMain.handle("agents:cancel", (_e, runId) => {
    runs.get(String(runId))?.abort();
  });
}

let runner; // Promise<module>, loaded once
const loadRunner = () => (runner ??= import(pathToFileURL(path.join(bundledCli(), "agent-runner.mjs")).href));

module.exports = { registerAgentsIpc };
