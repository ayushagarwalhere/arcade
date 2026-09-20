// GitHub sign-in for the renderer.
//
// github.com's OAuth endpoints send no CORS headers, so the device flow runs
// here rather than in the renderer — against these two fixed URLs only. The
// session (token + profile) is encrypted at rest with the OS keychain.

const { app, ipcMain, net, safeStorage } = require("electron");
const path = require("path");
const fs = require("fs");

const sessionFile = () => path.join(app.getPath("userData"), "github-session");

async function post(url, params) {
  const res = await net.fetch(url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  return res.json();
}

function registerGithubIpc() {
  ipcMain.handle("github:device-code", (_e, clientId, scope) =>
    post("https://github.com/login/device/code", { client_id: String(clientId), scope: String(scope) }),
  );

  ipcMain.handle("github:device-token", (_e, clientId, deviceCode) =>
    post("https://github.com/login/oauth/access_token", {
      client_id: String(clientId),
      device_code: String(deviceCode),
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    }),
  );

  ipcMain.handle("github:load-session", async () => {
    try {
      return safeStorage.decryptString(await fs.promises.readFile(sessionFile()));
    } catch {
      return null;
    }
  });

  ipcMain.handle("github:save-session", async (_e, session) => {
    if (session == null) return fs.promises.rm(sessionFile(), { force: true });
    // Never write the token in the clear; without a keychain it lasts for this launch only.
    if (!safeStorage.isEncryptionAvailable()) return;
    await fs.promises.writeFile(sessionFile(), safeStorage.encryptString(String(session)), { mode: 0o600 });
  });
}

module.exports = { registerGithubIpc };
