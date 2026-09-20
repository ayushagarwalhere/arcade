# @arcade/ade

The Arcade workbench (`/arcade`), its product docs (`/arcade/docs`), and the Electron desktop shell (`electron/`).
A Next.js **static export** — there is no server here; anything that needs one goes through [`apps/api`](../api/README.md).

```bash
npm run dev:ade            # from the repo root → http://localhost:3001/arcade/
npm run desktop:electron   # the desktop shell against the dev server
npm run desktop:build:win  # portable .exe + installer → apps/ade/release/
```

## What runs where

| Capability | Website | Desktop app |
|---|---|---|
| Open a local folder | Chrome / Edge (File System Access API) | Native dialog |
| Open a GitHub repository (read over the API, nothing cloned) | Yes — personal access token | Yes — token, or device sign-in |
| Scan, findings, fix diffs, approval gates | Yes, in the browser | Yes |
| Sign in and save scans to your Arcade account | Yes | Yes |
| **Run tests in a real sandbox** | No — a site cannot drive Docker on your machine | **Yes**, with Docker running |
| Connect Claude Code / Codex over MCP | No | Yes |

The attack, test and verification lines shown during a run are still scripted; the sandbox run above is the real one,
and it prints what actually happened. Command palette → **Run tests in a real sandbox**.

## Configuration

`apps/ade/.env.local` — all public, non-secret values, baked in at build time:

```bash
NEXT_PUBLIC_ARCADE_API_URL=https://….lambda-url.<region>.on.aws/
NEXT_PUBLIC_COGNITO_CLIENT_ID=…
NEXT_PUBLIC_COGNITO_HOSTED_UI_DOMAIN=https://….auth.<region>.amazoncognito.com
NEXT_PUBLIC_GITHUB_CLIENT_ID=…        # optional: GitHub device sign-in in the desktop app
```

Without the first three the sign-in control is hidden and the workbench behaves exactly as an offline tool.
Never put an AWS key in a `NEXT_PUBLIC_` variable: those are shipped to every visitor.

## Sign-in and saving scans

[`src/lib/cloud-auth.ts`](src/lib/cloud-auth.ts) — Cognito hosted UI, authorization code + **PKCE** (the site is a
public client; there is no secret). The `state` value is checked on return, the one-time code is stripped from the
address bar, and tokens live in `sessionStorage` only. The redirect URL is `<origin>/arcade/`, which must be in the
user pool client's callback list — the CDK stack adds the deployed site's URL automatically.

After a real assessment, [`@arcade/core/cloud-sync`](../../packages/core/src/cloud-sync.ts) records it through the API:
a personal organisation on first use, one project per workspace name, a run, its findings (scored by the
false-positive classifier on the way in), and an audit entry. The top bar shows **Saved · N**. Signed out, nothing
leaves the browser.

## The desktop bridge

`electron/preload.js` exposes one object, `window.arcade`, with `contextIsolation` on and `nodeIntegration` off.
Every channel is `invoke`/`handle`:

| Bridge | File | Boundary it enforces |
|---|---|---|
| Workspace (open, list, read) | `workspace-ipc.js` | Only folders picked through the native dialog; both ends `realpath`-checked |
| GitHub session | `github-ipc.js` | Fixed GitHub URLs; token encrypted with the OS keychain, refused if encryption is unavailable |
| Coding agents | `agents-ipc.js` | Agent ids from a fixed list; edits only the `arcade` MCP entry |
| Sandbox | `sandbox-ipc.js` | Only an already-opened folder; the page can never supply the command that runs |

The packaged app serves the export over `app://`; [`electron/main.js`](electron/main.js) refuses any path that resolves
outside the exported site.
