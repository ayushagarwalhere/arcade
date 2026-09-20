// Workspace access for the renderer: folder pickers plus read-only listing and
// reading of files inside a folder the user picked.
//
// The renderer never gets general filesystem access. Every root it may read is
// one the user chose in a native dialog; those roots are remembered in
// userData so "previous workspaces" can be reopened after a restart, and every
// path is resolved (symlinks included) and checked to still be inside its root.

const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs");

const MAX_TEXT_BYTES = 1.5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
};

let roots; // Set<string>, loaded lazily
const rootsFile = () => path.join(app.getPath("userData"), "workspaces.json");

function allowedRoots() {
  if (!roots) {
    try {
      const saved = JSON.parse(fs.readFileSync(rootsFile(), "utf8"));
      roots = new Set(Array.isArray(saved) ? saved.filter((r) => typeof r === "string") : []);
    } catch {
      roots = new Set();
    }
  }
  return roots;
}

function allowRoot(root) {
  allowedRoots().add(root);
  try {
    fs.writeFileSync(rootsFile(), JSON.stringify([...roots].slice(-50)));
  } catch {
    /* still allowed for this session */
  }
}

async function resolveInside(root, rel) {
  if (typeof root !== "string" || typeof rel !== "string" || !allowedRoots().has(root)) throw new Error("Workspace is not open");
  const [realRoot, realTarget] = await Promise.all([fs.promises.realpath(root), fs.promises.realpath(path.resolve(root, rel || "."))]);
  const within = path.relative(realRoot, realTarget);
  if (within.startsWith("..") || path.isAbsolute(within)) throw new Error("Path is outside the workspace");
  return realTarget;
}

const describe = (fp) => ({ name: path.basename(fp), path: fp });

function registerWorkspaceIpc() {
  ipcMain.handle("workspace:open-folder", async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showOpenDialog(win, { title: "Open folder", properties: ["openDirectory"] });
    if (res.canceled || !res.filePaths[0]) return null;
    allowRoot(res.filePaths[0]);
    return describe(res.filePaths[0]);
  });

  ipcMain.handle("workspace:create-folder", async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const res = await dialog.showSaveDialog(win, {
      title: "Create folder",
      buttonLabel: "Create",
      nameFieldLabel: "Folder name",
      defaultPath: path.join(app.getPath("documents"), "new-project"),
      properties: ["createDirectory"],
    });
    if (res.canceled || !res.filePath) return null;
    await fs.promises.mkdir(res.filePath, { recursive: true });
    allowRoot(res.filePath);
    return describe(res.filePath);
  });

  // Reopen a previous workspace: only a root the user picked before, that still exists.
  ipcMain.handle("workspace:reopen-folder", async (_e, root) => {
    if (typeof root !== "string" || !allowedRoots().has(root)) return null;
    try {
      return (await fs.promises.stat(root)).isDirectory() ? describe(root) : null;
    } catch {
      return null;
    }
  });

  ipcMain.handle("workspace:list-dir", async (_e, root, rel) => {
    const dir = await resolveInside(root, rel);
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const out = [];
    for (const ent of entries) {
      let isDir = ent.isDirectory();
      if (ent.isSymbolicLink()) {
        try {
          isDir = (await fs.promises.stat(path.join(dir, ent.name))).isDirectory();
        } catch {
          continue; // dangling link
        }
      } else if (!isDir && !ent.isFile()) continue;
      out.push({ name: ent.name, kind: isDir ? "dir" : "file" });
    }
    return out;
  });

  ipcMain.handle("workspace:read-file", async (_e, root, rel) => {
    const file = await resolveInside(root, rel);
    const { size } = await fs.promises.stat(file);
    const mime = IMAGE_MIME[path.extname(file).toLowerCase()];
    if (mime) {
      if (size > MAX_IMAGE_BYTES) return { kind: "too-large", size };
      const data = await fs.promises.readFile(file);
      return { kind: "image", size, url: `data:${mime};base64,${data.toString("base64")}` };
    }
    if (size > MAX_TEXT_BYTES) return { kind: "too-large", size };
    const data = await fs.promises.readFile(file);
    if (data.subarray(0, 8000).includes(0)) return { kind: "binary", size };
    return { kind: "text", size, text: data.toString("utf8") };
  });
}

module.exports = { registerWorkspaceIpc };
