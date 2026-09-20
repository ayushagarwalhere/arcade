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

Arcade also ships as a desktop application (Electron) that bundles the whole ADE. The
Download button on the site serves the Windows build; macOS and Linux build on their own
platforms.

```bash
npm install                 # at the repo root
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
   New-Item -ItemType Junction -Path node_modules -Target $env:LOCALAPPDATA\arcade-nm
   ```
2. Run `npm` from **PowerShell**, not Git Bash, so package install scripts can resolve
   `node` on the Windows PATH.

The same applies to `apps/mobile/`, which has its own install — see its README for the junction command.

## Mobile app

Arcade for iOS and Android lives in [`apps/mobile/`](apps/mobile/README.md): watch a run, read the
evidence and the fix diff, and answer approval gates from your phone. It shares the data
model and run engine with the ADE (`npm run sync:core` copies them from `packages/core/src`).

```bash
cd apps/mobile
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

Arcade started as a hackathon build and is being turned into a product.

**Live on AWS (us-east-1, stage `prod`):** the website and ADE on CloudFront, the API on Lambda, DynamoDB, Cognito,
and the false-positive classifier on a SageMaker serverless endpoint. URLs and ids are in
[`infra/deployment-prod.json`](infra/deployment-prod.json).

**Real today:** opening a folder or GitHub repository; the static scanner and the fix diffs it produces; the approval
gates; the Docker sandbox in the CLI; the agent connectors; the backend (accounts, orgs, runs, findings, approvals,
audit trail, Bedrock endpoints, finding scoring); the ML pipeline, which has trained and promoted a model.

**Not connected yet — the next piece of work:** the website and ADE do not sign in to the backend or send it their
findings, so nothing a visitor does reaches DynamoDB, Bedrock or the classifier. The `NEXT_PUBLIC_*` values are in
place for it; the sign-in flow and the calls are not written.

**Still scripted in the ADE:** the sandboxed attack, test execution, commits and merges, and independent
verification. The data model is real, so these can be swapped for live implementations without changing the flow.

**Not done:** training on SageMaker (`ml/sagemaker_round.py` is written, never run; needs GPU quota), automatic
retraining from triage labels, email invitations, mobile pairing and push, billing. Desktop installers are intended
to ship through GitHub Releases; none is published yet.
