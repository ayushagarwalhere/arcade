import { ArrowUpRight, Monitor, SquareTerminal, TerminalSquare } from "lucide-react";
import { AppleIcon } from "@arcade/ui/components/icons";
import { SITE } from "@arcade/ui/lib/site";
import Reveal from "./Reveal";

const PLATFORMS = [
  { os: "Windows", detail: "x64 · portable + installer", Icon: Monitor, href: SITE.releases },
  { os: "macOS", detail: "Apple Silicon", Icon: AppleIcon, href: SITE.releases },
  { os: "macOS", detail: "Intel", Icon: AppleIcon, href: SITE.releases },
  { os: "Linux", detail: "AppImage", Icon: TerminalSquare, href: SITE.releases },
  { os: "Linux", detail: ".deb", Icon: TerminalSquare, href: SITE.releases },
];

export default function DownloadSection() {
  return (
    <section id="download" className="mx-auto max-w-[1440px] scroll-mt-24 border-t border-white/[0.07] px-6 py-28 md:px-10">
      <Reveal>
        <h2 className="h-display text-[40px] font-medium md:text-[56px]">Download Arcade</h2>
        <p className="mt-5 max-w-2xl text-[19px] leading-8 text-white/55">
          Desktop builds ship through GitHub Releases. No installer yet? Open the ADE in your browser, or run it from source in a
          couple of commands.
        </p>
      </Reveal>

      <Reveal delay={0.05} className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PLATFORMS.map((p) => (
          <a
            key={`${p.os}-${p.detail}`}
            href={p.href}
            {...(p.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
            className="group flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-5 transition hover:border-white/25 hover:bg-white/[0.04]"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.05] text-white/80">
              <p.Icon className="h-5 w-5" />
            </span>
            <span className="flex-1">
              <span className="block text-[17px] font-semibold">{p.os}</span>
              <span className="block text-[14px] text-white/45">{p.detail}</span>
            </span>
            <span className="text-[13px] font-medium text-white/45 group-hover:text-white/90">Releases</span>
          </a>
        ))}
        <a
          href={SITE.releases}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/12 px-5 py-5 text-[15px] text-white/55 transition hover:border-white/25 hover:text-white"
        >
          View all releases <ArrowUpRight className="h-4 w-4" />
        </a>
      </Reveal>

      <Reveal delay={0.1} className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
          <h3 className="text-[16px] font-semibold">Install from source</h3>
          <pre className="scrollbar-thin mt-4 overflow-x-auto rounded-xl border border-white/10 bg-ink-900 p-4 font-mono text-[13.5px] leading-7 text-white/80">
{`git clone ${SITE.github}.git
cd arcade/frontend
npm install
npm run dev   # http://localhost:3000`}
          </pre>
        </div>
        <div className="flex flex-col justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-6">
          <SquareTerminal className="h-6 w-6 text-emerald-400" />
          <h3 className="mt-3 text-[16px] font-semibold">Try it right now</h3>
          <p className="mt-2 text-[14px] leading-7 text-white/55">
            The ADE runs entirely in your browser. Watch the five agents map, attack, fix and verify a sample app.
          </p>
          <a
            href={SITE.ade}
            className="mt-4 inline-flex w-fit items-center gap-2 rounded-lg bg-emerald-400 px-4 py-2.5 text-[14px] font-semibold text-black transition hover:bg-emerald-300"
          >
            <SquareTerminal className="h-4 w-4" /> Open the ADE
          </a>
        </div>
      </Reveal>
    </section>
  );
}
