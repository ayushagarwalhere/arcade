import type { DocPage } from "../types";
import { cards, code, h2, note, ol, p, steps, table, tip, ul } from "../build";

export const AGENTS: DocPage[] = [
  {
    slug: "agents/providers",
    title: "Bring your own agent",
    description: "Arcade is not a model. It gives the coding agents you already use a security workflow to drive.",
    blocks: [
      p(
        "Arcade's five agents are *roles* — Mapper, Attacker, Defender, Remediator, Verifier. The intelligence behind each role comes from a **provider**: a coding agent you've connected. Arcade supplies the workflow, the sandbox, the evidence store and the gates.",
      ),
      h2("Supported providers"),
      table(
        ["Provider", "Notes"],
        ["**Claude Code**", "First-class. One-click connect; also connects back to Arcade over MCP — see [Claude Code with Arcade](doc:agents/claude-code)."],
        ["**Codex**", "First-class. One-click connect, same as Claude Code — see [Codex with Arcade](doc:agents/codex)."],
        ["**Cursor CLI**", "Supported."],
        ["**OpenCode**", "Supported."],
        ["**Gemini CLI**", "Supported."],
        ["**Custom agent**", "Anything that can run the [CLI](doc:cli/overview) or speak [MCP](doc:cli/mcp)."],
      ),
      h2("Connect a provider"),
      ol(
        "Open the **Agent Providers** activity in the activity bar — or click the provider name in the status bar.",
        "Click **connect** next to Claude Code or Codex. Arcade registers its [MCP server](doc:cli/mcp) in that agent's own config file, and the row turns green.",
        "Restart the agent so it picks up the new server, then start a run. The status bar shows which provider is driving.",
      ),
      p("In the desktop app, the rows for Claude Code and Codex show what is really on your machine, and re-check whenever you switch back to the window:"),
      table(
        ["Row says", "Meaning"],
        ["**connect**", "The agent is installed, and Arcade isn't registered with it yet."],
        ["**connected**", "Arcade's MCP server is registered. Hover the row to disconnect."],
        ["**reconnect**", "Registered, but pointing at an Arcade somewhere else on disk — a copy you moved or removed. One click repoints it."],
        ["**install**", "The agent isn't on this machine. The row links to where to get it."],
        ["**config unreadable**", "The agent's config file couldn't be parsed. Arcade leaves it exactly as it is; fix the file and the row recovers."],
      ),
      p("No desktop app? `arcade connect` does the same thing from a terminal — see the [CLI reference](doc:cli/reference)."),
      note("Connecting adds one `arcade` entry to the agent's config and touches nothing else; disconnecting removes it. Arcade doesn't store or proxy your model credentials — each provider authenticates the way it normally does on your machine."),
      h2("Why roles are separate from providers"),
      ul(
        "**You can swap models without changing the workflow.** The loop, the evidence format and the gates stay the same.",
        "**The limits belong to the role, not the model.** Whichever provider plays the Attacker still only works in the sandbox; whichever plays the Remediator still only writes to its own branch.",
        "**Independence is structural.** The Verifier gets a fresh context and a fresh sandbox regardless of which provider runs it, so it can't inherit the Remediator's assumptions.",
      ),
      tip("A good default is to let one provider run the whole fleet. Once you're comfortable, try a different provider for the Verifier — a second opinion from a second model."),
    ],
  },

  {
    slug: "agents/claude-code",
    title: "Claude Code with Arcade",
    description: "Connect Claude Code over MCP so it can scan its own changes and read Arcade's findings back.",
    blocks: [
      p(
        "The most useful Arcade setup is a two-way one: Claude Code writes the feature, then asks Arcade whether it just introduced a vulnerability — without you relaying anything between them.",
      ),
      h2("Set it up"),
      steps(
        ["Connect", "In the desktop app, open **Agent Providers** and click **connect** next to Claude Code. From a terminal, run the command below instead."],
        ["Confirm the tools are visible", "Restart Claude Code and run `/mcp`. You should see `arcade` with ten tools."],
        ["Ask for a scan", "In plain language — Claude Code picks the right tools."],
      ),
      code("bash", `arcade connect claude`, "1 · Connect"),
      p(
        "Either way, Arcade adds itself to `mcpServers` in `~/.claude.json` — Claude Code's user-level config, so the tools are available in every project, and in the editor extensions as well as the terminal. Nothing else in the file changes, and `arcade disconnect claude` removes the entry again.",
      ),
      tip("Prefer to scope Arcade to a single project? Skip the connector and register it yourself from that project: `claude mcp add arcade -- node /path/to/arcade/packages/cli/mcp-server.mjs`."),
      code(
        "text",
        `> Scan this project with Arcade and tell me about anything critical.

● arcade_scan(path: ".")
● arcade_get_findings()
● arcade_get_evidence(id: "ARC-001")

ARC-001 is critical: POST /api/admin/export returns 200 to a standard
user's session and leaks 48,210 records. The handler checks that a session
exists but never checks the role…`,
        "3 · Ask",
      ),
      h2("What Claude Code can and can't do"),
      table(
        ["It can", "It can't"],
        ["Start a scan and read the attack surface", "Attack anything outside the sandbox"],
        ["Read findings, evidence and verification results", "Mark a finding as verified"],
        ["Ask for a fix to be verified", "Approve its own fix"],
        ["*Request* a human approval", "*Grant* an approval"],
      ),
      p("That last row is the important one. `arcade_request_approval` returns `pending` and the run waits for you in the workbench. See [Approval gates](doc:model/approvals)."),
      h2("A prompt worth saving"),
      code(
        "text",
        `After you finish a change that touches auth, routing, database queries or
secrets, run an Arcade scan. If it reports a finding at high or above, show
me the evidence before proposing a fix.`,
        "CLAUDE.md",
      ),
      cards(
        ["MCP server", "Every tool, with inputs and example output.", "doc:cli/mcp"],
        ["Let your agent check its own work", "The full recipe, end to end.", "doc:recipes/agent-self-check"],
      ),
    ],
  },

  {
    slug: "agents/codex",
    title: "Codex with Arcade",
    description: "Connect Codex over MCP so it can scan its own changes and read Arcade's findings back.",
    blocks: [
      p("Codex connects the same way Claude Code does: Arcade registers its MCP server with Codex, and Codex gains tools to start scans and read the results."),
      h2("Set it up"),
      steps(
        ["Connect", "In the desktop app, open **Agent Providers** and click **connect** next to Codex. From a terminal, run the command below instead."],
        ["Confirm the tools are visible", "Restart Codex and run `/mcp`. You should see `arcade` and its tools."],
        ["Ask for a scan", "In plain language — Codex picks the right tools."],
      ),
      code("bash", `arcade connect codex`, "1 · Connect"),
      h2("What gets written"),
      p("One table in `~/.codex/config.toml` (or under `CODEX_HOME`, if you set it). The rest of the file — your model, profiles, other servers, comments — is left exactly as it was."),
      code(
        "toml",
        `[mcp_servers.arcade]
command = "node"
args = ["/absolute/path/to/arcade/packages/cli/mcp-server.mjs"]`,
        "~/.codex/config.toml",
      ),
      p("If you had already registered an `arcade` server by hand, connecting replaces that table rather than adding a second one. `arcade disconnect codex` removes it."),
      h2("A prompt worth saving"),
      code(
        "text",
        `After you finish a change that touches auth, routing, database queries or
secrets, run an Arcade scan. If it reports a finding at high or above, show
me the evidence before proposing a fix.`,
        "AGENTS.md",
      ),
      note("Codex has the same limits as any connected agent: it can *request* an approval, never grant one. See [what a connected agent can and can't do](doc:agents/claude-code)."),
      cards(["MCP server", "Every tool, with inputs and example output.", "doc:cli/mcp"]),
    ],
  },
];
