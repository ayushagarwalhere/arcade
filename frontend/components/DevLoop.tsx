"use client";
import { useEffect, useRef, useState } from "react";
import { Box, FileSearch, Layers, ListChecks, Sparkles, SquarePen, Terminal, Workflow } from "lucide-react";
import { gsap } from "@/lib/gsap";
import Reveal from "./Reveal";
import {
  EditorPanel, EvidencePanel, FindingsPanel, OrchestrationPanel, SandboxPanel, ShipPanel, TerminalPanel, WorkspacesPanel,
} from "./devloop/panels";

const TABS = [
  { id: "workspaces", label: "Workspaces", Icon: Layers, Panel: WorkspacesPanel, title: "Every agent gets its own worktree", body: "Run Claude Code, Codex and Sentinel's security agents side by side. Each one works in an isolated git worktree, so nobody overwrites anybody else's changes." },
  { id: "orchestration", label: "Orchestration", Icon: Workflow, Panel: OrchestrationPanel, title: "A security team that hands off to itself", body: "Mapper, attacker, defender, remediation and verifier agents pass work along in order. Anything high-impact stops and waits for you." },
  { id: "sandbox", label: "Sandbox", Icon: Box, Panel: SandboxPanel, title: "Attacks never touch your machine", body: "The attacker agent works inside a disposable environment: no network access, no real secrets, and a filesystem you can throw away." },
  { id: "terminal", label: "Terminal", Icon: Terminal, Panel: TerminalPanel, title: "One terminal for your agents and ours", body: "Watch your coding agent write code in one pane while Sentinel re-scans every change in the next, and feeds findings back with repro steps." },
  { id: "findings", label: "Findings", Icon: ListChecks, Panel: FindingsPanel, title: "Every finding, tracked until it's fixed", body: "Findings become tasks with a severity, an owner and a status. They only close when the verifier can no longer break in." },
  { id: "editor", label: "Editor", Icon: SquarePen, Panel: EditorPanel, title: "Vulnerabilities flagged where you write them", body: "See proof of exploitability right on the line, and apply a fix that has already been tested against the original attack." },
  { id: "evidence", label: "Evidence", Icon: FileSearch, Panel: EvidencePanel, title: "A trail for every finding", body: "How it was discovered, reproduced, fixed and verified, exportable as SARIF, JSON or PDF for teammates and auditors." },
  { id: "ship", label: "Ship with AI", Icon: Sparkles, Panel: ShipPanel, title: "Ship when it's actually safe", body: "The ship gate opens only when every critical finding is verified fixed and a human has signed off." },
];

export default function DevLoop() {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const t = TABS[active];

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(".dl-left > *", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, stagger: 0.08, ease: "power3.out" });
      gsap.fromTo(".dl-card", { opacity: 0, y: 28, scale: 0.985 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "power3.out" });
      gsap.fromTo("[data-stagger]", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.45, stagger: 0.07, delay: 0.25, ease: "power2.out" });
    }, root);
    return () => ctx.revert();
  }, [active]);

  return (
    <section ref={root} className="mx-auto max-w-[1440px] px-6 py-28 md:px-10">
      <Reveal>
        <h2 className="h-display text-center text-[40px] font-medium md:text-[64px]">Your dev loop, secured.</h2>
      </Reveal>
      <Reveal delay={0.1} className="mt-12 flex flex-wrap justify-center gap-2">
        {TABS.map((tab, i) => (
          <button
            key={tab.id}
            onClick={() => setActive(i)}
            className={`flex items-center gap-2.5 rounded-xl px-5 py-3 text-[15px] font-medium transition ${i === active ? "bg-white text-black" : "text-white/55 hover:bg-white/[0.06] hover:text-white"}`}
          >
            <tab.Icon className="h-[18px] w-[18px]" /> {tab.label}
          </button>
        ))}
      </Reveal>

      <div className="mt-14 grid items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.3fr)]">
        <div className="dl-left lg:pr-10">
          <h3 className="h-display text-[34px] font-medium md:text-[44px]">{t.label}</h3>
          <p className="mt-4 text-[20px] font-medium leading-7 text-white/85">{t.title}</p>
          <p className="mt-4 max-w-lg text-[18px] leading-8 text-white/50">{t.body}</p>
        </div>
        <div className="dl-card rounded-[28px] border border-white/[0.09] bg-white/[0.02] p-5 md:p-10">
          <div key={t.id} className="min-h-[380px]"><t.Panel /></div>
        </div>
      </div>
    </section>
  );
}