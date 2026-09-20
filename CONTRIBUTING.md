# Contributing

## Setup

Node 20+, npm workspaces — everything runs from the repo root.

```bash
npm install
npm run dev:ade          # the workbench   → http://localhost:3001/arcade/
npm run dev:marketing    # the site        → http://localhost:3000
npm run dev:api          # the API         → http://localhost:3002  (dev sign-in, in-memory store, model off)
```

`apps/mobile` is deliberately outside the workspace (EAS uploads that folder alone): `cd apps/mobile && npm install`.
On Windows inside OneDrive, run npm from PowerShell and see the OneDrive note in the root README.

## Where code goes

```
apps/*  →  orchestrator  →  agents  →  core          apps/*  →  ui  →  core
```

Packages never import from an app. Put new code in the unit its importers dictate; a `core` file that needs to call an
agent belongs in `orchestrator`. Shared code is imported as `@arcade/<pkg>/<file>` and ships as TypeScript source.
The two web apps are separate Next.js zones: link between them with `<a href={SITE.ade}>`, never `<Link>`.

`apps/mobile/src/core` is a generated copy of `packages/core/src` — change the package, then `npm run sync:core` there.

## Before you open a pull request

```bash
npm run typecheck        # every workspace
npm run test:api         # must pass; add tests for what you change
npm run lint
```

- **Storage:** extend the `Store` interface in both `dynamo.ts` and `memory.ts`, and add a case to
  `apps/api/test/store.test.ts` so the two stay identical (`DYNAMO_ENDPOINT=… npm run test:api` runs it on DynamoDB Local).
- **The model's input text** is built only by `packages/core/src/finding-text.ts`. Training and scoring must not diverge.
- **Infrastructure:** run `npm run diff:prod` and read it. Never deploy the main stack without a fresh `dist/web`.
- **Honesty in the UI:** do not print that something ran, passed or merged unless it did.
- **Secrets:** never commit `.env*` files (only `.env.example`), and never put a secret in a `NEXT_PUBLIC_` variable.

Security issues: see [SECURITY.md](SECURITY.md) — please report privately.
