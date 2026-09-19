"use client";
import Link from "next/link";
import { useState } from "react";
import { Download, Menu, SquareTerminal, X } from "lucide-react";
import Logo from "./logo";
import { GithubIcon } from "./icons";
import { SITE } from "@/lib/site";

const LINKS = [
  { href: "/arcade", label: "ADE" },
  { href: "/docs", label: "Docs" },
  { href: "/changelog", label: "Changelog" },
  { href: "/enterprise", label: "Enterprise" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-black/80 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center justify-between px-6 md:px-10">
        <div className="flex items-center gap-10">
          <Logo />
          <nav className="hidden items-center gap-8 md:flex">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="text-[15px] font-medium text-white/80 transition hover:text-white"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <a
            href={SITE.github}
            className="hidden items-center gap-2 text-[15px] font-medium text-white/70 transition hover:text-white sm:flex"
          >
            <GithubIcon className="h-[18px] w-[18px]" />
            GitHub
          </a>
          <Link
            href={SITE.ade}
            className="hidden items-center gap-2 rounded-lg border border-white/12 px-3.5 py-2.5 text-[15px] font-medium text-white/85 transition hover:bg-white/[0.06] sm:flex"
          >
            <SquareTerminal className="h-4 w-4 text-emerald-400" /> Open ADE
          </Link>
          <Link
            href="/#download"
            className="flex items-center gap-2 rounded-lg bg-white px-4 py-2.5 text-[15px] font-medium text-black transition hover:bg-white/90"
          >
            <Download className="h-4 w-4" /> Download
          </Link>
          <button
            className="text-white md:hidden"
            aria-label="Menu"
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-white/[0.07] px-6 py-4 md:hidden">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block py-2.5 text-[15px] text-white/80"
            >
              {l.label}
            </Link>
          ))}
          <a href={SITE.github} className="block py-2.5 text-[15px] text-white/80">
            GitHub
          </a>
        </nav>
      )}
    </header>
  );
}
