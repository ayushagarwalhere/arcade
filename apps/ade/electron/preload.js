const { contextBridge, ipcRenderer } = require("electron");

/** Subscribe to a main → renderer channel; returns the unsubscribe. */
const on = (channel) => (handler) => {
  const listener = (_e, payload) => handler(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

// A small, safe bridge so the web app can tell it is running inside the desktop
// shell (e.g. to hide the browser "Download" prompts), ask for the native folder
// pickers, work with files inside a folder the user picked, use git there, drive
// the coding agents installed on this machine, and open a terminal. No Node
// access is exposed; the main process enforces the folder boundary and decides
// what actually executes (see workspace-ipc.js, git-ipc.js, agents-ipc.js).
contextBridge.exposeInMainWorld("arcade", {
  desktop: true,
  platform: process.platform,
  openFolder: () => ipcRenderer.invoke("workspace:open-folder"),
  createFolder: () => ipcRenderer.invoke("workspace:create-folder"),
  reopenFolder: (root) => ipcRenderer.invoke("workspace:reopen-folder", root),
  listDir: (root, rel) => ipcRenderer.invoke("workspace:list-dir", root, rel),
  readFile: (root, rel) => ipcRenderer.invoke("workspace:read-file", root, rel),
  writeFile: (root, rel, text) => ipcRenderer.invoke("workspace:write-file", root, rel, text),
  createEntry: (root, rel, kind) => ipcRenderer.invoke("workspace:create", root, rel, kind),
  renameEntry: (root, from, to) => ipcRenderer.invoke("workspace:rename", root, from, to),
  trashEntry: (root, rel) => ipcRenderer.invoke("workspace:trash", root, rel),
  revealEntry: (root, rel) => ipcRenderer.invoke("workspace:reveal", root, rel),
  // GitHub sign-in (see github-ipc.js).
  github: {
    deviceCode: (clientId, scope) => ipcRenderer.invoke("github:device-code", clientId, scope),
    deviceToken: (clientId, deviceCode) => ipcRenderer.invoke("github:device-token", clientId, deviceCode),
    loadSession: () => ipcRenderer.invoke("github:load-session"),
    saveSession: (session) => ipcRenderer.invoke("github:save-session", session),
  },
  // Real git in the opened folder (see git-ipc.js). Every call resolves to { ok, value } or { ok: false, error }.
  git: {
    info: (root) => ipcRenderer.invoke("git:info", root),
    status: (root) => ipcRenderer.invoke("git:status", root),
    diff: (root, rel, staged) => ipcRenderer.invoke("git:diff", root, rel, staged),
    show: (root, rel) => ipcRenderer.invoke("git:show", root, rel),
    log: (root, limit) => ipcRenderer.invoke("git:log", root, limit),
    branches: (root) => ipcRenderer.invoke("git:branches", root),
    init: (root) => ipcRenderer.invoke("git:init", root),
    stage: (root, paths) => ipcRenderer.invoke("git:stage", root, paths),
    unstage: (root, paths) => ipcRenderer.invoke("git:unstage", root, paths),
    discard: (root, paths) => ipcRenderer.invoke("git:discard", root, paths),
    checkout: (root, branch, create) => ipcRenderer.invoke("git:checkout", root, branch, create),
    commit: (root, message, opts) => ipcRenderer.invoke("git:commit", root, message, opts),
    push: (root, branch) => ipcRenderer.invoke("git:push", root, branch),
  },
  // Coding agents (see agents-ipc.js): MCP registration, and running an installed agent's CLI in the folder.
  agents: {
    status: () => ipcRenderer.invoke("agents:status"),
    connect: (id) => ipcRenderer.invoke("agents:connect", id),
    disconnect: (id) => ipcRenderer.invoke("agents:disconnect", id),
    detect: () => ipcRenderer.invoke("agents:detect"),
    run: (root, request) => ipcRenderer.invoke("agents:run", root, request),
    cancel: (runId) => ipcRenderer.invoke("agents:cancel", runId),
    onEvent: on("agents:event"),
  },
  // A real shell in the folder (see terminal-ipc.js).
  terminal: {
    shells: () => ipcRenderer.invoke("terminal:shells"),
    open: (root, shellId) => ipcRenderer.invoke("terminal:open", root, shellId),
    exec: (id, line) => ipcRenderer.invoke("terminal:exec", id, line),
    interrupt: (id) => ipcRenderer.invoke("terminal:interrupt", id),
    close: (id) => ipcRenderer.invoke("terminal:close", id),
    detectTests: (root) => ipcRenderer.invoke("terminal:detect-tests", root),
    onEvent: on("terminal:event"),
  },
  // Real Docker sandboxes (see sandbox-ipc.js). The page names an opened folder; it never supplies a command.
  sandbox: {
    available: () => ipcRenderer.invoke("sandbox:available"),
    test: (root) => ipcRenderer.invoke("sandbox:test", root),
    onEvent: on("sandbox:event"),
  },
});
