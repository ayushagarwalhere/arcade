# Arcade for mobile

The Arcade ADE in your pocket: watch the security loop run, read the evidence, and answer
approval gates from your phone. Built with Expo (React Native) and TypeScript, for iOS and
Android from one codebase.

It runs the **same engine as the web ADE**. The data model, demo data, run engine, store and
syntax highlighter in `src/core/` are copied verbatim from `packages/core/src/`, so a run on
the phone is the run you see on the desktop — same beats, same gates, same evidence.

## What's in it

| Screen | What it does |
| --- | --- |
| **Overview** | Start, resume or reset a run. Live status of the five agents, the primary finding, and measured posture. |
| **Findings** | Every finding by severity. Each opens to Overview · Attack path · Evidence · Code · Fix · Verification · Timeline. |
| **Surface** | The attack-surface graph, laid out top-to-bottom for a portrait screen. Tap a node to inspect it; the proven exploit path lights up once it is mapped. |
| **Activity** | The run timeline and the agents' terminal output, pinned to the newest line. |
| **Settings** | GitHub connection, coding agents, the sandbox environment, and a sandbox-reset request. |
| **Approval sheet** | When a run pauses at a gate, a banner appears on every screen (with a haptic). The sheet shows what the agent wants to do, what it touches, and the diff — then **Approve** or **Reject**. |
| **Repositories** | With GitHub connected: browse your repositories, folders and files, read straight from the GitHub API with syntax highlighting. Nothing is cloned. |

## Run it

```bash
cd mobile
npm install
npm start          # scan the QR code with Expo Go, or press a / i for an emulator
```

- `npm run android` / `npm run ios` — open directly in an emulator or simulator.
- `npm run web` — a browser preview, handy for quick UI checks. The phone is the target;
  web skips the keychain and GitHub device sign-in.
- `npm run typecheck` — `tsc --noEmit`.

### Windows + OneDrive

As with `frontend/`, keep `node_modules` out of the synced folder and run `npm` from
**PowerShell**, not Git Bash. Create the junction before installing:

```powershell
New-Item -ItemType Directory -Force $env:LOCALAPPDATA\arcade-mobile\node_modules
New-Item -ItemType Junction -Path mobile\node_modules -Target $env:LOCALAPPDATA\arcade-mobile\node_modules
```

The target folder must itself be named `node_modules`: Metro resolves packages from their
real path, and a dependency's own imports are found by walking up to a `node_modules`
folder. `metro.config.js` detects the junction and watches the real path.

## Sharing code with the web app

`packages/core/src/` stays the source of truth. After changing the model, demo data,
engine, store or highlighter there:

```bash
npm run sync:core
```

That rewrites `src/core/`. The copies are committed so the app builds on its own (EAS
uploads only this folder) — don't edit them here.

## Connecting GitHub

Two ways in, the same as the rest of Arcade:

- **Personal access token** — works everywhere. The connect screen links to a pre-filled
  token page (`repo` scope). The token is only ever sent to `api.github.com` and is stored
  in the device keychain (`expo-secure-store`).
- **Sign in with GitHub (device flow)** — a native app has no CORS restrictions, so it can
  run the device flow itself. Use the same OAuth app as the desktop build and put its
  client ID in `mobile/.env.local`:

  ```bash
  EXPO_PUBLIC_GITHUB_CLIENT_ID=Ov23li...
  ```

  Without it the button is hidden and the token form is the only option.

## Project layout

```
app/                 routes (expo-router)
  (tabs)/            Overview · Findings · Surface · Activity · Settings
  finding/[id].tsx   one finding
  approval.tsx       the approval sheet (modal)
  github.tsx         connect GitHub (modal)
  repos.tsx · repo.tsx · file.tsx   repository browser
src/
  core/              GENERATED from packages/core/src — see above
  run/               RunProvider: one shared run for every screen, plus gate haptics
  github/            session, device flow, repository tree and blobs
  ui/                theme tokens, atoms, diff, timeline, terminal, surface graph
scripts/sync-core.mjs
```

## Building installable apps

Store and device builds go through [EAS Build](https://docs.expo.dev/build/introduction/):

```bash
npm install -g eas-cli
eas build --platform android --profile preview   # an installable .apk
eas build --platform ios
```

Bundle identifiers are set in `app.json` (`dev.arcade.mobile`).

## Status

Like the ADE, the app replays the deterministic demo run; the state shape is the real one,
so live agents can replace the demo beats without changing any screen. Next up: a live
connection to a running Arcade instance, and push notifications for approval gates so a
paused run can reach you when the app is closed.
