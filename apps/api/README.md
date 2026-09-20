# @arcade/api

Arcade's backend. It keeps the record of a security run — projects, runs, findings, approvals and an append-only audit trail — and it is the only part of Arcade that talks to a model. Clients (the desktop app, the CLI, the MCP server, the mobile app) never hold a cloud credential.

- **HTTP:** [Hono](https://hono.dev), one app that runs on AWS Lambda (`src/lambda.ts`) and on a local Node server (`src/dev.ts`).
- **Data:** Amazon DynamoDB, one table. The key design is documented in [`src/db/keys.ts`](src/db/keys.ts).
- **Auth:** Amazon Cognito JWTs for people; hashed, org-scoped `arc_…` API tokens for the CLI, MCP and CI.
- **Model:** Claude in Amazon Bedrock, called with the function's IAM role.

## Run it

From the repo root:

```bash
npm run dev:api     # http://localhost:3002 — dev auth, in-memory store, model off
npm run test:api    # no AWS account or network needed
```

Dev auth accepts `Authorization: Bearer dev:<any-name>`; each name is a separate user.

```bash
curl -s -X POST localhost:3002/v1/orgs -H "authorization: Bearer dev:ada" -H "content-type: application/json" -d '{"name":"Acme"}'
```

To work against a real DynamoDB engine, run DynamoDB Local and point the API at it:

```bash
docker run -d -p 8000:8000 amazon/dynamodb-local
DYNAMO_ENDPOINT=http://localhost:8000 npm run db:create-local -w apps/api
DYNAMO_ENDPOINT=http://localhost:8000 ARCADE_STORE=dynamo npm run dev:api
DYNAMO_ENDPOINT=http://localhost:8000 npm run test:api   # also runs the store contract against DynamoDB
```

Every setting is listed in [`.env.example`](.env.example).

## API

All routes are under `/v1` and need a bearer credential. Errors are `{ "error": { "code", "message" } }`.

| | |
|---|---|
| `GET /me` | The caller and their organisations |
| `POST /orgs` · `GET /orgs/:org` | Create / read an organisation |
| `GET·PUT·DELETE /orgs/:org/members[/:user]` | Members and roles (`viewer` < `member` < `admin` < `owner`) |
| `POST·GET·DELETE /orgs/:org/tokens[/:id]` | API tokens — the secret is returned once, at creation |
| `POST·GET /orgs/:org/projects[/:project]` | Projects |
| `POST·GET /…/projects/:project/runs` | Start a run · list runs, newest first |
| `GET·PATCH /…/runs/:run` | The run with its findings, approvals and events · update status, phase, counts, surface |
| `PUT /…/runs/:run/findings` | Report findings (up to 100 per call); re-reporting keeps the triage decision |
| `PATCH /…/runs/:run/findings/:id` | Triage: `open`, `accepted-risk`, `false-positive`, `fixed`; assignee |
| `GET /orgs/:org/findings?triage=open` | The org-wide queue, most severe first |
| `POST·GET /…/runs/:run/approvals[/:id]` | Request an approval · poll it |
| `POST /…/approvals/:id/decision` | Approve or reject — once, by a signed-in person |
| `POST·GET /…/runs/:run/events` | Append to / read the audit trail |
| `POST /orgs/:org/model/{explain,propose,discover}` | The model endpoints behind `bedrockProvider` in `@arcade/agents` |
| `GET /orgs/:org/usage?month=2026-09` | Model tokens used against the monthly budget |

## Rules the code enforces

- **Tenant isolation is structural.** Every partition key begins with the org id, and every store method takes it. Non-members get `404`, not `403`, so org ids cannot be probed.
- **Agents request, people decide.** An API token can open an approval and poll it, but only a Cognito-authenticated person can decide it, and `ship` / `destructive` approvals need an admin. A decision is written once, in the same transaction as its audit event.
- **The audit trail is append-only.** The store interface has no update or delete for events, DynamoDB writes are conditional on the id not existing, and clients cannot write `human` entries — only the API does, from a verified identity.
- **Secrets never reach the model.** Source is passed through [`src/model/redact.ts`](src/model/redact.ts) first; line numbers are preserved so the model's answer still maps onto the file.
- **Scanned code is untrusted input.** Prompts fence it as data, and the answer must arrive as a schema-validated tool call, so text planted in a repository has nowhere free-form to write.
- **Spend is bounded.** Each org has a monthly token budget; refusals and failed answers are charged too, because the tokens were spent.

## Deploying

Infrastructure lives in [`infra/`](../../infra) (AWS CDK): the table, a Cognito user pool, this function behind a Function URL, and its IAM permissions.

```bash
cd infra
npx cdk bootstrap                 # once per AWS account and region
npx cdk deploy -c stage=dev
```

Before the first model call, open **Amazon Bedrock → Model access** in the AWS console and confirm the account can use the configured model. Claude Opus 5 access is granted per account; `anthropic.claude-opus-4-8` is open to all Bedrock customers and can be set with `-c bedrockModelId=anthropic.claude-opus-4-8`.

## Not built yet

Invitations by email (members are added by user id today), device pairing and push notifications for the mobile app, S3 storage for evidence larger than a DynamoDB item (400 KB), billing, and per-user rate limiting in front of the function.
