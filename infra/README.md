# @arcade/infra

Arcade's AWS infrastructure, as AWS CDK (TypeScript). Two **independent CDK apps**, so that replacing a machine-learning
model can never touch the product's data or website:

| CDK app | Stack | What it creates |
|---|---|---|
| [`bin/arcade.ts`](bin/arcade.ts) → [`lib/arcade-stack.ts`](lib/arcade-stack.ts) | `Arcade-<stage>` | DynamoDB table · Cognito user pool, public PKCE client and hosted UI · the API Lambda behind a Function URL · S3 + CloudFront for the static website |
| [`bin/ml.ts`](bin/ml.ts) → [`lib/ml-stack.ts`](lib/ml-stack.ts) | `ArcadeMl-<stage>` | SageMaker model, serverless endpoint config and endpoint `arcade-fp-classifier-<stage>`, plus the role it runs as |

## Credentials

[`cdk.mjs`](cdk.mjs) loads `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and `AWS_REGION` from a git-ignored `.env` at the
repo root (or `infra/.env`) and then runs the CDK CLI. Nothing deployed uses those keys: the Lambda and the SageMaker
model run as IAM roles created by the stacks.

Treat the deploy key as the most sensitive thing in the project: keep it out of any synced folder, give it only the
permissions CDK needs, and rotate it after use.

## The main stack

```bash
npm run bootstrap:prod     # once per AWS account + region
npm run build:web          # marketing + ADE → dist/web
npm run diff:prod          # read-only: exactly what a deploy would change
npm run deploy:prod        # stage=prod, with the classifier endpoint wired in
```

> **Only deploy this stack from a machine with a fresh `dist/web`.** The website is uploaded from that folder with
> `prune: true`, so a deploy with a missing or stale folder overwrites the live site.

What the stack decides for you:

- **CORS and sign-in redirects** include the stack's own CloudFront URL automatically; `-c corsOrigins=…` and
  `-c authCallbackUrls=…` add to them (defaults in [`cdk.json`](cdk.json) are the localhost dev URLs).
- **`-c fpEndpointName=<endpoint>`** (set by `deploy:prod`) gives the API `FP_ENDPOINT_NAME` and
  `sagemaker:InvokeEndpoint` on that one endpoint. Without it the API stores findings unscored and nothing else changes.
- **`-c bedrockModelId=…`** picks the Claude model (default `anthropic.claude-opus-5`). The AWS account must have been
  granted access to it under *Amazon Bedrock → Model access*, or the model endpoints answer `502`.
- **In `prod`** the table, user pool and site bucket are retained on stack deletion, and the table has deletion
  protection and point-in-time recovery. Logical IDs are stable, so deploys update in place.
- **Security headers** (HSTS, `nosniff`, frame options, referrer policy) are attached to the website; a missing page is
  a real `404`.
- The API is a **Function URL**, not API Gateway: model requests outlast API Gateway's 30-second limit. The URL is
  public and the app authenticates every `/v1` request itself.

Pass extra context from this folder — `node ./cdk.mjs deploy -c stage=prod -c key=value` — because flags do not survive
`npm run … --` through two layers of npm. Outputs of the last prod deploy are recorded in
[`deployment-prod.json`](deployment-prod.json) (public identifiers only).

## The ML stack

Build the archive, then deploy; see [`ml/README.md`](../ml/README.md) for the full flow.

```powershell
npx cdk --app "npx tsx bin/ml.ts" deploy ArcadeMl-prod -c stage=prod -c modelArtifact=<path to model.tar.gz> -c modelVersion=r2
npx cdk --app "npx tsx bin/ml.ts" destroy ArcadeMl-prod      # remove it
```

A new `modelVersion` creates a new SageMaker model and rolls the endpoint to it. Serverless inference scales to zero.
The endpoint is reachable only with AWS credentials (SigV4); it is never exposed to browsers.

## Known gaps

- `bedrock-mantle:CreateInference` is granted on `*`; narrow it to the chosen model's ARN.
- The API has no reserved concurrency, WAF or per-IP rate limit in front of it, so there is no hard ceiling on
  invocation cost. (Reserved concurrency is left unset deliberately: on a new account, whose total limit can be as low
  as 10, setting it makes the deploy fail.)
- No Content-Security-Policy yet — a useful one needs changes to how the Next.js export inlines scripts.
