# Security

Arcade is a security tool that reads people's source code and holds tokens for their repositories. This document says
how to report a problem, what the design guarantees, and — just as plainly — what it does not yet.

## Reporting a vulnerability

Please report privately, not in a public issue: use **GitHub → Security → Report a vulnerability** on this repository
(private vulnerability reporting). Include what you found, how to reproduce it, and what it lets an attacker do. We aim
to acknowledge within three working days. Please do not test against other people's data or run denial-of-service
tests against the hosted deployment.

## What the design guarantees

**Credentials never reach a client.** Browsers, the desktop app, the CLI and the mobile app hold only a Cognito session
token or an `arc_…` API token. Only the API's IAM role can reach DynamoDB, Bedrock or SageMaker.

**Tenant isolation is structural.** Every DynamoDB partition key begins with the organisation id, and every store method
requires it. A non-member receives `404`, not `403`, so organisation ids cannot be probed.

**Agents request; people decide.** An API token can open an approval and poll it, but only a person signed in through
Cognito can decide it — once, in the same transaction as its audit entry. Shipping and destructive approvals need an
admin. The audit trail is append-only: the store has no update or delete for events, and clients cannot write `human`
entries.

**Tokens.** API tokens are stored only as SHA-256 hashes, are scoped to one organisation and role, cannot outrank or
outlive their creator's membership, and cannot mint further tokens.

**Models never see secrets, and scanned code is untrusted input.** Source is redacted before any Bedrock call (line
numbers preserved). Prompts fence code as data, and an answer must arrive as a schema-validated tool call, so text
planted in a repository has no free-form channel to write into. Model hits naming files or lines that were not sent
are dropped.

**Spend is bounded.** Each organisation has a monthly model-token budget (refusals and failed answers count), and an
account may own at most three organisations.

**The false-positive score is advisory.** It ranks and annotates findings. It never hides one.

**Sandboxes.** Secret files are withheld from the snapshot; containers have no host mounts, no capabilities, resource
limits and throwaway credentials; the network is removed after dependency install and the removal is verified with the
Docker daemon before any test runs.

**Desktop app.** `contextIsolation` on, `nodeIntegration` off, one narrow preload bridge; file access limited to
folders chosen in the native dialog; the `app://` handler refuses paths outside the exported site; the sandbox bridge
accepts no command from the page.

**Transport and headers.** HTTPS only; HSTS, `nosniff`, frame and referrer policies on the API and the website; the
site bucket is private behind CloudFront.

## Known limitations

- **The website stores a GitHub personal access token in `localStorage`, unencrypted.** Use a token you are willing to
  revoke. The desktop app encrypts it with the OS keychain instead.
- Session tokens are kept in `sessionStorage`; there is **no Content-Security-Policy** yet, so an XSS bug would expose them.
- The API's Function URL is public with **no WAF, per-IP rate limit or concurrency ceiling** in front of it.
- The Bedrock permission is granted on `*` rather than one model ARN.
- Sandbox containers run as root with a writable root filesystem and unpinned images; the install step has open egress.
- API tokens do not expire; revoke them when no longer needed.
- Detection is pattern-based: it misses real weaknesses and raises false alarms. A clean scan is not evidence of safety.
- During a run, the attack, test and verification lines in the ADE are scripted; only the desktop "Run tests in a real
  sandbox" command executes anything.
- The CLI's analysis commands and most MCP tools return a reference snapshot, not facts about your repository — see
  [`packages/cli/README.md`](packages/cli/README.md).

## Operating the deployment

Keep the CDK deploy key out of synced folders, scope it to what CDK needs, enable MFA on the account, and rotate the
key after use. Nothing deployed depends on it.
