const { contextBridge } = require("electron");

// A tiny, safe bridge so the web app can tell it is running inside the desktop
// shell (e.g. to hide the browser "Download" prompts). No Node access is exposed.
contextBridge.exposeInMainWorld("arcade", {
  desktop: true,
  platform: process.platform,
});
