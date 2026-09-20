// Real sandboxed test runs for the renderer.
//
// The work is done by the same module the CLI uses (packages/cli/sandbox.mjs): the
// project is snapshotted with its secret files withheld, copied into a throwaway
// Docker container with no host mounts and no capabilities, dependencies are
// installed, the network is cut and verified, the tests run, and the container is
// destroyed. Docker has to be running on this machine — which is why this exists
// in the desktop app and cannot exist on the website.
//
// Two rules keep the bridge narrow:
//   - the renderer names a folder and nothing else. It must be a folder the user
//     already opened through the native picker (the workspace allow-list), and
//   - the renderer never supplies the command. What runs is the project's own
//     detected test command.

const { app, ipcMain } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

const bundledCli = () => (app.isPackaged ? path.join(process.resourcesPath, "cli") : path.join(__dirname, "..", "..", "..", "packages", "cli"));

let sandbox; // Promise<module>, loaded once
const load = () => (sandbox ??= import(pathToFileURL(path.join(bundledCli(), "sandbox.mjs")).href));

const MAX_LINE = 2000;
let running = false;

function registerSandboxIpc({ isAllowedRoot }) {
  ipcMain.handle("sandbox:available", async () => {
    try {
      await (await load()).ensureDocker();
      return { available: true };
    } catch (e) {
      return { available: false, reason: e.message };
    }
  });

  ipcMain.handle("sandbox:test", async (event, root) => {
    if (typeof root !== "string" || !isAllowedRoot(root)) throw new Error("Workspace is not open");
    if (running) throw new Error("A sandbox run is already in progress");
    running = true;
    const send = (payload) => {
      if (!event.sender.isDestroyed()) event.sender.send("sandbox:event", payload);
    };
    try {
      const s = await load();
      const result = await s.runTests({
        dir: root,
        onStep: (step, detail) => send({ kind: "step", step, detail: String(detail ?? "").slice(0, MAX_LINE) }),
        onOutput: (chunk) => {
          for (const line of String(chunk).split(/\r?\n/)) if (line.trim()) send({ kind: "output", line: line.slice(0, MAX_LINE) });
        },
      });
      return { ok: true, passed: result.passed, exitCode: result.exitCode, timedOut: !!result.timedOut, durationMs: result.durationMs, sandboxId: result.sandboxId, image: result.image, network: result.network };
    } catch (e) {
      return { ok: false, error: e.message };
    } finally {
      running = false;
    }
  });
}

module.exports = { registerSandboxIpc };
