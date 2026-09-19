import { ArrowUpRight } from "lucide-react";
import { SITE } from "@/lib/site";
import Reveal from "./Reveal";

export default function OrcaStrip() {
  return (
    <section className="mx-auto max-w-[1440px] px-6 py-16 md:px-10">
      <Reveal className="rounded-3xl border border-white/10 bg-white/[0.02] px-7 py-8 md:px-10">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">Built on ADE principles</div>
            <h3 className="mt-2 text-[22px] font-medium text-white md:text-[26px]">Inspired by Orca</h3>
            <p className="mt-3 max-w-2xl text-[16px] leading-7 text-white/55">
              Arcade takes inspiration from Orca&apos;s Agent Development Environment — agents, isolated worktrees, terminals,
              browser tooling and diffs in one place — and specializes it for the security engineering of AI-generated software.
              Arcade is a separate, security-focused project.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              ["Orca", SITE.orca.site],
              ["GitHub", SITE.orca.github],
              ["Docs", SITE.orca.docs],
            ].map(([label, href]) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 rounded-xl border border-white/12 px-4 py-2.5 text-[14px] font-medium text-white/80 transition hover:bg-white/[0.06]"
              >
                {label} <ArrowUpRight className="h-4 w-4" />
              </a>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
