# Arcade for mobile

Assess a GitHub repository from your phone, read the findings, and approve a fix before it
becomes a pull request. Built with Expo (React Native) and TypeScript, for iOS and Android
from one codebase.

It runs the **same engine as the desktop app**: the scanner, the rule set, the mapper and the
fix logic in `src/core`, `src/agents` and `src/orchestrator` are copied from `packages/*`, so a
finding on the phone is the finding you would get on the desktop.

## What is real

- **GitHub sign-in** — a personal access token, or the device flow. The token lives in the
  device keychain (`expo-secure-store`) and is only ever sent to `api.github.com`.
- **Browsing** — repositories, folders and files, read through the GitHub API. Nothing is cloned.
- **Assessment** — *Assess this repository* pins the default branch's current commit, reads the
  files through the API (at most 6 requests at a time) and runs the static rule set over them
  **on the phone**. You choose the scope (source files, or everything), see real progress, and
  can cancel. Findings carry the real path, line and code.
- **Fixes → pull requests** — for a rule with a concrete rewrite, approving *Prepare a fix*
  re-reads the file, applies the rewrite in memory and re-runs the rule over the result; you see
  the real diff. Approving *Commit & open PR* creates a new `arcade/fix-…` branch, commits the one
  file, and opens a pull request. The default branch is never written to.
- **Issues** — for a finding with no automatic rewrite, *Open an issue on GitHub* files one with
  the rule, location and mitigations (never the flagged line, when the rule matches a secret).
- **Persistence** — the last assessment of each repository is kept on the device
  (`@react-native-async-storage/async-storage`), most recent six.
- **Deep link** — `arcade://repo/<owner>/<name>` opens that repository; add `/assess` to land on
  the assessment screen.

Every write to GitHub sits behind an approval sheet that names the repository and the branch.

### What it is not

Be clear about this when describing the app:

- It is **static analysis**: pattern rules over source text. Nothing is executed, there is no
  sandbox on the phone, no exploit is reproduced and no tests are run. A finding is a lead for a
  reviewer, not proof of an exploit.
- The **only check a fix gets** is the same rule re-run over the patched file. The pull request
  says so.
- Only rules whose edit is a genuine rewrite can be fixed here (today: weak hash algorithms and
  disabled TLS verification). Every other rule can only insert a `// FIXME` note, which is not a
  fix, so the app refuses to commit it and offers an issue instead.
- **Coding agents run on the desktop.** The phone does not run or connect to them.
- The **Sample run** is a scripted demo with made-up data. It is reachable only from its labelled
  entry point and carries a banner on every screen while it is open.
