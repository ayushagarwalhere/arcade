// Arcade desktop shell.
//
// Wraps the statically-exported ADE (../out) in an Electron window. In a
// packaged build it serves the export over a privileged `app://` protocol so
// the absolute /_next/... asset paths resolve to the export root. In dev
// (unpackaged) it loads the running `next dev` server instead.

const { app, BrowserWindow, protocol, shell, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const { registerWorkspaceIpc, isAllowedRoot } = require("./workspace-ipc");
const { registerSandboxIpc } = require("./sandbox-ipc");
const { registerGithubIpc, githubToken } = require("./github-ipc");
const { registerAgentsIpc } = require("./agents-ipc");
const { registerGitIpc } = require("./git-ipc");
const { registerTerminalIpc } = require("./terminal-ipc");

const isDev = !app.isPackaged && !process.env.ELECTRON_PROD;
const OUT = path.join(__dirname, "..", "out");
const SCHEME = "app";
const DEV_URL = "http://localhost:3001/arcade/";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

if (!isDev) {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
  ]);
}

function resolveFile(pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, "");
  if (!rel) return path.join(OUT, "index.html");
  const fp = path.join(OUT, rel);
  // An encoded "../" survives URL normalisation and is decoded above, so check the result:
  // app:// may only ever serve files inside the exported site.
  const inside = path.relative(OUT, fp);
  if (inside.startsWith("..") || path.isAbsolute(inside)) return path.join(OUT, "404.html");
  try {
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) return path.join(fp, "index.html");
    return fp;
  } catch {
    // trailingSlash export: /arcade -> /arcade/index.html, or /x -> /x.html
    if (!path.extname(fp)) {
      const idx = path.join(fp, "index.html");
      if (fs.existsSync(idx)) return idx;
      const html = `${fp}.html`;
      if (fs.existsSync(html)) return html;
    }
    return path.join(OUT, "404.html");
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1040,
    minHeight: 680,
    backgroundColor: "#000000",
    title: "Arcade",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // External links open in the user's browser, not inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http")) shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("did-finish-load", () => {
    console.log(`[arcade] loaded ${win.webContents.getURL()}`);
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[arcade] failed to load ${url} (${code} ${desc})`);
  });

  if (isDev) {
    win.loadURL(DEV_URL).catch(() => win.loadURL("http://localhost:3001/"));
  } else {
    win.loadURL(`${SCHEME}://arcade/arcade/`);
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  registerWorkspaceIpc();
  registerGithubIpc();
  registerAgentsIpc({ isAllowedRoot });
  registerGitIpc({ isAllowedRoot, githubToken });
  registerTerminalIpc({ isAllowedRoot });
  registerSandboxIpc({ isAllowedRoot });

  if (!isDev) {
    protocol.handle(SCHEME, async (request) => {
      const url = new URL(request.url);
      const file = resolveFile(url.pathname);
      try {
        const data = await fs.promises.readFile(file);
        const ext = path.extname(file).toLowerCase();
        return new Response(data, { headers: { "content-type": MIME[ext] || "application/octet-stream" } });
      } catch {
        return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
      }
    });
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
