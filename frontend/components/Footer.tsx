import Link from "next/link";
import Logo from "./logo";
import { SITE } from "@/lib/site";

const COLS = [
  {
    title: "Product",
    links: [
      ["Download", "/#download"],
      ["Changelog", "/changelog"],
      ["Enterprise", "/enterprise"],
      ["Docs", "/docs"],
    ],
  },
  {
    title: "Community",
    links: [
      ["GitHub", SITE.github],
      ["Discord", SITE.discord],
      ["X", SITE.x],
    ],
  },
  {
    title: "Company",
    links: [
      ["About", "/"],
      ["Privacy", "/"],
      ["Terms", "/"],
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
            The security control plane between AI-generated code and production.
            Build at AI speed, ship without AI risk.
          </p>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <h4 className="text-[15px] font-semibold">{c.title}</h4>
            <ul className="mt-6 space-y-4">
              {c.links.map(([label, href]) => (
                <li key={label}>
                  {href.startsWith("http") ? (
                    <a
                      href={href}
                      className="text-[16px] text-white/55 transition hover:text-white"
                    >
                      {label}
                    </a>
                  ) : (
                    <Link
                      href={href}
                      className="text-[16px] text-white/55 transition hover:text-white"
                    >
                      {label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-[1440px] border-t border-white/[0.07] px-6 py-6 text-sm text-white/35 md:px-10">
        © 2026 Arcade. Built for the hackathon.
      </div>
    </footer>
  );
}
