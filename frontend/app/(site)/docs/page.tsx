"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { SITE } from "@/lib/site";

/* ------------------------------------------------------------------ primitives */

function Code({ children }: { children: string }) {
  return (
    <pre className="scrollbar-thin mt-4 overflow-x-auto rounded-xl border border-white/10 bg-ink-900 p-4 font-mono text-[13.5px] leading-7 text-white/80">
      {children}
    </pre>
  );
}

function Callout({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "violet" | "emerald" }) {
  const c =
    tone === "violet"
      ? "border-violet-500/25 bg-violet-500/[0.06] text-violet-100/90"
      : tone === "emerald"
        ? "border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-100/90"
        : "border-white/10 bg-white/[0.03] text-white/70";
  return <div className={`mt-4 rounded-xl border px-4 py-3 text-[14px] leading-7 ${c}`}>{children}</div>;
}

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="h-display scroll-mt-28 pt-14 text-[30px] font-medium first:pt-0">
      {children}
    </h2>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-8 text-[19px] font-semibold text-white">{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[16px] leading-8 text-white/60">{children}</p>;
}

/* ------------------------------------------------------------------ nav */

const NAV: { group: string; items: { id: string; label: string }[] }[] = [
  { group: "Introduction", items: [{ id: "introduction", label: "What is Arcade?" }] },
  {
    group: "Getting started",
    items: [
      { id: "install", label: "Installation" },
      { id: "first-run", label: "First security run" },
      { id: "findings", label: "Understanding findings" },
    ],
  },
  {
    group: "Core concepts",
    items: [
      { id: "concepts", label: "The security loop" },
      { id: "agents", label: "The five agents" },
      { id: "evidence", label: "Evidence & verification" },
      { id: "approval", label: "Human approval" },
    ],
  },
  {
    group: "Integrations",
    items: [
      { id: "byo", label: "Bring your own agent" },
      { id: "cli", label: "CLI" },
      { id: "mcp", label: "MCP" },
    ],
  },
  {
    group: "Architecture",
    items: [
      { id: "architecture", label: "System architecture" },
      { id: "security", label: "Sandboxing & permissions" },
    ],
  },
  { group: "Reference", items: [{ id: "orca", label: "Inspired by Orca" }] },
];

const AGENTS: [string, string, string][] = [
  ["Mapper", "Understands the application", "Indexes the repo, identifies frameworks, services, endpoints, auth, data stores and integrations, and builds the shared security map."],
  ["Attacker", "Reproduces exploits", "Works only inside an isolated sandbox. Probes the surface and reports a finding only when it can reproduce the exploit with saved evidence."],
  ["Defender", "Traces root cause", "Follows the attack path, works out the blast radius, and proposes mitigations ranked by how much they fix and how much they change."],
  ["Remediator", "Writes the fix", "On its own worktree, writes the code change plus a regression test that replays the exploit. Never touches your working tree."],
  ["Verifier", "Re-runs the attack", "Independent, with no memory of the fix. Rebuilds the sandbox from the fix branch and replays the original attack plus mutations."],
];

const CLI_CMDS: [string, string][] = [
  ["arcade init", "Set up Arcade in the current repository."],
  ["arcade scan .", "Run the full security loop against a folder or repo."],
  ["arcade map", "Build the security map / attack surface only."],
  ["arcade attack", "Reproduce exploits in the isolated sandbox."],
  ["arcade findings", "List findings with severity and status."],
  ["arcade evidence <id>", "Print the evidence trail for a finding."],
  ["arcade verify <id>", "Independently re-run the original attack against the fix."],
  ["arcade status --json", "Machine-readable agent/run state for other agents."],
];

const MCP_TOOLS: [string, string][] = [
  ["arcade_scan", "Start a security workflow against a target."],
  ["arcade_get_attack_surface", "Return the mapped nodes and edges."],
  ["arcade_get_findings", "Return findings with severity and status."],
  ["arcade_get_evidence", "Return the reproduction and evidence for a finding."],
  ["arcade_run_attack", "Run a specific attack in the sandbox."],
  ["arcade_request_approval", "Ask the human to approve a high-impact action."],
  ["arcade_verify_fix", "Re-run the original attack to verify a fix."],
  ["arcade_get_status", "Return machine-readable run state."],
];

const ARCH = `            Developer
                │
                ▼
        ┌───────────────┐
        │    Arcade     │  ADE / control plane
        └───────┬───────┘
                │
   ┌────────────┼────────────┐
   ▼            ▼            ▼
 Mapper     Attacker     Defender
   │            │            │
   └────────────┼────────────┘
                ▼
          Evidence store
                │
                ▼
           Remediation  (isolated worktree)
                │
                ▼
           Human gate  ← you approve
                │
                ▼
          Verification  (independent replay)
                │
                ▼
           Verified / Failed`;

