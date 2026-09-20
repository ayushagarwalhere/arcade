// Coding-agent connections for the renderer: is Claude Code / Codex installed,
// is Arcade's MCP server registered with it, and connect / disconnect.
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

function registerAgentsIpc() {
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
}

module.exports = { registerAgentsIpc };
