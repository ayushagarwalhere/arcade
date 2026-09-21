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

## Live

| | Link |
|---|---|
| **Website** | <https://d20wyf3rpbds1d.cloudfront.net> |
| **The ADE (workbench)** | <https://d20wyf3rpbds1d.cloudfront.net/arcade/> |
| **Product documentation** | <https://d20wyf3rpbds1d.cloudfront.net/arcade/docs/> |
| Guides · changelog · enterprise | [/docs/](https://d20wyf3rpbds1d.cloudfront.net/docs/) · [/changelog/](https://d20wyf3rpbds1d.cloudfront.net/changelog/) · [/enterprise/](https://d20wyf3rpbds1d.cloudfront.net/enterprise/) |
| **API status** | <https://oerxgrc4fehpj3wdef3zght47y0jyjir.lambda-url.us-east-1.on.aws/health> |
| **Source** | <https://github.com/ayushagarwalhere/arcade> |

These are safe to share: a static site, a health check, and an API that authenticates every other request. Everything
else stays private — the deploy keys in `.env`, and the SageMaker endpoint, which answers only to the API's IAM role.
Desktop installers are not published yet.

## Documentation

| Read this | For |
|---|---|
| [README.md](README.md) (this file) | What Arcade is, the architecture, running it, deploying it, status |
| [apps/ade/README.md](apps/ade/README.md) | The workbench and desktop app: what runs where, sign-in, saving scans, the desktop bridges |
| [apps/api/README.md](apps/api/README.md) | The backend: every route, the DynamoDB key design, the rules the code enforces, running it locally |
| [ml/README.md](ml/README.md) | The false-positive classifier: data, continual training, results, SageMaker hosting |
| [infra/README.md](infra/README.md) | The two CDK stacks, deploy and teardown commands, known gaps |
| [packages/cli/README.md](packages/cli/README.md) | The CLI, the Docker sandbox, the MCP server — and which commands are real |
| [apps/mobile/README.md](apps/mobile/README.md) | The Expo companion app |
| [SECURITY.md](SECURITY.md) | Reporting a vulnerability, what the design guarantees, known limitations |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Setup, where code goes, what to run before a pull request |
| [Product docs](https://d20wyf3rpbds1d.cloudfront.net/arcade/docs/) (source: `apps/ade/src/lib/docs/content/`) | User-facing guides. Some pages describe the intended product ahead of the code — the Status section below is the source of truth |

## The security loop

```
scan → map → findings → root cause → [you approve] → branch → fix → your tests
→ re-check → commit → [you approve] → push → pull request
```

The first half only reads your source. The second half changes things, so it is carried out for real
(`apps/ade/src/lib/live-loop.ts`) and every line it prints is the outcome of something that just ran.

| Stage | What actually happens |
| --- | --- |
| **Mapper** | Indexes the project and derives its stack, routes and attack-surface map from the real files. |
| **Attacker** | Static analysis: 14 rules matched against the source. Nothing is executed and no request is sent; the evidence says so. |
| **Defender** | Traces the root cause and ranks the mitigations for each finding. |
| **Remediator** | After you approve: creates `arcade/fix-…` with your git, then applies the fix. Two rules (`weak-hash`, `tls-verification-disabled`) have a deterministic rewrite; for every other finding the coding agent installed on your machine (Claude Code, Codex, Gemini CLI, …) writes it. Then the project's own test command runs. |
| **Verifier** | Re-runs the finding's rule over the patched file. Only if it no longer fires **and** the tests pass is the change committed (just the files the fix touched). A `// FIXME` comment never counts as a fix. |
| **Ship** | After a second approval: `git push` and a pull request through the GitHub API. Arcade never commits to the branch you were on and never merges. |

Where it runs decides how far it goes: a local folder in the desktop app gets all of it; a repository opened
from GitHub gets the deterministic rewrites as a branch + pull request through the API (nothing is cloned, so no
agent and no tests); a folder opened in a browser gets the rewrite saved and re-checked. The **Dry run** on the
welcome screen is a scripted walkthrough on a bundled sample, and is labelled as one everywhere it appears.

## Repository layout

```
apps/
  marketing/   Next.js — the landing site (/, /docs, /changelog, /enterprise)
  ade/         Next.js — the ADE (/arcade), product docs (/arcade/docs) and the Electron desktop shell
  mobile/      Expo — the mobile companion (standalone: not part of the npm workspace)
  api/         Hono on AWS Lambda — accounts, runs, findings, approvals, the audit trail, and the Bedrock model endpoints
packages/
  core/        @arcade/core — data model, run engine, scanner, workspace + GitHub file systems
  agents/      @arcade/agents — mapper, attacker, defender, remediator, verifier, provider
  orchestrator/ @arcade/orchestrator — the pipeline and live engine that run the agents
  ui/         @arcade/ui — components, hooks and theme shared by both web apps
  cli/         @arcade/cli — the Arcade CLI + a dependency-free MCP server
ml/            the false-positive classifier — data generator, continual fine-tuning pipeline, SageMaker inference handler
infra/         AWS CDK — two independent apps: the main stack (API, DynamoDB, Cognito, website) and the ML stack (SageMaker)
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

## Architecture on AWS

```
                         ┌──────────────── stack: Arcade-<stage> ─────────────────┐
 Browser ── CloudFront ──┤ S3 (static site: marketing + ADE)                      │
    │                    │                                                        │
    │  sign in           │ Cognito user pool  (hosted UI, PKCE public client)     │
    │                    │                                                        │
    └─ bearer token ────►│ API — Lambda behind a Function URL (Hono)              │
                         │   ├─ DynamoDB      one table: orgs, projects, runs,    │
                         │   │                findings, approvals, audit trail    │
                         │   ├─ Bedrock       Claude: explain / propose / discover│
                         │   └─ SageMaker ───────────────┐                        │
                         └───────────────────────────────┼────────────────────────┘
                         ┌──── stack: ArcadeMl-<stage> ──▼────────────────────────┐
                         │ Serverless Inference endpoint: false-positive classifier│
                         └────────────────────────────────────────────────────────┘
```

Three rules shape it:

- **No cloud credential ever reaches a client.** The browser, desktop app, CLI and mobile app hold only a Cognito
  token or an `arc_…` API token. The API's IAM role is the only thing that can reach DynamoDB, Bedrock or SageMaker.
- **Source is scrubbed before any model sees it.** The API redacts secrets from code (keeping line numbers intact) before
  a Bedrock call, and treats scanned code as untrusted input: answers must come back as a schema-validated tool call.
- **The two stacks are independent.** The classifier is its own CDK app, so deploying or replacing a model can never
  touch the API, the table, the user pool or the website.

## Backend

[`apps/api`](apps/api/README.md) keeps the record of a run — organisations, projects, runs, findings, approvals and an
append-only audit trail — and is the only part of Arcade that talks to a model. Highlights:

- **Tenant isolation is structural:** every DynamoDB partition key starts with the org id; non-members get `404`.
- **Agents request, people decide:** an API token can open an approval and poll it, but only a signed-in person can
  decide it, once, in the same transaction as its audit entry. Shipping and destructive approvals need an admin.
- **Spend is bounded:** each org has a monthly model-token budget; refusals and failed answers are charged too.
- **Findings are scored** by the classifier as they are saved (see below); a cold or failing endpoint means "saved
  without a score", never an error.

```bash
npm run dev:api        # http://localhost:3002 — dev sign-in, in-memory store, model off
npm run test:api       # the API test suite; needs no AWS account or network
```

It runs with no AWS account at all. Routes, the key design and DynamoDB Local instructions are in the
[API README](apps/api/README.md).

## The false-positive classifier

A regex scanner raises false alarms. [`ml/`](ml/README.md) fine-tunes an open-source code model
(`microsoft/codebert-base`) to estimate whether a finding is real, and keeps training as labelled data arrives:

```
generate.ts ─► data/incoming/shard-*.jsonl ─► pipeline.py ─► train.py (one round: new shard + replay)
                                                   └─► score a frozen holdout ─► promote, or keep the old model
promoted model ─► package_model.py ─► SageMaker Serverless Inference ─► the API scores findings on save
```

- **Data:** Arcade's real scanner run over real repositories (labelled by provenance) plus randomised synthetic
  variants (exact labels). The holdout is whole repositories and whole synthetic families the model never trains on.
- **Promotion gate:** a round replaces the current model only if the holdout score did not drop.
- **In the product:** each stored finding gets `score.pTruePositive`. It **ranks and annotates — it never hides a
  finding.** The text the model reads is built by one function, `packages/core/src/finding-text.ts`, shared by
  training and scoring.
- **Honest numbers (first run):** ~0.99 AUC on unseen synthetic families, ~0.78 on 78 real, weakly-labelled findings.
  That is a working pipeline, not yet a classifier to trust; it improves as users' triage decisions become labels.

```powershell
py -3.14 ml\pipeline.py --data ml\data --runs $env:LOCALAPPDATA\arcade-ml\runs --idle-exit 150   # trainer
npx tsx ml/generate.ts --repos $env:LOCALAPPDATA\arcade-ml\repos --shards 4 --interval 45        # data, concurrently
py -3.14 ml\predict.py --runs $env:LOCALAPPDATA\arcade-ml\runs --demo                            # score locally
```

## Deploying to AWS

Everything is AWS CDK in [`infra/`](infra). Credentials are read from a git-ignored `.env` at the repo root
(`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`) by `infra/cdk.mjs`; the deployed Lambda itself uses its
IAM role and needs no keys.

| Stack | CDK app | Contains | Deploy with |
|---|---|---|---|
| `Arcade-<stage>` | `infra/bin/arcade.ts` | API Lambda + Function URL, DynamoDB table, Cognito, S3 + CloudFront website | `npm run deploy:prod` |
| `ArcadeMl-<stage>` | `infra/bin/ml.ts` | SageMaker model, serverless endpoint config, endpoint `arcade-fp-classifier-<stage>` | see [`ml/README.md`](ml/README.md) |

### Deploying the main stack (from the machine that builds the website)

`Arcade-<stage>` uploads the site from `dist/web` with `prune: true`, so **only deploy it from a machine that has a
fresh `dist/web`** — deploying with a missing or stale folder would overwrite the live site.

```bash
git pull
npm install                 # picks up new dependencies
npm run build:web           # marketing + ADE → dist/web   (needs the NEXT_PUBLIC_* values below at build time)
npm run diff:prod           # read-only preview of exactly what will change
npm run deploy:prod         # stage=prod, classifier endpoint wired in
```

`deploy:prod` passes `fpEndpointName=arcade-fp-classifier-prod`, which sets `FP_ENDPOINT_NAME` on the API and grants
it `sagemaker:InvokeEndpoint` on that one endpoint. The stack adds its own CloudFront URL to the API's CORS origins and
to Cognito's sign-in/sign-out redirect URLs automatically; add more with `-c corsOrigins=…` / `-c authCallbackUrls=…`
(run those from `infra/` as `node ./cdk.mjs deploy -c stage=prod -c …` — flags do not survive `npm run … --` through
two npm layers).

Stateful resources (table, user pool, site bucket) are retained and deletion-protected in `prod`, and their logical
IDs are stable, so a deploy updates settings in place and replaces nothing.

**Verify after deploying:**

```bash
curl https://<ApiUrl>/health                                  # {"ok":true,"stage":"prod",…}
curl -si -H "Origin: https://<WebUrl>" https://<ApiUrl>/health | grep -i access-control-allow-origin
py -3.14 ml/invoke_endpoint.py --endpoint arcade-fp-classifier-prod --region us-east-1 --env .env
```

Stack outputs (API URL, website URL, user pool and client ids) are recorded in `infra/deployment-prod.json`.

**Before the first model call:** open *Amazon Bedrock → Model access* in the AWS console for your region. Claude Opus 5
access is granted per account; `anthropic.claude-opus-4-8` is open to all Bedrock customers
(`-c bedrockModelId=anthropic.claude-opus-4-8`).

### Deploying or updating the classifier

Independent of the main stack, and safe to run from any machine with the promoted model:

```powershell
py -3.14 ml\package_model.py --runs $env:LOCALAPPDATA\arcade-ml\runs --base $env:LOCALAPPDATA\arcade-ml\codebert-base --out $env:LOCALAPPDATA\arcade-ml\deploy\model.tar.gz
cd infra
npx cdk --app "npx tsx bin/ml.ts" deploy ArcadeMl-prod -c stage=prod -c modelArtifact=$env:LOCALAPPDATA\arcade-ml\deploy\model.tar.gz -c modelVersion=r2
```

Bump `modelVersion` for a new model; CloudFormation creates it and rolls the endpoint over. Serverless inference
scales to zero — idle costs nothing; the first request after idling pays a cold start (measured: 6.7 s cold, 1.3 s warm
for a batch of four).

### Environment variables

| Where | Variable | Purpose |
|---|---|---|
| root `.env` (git-ignored) | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | Deploy credentials for CDK. Never prefix these with `NEXT_PUBLIC_`. |
| `apps/ade/.env.local`, `apps/marketing/.env.local` | `NEXT_PUBLIC_ARCADE_API_URL`, `NEXT_PUBLIC_COGNITO_USER_POOL_ID`, `NEXT_PUBLIC_COGNITO_CLIENT_ID`, `NEXT_PUBLIC_COGNITO_HOSTED_UI_DOMAIN`, `NEXT_PUBLIC_AWS_REGION` | Public, non-secret ids baked into the site at build time. |
| `apps/ade/.env.local` | `NEXT_PUBLIC_GITHUB_CLIENT_ID` | Optional: enables GitHub device sign-in in the desktop app. |
| API Lambda (set by CDK) | `TABLE_NAME`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_IDS`, `BEDROCK_MODEL_ID`, `MODEL_MONTHLY_TOKEN_BUDGET`, `CORS_ORIGINS`, `FP_ENDPOINT_NAME`, `ARCADE_STAGE` | Runtime configuration; see [`apps/api/.env.example`](apps/api/.env.example) for local equivalents. |

### Cost and teardown

DynamoDB is on-demand, Lambda and Cognito have free tiers, and the SageMaker endpoint is serverless, so an idle
deployment costs close to nothing; Bedrock tokens are the real spend and are capped per org. Remove the classifier with
`npx cdk --app "npx tsx bin/ml.ts" destroy ArcadeMl-prod`. A `prod` main stack retains its table, user pool and bucket
on destroy by design.

## Testing

```bash
npm run typecheck      # every workspace
npm run test:api       # API: auth, tenant isolation, roles, approvals, redaction, the Bedrock client, scoring
DYNAMO_ENDPOINT=http://localhost:8000 npm run test:api    # also runs the store contract against DynamoDB Local
```

## Connecting GitHub

The **GitHub** entry in the site navbar and the ADE top bar connects a GitHub account. Once
connected, **Open folder** on the ADE welcome screen (and the top-bar menu) lists your
repositories, and an opened repository is read straight from the GitHub API — nothing is cloned.

The ADE is a static export and GitHub sign-in does not go through Arcade's API, so there is
no OAuth redirect flow. Two ways in:

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

Arcade ships as a desktop application (Electron). The desktop app is the full IDE, because it is the
only place the things an IDE needs exist: your files, your git, your shell and your coding agents.

| In the desktop app | How |
| --- | --- |
| **Editor** | Monaco (the editor from VS Code): editing, multi-cursor, find/replace, minimap, bracket colours, per-file undo. `Ctrl+S` saves; unsaved tabs show a dot. Explorer: new file/folder, rename (`F2`), move to trash, reveal. |
| **Agent** (`Ctrl+L`) | A real conversation with the agent CLI installed on your machine, run inside the open folder. Streams its text, tool calls and file edits; follow-ups continue the same session; Stop cancels it. Read-only or can-edit, and an optional model override, are in Settings. It runs as you, on your plan: the pane shows the session cost the agent reports. |
| **Source Control** (`Ctrl+Shift+G`) | Your own `git`: status, stage / unstage / discard, commit (`Ctrl+Enter`), branches, push, open a pull request, recent commits, and a side-by-side diff against `HEAD`. |
| **Terminal** (``Ctrl+` ``) | Your shell (PowerShell, cmd, Git Bash, zsh…) in the project folder, with history, `cd` and `Ctrl+C`. No pty, so full-screen programs (vim, htop) don't work; builds, tests, git and package managers do. |
| **Themes** (`Ctrl+,`) | 13 color themes (Arcade Dark/Light, Dark/Light Modern, Monokai, Dracula, One Dark, Nord, GitHub Dark/Light, Solarized Dark/Light, High Contrast), applied to the workbench and the editor from one definition. Also in the command palette (`Ctrl+K`). |

The renderer never gets general access to the machine: every file, git, agent and terminal call names a folder
you opened through the native picker, and the main process refuses anything else. Prompt text reaches an agent
only over stdin, never argv. A GitHub token never crosses IPC; the main process reads it from the OS keychain to push.

```bash
npm install                 # at the repo root
npm run desktop:build:win   # Windows: Arcade-Setup.exe + Arcade-portable.exe → apps/ade/release/
npm run desktop:build       # current OS (mac: .dmg, linux: AppImage + .deb)
npm run desktop:pack        # unpacked app for a quick local check
```

**Releasing.** Push a version tag and [`.github/workflows/release.yml`](.github/workflows/release.yml) builds
Windows, macOS (arm64 + x64) and Linux installers and attaches them to a GitHub Release:

```bash
git tag v0.2.0 && git push origin v0.2.0
```

After running `npm install` on one machine, run `npm run lock:complete` before committing the lockfile. npm
records only the current OS's native packages (the SWC compiler, Tailwind's engine), and a lockfile like that
builds on your machine and nowhere else; the release workflow checks for it first and says so.

The site's Download buttons point at `releases/latest/download/<asset>`, and the asset names carry no version,
so publishing a release is all it takes for them to serve the new build. The builds are unsigned: Windows
SmartScreen and macOS Gatekeeper warn on first launch until code-signing certificates are added.

- The static export (`out/`) is served inside the app over a privileged `app://` protocol, so it runs offline;
  the editor is copied out of `node_modules` by `apps/ade/scripts/copy-monaco.mjs` rather than fetched from a CDN.
- Dev loop: run `npm run dev`, then `npm run desktop:electron` in a second terminal to open the shell against
  the live dev server.

### Windows + OneDrive note

This project lives inside a OneDrive-synced folder. OneDrive will dehydrate a
`node_modules` installed there and break the build. Two things make it reliable:

1. Keep `node_modules` **out of the synced folder** — point it at a local path with a
   directory junction so OneDrive leaves it alone:
   ```powershell
   New-Item -ItemType Junction -Path node_modules -Target $env:LOCALAPPDATA\arcade-nm
   ```
2. Run `npm` from **PowerShell**, not Git Bash, so package install scripts can resolve
   `node` on the Windows PATH.

The same applies to `apps/mobile/`, which has its own install — see its README for the junction command.

## Mobile app

Arcade for iOS and Android lives in [`apps/mobile/`](apps/mobile/README.md). It runs the same engine as the
workbench (vendored by `npm run sync:core`; `npm run sync:check` fails when the copy is behind), on the phone:

- **Assess a GitHub repository**: connect GitHub, pick a repository, choose a scope, and the scanner reads it
  through the API at a pinned commit, with live progress, cancel, and an honest failure on a rate limit.
- **Fix → pull request**: for a finding whose rule has a real rewrite, review the actual diff, then approve a
  commit to a new `arcade/fix-…` branch and a pull request. Nothing is ever written to the default branch.
- **No automatic rewrite?** It says so, points you to the desktop app (where your agent can write the fix), and
  offers to open a GitHub issue with the details instead.
- The last assessment per repository is kept on the device (no file contents, and matched credentials are
  redacted); the token stays in the keychain. `arcade://repo/<owner>/<name>` opens a repository.
- "Sample run" is the scripted walkthrough, labelled as sample data on every screen.

```bash
cd apps/mobile
npm install
npm start                               # scan the QR code with Expo Go, or press a / i for an emulator
npm test                                # 20 tests: scanner, adapter, and the write sequence against a fake GitHub
npx eas build -p android --profile preview   # an installable APK (needs an Expo account)
```

Not built: signing in to an Arcade account from the phone. The deployed Cognito client allows no `arcade://`
callback; adding `arcade://auth` to `authCallbackUrls` in `infra/cdk.json` and redeploying is the prerequisite.
Nothing has run on a device or emulator yet; the write path is tested against a fake GitHub, not the real API.

## CLI

[`packages/cli`](packages/cli/README.md) is the `arcade-security` npm package: a dependency-free CLI and MCP server
built on the same scanner the workbench uses (bundled into `engine.mjs` by `npm run build:engine -w packages/cli`).
Every command takes `--json`, and exit codes are made for CI.

```bash
npm i -g arcade-security        # once it is published; until then: npm pack -w packages/cli, or `npm run cli --`

arcade init                     # writes .arcade/config.json (scope, failOn, ignore)
arcade scan . --fail-on high --sarif arcade.sarif   # real scan; exit 1 at/above the threshold; SARIF for code scanning
arcade findings                 # from the last scan of this project
arcade evidence ARC-001
arcade fix ARC-002              # dry run: prints the patch
arcade fix ARC-002 --apply --commit --push --pr     # apply, re-check, commit on a branch, push, open a PR (GITHUB_TOKEN)
arcade fix ARC-001 --agent claude --apply           # no automatic rewrite? have your agent write it, then re-check
arcade verify ARC-002           # re-run the finding's rule over the file as it is now
arcade agent "explain src/auth.ts" [--edit] [--model sonnet]
arcade rules | doctor | agents | connect | sandbox …
```

Publishing is one command from `packages/cli` once you are logged in to npm (`npm publish`); `prepack` refuses
to ship a stale engine bundle. `arcade demo` prints the old sample data, labelled as sample data.

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
same thing is a button: **Agents → Agents that can call Arcade**. Any other MCP client can launch the
server with `arcade-mcp` (or `node packages/cli/mcp-server.mjs`).

Tools, all backed by a real scan of the project the agent is working in: `arcade_scan`,
`arcade_get_findings`, `arcade_get_evidence`, `arcade_get_attack_surface`, `arcade_get_status`,
`arcade_propose_fix`, `arcade_verify_fix`, `arcade_sandbox_test`, `arcade_sandbox_list`, and
`arcade_request_approval` / `arcade_get_approval`, which use the Arcade API when `ARCADE_API_URL` and
`ARCADE_TOKEN` are set and otherwise answer `unavailable` rather than pretending a person was asked.

## Sandboxing & human control

Scanning is static and executes nothing. Changing code stops for you twice: once before a fix is
applied (always on a new `arcade/fix-…` branch), and again before anything is pushed. Arcade never
commits to the branch you were on, never merges, and never commits a fix whose re-check or tests failed.
The second stop can be turned off in Settings ("Push and open the pull request without asking"); the
first cannot.

When you want the project's tests run away from your machine's files and network, sandboxes are real
Docker containers, built by [`packages/cli/sandbox.mjs`](packages/cli/sandbox.mjs) (command palette →
"Run tests in a Docker sandbox", or the CLI):

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

Arcade started as a hackathon build and is being turned into a product.

**Live on AWS (us-east-1, stage `prod`):** the website and ADE on CloudFront, the API on Lambda, DynamoDB, Cognito,
and the false-positive classifier on a SageMaker serverless endpoint. URLs and ids are in
[`infra/deployment-prod.json`](infra/deployment-prod.json).

**Real today:** opening a folder or GitHub repository; the static scanner; the desktop IDE (Monaco editor with
save, file operations, real git Source Control, a shell terminal, 13 themes); the agent pane and the security
loop's remediation driving the coding agent installed on your machine; real branches, tests, re-checks, commits,
pushes and pull requests; the CLI and MCP server (`arcade-security`), including SARIF and CI exit codes; the
Docker sandbox; the agent connectors; the backend (accounts, orgs, runs, findings, approvals, audit trail,
Bedrock endpoints, finding scoring); the ML pipeline, which has trained and promoted a model.

**Verified how:** the loop was driven end to end inside Electron against a scratch repository (a real agent
wrote a parameterized-query fix, `npm test` ran, the rule was re-run, and the commit exists in `git log`);
the packaged `Arcade.exe` was inspected over the DevTools protocol (bridges, the folder boundary on git / write /
agent / terminal, Monaco and its TypeScript worker under `app://`); the CLI has 54 tests and was installed from
its tarball outside the repo. **Not exercised:** a push and a pull request against a real GitHub remote (the code
paths are wired and their refusals tested, but no token was available); the Codex, Gemini, Cursor and OpenCode
runners against the real CLIs (only Claude Code was installed; Codex's event format is tested with a stub);
macOS and Linux builds (the workflow exists, it has not run yet).

**Limits worth knowing:** the scanner is 14 line-level rules with no data-flow analysis, so expect false
positives and false negatives, and "verified" means the rule no longer fires plus your tests pass, not proof of
safety. The loop fixes the top finding per run. An agent turn costs what your agent plan charges; on a large
default model a single turn can cost over a dollar, which is why the model override exists.

**Written, waiting on the next deploy:** sign-in (Cognito, PKCE) and saving each real scan to the backend — run,
findings, classifier scores, audit entry. It reaches the live site once `Arcade-prod` is redeployed, because the
currently deployed stack allows only `localhost` in CORS and in Cognito's redirect URLs. Tested against the API's real
routes; not yet exercised in a browser against the live user pool.

**Blocked outside the code:** the AWS account has not been granted access to any Claude model on Bedrock (every model
answers "not available for this account"), so the explain / propose / discover endpoints fail until access is
requested under *Amazon Bedrock → Model access*. The ADE also does not pass the Bedrock provider into an assessment yet.

**Real sandbox: desktop and CLI only.** The Docker sandbox is verified working (secrets withheld, host filesystem
invisible, network cut and checked). The desktop app can run a project's tests in it; the bridge is written and
compiles but has not yet been exercised inside a packaged app. The website cannot have one — there is no Docker on a
visitor's machine to drive — so a hosted sandbox would be a new cloud service.

**Still scripted in the ADE:** the attack, the test lines shown during a run, commits and merges, and independent
verification. The data model is real, so these can be swapped for live implementations without changing the flow.

**Not done:** training on SageMaker (`ml/sagemaker_round.py` is written, never run; needs GPU quota), automatic
retraining from triage labels, email invitations, mobile pairing and push, billing. Desktop installers are intended
to ship through GitHub Releases; none is published yet.