export default function Docs() {
  const [active, setActive] = useState("introduction");

  useEffect(() => {
    const ids = NAV.flatMap((g) => g.items.map((i) => i.id));
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <div className="mx-auto max-w-[1180px] px-6 md:px-10">
      <div className="grid gap-12 lg:grid-cols-[220px_1fr]">
        {/* Sidebar */}
        <aside className="hidden lg:block">
          <div className="sticky top-28 max-h-[calc(100vh-8rem)] space-y-6 overflow-y-auto pb-10">
            {NAV.map((g) => (
              <div key={g.group}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">{g.group}</div>
                <ul className="mt-2 space-y-1">
                  {g.items.map((i) => (
                    <li key={i.id}>
                      <a
                        href={`#${i.id}`}
                        className={`block rounded-md px-2 py-1 text-[14px] transition ${
                          active === i.id ? "bg-white/[0.06] text-white" : "text-white/50 hover:text-white/85"
                        }`}
                      >
                        {i.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </aside>

        {/* Content */}
        <article className="min-w-0 pb-32 pt-16">
          <div className="text-[13px] font-semibold uppercase tracking-[0.14em] text-emerald-400/80">Documentation</div>
          <h1 className="h-display mt-3 text-[44px] font-medium md:text-[60px]">Arcade docs</h1>
          <p className="mt-5 max-w-2xl text-[19px] leading-8 text-white/55">
            Everything you need to go from an imported project to a verified, human-approved fix.
          </p>

          <H id="introduction">What is Arcade?</H>
          <P>
            Arcade is a security-focused Agent Development Environment. You build with Claude Code, Codex or any coding agent;
            Arcade&apos;s multi-agent system maps your application, attacks it in an isolated sandbox, writes a fix, and
            independently re-runs the original attack to prove the fix worked — with a human approving every high-impact action.
          </P>
          <Callout tone="emerald">
            Arcade does not just say &quot;this code may be vulnerable.&quot; It shows what the app contains, how it was
            exploited, the request and response that prove it, the fix, and whether the original exploit still works.
          </Callout>

          <H id="install">Installation</H>
          <Sub>Download</Sub>
          <P>
            Grab the desktop build for your platform from{" "}
            <a href={SITE.releases} className="text-emerald-300 hover:text-emerald-200" target="_blank" rel="noreferrer">
              GitHub Releases
            </a>
            , or open the ADE in your browser — no install required.
          </P>
          <Link href={SITE.ade} className="mt-4 inline-flex rounded-lg bg-emerald-400 px-4 py-2.5 text-[14px] font-semibold text-black transition hover:bg-emerald-300">
            Open the ADE →
          </Link>
          <Sub>Install from source</Sub>
          <Code>{`git clone ${SITE.github}.git
cd arcade/frontend
npm install
npm run dev        # http://localhost:3000
# open http://localhost:3000/arcade for the ADE`}</Code>
          <Callout>
            On Windows with the project inside OneDrive, keep <code className="font-mono text-white/80">node_modules</code> out of
            the synced folder (a directory junction to a local path) and run npm from PowerShell, so package install scripts
            resolve Node. See the repository README.
          </Callout>

          <H id="first-run">First security run</H>
          <P>Open the ADE and press &quot;Run security demo&quot;. Arcade walks the whole loop against a sample vulnerable app:</P>
          <ol className="mt-4 space-y-2.5">
            {[
              "Map — the mapper indexes the project and draws the attack surface.",
              "Attack — the attacker reproduces an exploit inside an isolated sandbox.",
              "Evidence — the exact request and response are captured as proof.",
              "Defend — the defender explains the root cause and ranks mitigations.",
              "Approve — you approve the proposed fix. Nothing changes until you do.",
              "Remediate — the fix and a regression test are written on a worktree.",
              "Test — the regression suite runs.",
              "Verify — an independent agent re-runs the original attack.",
              "Verified — the finding is marked verified only if the exploit no longer works.",
            ].map((s, i) => (
              <li key={i} className="flex gap-3 text-[15px] text-white/65">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-white/15 text-[12px] text-white/60">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>

          <H id="findings">Understanding findings</H>
          <P>
            A finding is a security-engineering artifact, not a chatbot reply. Each one opens onto Overview, Attack Path,
            Evidence, Code, Remediation, Verification and Timeline — so you can check Arcade&apos;s work at every step. Findings
            carry a severity and a status, and only reach <span className="text-emerald-300">Verified</span> when a separate agent
            can no longer break in.
          </P>

          <H id="concepts">The security loop</H>
          <P>
            The map feeds the attacker, the attacker&apos;s evidence feeds the defender, the defender&apos;s plan feeds the
            remediator, and the remediator&apos;s branch feeds an independent verifier. A human sits between the plan and the code,
            and between the verified fix and the merge.
          </P>

          <H id="agents">The five agents</H>
          <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
            {AGENTS.map(([name, role, body], i) => (
              <div key={name} className={`grid gap-1 px-5 py-4 sm:grid-cols-[150px_1fr] ${i ? "border-t border-white/[0.07]" : ""}`}>
                <div>
                  <div className="text-[15px] font-semibold text-white">{name}</div>
                  <div className="text-[12.5px] text-emerald-300/80">{role}</div>
                </div>
                <p className="text-[14px] leading-7 text-white/60">{body}</p>
              </div>
            ))}
          </div>

          <H id="evidence">Evidence &amp; verification</H>
          <P>
            Every finding has an evidence trail: how it was discovered, the exact request that reproduced it, the fix diff, and
            the verifier&apos;s result after re-running the attack. The verifier is independent and has no memory of the fix, so a
            change to the code is never mistaken for a fix. Evidence exports as JSON today, with SARIF and PDF on the roadmap.
          </P>

          <H id="approval">Human approval</H>
          <P>
            Arcade never performs a high-impact action on its own. Applying a fix, merging to main, or resetting the sandbox all
            stop and wait for you, with the full evidence one click away. Destructive actions get a distinct, louder prompt.
          </P>

          <H id="byo">Bring your own agent</H>
          <P>
            Arcade is not its own model. It orchestrates the coding agents you already use and gives them a security workflow to
            drive. Configure providers in the ADE sidebar.
          </P>
          <div className="mt-4 flex flex-wrap gap-2">
            {["Claude Code", "Codex", "Cursor CLI", "OpenCode", "Gemini CLI", "Custom agent"].map((p) => (
              <span key={p} className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[13px] text-white/70">{p}</span>
            ))}
          </div>

          <H id="cli">CLI</H>
          <P>The CLI lets an agent — or you — drive the environment. It prefers structured JSON so other agents can integrate.</P>
          <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
            {CLI_CMDS.map(([cmd, desc], i) => (
              <div key={cmd} className={`grid gap-1 px-5 py-3 sm:grid-cols-[240px_1fr] ${i ? "border-t border-white/[0.07]" : ""}`}>
                <code className="font-mono text-[13px] text-emerald-300">{cmd}</code>
                <span className="text-[14px] text-white/60">{desc}</span>
              </div>
            ))}
          </div>
          <Code>{`$ arcade scan .
$ arcade status --json
{
  "run": "scan-admin-authz",
  "phase": "verified",
  "agents": { "mapper": "done", "attacker": "done", "verifier": "done" },
  "findings": [{ "id": "ARC-001", "severity": "critical", "status": "verified" }]
}`}</Code>

          <H id="mcp">MCP</H>
          <P>
            Arcade exposes its workflow over the Model Context Protocol, so a coding agent like Claude Code can ask Arcade to scan
            its own changes and read the results back — instead of you operating everything by hand.
          </P>
          <div className="mt-5 overflow-hidden rounded-xl border border-white/10">
            {MCP_TOOLS.map(([tool, desc], i) => (
              <div key={tool} className={`grid gap-1 px-5 py-3 sm:grid-cols-[260px_1fr] ${i ? "border-t border-white/[0.07]" : ""}`}>
                <code className="font-mono text-[13px] text-violet-300">{tool}</code>
                <span className="text-[14px] text-white/60">{desc}</span>
              </div>
            ))}
          </div>

          <H id="architecture">System architecture</H>
          <P>Arcade is a control plane. Agents are modular, so demo agents can be swapped for real ones without changing the flow.</P>
          <Code>{ARCH}</Code>

          <H id="security">Sandboxing &amp; permissions</H>
          <P>
            The attacker never touches your machine or production. It runs inside a disposable sandbox with no network access, no
            real secrets, and a filesystem you can throw away. High-risk operations require your approval, and the target
            environment is always shown in the ADE.
          </P>
          <Callout tone="violet">
            Threat model: Arcade treats agent output and third-party code as untrusted, isolates each run, and keeps a human in
            the loop for anything that changes code or infrastructure.
          </Callout>

          <H id="orca">Inspired by Orca</H>
          <P>
            Arcade takes inspiration from Orca&apos;s Agent Development Environment model — bringing agents, isolated workspaces,
            terminals, browser tooling, diffs, and developer workflows into one environment — and specializes it for security
            engineering of AI-generated software. Arcade is a separate, security-focused project.
          </P>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href={SITE.orca.site} target="_blank" rel="noreferrer" className="rounded-lg border border-white/12 px-4 py-2.5 text-[14px] text-white/80 transition hover:bg-white/[0.05]">
              Orca ↗
            </a>
            <a href={SITE.orca.github} target="_blank" rel="noreferrer" className="rounded-lg border border-white/12 px-4 py-2.5 text-[14px] text-white/80 transition hover:bg-white/[0.05]">
              Orca on GitHub ↗
            </a>
            <a href={SITE.orca.docs} target="_blank" rel="noreferrer" className="rounded-lg border border-white/12 px-4 py-2.5 text-[14px] text-white/80 transition hover:bg-white/[0.05]">
              Orca docs ↗
            </a>
          </div>
        </article>
      </div>
    </div>
  );
}
