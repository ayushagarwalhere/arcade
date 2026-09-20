import type { DocPage } from "../types";
import { cards, code, h2, h3, note, p, table, tip, ul } from "../build";

export const CLI: DocPage[] = [
  {
    slug: "cli/overview",
    title: "CLI overview",
    description: "Drive Arcade from a terminal, a script, or another agent.",
    blocks: [
      p(
        "Everything the workbench shows is also available from the `arcade` command. It's built for two audiences: you, at a terminal — and other agents, which is why every command can speak JSON.",
      ),
      h2("Install"),
      code(
        "bash",
        `cd arcade/cli
npm link
arcade help`,
      ),
      p("The CLI has no dependencies and needs Node.js 20 or newer. Without linking, run it directly with `node packages/cli/arcade.mjs <command>`."),
      h2("A typical session"),
      code(
        "bash",
        `$ arcade init                 # once per repository
$ arcade scan .               # map → attack → defend, then pause for approval
$ arcade findings             # what was reproduced?
$ arcade evidence ARC-001     # show me the proof
$ arcade verify ARC-001       # did the fix hold?`,
      ),
      note("`arcade scan` stops at the human approval gate, exactly like the workbench. The CLI can't approve a fix on your behalf."),
      h2("Human output vs. JSON"),
      p("By default the CLI prints for people: color, alignment, short summaries. Add `--json` to any command for stable, machine-readable output."),
      code(
        "json",
        `{
  "run": "scan-admin-authz",
  "phase": "verified",
  "environment": {
    "sandboxId": "sandbox-7f2c",
    "isolated": true,
    "disposable": true,
    "network": "none",
    "host": "localhost:3000"
  },
  "agents": {
    "mapper": "done",
    "attacker": "done",
    "defender": "done",
    "remediator": "done",
    "verifier": "done"
  },
  "findings": [
    { "id": "ARC-001", "severity": "critical", "status": "verified" }
  ]
}`,
        "arcade status --json",
      ),
      tip("Building an integration? Prefer `--json` and key off `phase`, `status` and `outcome` — the values are documented in the [status reference](doc:reference/statuses)."),
      h2("Exit codes"),
      table(["Code", "Meaning"], ["`0`", "The command succeeded."], ["`1`", "Unknown command, unknown finding id, or no evidence for that finding."]),
      cards(
        ["CLI reference", "Every command, flag and output shape.", "doc:cli/reference"],
        ["MCP server", "The same capabilities, as tools for a coding agent.", "doc:cli/mcp"],
      ),
    ],
  },

  {
    slug: "cli/reference",
    title: "CLI reference",
    description: "Every arcade command, with arguments and example output.",
    blocks: [
      code("text", `arcade <command> [target] [--json]`, "Usage"),
      table(
        ["Command", "Description"],
        ["`arcade init`", "Set up Arcade in the current repository."],
        ["`arcade scan <path>`", "Run the full security loop. Pauses at the approval gate."],
        ["`arcade map`", "Build and print the attack surface."],
        ["`arcade attack`", "Reproduce exploits in the isolated sandbox."],
        ["`arcade findings`", "List findings with severity and status."],
        ["`arcade evidence <id>`", "Print the evidence trail for a finding."],
        ["`arcade verify <id>`", "Show the independent verification of a fix."],
        ["`arcade status`", "Show run, sandbox and agent state."],
        ["`arcade sandbox <sub>`", "Create, test in, and destroy real Docker sandboxes."],
        ["`arcade agents`", "Show which coding agents Arcade is connected to."],
        ["`arcade connect [agent]`", "Register Arcade's MCP server with `claude`, `codex`, or every supported agent installed here."],
        ["`arcade disconnect [agent]`", "Remove that registration again."],
        ["`arcade help`", "Show usage."],
      ),
      h2("Global flags"),
      table(["Flag", "Effect"], ["`--json`", "Print machine-readable JSON instead of formatted text. Works on every command."], ["`-h`, `--help`", "Show usage."]),

      h2("arcade init"),
      p("Creates `.arcade/config.json` in the current repository. Run it once."),
      code("json", `{ "ok": true, "created": [".arcade/config.json"], "next": "arcade scan ." }`, "arcade init --json"),

      h2("arcade scan"),
      p("Runs the loop against a path (defaults to `.`): map, attack, evidence, defend — then stops for approval before anything changes code."),
      code(
        "bash",
        `$ arcade scan .
arcade scan .  · sandbox-7f2c
  ● map
  ● attack
  ● evidence
  ● defend
  ● approve (human)
  ● remediate
  ● test
  ● verify

! Pauses for your approval before changing code. Run arcade findings to review.`,
      ),

      h2("arcade map"),
      p("Prints each surface node with its risk, then the proven exploit path. With `--json`, returns `nodes` and `exploitPath`."),
      code(
        "bash",
        `$ arcade map
Attack surface — 17 endpoints, 4 auth boundaries

  · User               safe
  · Browser            safe
  ! API Gateway        attention
  ! Auth / Session     attention
  · Orders Service     safe
  ✗ Admin Export       vulnerable
  ! PostgreSQL         attention
  · Stripe API         safe
  ! Secrets / .env     attention

Exploit path  user → browser → api → admin → db`,
      ),

      h2("arcade attack"),
      p("Runs only the attack stage: spawn a sandbox, probe endpoints, reproduce, capture evidence. Useful after you've changed code and want to re-test without a full scan."),

      h2("arcade findings"),
      p("Lists findings. The JSON form returns `id`, `title`, `severity`, `status` and `target` for each."),
      code(
        "json",
        `[
  {
    "id": "ARC-001",
    "title": "Broken authorization on admin export",
    "severity": "critical",
    "status": "verified",
    "target": "POST /api/admin/export"
  }
]`,
        "arcade findings --json",
      ),

      h2("arcade evidence"),
      p("Takes a finding id (case-insensitive). Prints the request, the response status that proved the exploit, the reproduction steps and the artifact path. Exits `1` if the finding doesn't exist or has no captured evidence yet."),

      h2("arcade verify"),
      p("Shows the Verifier's result for a finding: status before and after, mutation results, regression results. If verification hasn't happened yet, the outcome is `pending`."),
      code(
        "bash",
        `$ arcade verify ARC-001
VERIFIED ARC-001

  Original exploit: POST /api/admin/export
  Previous: 200 OK   Current: 403 Forbidden
  Mutations: 0/64 succeeded · regression 156/156
  Verifier ran independently, with no memory of the fix.`,
      ),

      h2("arcade sandbox"),
      p("Creates and manages real Docker [sandboxes](doc:model/sandbox). Requires a running Docker daemon. Every subcommand accepts `--json`."),
      table(
        ["Subcommand", "Description"],
        ["`sandbox create [path]`", "Build a sandbox from a project. `--ref <git-ref>` snapshots a commit instead of the working tree, `--image <img>` overrides the base image, `--offline` skips install and never attaches a network."],
        ["`sandbox test [path]`", "Fresh sandbox, run the tests, destroy it. Takes `--ref`, `--cmd \"<command>\"`, `--timeout <seconds>`, and `--keep` to leave the sandbox up for inspection. Exits `1` if the tests fail."],
        ["`sandbox exec <id> -- <command>`", "Run a shell command in `/workspace` inside a sandbox. Exits with the command's exit code."],
        ["`sandbox ls`", "List sandboxes, with the network state reported by Docker."],
        ["`sandbox destroy <id>`", "Remove a sandbox. `--all` removes every Arcade sandbox. Containers Arcade didn't create are never touched."],
      ),

      h2("arcade status"),
      p("The run id, current [phase](doc:model/security-loop#run-phases), sandbox, and each agent's state. This is the command other agents should poll."),
      h2("arcade connect"),
      p(
        "Registers the [MCP server](doc:cli/mcp) with a coding agent by adding one `arcade` entry to the agent's own user-level config: `~/.claude.json` for Claude Code, `~/.codex/config.toml` for Codex. Name an agent — `claude` or `codex` — or name none to connect every supported agent installed on this machine.",
      ),
      code(
        "bash",
        `$ arcade connect
Coding agents

  ● Claude Code  connected  /home/you/.claude.json
  ● Codex        connected  /home/you/.codex/config.toml

Restart the agent, then ask it to scan this project with Arcade. In Claude Code, /mcp lists the tools.`,
      ),
      ul(
        "It's safe to run twice, and it replaces an `arcade` entry you registered by hand instead of duplicating it.",
        "Everything else in the config file is preserved. A config that can't be parsed is reported and left untouched.",
        "`arcade agents` shows the current state without changing anything; `arcade disconnect [agent]` removes the entry.",
        "An agent shown as *connected (elsewhere)* is registered against a different copy of Arcade on disk. Run `arcade connect` to repoint it at this one.",
      ),
      note("An agent counts as installed when its command is on your PATH or its config folder exists, so editor-extension and desktop installs are found too. The desktop app has the same feature as a button — see [Bring your own agent](doc:agents/providers)."),

      h3("See also"),
      ul("[CLI overview](doc:cli/overview) — install and a typical session.", "[Status reference](doc:reference/statuses) — every value `phase`, `status` and `outcome` can take."),
    ],
  },

  {
    slug: "cli/mcp",
    title: "MCP server",
    description: "Expose Arcade's workflow to any coding agent over the Model Context Protocol.",
    blocks: [
      p(
        "The Arcade MCP server lets a coding agent start scans and read results as tool calls. It's a single dependency-free file that speaks JSON-RPC 2.0 over stdio, so it works anywhere Node.js does.",
      ),
      h2("Register it"),
      p("For Claude Code and Codex, let Arcade do it — from the desktop app's **Agent Providers** panel, or from a terminal:"),
      code("bash", `arcade connect`, "Claude Code and Codex"),
      p("See [arcade connect](doc:cli/reference) for exactly what it writes. For any other MCP client, register the server by hand:"),
      code(
        "json",
        `{
  "mcpServers": {
    "arcade": {
      "command": "node",
      "args": ["/absolute/path/to/arcade/packages/cli/mcp-server.mjs"]
    }
  }
}`,
        "Any MCP client",
      ),
      h2("Tools"),
      table(
        ["Tool", "Input", "Returns"],
        ["`arcade_scan`", "`path?`", "The started run. Pauses at the approval gate."],
        ["`arcade_get_attack_surface`", "—", "Surface nodes and the exploit path."],
        ["`arcade_get_findings`", "—", "Findings with id, title, severity, status, target, CWE."],
        ["`arcade_get_evidence`", "`id`", "Evidence and verification for one finding."],
        ["`arcade_run_attack`", "—", "Runs the attack stage in the sandbox; returns reproduced ids."],
        ["`arcade_request_approval`", "`action`", "Always `pending`. A human decides in the workbench."],
        ["`arcade_verify_fix`", "`id`", "The independent verification result."],
        ["`arcade_sandbox_test`", "`path?`, `ref?`, `command?`", "Builds a fresh Docker sandbox, runs the tests with the network cut, destroys it. Returns exit code, output and the creation steps."],
        ["`arcade_sandbox_list`", "—", "Live sandboxes, as reported by the Docker daemon."],
        ["`arcade_get_status`", "—", "Run, phase, agents and environment."],
      ),
      note("There is no `arcade_approve` tool, and there won't be. An agent can ask; only a person can grant. See [Approval gates](doc:model/approvals)."),
      h2("Example call"),
      code(
        "json",
        `{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "tools/call",
  "params": { "name": "arcade_verify_fix", "arguments": { "id": "ARC-001" } }
}`,
        "Request",
      ),
      code(
        "json",
        `{
  "id": "ARC-001",
  "verification": {
    "outcome": "verified",
    "independent": true,
    "statusBefore": "200 OK",
    "statusAfter": "403 Forbidden",
    "mutatedPayloads": 64,
    "mutatedSucceeded": 0,
    "regression": "156/156"
  }
}`,
        "Result (text content)",
      ),
      h2("Protocol details"),
      ul(
        "Transport: stdio, newline-delimited JSON-RPC 2.0.",
        "Protocol version: `2024-11-05`. Capabilities: `tools`.",
        "Methods: `initialize`, `tools/list`, `tools/call`, `ping`.",
        "Errors: `-32601` for an unknown method, `-32000` for a tool error such as an unknown finding id.",
      ),
      tip("Test the server by hand: run `npm run mcp` in `packages/cli/`, then paste a JSON-RPC line and press Enter."),
    ],
  },
];