- There is no Arcade cloud sign-in — see [Arcade cloud](#arcade-cloud).

## Screens

| Screen | What it does |
| --- | --- |
| **Overview** | With nothing loaded: choose a repository, reopen a stored assessment, or open the sample. With an assessment: what ran, the strongest finding, and counts from the analysis. |
| **Findings** | Every finding by severity, with what has actually happened to it (open, fix prepared, pull request open, issue opened). |
| **Finding** | Overview · Code (opens the file at the flagged line) · Match · Attack path · Fix · Timeline. |
| **Surface** | The mapper's model of the repository's layers. A layer is red when a finding's rule belongs to it; tap one to list those findings. |
| **Activity** | What was read, what matched, and everything you approved or declined. |
| **Settings** | GitHub connection, what this analysis was, assessments stored on the device (with *forget*), the sample run. |
| **Approval sheet** | What is about to happen, what it touches, the diff or the issue text — then approve or decline. |

## Run it

```bash
cd apps/mobile
npm install
npm start          # scan the QR code with Expo Go, or press a / i for an emulator
```

- `npm run android` / `npm run ios` — open directly in an emulator or simulator.
- `npm run web` — a browser preview for quick UI checks. The phone is the target; web has no
  keychain (it falls back to local storage) and cannot use the GitHub device flow.
- `npm run typecheck` — `tsc --noEmit` for the app and for `tests/`.
- `npm test` — unit tests for the non-UI logic (see [Tests](#tests)).
- `npm run sync:check` — fails when the vendored engine is out of date.

A development build shows *Assess the built-in fixture*: a small in-memory repository with known
weaknesses, for trying the assessment and fix screens without a token. Commits and issues are
refused for it. It is guarded by `__DEV__` and is not included in production bundles.

Do not set `CI=1` for the dev server: Metro then serves stale bundles.

### Environment

| Variable | Purpose |
| --- | --- |
| `EXPO_PUBLIC_GITHUB_CLIENT_ID` | Optional. The client ID of a GitHub OAuth app with device flow enabled (the same one the desktop build uses). Put it in `apps/mobile/.env.local`. Without it the device sign-in button is hidden and the token form is the only way in. |

A token needs the `repo` scope to read private repositories and to push a fix branch. With
read-only access the app still assesses; it explains that it cannot push and offers an issue.

### Windows + OneDrive

Keep `node_modules` out of the synced folder and run `npm` / `npx` from **PowerShell**, not Git
Bash. Create the junction before installing:

```powershell
New-Item -ItemType Directory -Force $env:LOCALAPPDATA\arcade-mobile\node_modules
New-Item -ItemType Junction -Path apps\mobile\node_modules -Target $env:LOCALAPPDATA\arcade-mobile\node_modules
```

The target folder must itself be named `node_modules`: Metro resolves packages from their real
path. `metro.config.js` detects the junction and watches the real path.

## Building an installable app

Builds go through [EAS Build](https://docs.expo.dev/build/introduction/). This folder is
deliberately **not** an npm workspace: EAS uploads it on its own, which is why the engine is
vendored rather than imported.

```bash
npm install -g eas-cli
eas login
npm run sync:check                            # the vendored engine must be current
eas build -p android --profile preview        # an installable .apk
eas build -p ios
```

Set `EXPO_PUBLIC_GITHUB_CLIENT_ID` as an EAS environment variable if you want device sign-in in
the build. Bundle identifiers are in `app.json` (`dev.arcade.mobile`).

## Sharing the engine

`packages/core`, `packages/agents` and `packages/orchestrator` are the source of truth. After
changing them:

```bash
npm run sync:core
```

That rewrites `src/core`, `src/agents` and `src/orchestrator`: only the files the entry points
import, with the `@arcade/<package>/<file>` aliases made relative, each under a GENERATED banner.
A file that uses a browser- or desktop-only API fails the sync. The copies are committed — don't
edit them here. Those packages change often, so expect to re-run this, and re-run the tests after.

## Tests

`npm test` bundles `tests/*.test.ts` with the monorepo root's `esbuild`, swaps React Native's
native modules for the stubs in `tests/stubs`, and runs them on `node --test` against an
in-process fake of the GitHub API (`tests/fake-github.ts`). They cover the `WorkspaceFs` adapter,
a full assessment (findings and line numbers), rate-limit and cancel handling, the exact write
sequence of a fix (blobs → tree → commit → ref → pulls, never the default branch), refusal of
scaffold-only rules, issue text, persistence and deep links.

Nothing here has been run against the real GitHub API or on a device; see *Status*.

## Project layout

```
app/                     routes (expo-router)
  (tabs)/                Overview · Findings · Surface · Activity · Settings
  finding/[id].tsx       one finding
  assess.tsx             assess a repository: scope, progress, cancel
  approval.tsx           the approval sheet (modal)
  github.tsx             connect GitHub (modal)
  repos.tsx · repo.tsx · file.tsx   repository browser
  +native-intent.tsx     arcade:// links
src/
  core/ agents/ orchestrator/   GENERATED from packages/* — see above
  assess/                the assessment, fixes, persistence, and the live screens
  run/                   RunProvider: one shared run store for every screen
  github/                session, device flow, repository tree and blobs
  ui/                    theme tokens, atoms, diff, timeline, terminal, surface graph
scripts/sync-core.mjs · scripts/test.mjs
tests/
```

## Arcade cloud

Not built. The deployed Cognito app client allows sign-in redirects only to the website
(`http://localhost:3001/arcade/` and the CloudFront site). A native redirect such as
`arcade://auth` is not among them, so hosted sign-in from the app cannot complete. It needs
`arcade://auth` added to `authCallbackUrls` in `infra/cdk.json` (or to `redirects` in
`infra/lib/arcade-stack.ts`) and a redeploy.

## Status

Verified here: typecheck, `expo-doctor`, a production `expo export` for Android and iOS, the unit
tests above, and the screens in a browser preview at phone size.

**Not** verified: any call to the real GitHub API (the write path is tested only against the
fake), and anything on a physical device or emulator — including the keychain, the device flow,
deep links and AsyncStorage limits on Android.
