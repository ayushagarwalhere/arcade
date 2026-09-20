import type { DocPage } from "../types";
import { cards, code, danger, figure, h2, h3, note, ol, p, table, tip, ul, warn } from "../build";

export const MODEL: DocPage[] = [
  {
    slug: "model/security-loop",
    title: "The security loop",
    description: "One pipeline, five agents, two human gates. The mental model behind everything in Arcade.",
    blocks: [
      p(
        "Every Arcade run moves through the same loop. Each stage produces an artifact, and that artifact is the *only* thing the next stage gets. Nothing is passed along as a hunch.",
      ),
      figure("loop", "Each stage hands a concrete artifact to the next. The two gates are where you decide."),
      table(
        ["Stage", "Agent", "Produces"],
        ["Map", "Mapper", "The attack surface: services, endpoints, auth boundaries, data stores, integrations."],
        ["Attack", "Attacker", "A reproduced exploit, with the request and response that prove it."],
        ["Defend", "Defender", "The root cause, the blast radius, and ranked mitigations."],
        ["Gate 1", "You", "A decision: may Arcade change code?"],
        ["Remediate", "Remediator", "A fix and a regression test, on an isolated branch."],
        ["Verify", "Verifier", "An independent replay of the original attack against the fix."],
        ["Gate 2", "You", "A decision: may the verified fix merge?"],
      ),

      h2("Why it's shaped this way"),
      h3("Evidence before opinion"),
      p(
        "The Attacker reports a finding only when it can reproduce the exploit and save the proof. That single rule removes most of what makes security tooling tiring: false positives, severity inflation, and arguing about whether something is \"really\" exploitable.",
      ),
      h3("The fixer doesn't grade its own work"),
      p(
        "The Remediator writes the fix. A different agent — the Verifier — decides whether it worked, starting from a clean sandbox with no memory of what changed. A change to the code is never mistaken for a fix.",
      ),
      h3("A human sits where the risk is"),
      p(
        "Reading code and attacking a throwaway sandbox are safe, so agents do them freely. Changing your code and merging to main are not, so they stop at an [approval gate](doc:model/approvals).",
      ),

      h2("Run phases"),
      p("A run is always in exactly one phase. You'll see it in the status bar, in `arcade status`, and from the MCP tool `arcade_get_status`."),
      table(
        ["Phase", "Meaning"],
        ["`idle`", "Nothing has started."],
        ["`mapping` → `mapped`", "The Mapper is building, then has built, the attack surface."],
        ["`attacking` → `attacked`", "The Attacker is probing, then has reproduced an exploit."],
        ["`defending` → `defended`", "The Defender is tracing the root cause, then has ranked mitigations."],
        ["`awaiting-fix-approval`", "Paused at gate 1. Waiting for you."],
        ["`remediating`", "The Remediator is writing the fix on its branch."],
        ["`testing`", "The regression suite is running."],
        ["`verifying`", "The Verifier is replaying the original attack."],
        ["`verified`", "The exploit no longer works. Gate 2 decides the merge."],
      ),
      cards(
        ["The five agents", "What each agent can and cannot do.", "doc:model/agents"],
        ["Approval gates", "What stops for you, and why.", "doc:model/approvals"],
      ),
    ],
  },

  {
    slug: "model/agents",
    title: "The five agents",
    description: "Mapper, Attacker, Defender, Remediator, Verifier — what each one does, and what it is never allowed to do.",
    blocks: [
      p(
        "Arcade's fleet is five narrow agents rather than one broad one. Each has a single job, a single output, and hard limits on what it may touch. Narrow agents are easier to trust, and easier to check.",
      ),
      table(
        ["Agent", "Job", "Works in", "Never"],
        ["**Mapper**", "Understands the application", "Read-only view of the repo", "Executes project code"],
        ["**Attacker**", "Reproduces exploits", "The sandbox", "Touches your machine, production, or the network"],
        ["**Defender**", "Traces root cause", "Read-only, plus the evidence", "Writes code"],
        ["**Remediator**", "Writes the fix", "Its own branch and worktree", "Touches your working tree, or merges"],
        ["**Verifier**", "Re-runs the attack", "A fresh sandbox built from the fix branch", "Sees the Remediator's reasoning"],
      ),

      h2("Mapper"),
      p(
        "Indexes the repository and identifies frameworks, services, endpoints, auth boundaries, data stores, third-party integrations and privileged operations. Its output is the shared security map every other agent works from, shown in the [Attack Surface](doc:workbench/attack-surface) view.",
      ),

      h2("Attacker"),
      p(
        "Probes the mapped surface from inside the [sandbox](doc:model/sandbox). When something looks exploitable it tries to actually exploit it. If it succeeds, it saves the request, the response, and numbered reproduction steps as [evidence](doc:model/evidence) — and only then opens a finding.",
      ),
      note("No reproduction, no finding. Suspicions that can't be reproduced are logged in the timeline, not raised as findings."),

      h2("Defender"),
      p(
        "Follows the exploit path back to the line of code responsible, works out the blast radius, and proposes mitigations ranked by how much they fix against how much they change. One is marked recommended; you see all of them.",
      ),

      h2("Remediator"),
      p(
        "After you approve, writes the code change **and** a regression test that replays the exploit. It works on its own branch in its own worktree, so your working tree is never modified. The result appears in **Changes** as a normal diff — see [Reviewing fixes](doc:workbench/reviewing-fixes).",
      ),

      h2("Verifier"),
      p(
        "Rebuilds the sandbox from the fix branch and replays the original attack, then a set of mutated payloads designed to slip past a narrow fix. It has no memory of the fix and no access to the Remediator's reasoning. A finding reaches **Verified** only if every replay fails.",
      ),

      h2("Agent status"),
      table(
        ["Status", "Meaning"],
        ["`idle`", "Not needed yet."],
        ["`queued`", "Will run once the previous stage hands over its artifact."],
        ["`running`", "Working. The agent pane shows its current task and progress."],
        ["`awaiting-approval`", "Finished its part and is waiting on a gate."],
        ["`blocked`", "Can't continue — for example, an approval was rejected."],
        ["`done`", "Handed its artifact to the next stage."],
      ),
      tip("The agents are roles, not models. Which coding agent powers them is up to you — see [Bring your own agent](doc:agents/providers)."),
    ],
  },

  {
    slug: "model/findings",
    title: "Findings",
    description: "A finding is a security-engineering artifact, not a chatbot reply. Here's what's inside one.",
    blocks: [
      p(
        "A finding is Arcade's unit of work. It gets a stable id (`ARC-001`), a severity, a CWE, and a status that tracks it through the loop. Open one from the **Findings** activity, the **Problems** panel, or the command palette.",
      ),

      h2("Anatomy of a finding"),
      table(
        ["Section", "What it answers"],
        ["Overview", "What is wrong, where, and how bad is it?"],
        ["Attack path", "How does an attacker get from the outside to the damage?"],
        ["Evidence", "What exact request and response prove it?"],
        ["Code", "Which lines are responsible?"],
        ["Remediation", "What are the options, what changed, and what tests cover it?"],
        ["Verification", "Does the original attack still work?"],
        ["Timeline", "Who did what, and when — agents and humans alike."],
      ),

      h2("Lifecycle"),
      p("A finding moves forward through these statuses. It can only reach **Verified** through the Verifier — there is no manual \"mark as fixed\"."),
      table(
        ["Status", "Meaning"],
        ["`reproduced`", "The Attacker proved the exploit and captured evidence."],
        ["`analyzing`", "The Defender is tracing the root cause."],
        ["`awaiting-approval`", "A fix is proposed and waiting at gate 1."],
        ["`remediating`", "The Remediator is writing the fix and its regression test."],
        ["`verifying`", "The Verifier is replaying the attack against the fix."],
        ["`verified`", "The original exploit and all mutations fail. Safe to merge."],
        ["`verification-failed`", "The attack still works. The fix is not accepted."],
      ),
      warn("`verification-failed` is a feature. It means a fix that *looked* right was caught before it shipped. The finding returns to the Defender with the failing replay attached."),

      h2("Severity"),
      p("Severity reflects demonstrated impact — what the reproduced exploit actually reached — not a theoretical score. See the [severity reference](doc:reference/statuses) for how each level is assigned."),

      h2("From the terminal"),
      code(
        "bash",
        `$ arcade findings
Findings — acme/commerce-api

  ARC-001  CRITICAL  Broken authorization on admin export  [verified]
  ARC-002  HIGH      SQL injection in order lookup  [remediating]
  ARC-003  HIGH      JWT accepts alg: none  [analyzing]
  ARC-004  MEDIUM    Stripe test key committed to history  [reproduced]
  ARC-005  LOW       Missing security headers  [reproduced]`,
      ),
    ],
  },

  {
    slug: "model/evidence",
    title: "Evidence & verification",
    description: "What Arcade saves as proof, and how an independent agent decides a fix is real.",
    blocks: [
      p("Two artifacts make an Arcade finding trustworthy: the **evidence** that the exploit worked, and the **verification** that it no longer does."),

      h2("Evidence"),
      p("Captured by the Attacker at the moment the exploit succeeds. It's enough for you — or anyone you forward it to — to reproduce the issue by hand."),
      table(
        ["Field", "Contents"],
        ["`method`, `target`", "The exact request line."],
        ["`requestHeaders`, `requestBody`", "What was sent, including the session used."],
        ["`statusBefore`, `responseBody`", "What came back — the proof."],
        ["`steps`", "Numbered, human-readable reproduction steps."],
        ["`artifact`", "Path of the saved evidence file, e.g. `evidence/ARC-001.json`."],
        ["`capturedAt`", "When the exploit was reproduced."],
      ),
      code(
        "bash",
        `$ arcade evidence ARC-001
ARC-001 Broken authorization on admin export  CWE-862

Request   POST https://localhost:3000/api/admin/export
Response  200 OK (unauthorized access confirmed)
Repro
  1. Sign in as a standard-tier user
  2. Capture the session cookie
  3. POST /api/admin/export with that cookie
  4. Receive 48,210 records belonging to other customers
Artifact: evidence/ARC-001.json`,
      ),

      h2("Verification"),
      p("Produced by the Verifier after a fix exists. It starts from a **fresh sandbox built from the fix branch** and knows only the original evidence."),
      ol(
        "**Replay the original attack.** Same request, same session. It must now fail.",
        "**Replay mutated payloads.** Variations in method, casing, encoding, headers and parameters — the ways a narrow fix gets bypassed.",
        "**Run the regression suite.** The fix must not break the application.",
      ),
      code(
        "json",
        `{
  "id": "ARC-001",
  "outcome": "verified",
  "independent": true,
  "statusBefore": "200 OK",
  "statusAfter": "403 Forbidden",
  "mutatedPayloads": 64,
  "mutatedSucceeded": 0,
  "regression": "156/156"
}`,
        "arcade verify ARC-001 --json",
      ),
      note("A finding is **Verified** only when the original attack fails, `mutatedSucceeded` is `0`, and the regression suite is green. Anything else is `verification-failed`."),

      h2("Exporting"),
      p("Evidence and verification are available as JSON from the CLI (`--json`) and the MCP server, so they drop straight into tickets, pull requests and audit trails."),
    ],
  },

  {
    slug: "model/approvals",
    title: "Approval gates",
    description: "Arcade never changes code, merges, or resets an environment on its own. Here's exactly what stops for you.",
    blocks: [
      p(
        "Agents are fast and usually right. \"Usually\" isn't good enough for actions you can't take back. Arcade draws a hard line: anything that changes code, history or an environment **pauses the run** and waits for a person.",
      ),
      h2("The three kinds of approval"),
      table(
        ["Kind", "When it appears", "Approve button", "Looks like"],
        ["**Code**", "Before the Remediator applies a fix", "Approve", "Violet — *Approval required — run paused*"],
        ["**Ship**", "Before a verified fix merges to main", "Approve & merge", "Violet, with the verification summary"],
        ["**Destructive**", "Before resetting the sandbox or anything irreversible", "Allow once", "Red — *Destructive action — waiting for you*"],
      ),

      h2("What an approval shows you"),
      ul(
        "**What** the agent wants to do, in one line.",
        "**Why** — the reason, tied to a finding.",
        "**The exact target** — the branch, command or environment, in monospace so there's no ambiguity.",
        "**Review diff** — for code and ship approvals, one click opens the full change before you decide.",
      ),
      p("Approvals appear inline in the agent pane, at the point in the conversation where the run paused. If the pane is closed, a pending approval reopens it — a waiting run is never hidden."),

      h2("Rejecting"),
      p("Rejecting is always safe. A rejected code approval leaves your repository untouched; a rejected ship approval leaves the verified fix on its branch. The decision is recorded in the finding's timeline either way."),
      danger("Destructive approvals are deliberately louder and are granted **once**. Approving a sandbox reset today does not pre-approve the next one."),

      h2("From an agent"),
      p("A coding agent connected over MCP can *request* an approval with `arcade_request_approval`, but it can never grant one. Approvals are only ever granted by a person in the workbench."),
      cards(["MCP server", "How a coding agent drives Arcade — and where it has to stop.", "doc:cli/mcp"]),
    ],
  },

  {
    slug: "model/sandbox",
    title: "Sandboxes",
    description: "Where attacks run: isolated, disposable, and offline by default.",
    blocks: [
      p("The Attacker and the Verifier are the only agents that execute anything, and they only ever do it inside a sandbox. The active sandbox is always visible in the status bar."),
      h2("Guarantees"),
      table(
        ["Property", "What it means"],
        ["**Isolated**", "A separate environment from your machine and your working tree."],
        ["**Disposable**", "Thrown away and rebuilt freely. The Verifier always starts from a fresh one."],
        ["**No network**", "`network: none`. An exploit can't reach a real third party, and nothing can phone home."],
        ["**No real secrets**", "The sandbox is provisioned with throwaway credentials, never your `.env`."],
      ),
      code(
        "json",
        `{
  "sandboxId": "sandbox-7f2c",
  "isolated": true,
  "disposable": true,
  "network": "none",
  "host": "localhost:3000"
}`,
        "environment — from arcade status --json",
      ),

      h2("How a sandbox is created"),
      p("A sandbox is one hardened Docker container holding a *copy* of your project. `arcade sandbox create` builds it in six steps, and prints each one as it happens:"),
      ol(
        "**Snapshot.** Arcade lists the project's files — the working tree, or a git ref with `--ref`, which is how the Verifier gets a sandbox built from the fix branch. Secret files (`.env`, private keys, registry config carrying a token) are withheld, and symlinks are skipped so nothing outside the project can ride along.",
        "**Detect.** The stack decides the base image and the install and test commands: Node, Python and Go are recognised. A `.arcade/sandbox.json` with `image`, `install` and `test` overrides the guess.",
        "**Create.** The container starts with no host mounts, every Linux capability dropped, `no-new-privileges`, and memory, CPU and process limits. Every variable named in your env template is set, but secret-looking keys get random throwaway values.",
        "**Copy.** The snapshot is streamed into `/workspace`. Your working tree is never mounted, so nothing that runs inside can change it.",
        "**Install.** Dependencies are installed. This is the only moment the container has a network.",
        "**Isolate.** The network is disconnected, and Arcade asks the Docker daemon to confirm no network is left. A sandbox that fails this check is destroyed, not handed out.",
      ),
      code(
        "bash",
        `$ arcade sandbox test . --ref fix/admin-export-authz
  ● snapshot  212 files from fix/admin-export-authz @ 3f9a1c2 · 1 secret file(s) withheld
  ● detect    node → node:22-bookworm-slim
  ● create    arcade-sandbox-53b1 · caps dropped · no host mounts · 2g / 2 cpu / 512 pids
  ● copy      212 files → /workspace
  ● install   npm ci  (network attached for this step only)
  ● isolate   network: none (verified with docker inspect)
  ● test      npm test

✓ passed · sandbox-53b1 · 41.2s · destroyed`,
      ),
      note("Sandboxes need Docker. There is no state file: `arcade sandbox ls` and `destroy` read labels back from the Docker daemon, so what you see is what exists."),
      warn("Dependency install scripts run during the install step, while the network is still attached. They run without your secrets and without access to your machine, but they are not offline. Use `--offline` for projects that need no install."),

      h2("The built-in browser"),
      p("The **Browser** view shows the sandboxed application as the Attacker sees it. It's pointed at the sandbox host, never at a live deployment."),
      h2("Resetting"),
      p("Resetting the sandbox discards its state, so it's treated as a destructive action and goes through a red [approval gate](doc:model/approvals)."),
      tip("Because every verification starts from a clean sandbox, a passing result can't be explained by leftover state from the attack run."),
    ],
  },
];
