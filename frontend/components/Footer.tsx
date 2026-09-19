import Link from "next/link";
import Logo from "./logo";
import { SITE } from "@/lib/site";

const COLS = [
  {
    title: "Product",
    links: [
      ["Open the ADE", SITE.ade],
      ["Download", "/#download"],
      ["Changelog", "/changelog"],
      ["Enterprise", "/enterprise"],
    ],
  },
  {
    title: "Develop",
    links: [
      ["Documentation", "/docs"],
      ["GitHub", SITE.github],
      ["Releases", SITE.releases],
      ["Issues", SITE.issues],
    ],
  },
  {
    title: "Inspired by Orca",
    links: [
      ["Orca", SITE.orca.site],
      ["Orca on GitHub", SITE.orca.github],
      ["Orca docs", SITE.orca.docs],
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-white/[0.07]">
      <div className="mx-auto grid max-w-[1440px] gap-12 px-6 py-20 md:grid-cols-[1.4fr_1fr_1fr_1fr] md:px-10">
        <div>
          <Logo />
          <p className="mt-6 max-w-sm text-[17px] leading-7 text-white/55">
            The security control plane between AI-generated code and production. Build at AI speed, ship at security confidence.
          </p>
          <p className="mt-5 max-w-sm text-[13px] leading-6 text-white/40">
            Arcade takes inspiration from Orca&apos;s Agent Development Environment — agents, isolated workspaces, terminals, browser
            tooling and diffs in one place — and specializes it for security engineering. Arcade is a separate, security-focused project.
          </p>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <h4 className="text-[15px] font-semibold">{c.title}</h4>
            <ul className="mt-6 space-y-4">
              {c.links.map(([label, href]) => (
                <li key={label}>
                  {href.startsWith("http") ? (
                    <a href={href} target="_blank" rel="noreferrer" className="text-[16px] text-white/55 transition hover:text-white">
                      {label}
                    </a>
                  ) : (
                    <Link href={href} className="text-[16px] text-white/55 transition hover:text-white">
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] px-6 py-6 text-sm text-white/35 md:px-10">
        <span>© 2026 Arcade. A security ADE for AI-generated software.</span>
        <span>
          Inspired by{" "}
          <a href={SITE.orca.site} target="_blank" rel="noreferrer" className="text-white/55 transition hover:text-white">
            Orca
          </a>{" "}
          — the open-source Agent Development Environment.
        </span>
      </div>
    </footer>
  );
}
