// Workspace access for the renderer: folder pickers, listing and reading files
// inside a folder the user picked, and the edits an IDE makes to them (save,
// new file / folder, rename, move to trash).
//
// The renderer never gets general filesystem access. Every root it may touch is
// one the user chose in a native dialog; those roots are remembered in
// userData so "previous workspaces" can be reopened after a restart, and every
// path is resolved (symlinks included) and checked to still be inside its root.
// Deleting sends a file to the OS trash, so it can be brought back.

const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
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

/**
 * Like resolveInside, for a path that may not exist yet: the nearest existing
 * ancestor is what gets resolved and checked, so a symlinked folder can't be
 * used to write outside the workspace.
 */
async function resolveNewInside(root, rel) {
  if (typeof root !== "string" || typeof rel !== "string" || !rel || !allowedRoots().has(root)) throw new Error("Workspace is not open");
  const parts = rel.split(/[\\/]+/).filter(Boolean);
  if (!parts.length || parts.some((p) => p === "." || p === ".." || /[<>:"|?*\0]/.test(p))) throw new Error("That isn't a valid file name");
  if (parts[0].toLowerCase() === ".git") throw new Error("Arcade doesn't write inside .git");
  const realRoot = await fs.promises.realpath(root);
  let existing = realRoot;
  let i = 0;
  for (; i < parts.length; i++) {
    const next = path.join(existing, parts[i]);
    try {
      existing = await fs.promises.realpath(next);
    } catch {
      break;
    }
  }
  const within = path.relative(realRoot, existing);
  if (within.startsWith("..") || path.isAbsolute(within)) throw new Error("Path is outside the workspace");
  return path.join(existing, ...parts.slice(i));
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

  // Save. Written to a sibling temp file and renamed, so a crash never leaves half a file.
  ipcMain.handle("workspace:write-file", async (_e, root, rel, text) => {
    if (typeof text !== "string") throw new Error("Only text can be saved");
    if (Buffer.byteLength(text) > MAX_TEXT_BYTES * 4) throw new Error("That file is too large to save from the editor");
    const file = await resolveNewInside(root, rel);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    let mode;
    try {
      mode = (await fs.promises.stat(file)).mode & 0o777;
    } catch {
      /* new file */
    }
    const tmp = `${file}.arcade-${process.pid}.tmp`;
    await fs.promises.writeFile(tmp, text, mode ? { mode } : undefined);
    try {
      await fs.promises.rename(tmp, file);
    } catch (e) {
      await fs.promises.rm(tmp, { force: true });
      throw e;
    }
    return { size: Buffer.byteLength(text) };
  });

  // New file or folder. Refuses to replace something that is already there.
  ipcMain.handle("workspace:create", async (_e, root, rel, kind) => {
    const target = await resolveNewInside(root, rel);
    if (fs.existsSync(target)) throw new Error(`${path.basename(target)} already exists`);
    if (kind === "dir") await fs.promises.mkdir(target, { recursive: true });
    else {
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      await fs.promises.writeFile(target, "", { flag: "wx" });
    }
  });

  ipcMain.handle("workspace:rename", async (_e, root, from, to) => {
    const source = await resolveInside(root, from);
    const target = await resolveNewInside(root, to);
    if (source === (await fs.promises.realpath(root))) throw new Error("The workspace folder itself can't be renamed from here");
    if (fs.existsSync(target) && source.toLowerCase() !== target.toLowerCase()) throw new Error(`${path.basename(target)} already exists`);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    await fs.promises.rename(source, target);
  });

  // To the OS trash, not gone: a slip in the explorer stays recoverable.
  ipcMain.handle("workspace:trash", async (_e, root, rel) => {
    const target = await resolveInside(root, rel);
    if (target === (await fs.promises.realpath(root))) throw new Error("The workspace folder itself can't be deleted from here");
    await shell.trashItem(target);
  });

  ipcMain.handle("workspace:reveal", async (_e, root, rel) => {
    shell.showItemInFolder(await resolveInside(root, rel));
  });
}

/** For other bridges: is this exactly a folder the user opened through the native picker? */
const isAllowedRoot = (root) => typeof root === "string" && allowedRoots().has(root);

module.exports = { registerWorkspaceIpc, isAllowedRoot };
