import type { DocPage } from "../types";
import { cards, figure, h2, h3, keys, note, ol, p, table, tip, ul } from "../build";

export const WORKBENCH: DocPage[] = [
  {
    slug: "workbench/tour",
    title: "Workbench tour",
    description: "Every bar, pane and panel in the Arcade window, and what each one is for.",
    blocks: [
      p(
        "The workbench will feel familiar if you've used a modern code editor — on purpose. Navigation on the left, your work in the middle, the agent on the right, output at the bottom. The difference is what's inside them.",
      ),
      figure("workbench", "The workbench layout. Every region except the editor can be hidden."),

      h2("Top bar"),
      ul(
        "**Project and workspace** — what you're scanning, and which run you're looking at.",
        "**Search** — opens the [command palette](doc:workbench/shortcuts).",
        "**Run / Resume** and **Reset** — start the security loop, or clear the run and start over.",
        "**Approval indicator** — lights up when a run is paused on you. Click it to jump to the request.",
        "**Layout toggles** — show or hide the sidebar, bottom panel and agent pane.",
      ),

      h2("Activity bar and sidebar"),
      p("The narrow strip on the far left switches what the sidebar shows. Click the active icon again to collapse the sidebar."),
      table(
        ["Activity", "Sidebar shows"],
        ["**Explorer**", "Workspaces and the views of the current run."],
        ["**Findings**", "Every finding with severity and status. A badge shows the count."],
        ["**Source Control**", "Files changed by the Remediator, once there's a fix to review."],
        ["**Agent Providers**", "Which coding agents are connected. See [Bring your own agent](doc:agents/providers)."],
      ),
      h3("Workspaces"),
      p("A workspace is one security run on one branch — for example `scan-admin-authz` on `fix/admin-export-authz`. Runs are isolated from each other, so several can be queued or in flight against the same project."),

      h2("Editor area"),
      p("Views open as tabs, with a breadcrumb underneath showing project, workspace and view. Close everything and you get a quiet reminder of the main shortcuts."),
      table(
        ["View", "Use it to"],
        ["**Overview**", "See the project at a glance: technologies, endpoint and boundary counts, top findings."],
        ["**Attack Surface**", "Explore the application graph and the proven exploit path."],
        ["**Findings**", "Read one finding end to end. The tab is named after the finding id."],
        ["**Evidence**", "Inspect the request, response and reproduction steps."],
        ["**Timeline**", "Audit who did what, and when."],
        ["**Browser**", "See the sandboxed app as the Attacker sees it."],
        ["**Changes**", "Review the Remediator's diff."],
      ),

      h2("Agent pane"),
      p(
        "The right-hand pane is your conversation with the fleet. It shows which agent is working and on what, streams progress, and is where [approval requests](doc:model/approvals) appear. If a run is waiting on you, this pane opens itself.",
      ),

      h2("Bottom panel"),
      table(
        ["Tab", "Contents"],
        ["**Problems**", "Findings as a flat list. Click one to open it."],
        ["**Output**", "The structured log of the run."],
        ["**Terminal**", "What the agents are executing inside the sandbox, labelled by agent."],
      ),

      h2("Status bar"),
      p("Always visible, always honest about where things are running:"),
      ul(
        "**Target environment** — the sandbox id, in green when the target is isolated and disposable.",
        "**Problems** — finding counts. Click to open the Problems tab.",
        "**Run progress** — the current phase.",
        "**Agent provider** — which coding agent is driving.",
      ),
      note("Every region is resizable by dragging its edge. On narrow windows the sidebar and agent pane stay out of the way until you ask for them."),
    ],
  },

  {
    slug: "workbench/attack-surface",
    title: "Attack Surface",
    description: "The Mapper's picture of your application, and the path an attacker actually took through it.",
    blocks: [
      p(
        "The Attack Surface view is the shared map every agent works from. It answers two questions quickly: *what does this application consist of*, and *where did the exploit go*.",
      ),
      h2("Nodes"),
      p("Each node is a part of the application the Mapper identified."),
      table(
        ["Kind", "Examples"],
        ["User, Browser", "Where requests originate."],
        ["API, Service", "Gateways, route handlers, internal services."],
        ["Auth", "Session handling, token verification, role checks."],
        ["Admin", "Privileged operations — exports, impersonation, configuration."],
        ["Database", "Data stores."],
        ["Third party", "Payment providers, email, anything across a network boundary."],
        ["Secrets", "`.env` files, key stores, credentials in history."],
      ),
      h2("Risk colors"),
      table(
        ["Risk", "Meaning"],
        ["**Safe**", "Nothing of concern found."],
        ["**Attention**", "Worth a look — a trust boundary, or a weak pattern — but not exploited."],
        ["**Vulnerable**", "An exploit was reproduced against this node."],
      ),
      note("A node only turns red when there's evidence. Attention is the Mapper's opinion; Vulnerable is the Attacker's proof."),
      h2("The exploit path"),
      p(
        "Once a finding is reproduced, the edges the attack travelled are highlighted end to end — for ARC-001: `user → browser → api → admin → db`. Reading the path is often the fastest way to understand a finding, because it shows which boundary *should* have stopped the request.",
      ),
      h2("From the terminal"),
      p("`arcade map` prints the same surface, and `arcade map --json` returns the nodes and the exploit path for other tools."),
      cards(["CLI reference", "`arcade map` and every other command.", "doc:cli/reference"]),
    ],
  },

  {
    slug: "workbench/reviewing-fixes",
    title: "Reviewing fixes",
    description: "How to read a Remediator diff, and what to check before you approve it.",
    blocks: [
      p("A proposed fix shows up in two places: the **Source Control** activity lists the changed files, and the **Changes** view shows the diff. Both appear as soon as there's something to review — before you approve, not after."),
      h2("What's in a fix"),
      ul(
        "**The code change**, scoped to the root cause the Defender identified.",
        "**A regression test** that replays the original exploit, so the bug can't quietly come back.",
        "**The branch and commit** — for example `fix/admin-export-authz` @ `3f9a1c2`.",
        "**The commands** the Remediator ran, and the test results.",
      ),
      h2("A review checklist"),
      ol(
        "**Does it fix the cause, or the symptom?** Compare the diff against the root cause in the finding. Blocking one payload is a symptom fix.",
        "**Is the test the exploit?** The regression test should replay the evidence request and assert the secure response.",
        "**Is the change minimal?** The Defender ranks mitigations by effort. If the recommended one is bigger than you'd like, the alternatives are listed in the finding.",
        "**Did anything else change?** File statuses (`M`, `A`, `D`) and line counts are shown per file.",
      ),
      tip("You're not the last line of defense. After you approve, the Verifier still has to fail to break in. Your review is about *whether you want this change*; the Verifier's is about *whether it works*."),
      h2("After verification"),
      p("When the finding reaches **Verified**, a ship approval asks whether to merge. The request repeats the verification summary — original exploit status, mutation results, test counts — so the decision and the proof are in one place."),
      cards(
        ["Approval gates", "The three kinds of approval.", "doc:model/approvals"],
        ["Evidence & verification", "What the Verifier actually checks.", "doc:model/evidence"],
      ),
    ],
  },

  {
    slug: "workbench/shortcuts",
    title: "Command palette & shortcuts",
    description: "Jump anywhere and do anything without leaving the keyboard.",
    blocks: [
      h2("Command palette"),
      p("Press **Ctrl K** (or **Ctrl P**) to open the palette. Start typing to filter; use the arrow keys and **Enter** to run; **Esc** to close. On macOS, use **⌘** in place of Ctrl."),
      table(
        ["Group", "What you can do"],
        ["**View**", "Open any view: Overview, Attack Surface, Findings, Evidence, Timeline, Browser, Changes."],
        ["**Finding**", "Jump straight to a finding by id or title — try typing `sql`."],
        ["**Run**", "Run or resume the security loop, or reset the run."],
        ["**Layout**", "Toggle the sidebar, bottom panel and agent pane."],
        ["**Panel**", "Show the Terminal, Problems or Output tab."],
      ),
      h2("Keyboard shortcuts"),
      keys(
        ["Ctrl+K", "Open the command palette"],
        ["Ctrl+P", "Open the command palette"],
        ["Ctrl+B", "Toggle the sidebar"],
        ["Ctrl+J", "Toggle the bottom panel"],
        ["Ctrl+L", "Toggle the agent pane"],
        ["↑+↓", "Move through palette results"],
        ["Enter", "Run the selected command"],
        ["Esc", "Close the palette"],
      ),
      note("A pending approval always wins: if a run is waiting on you, the agent pane reopens even if you've hidden it."),
      h2("In these docs"),
      keys(["Ctrl+K", "Search the docs"], ["/", "Search the docs"]),
    ],
  },
];
