# Arcade

**Build at AI speed. Ship at security confidence.**

Arcade is a security-focused **Agent Development Environment (ADE)** for AI-generated
software. You build with Claude Code, Codex or any coding agent; Arcade's multi-agent
system **maps** your application, **attacks** it in an isolated sandbox, **defends** by
tracing the root cause, **remediates** with a tested fix, and **independently verifies**
that the original exploit no longer works — with a human approving every high-impact
action.

Arcade doesn't just say "this might be vulnerable." It shows the attack surface, the
exploit, the request/response that proves it, the fix diff, and whether the original
attack still succeeds. Evidence, not guesses.

## The security loop

```
Developer → Arcade → Mapper → Attacker → Evidence → Defender
→ Human approval → Remediator → Tests → Independent Verifier → Verified
```

The five agents:

| Agent | Role |
| --- | --- |
| **Mapper** | Indexes the repo and builds the attack-surface map. |
| **Attacker** | Reproduces exploits inside an isolated sandbox, with evidence. |
| **Defender** | Traces the root cause and ranks mitigations. |
| **Remediator** | Writes the fix + a regression test on its own worktree. |
| **Verifier** | Independently re-runs the original attack against the fix. |

## Repository layout

```
apps/
  marketing/   Next.js — the landing site (/, /docs, /changelog, /enterprise)
  ade/         Next.js — the ADE (/arcade), product docs (/arcade/docs) and the Electron desktop shell
  mobile/      Expo — the mobile companion (standalone: not part of the npm workspace)
packages/
  core/        @arcade/core — data model, run engine, scanner, workspace + GitHub file systems
  agents/      @arcade/agents — mapper, attacker, defender, remediator, verifier, provider
  orchestrator/ @arcade/orchestrator — the pipeline and live engine that run the agents
  ui/         @arcade/ui — components, hooks and theme shared by both web apps
  cli/         @arcade/cli — the Arcade CLI + a dependency-free MCP server
scripts/       repo tooling (build-web.mjs lays both web apps out as one static site)
```

Dependencies point one way: `apps/*` → `orchestrator` → `agents` → `core`, and `apps/*` → `ui` → `core`. Packages never import from an app.

## Run it

The interactive ADE runs entirely in the browser.

```bash
npm install            # once, at the repo root (npm workspaces)
npm run dev:ade        # the ADE            → http://localhost:3001/arcade/
npm run dev:marketing  # the marketing site → http://localhost:3000
```

- Marketing site: `http://localhost:3000`
- **The ADE:** `http://localhost:3001/arcade/` — press **Run security demo** to watch the
  whole loop, and approve the fix and the merge when prompted.

## Connecting GitHub

The **GitHub** entry in the site navbar and the ADE top bar connects a GitHub account. Once
connected, **Open folder** on the ADE welcome screen (and the top-bar menu) lists your
repositories, and an opened repository is read straight from the GitHub API — nothing is cloned.

The app is a static export with no backend, so there is no OAuth redirect flow. Two ways in:

- **Personal access token** — works everywhere. The connect form links to a pre-filled token
  page (`repo` scope). The token is only ever sent to `api.github.com`; the desktop app
  encrypts it with the OS keychain, a browser keeps it in `localStorage`.
- **Sign in with GitHub (device flow)** — desktop app only, because `github.com`'s OAuth
  endpoints don't allow browser CORS. Register an OAuth app with *device flow* enabled and put
  its client ID in `apps/ade/.env.local` before building:

  ```bash
  NEXT_PUBLIC_GITHUB_CLIENT_ID=Ov23li...
  ```

  Without it the button is hidden and the token form is the only option.

## Desktop app (downloadable)

Arcade also ships as a desktop application (Electron) that bundles the whole ADE. The
Download button on the site serves the Windows build; macOS and Linux build on their own
platforms.

```bash
cd frontend
npm install
npm run desktop:build:win   # Windows: portable .exe + NSIS installer → apps/ade/release/
npm run desktop:build       # current OS (mac: .dmg, linux: AppImage + .deb)
npm run desktop:pack        # unpacked app for a quick local check
```

