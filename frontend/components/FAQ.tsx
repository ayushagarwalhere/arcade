"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import Reveal from "./Reveal";

const FAQS = [
  ["What is Arcade?", "Arcade is an agent IDE with a security team built in. You build with Claude Code, Codex or any coding agent. Sentinel, our multi-agent system, maps your app, attacks it in a sandbox, writes the fix, and re-runs the attack to prove the fix worked."],
  ["How is this different from asking a model to review my code?", "A review can flag something that might be wrong. Security means proving it is exploitable, fixing it, and proving the fix works. Arcade does all of that and keeps an evidence trail so you can check its work."],
  ["Does Sentinel make decisions on its own?", "No. High-impact actions, like merging a fix or changing production configuration, wait for your explicit approval. Agents can propose and prepare. You decide."],
  ["Where do the attacks run?", "In an isolated sandbox with no network access, no real secrets and a disposable filesystem. Attacks never run against your production systems."],
  ["Which coding agents does it work with?", "Claude Code, Codex and others. Arcade runs them in parallel worktrees and gives them a CLI and MCP tools, so they can ask Sentinel to scan their own changes."],
  ["What is in the evidence trail?", "For every finding: how it was discovered, the exact request that reproduced it, the fix diff, and the verifier's result after re-running the attack. You can export it as SARIF, JSON or PDF."],
  ["Can it scan a project I already have?", "Yes. Point Arcade at any local folder or repository and Sentinel will build a security map, then test it the same way."],
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="mx-auto max-w-[1440px] border-t border-white/[0.07] px-6 py-28 md:px-10">
      <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
        <Reveal><h2 className="h-display text-[40px] font-medium md:text-[64px]">Frequently<br />asked questions</h2></Reveal>
        <div>
          {FAQS.map(([q, a], i) => {
            const isOpen = open === i;
            return (
              <div key={q} className="border-b border-white/[0.09]">
                <button onClick={() => setOpen(isOpen ? null : i)} aria-expanded={isOpen} className="flex w-full items-center justify-between gap-6 py-6 text-left text-[18px] font-medium">
                  {q}
                  <ChevronDown className={`h-5 w-5 shrink-0 text-white/50 transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                </button>
                <div className={`grid transition-all duration-300 ${isOpen ? "grid-rows-[1fr] pb-6" : "grid-rows-[0fr]"}`}>
                  <p className="overflow-hidden text-[17px] leading-8 text-white/55">{a}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}