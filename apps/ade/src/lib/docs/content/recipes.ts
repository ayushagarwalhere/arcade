import type { DocPage } from "../types";
import { cards, code, h2, note, ol, p, steps, tip, warn } from "../build";

export const RECIPES: DocPage[] = [
  {
    slug: "recipes/agent-self-check",
    title: "Let your agent check its own work",
    description: "Have your coding agent scan every risky change with Arcade before it tells you it's done.",
    blocks: [
      p("**Goal:** your coding agent finishes a feature, asks Arcade whether it introduced anything exploitable, and reports back with evidence — in one turn. **Time:** five minutes to set up."),
      h2("You'll need"),
      ol("Arcade's CLI folder on disk — see [Install](doc:install).", "A coding agent that supports MCP. This recipe uses Claude Code."),
      h2("Steps"),
      steps(
        ["Register Arcade's MCP server", "Run `claude mcp add arcade -- node ./packages/cli/mcp-server.mjs` from the Arcade repository root."],
        ["Tell the agent when to scan", "Add a standing instruction to your project's `CLAUDE.md` so you don't have to ask each time."],
        ["Build something", "Ask for a feature that touches auth, routing or queries — the places bugs like to hide."],
        ["Read the evidence together", "When a finding comes back, ask the agent to show you the request and response before it proposes anything."],
      ),
      code(
        "text",
        `## Security
After any change to auth, routing, database queries, file handling or secrets:
1. Call arcade_scan on the project.
2. Call arcade_get_findings. For anything high or critical, call
   arcade_get_evidence and show me the request and response.
3. Do not propose a fix until I've seen the evidence.
4. Never treat a finding as fixed until arcade_verify_fix returns "verified".`,
        "CLAUDE.md",
      ),
      note("The agent can request an approval, but the run still pauses for you in the workbench. Keep Arcade open while you work."),
      h2("Why this works"),
      p("The agent that wrote the code is the worst judge of whether it's secure — it already believes it is. Arcade gives it an outside check it can call like any other tool, and a definition of \"done\" it can't talk its way past."),
      cards(["Claude Code with Arcade", "What the agent can and can't do over MCP.", "doc:agents/claude-code"]),
    ],
  },

  {
    slug: "recipes/triage-critical",
    title: "Triage a critical finding",
    description: "A calm, repeatable ten minutes from \"critical\" appearing to a verified fix.",
    blocks: [
      p("**Goal:** decide quickly and confidently what to do about a critical finding. This walks through ARC-001 from the sample project, but the order of operations is the same for any finding."),
      steps(
        ["Read the evidence first", "Open **Evidence**. Look at the request and the response. Is this real? With Arcade the answer is nearly always yes — but you should see it yourself."],
        ["Follow the path", "Open **Attack Surface**. The red path shows which boundary failed. For ARC-001, the request crosses `api → admin` without any role check."],
        ["Understand the cause", "In the finding, read the root cause and the flagged lines. Here: the handler confirms a session exists, and stops there."],
        ["Compare the mitigations", "The Defender offers three, ranked. The recommended one — `requireRole(\"admin\")` — is low effort and closes the cause, not just this request."],
        ["Review and approve", "Click **Review diff** on the approval. Check the fix and the regression test, then **Approve**."],
        ["Wait for the Verifier", "Don't merge on the Remediator's word. Wait for **Verified**: original attack blocked, 0 of 64 mutations through, tests green."],
        ["Merge", "Approve the ship gate — or reject it and merge the branch through your normal review process."],
      ),
      tip("Need to hand this to someone else? `arcade evidence ARC-001 --json` and `arcade verify ARC-001 --json` give you the proof and the result in a form you can paste into a ticket."),
      warn("If verification fails, resist the urge to patch by hand and move on. A failed verification means the root cause isn't what everyone thought it was — read the failing replay first."),
    ],
  },

  {
    slug: "recipes/gate-a-merge",
    title: "Gate a merge on verification",
    description: "Use the CLI's JSON output to block a merge while any serious finding is unverified.",
    blocks: [
      p("**Goal:** a script that fails when a high or critical finding hasn't reached `verified`. Run it locally before you push, or as a step in your pipeline."),
      h2("The check"),
      code(
        "bash",
        `#!/usr/bin/env bash
set -euo pipefail

arcade scan . --json > /dev/null

open=$(arcade findings --json | node -e '
  const findings = JSON.parse(require("fs").readFileSync(0, "utf8"));
  const blocking = findings.filter(
    (f) => ["critical", "high"].includes(f.severity) && f.status !== "verified"
  );
  for (const f of blocking) console.error(f.id, f.severity, f.status, "-", f.title);
  console.log(blocking.length);
')

if [ "$open" -gt 0 ]; then
  echo "Blocked: $open unverified high/critical finding(s)." >&2
  exit 1
fi
echo "Arcade: nothing blocking."`,
        "scripts/arcade-gate.sh",
      ),
      h2("How it behaves"),
      p("Against the sample project, the gate blocks — correctly. ARC-001 is verified, but two high findings are still in flight:"),
      code(
        "text",
        `ARC-002 high remediating - SQL injection in order lookup
ARC-003 high analyzing - JWT accepts alg: none
Blocked: 2 unverified high/critical finding(s).`,
      ),
      note("The script only reads state. It never approves anything — a blocked merge is unblocked by a person approving a fix in the workbench and the Verifier passing it."),
      h2("Tuning it"),
      p("Change the severity list to match your risk appetite. A common starting point is to block on `critical` only, then add `high` once the backlog is clear. The full set of values is in the [status reference](doc:reference/statuses)."),
      cards(["CLI reference", "Output shapes for every command.", "doc:cli/reference"]),
    ],
  },
];
