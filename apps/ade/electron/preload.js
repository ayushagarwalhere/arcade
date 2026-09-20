const { contextBridge, ipcRenderer } = require("electron");

// A tiny, safe bridge so the web app can tell it is running inside the desktop
// shell (e.g. to hide the browser "Download" prompts), ask for the native
// folder pickers, read files inside a folder the user picked, and connect the
// coding agents installed on this machine. No Node access is exposed; the main
// process enforces the folder boundary (see workspace-ipc.js).
contextBridge.exposeInMainWorld("arcade", {
  desktop: true,
  platform: process.platform,
  openFolder: () => ipcRenderer.invoke("workspace:open-folder"),
  createFolder: () => ipcRenderer.invoke("workspace:create-folder"),
  reopenFolder: (root) => ipcRenderer.invoke("workspace:reopen-folder", root),
  listDir: (root, rel) => ipcRenderer.invoke("workspace:list-dir", root, rel),
  readFile: (root, rel) => ipcRenderer.invoke("workspace:read-file", root, rel),
  // GitHub sign-in (see github-ipc.js).
  github: {
    deviceCode: (clientId, scope) => ipcRenderer.invoke("github:device-code", clientId, scope),
    deviceToken: (clientId, deviceCode) => ipcRenderer.invoke("github:device-token", clientId, deviceCode),
    loadSession: () => ipcRenderer.invoke("github:load-session"),
    saveSession: (session) => ipcRenderer.invoke("github:save-session", session),
  },
  // Claude Code / Codex connections (see agents-ipc.js).
  agents: {
    status: () => ipcRenderer.invoke("agents:status"),
    connect: (id) => ipcRenderer.invoke("agents:connect", id),
    disconnect: (id) => ipcRenderer.invoke("agents:disconnect", id),
  },
  // Real Docker sandboxes (see sandbox-ipc.js). The page names an opened folder; it never supplies a command.
  sandbox: {
    available: () => ipcRenderer.invoke("sandbox:available"),
    test: (root) => ipcRenderer.invoke("sandbox:test", root),
    onEvent: (handler) => {
      const listener = (_e, payload) => handler(payload);
      ipcRenderer.on("sandbox:event", listener);
      return () => ipcRenderer.removeListener("sandbox:event", listener);
    },
  },
});