- The static export (`out/`) is produced by `next build` and served inside the app over a
  privileged `app://` protocol, so the ADE runs fully offline.
- Artifacts land in `apps/ade/release/` (e.g. `Arcade-0.1.0-portable.exe`, `Arcade-Setup-0.1.0.exe`).
  Run the portable exe directly, or publish the artifacts to GitHub Releases — the site's
  Download buttons link to Releases (a 96 MB binary is not bundled into the static site).
- Dev loop: run `npm run dev`, then `npm run desktop:electron` in a second terminal to open
  the shell against the live dev server.

### Windows + OneDrive note

This project lives inside a OneDrive-synced folder. OneDrive will dehydrate a
`node_modules` installed there and break the build. Two things make it reliable:

1. Keep `node_modules` **out of the synced folder** — point it at a local path with a
   directory junction so OneDrive leaves it alone:
   ```powershell
   New-Item -ItemType Junction -Path frontend\node_modules -Target $env:LOCALAPPDATA\arcade-nm
   ```
2. Run `npm` from **PowerShell**, not Git Bash, so package install scripts can resolve
   `node` on the Windows PATH.

The same applies to `mobile/` — see its README for the junction command.

## Mobile app

Arcade for iOS and Android lives in [`mobile/`](mobile/README.md): watch a run, read the
evidence and the fix diff, and answer approval gates from your phone. It shares the data
model and run engine with the ADE (`npm run sync:core` copies them from `packages/core/src`).

```bash
cd mobile
npm install
npm start          # scan the QR code with Expo Go, or press a / i for an emulator
```

## CLI

The CLI lets you — or another agent — drive the environment. It prefers structured JSON.

```bash
node packages/cli/arcade.mjs scan .
node packages/cli/arcade.mjs findings
node packages/cli/arcade.mjs evidence ARC-001
node packages/cli/arcade.mjs verify ARC-001
node packages/cli/arcade.mjs status --json
```

## MCP server

Arcade exposes its workflow over the Model Context Protocol so a coding agent can scan
its own changes and read the results back.

```bash
# connect Claude Code and Codex (whichever are installed)
node packages/cli/arcade.mjs connect

node packages/cli/arcade.mjs agents             # what is connected
node packages/cli/arcade.mjs disconnect codex   # undo
```

`connect` adds one `arcade` entry to the agent's own user-level config (`~/.claude.json`,
`~/.codex/config.toml`) and leaves everything else in the file alone. In the desktop app the
same thing is a button: **Agent Providers → connect**. Any other MCP client can launch the
server directly with `node packages/cli/mcp-server.mjs`.

Tools: `arcade_scan`, `arcade_get_attack_surface`, `arcade_get_findings`,
`arcade_get_evidence`, `arcade_run_attack`, `arcade_request_approval`,
`arcade_verify_fix`, `arcade_get_status`.

## Sandboxing & human control

The attacker runs in a **disposable sandbox** with no network access, no real secrets and
a throwaway filesystem. Arcade never merges a fix, changes configuration or resets an
environment on its own — those stop for explicit human approval, with the full evidence
one click away.

Sandboxes are real Docker containers, built by [`packages/cli/sandbox.mjs`](packages/cli/sandbox.mjs):

```bash
node packages/cli/arcade.mjs sandbox test .              # fresh sandbox → run tests → destroy
node packages/cli/arcade.mjs sandbox test . --ref HEAD   # same, from a commit (the Verifier's path)
node packages/cli/arcade.mjs sandbox create . && node packages/cli/arcade.mjs sandbox ls
```

Creation is six steps: **snapshot** the project (secret files withheld) → **detect** the
stack → **create** a container with no host mounts, no capabilities and throwaway
credentials → **copy** the snapshot in → **install** dependencies (the only step with a
network) → **isolate**: disconnect the network and verify it with the Docker daemon.

## Status

This is a hackathon build. The ADE, agents, evidence trail, approval gates and the demo
run are functional; the data model is real so demo agents can later be swapped for live
ones without changing the flow. Desktop installers ship through GitHub Releases.
