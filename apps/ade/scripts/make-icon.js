// Renders the app icon (build-resources/icon.png, 1024×1024) from the Arcade logo mark.
// electron-builder derives the .ico / .icns / Linux sizes from this one PNG.
//
//   npx electron scripts/make-icon.js        (from apps/ade; unset ELECTRON_RUN_AS_NODE first)
//
// The PNG is committed; re-run this only when the mark changes.
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

const SIZE = 1024;
// The mark from packages/ui/src/components/logo.tsx, in emerald on the workbench's near-black, with
// the rounded-square margins desktop icons are expected to have.
const html = `<!doctype html><html style="overflow:hidden;background:transparent"><body style="margin:0;overflow:hidden;background:transparent">
<svg xmlns="http://www.w3.org/2000/svg" style="display:block" width="${SIZE}" height="${SIZE}" viewBox="0 0 1024 1024">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b1d21"/><stop offset="1" stop-color="#0b0c0e"/></linearGradient></defs>
  <rect x="64" y="64" width="896" height="896" rx="200" fill="url(#g)"/>
  <rect x="65.5" y="65.5" width="893" height="893" rx="198.5" fill="none" stroke="#ffffff" stroke-opacity=".08" stroke-width="3"/>
  <g transform="translate(232 232) scale(17.5)" fill="none" stroke="#34d399" stroke-width="2.6" stroke-linecap="round">
    <path d="M4 27A23 23 0 0 1 27 4"/>
    <path d="M10 27A17 17 0 0 1 27 10" opacity=".75"/>
    <path d="M16.5 27A10.5 10.5 0 0 1 27 16.5" opacity=".5"/>
    <circle cx="26.5" cy="26.5" r="2.2" fill="#34d399" stroke="none"/>
  </g>
</svg></body></html>`;

app.commandLine.appendSwitch("force-device-scale-factor", "1");
setTimeout(() => app.exit(1), 30000);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: SIZE, height: SIZE, useContentSize: true, show: false, transparent: true, backgroundColor: "#00000000", frame: false, webPreferences: { offscreen: true } });
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((r) => setTimeout(r, 600));
  const image = await win.webContents.capturePage({ x: 0, y: 0, width: SIZE, height: SIZE });
  const out = path.join(__dirname, "..", "build-resources", "icon.png");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, image.resize({ width: SIZE, height: SIZE }).toPNG());
  // The corners must be see-through and the right edge must be the icon, not a scrollbar.
  const px = image.toBitmap();
  const alphaAt = (x, y) => px[(y * image.getSize().width + x) * 4 + 3];
  console.log(`wrote ${out} (${image.getSize().width}×${image.getSize().height}) · corner alpha ${alphaAt(4, 4)} · right-edge alpha ${alphaAt(SIZE - 4, SIZE / 2)} · centre alpha ${alphaAt(SIZE / 2, SIZE / 2)}`);
  app.exit(0);
});
