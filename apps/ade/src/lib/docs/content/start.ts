import { SITE } from "@arcade/ui/lib/site";
import type { DocPage } from "../types";
import { cards, code, figure, h2, h3, note, ol, p, steps, table, tip, ul } from "../build";

export const START: DocPage[] = [
  {
    slug: "",
    title: "What is Arcade?",
    description: "The 60-second pitch: a security workbench that proves vulnerabilities, fixes them, and proves the fix.",
    blocks: [
      p(
        "Arcade is an **Agent Development Environment for security**. You keep building with Claude Code, Codex or whichever coding agent you like. Arcade runs a fleet of five specialized agents next to it that **map** your application, **attack** it in an isolated sandbox, **trace** the root cause, **write** a tested fix, and then **independently re-run the original attack** to prove the fix holds.",
      ),
      p(
        "The difference from a scanner is evidence. Arcade never says \"this might be vulnerable.\" A finding only exists once the exploit has been reproduced, and it only closes once a separate agent — one with no memory of the fix — fails to break in again.",
      ),
      figure("loop", "The security loop. You sit at the two gates: before code changes, and before anything merges."),

      h2("When to use Arcade"),
      ul(
        "**You ship AI-generated code.** Agents write plausible code fast. Arcade checks the part they are worst at: authorization, injection, secrets and trust boundaries.",
        "**You want proof, not a report.** Every finding carries the exact request and response that reproduced it, so triage is a read, not a debate.",
        "**You want fixes that are actually verified.** The fix ships with a regression test that replays the exploit, and an independent verifier replays the attack plus mutated payloads.",
        "**You want your coding agent to check its own work.** Through the [CLI](doc:cli/overview) and [MCP server](doc:cli/mcp), an agent can ask Arcade to scan its changes and read the results back.",
      ),

      h2("Who it's for"),
      p(
        "Developers and small teams who move quickly with coding agents and don't have a security engineer reviewing every diff. If you can read a pull request, you can read an Arcade finding: attack path, evidence, root cause, diff, verification.",
      ),

      h2("What Arcade is not"),
      ul(
        "**Not a model.** Arcade orchestrates the agents you already use. See [Bring your own agent](doc:agents/providers).",
        "**Not a linter or SAST report.** Pattern matches don't become findings. Reproduced exploits do.",
        "**Not autonomous.** Arcade never changes code, merges, or resets an environment on its own. Those stop at an [approval gate](doc:model/approvals).",
        "**Not pointed at production.** Attacks run only inside a disposable [sandbox](doc:model/sandbox) with no network access.",
      ),

      h2("Where to go next"),
      cards(
        ["Install", "Desktop app, browser, or from source — pick one and be running in a minute.", "doc:install"],
        ["Your first security run", "Watch the full loop on a sample app and approve your first fix.", "doc:first-run"],
        ["The security loop", "The mental model behind everything else in these docs.", "doc:model/security-loop"],
        ["CLI & MCP", "Drive Arcade from a terminal, a script, or another agent.", "doc:cli/overview"],
      ),
    ],
  },

  {
    slug: "install",
    title: "Install",
    description: "Three ways to run Arcade: the desktop app, in your browser, or from source.",
    blocks: [
      p("Arcade is the same workbench everywhere. Pick whichever fits how you work — you can switch later without losing anything."),
      table(
        ["Option", "Best for", "Works offline"],
        ["Desktop app", "Daily use. Bundles the whole workbench.", "Yes"],
        ["Browser", "Trying Arcade with nothing to install.", "No"],
        ["From source", "Contributing, or pinning to a commit.", "Yes"],
      ),

      h2("Desktop app"),
      p(`Download the build for your platform from [GitHub Releases](${SITE.releases}).`),
      table(
        ["Platform", "Artifact", "Notes"],
        ["Windows x64", "`Arcade-Setup-<version>.exe`", "Standard installer. Lets you choose the install directory."],
        ["Windows x64", "`Arcade-<version>-portable.exe`", "No install. Run it from anywhere, including a USB drive."],
        ["macOS", "`Arcade-<version>-<arch>.dmg`", "Drag to Applications."],
        ["Linux", "`.AppImage` or `.deb`", "AppImage runs anywhere; `.deb` for Debian and Ubuntu."],
      ),
      note(
        "The desktop app serves the workbench from inside the application bundle, so it runs fully offline. Nothing about your project leaves your machine — see [Privacy & telemetry](doc:reference/privacy).",
      ),

      h2("Browser"),
      p(`Open [the workbench](${SITE.ade}) — there is nothing to install. This is the fastest way to follow [Your first security run](doc:first-run).`),

      h2("From source"),
      p("You need Node.js 20 or newer."),
      code(
        "bash",
        `git clone ${SITE.github}.git
cd arcade/frontend
npm install
npm run dev          # workbench at http://localhost:3000/arcade`,
      ),
      h3("Build the desktop app yourself"),
      code(
        "bash",
        `npm run desktop:build        # current OS: .dmg on macOS, AppImage + .deb on Linux
npm run desktop:build:win    # Windows: portable .exe + installer
npm run desktop:pack         # unpacked app, for a quick local check`,
      ),
      p("Artifacts land in `apps/ade/release/`."),

      h2("Install the CLI"),
      p("The CLI and MCP server live in the same repository and have no dependencies."),
      code(
        "bash",
        `cd arcade/cli
npm link             # puts \`arcade\` on your PATH
arcade help`,
      ),
      tip("You don't need the CLI to use the workbench. Install it when you want to script Arcade or connect a coding agent — see [CLI overview](doc:cli/overview)."),
    ],
  },

  {
    slug: "first-run",
    title: "Your first security run",
    description: "From opening Arcade to a verified, merged fix in about five minutes.",
    blocks: [
      p(
        "This is the most important page in the docs. It walks the whole loop once against the bundled sample project, `acme-commerce` — a small commerce API with a very real authorization bug. Everything else in Arcade is a closer look at one of these steps.",
      ),
      figure("workbench", "The workbench mid-run: navigation on the left, the active view in the center, the agent thread on the right."),

      h2("1. Open the workbench and start the run"),
      p(
        "Open Arcade. The sample project is already loaded and the run starts on its own after a moment. If it doesn't, press **Run** in the top bar, or send the default prompt from the agent pane on the right.",
      ),

      h2("2. Watch the Mapper draw the attack surface"),
      p(
        "Open **Attack Surface** from the sidebar. The Mapper indexes the repository and reveals the application node by node: browser, API gateway, auth, services, database, third parties, secrets. Nodes are colored by risk — nothing is red yet, because nothing has been proven.",
      ),

      h2("3. Let the Attacker reproduce an exploit"),
      p(
        "The Attacker works only inside the sandbox shown in the status bar (`sandbox-7f2c`, network: none). It signs in as a standard user, replays that session against `POST /api/admin/export`, and gets back `200 OK` with 48,210 records that belong to other customers.",
      ),
      p("That becomes **ARC-001 — Broken authorization on admin export**, severity critical. On the attack surface, the exploit path turns red."),

      h2("4. Read the evidence"),
      p(
        "Open **Evidence**. You'll see the exact request, the headers, the response, and numbered reproduction steps. This is the point of Arcade: you can check the claim yourself before anyone proposes a change.",
      ),

      h2("5. Approve the fix"),
      p(
        "The Defender traces the root cause — the session proved *who* the caller was, never *what they were allowed to do* — and ranks three mitigations. The run then **pauses**. The agent pane shows an approval request: *Apply the proposed fix*.",
      ),
      p("Click **Review diff** to see exactly what would change, then **Approve**. Nothing in your code has been touched until this moment."),

      h2("6. Remediate, test, verify"),
      ol(
        "The Remediator writes the fix and a regression test that replays the exploit, on its own branch `fix/admin-export-authz`.",
        "The regression suite runs.",
        "The Verifier — a separate agent with no memory of the fix — rebuilds the sandbox from the fix branch and replays the original attack plus 64 mutated payloads.",
      ),
      p("The original request now returns `403 Forbidden`, none of the mutations get through, and ARC-001 moves to **Verified**."),

      h2("7. Approve the merge"),
      p("A second gate appears: *Merge the verified fix to main*. Approve it and the finding closes. Reject it and the fix stays on its branch for you to handle however you like."),

      h2("That's the loop"),
      steps(
        ["Map", "Understand what the application is."],
        ["Attack", "Prove what is exploitable, in a sandbox."],
        ["Defend", "Explain the root cause and rank the options."],
        ["Approve", "A human decides whether code changes."],
        ["Remediate", "Write the fix and a test that replays the exploit."],
        ["Verify", "An independent agent tries to break in again."],
      ),
      tip("Press **Ctrl K** at any time to jump to a view, a finding, or a command. More in [Command palette & shortcuts](doc:workbench/shortcuts)."),
      cards(
        ["The security loop", "Why the loop is shaped this way.", "doc:model/security-loop"],
        ["Workbench tour", "Every pane, panel and bar, explained.", "doc:workbench/tour"],
      ),
    ],
  },
];
