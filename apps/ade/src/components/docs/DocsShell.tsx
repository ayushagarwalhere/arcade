"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Search, SquareTerminal, X } from "lucide-react";
import { LogoMark } from "@arcade/ui/components/logo";
import { GithubIcon } from "@arcade/ui/components/icons";
import { SITE } from "@arcade/ui/lib/site";
import { DOCS_BASE, DOCS_VERSION, NAV, docHref, slugFromPath } from "@/lib/docs/nav";
import DocsSearch from "./DocsSearch";
import ThemeToggle from "@arcade/ui/components/ThemeToggle";

function SidebarNav({ current, onNavigate }: { current: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Docs" className="space-y-7">
      {NAV.map((group) => (
        <div key={group.title}>
          <div className="px-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/35">{group.title}</div>
          <ul className="mt-2 space-y-px">
            {group.items.map((item) => {
              const active = item.slug === current;
              return (
                <li key={item.slug}>
                  <Link
                    href={docHref(item.slug)}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`block rounded-md px-2.5 py-[5px] text-[13.5px] leading-6 transition ${
                      active ? "bg-emerald-400/[0.09] font-medium text-emerald-200" : "text-white/55 hover:bg-white/[0.04] hover:text-white/90"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export default function DocsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const current = slugFromPath(pathname);
  const scroller = useRef<HTMLDivElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawer, setDrawer] = useState<string | null>(null);
  // The drawer closes itself on navigation: it is only open for the path it was opened on.
  const drawerOpen = drawer === pathname;

  // The docs scroll inside their own container (the /arcade layout pins the
  // viewport for the workbench), so a new page has to be scrolled to the top by hand.
  useEffect(() => {
    if (!window.location.hash) scroller.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((o) => !o);
      } else if (e.key === "/" && !typing && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={scroller} className="page-ground scrollbar-thin h-full overflow-y-auto scroll-smooth bg-ink-950">
      <header className="sticky top-0 z-40 border-b border-white/[0.07] bg-ink-950/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 md:px-6">
          <button className="-ml-1 grid h-8 w-8 place-items-center rounded-md text-white/70 hover:bg-white/[0.06] lg:hidden" aria-label="Open navigation" onClick={() => setDrawer(pathname)}>
            <Menu className="h-[18px] w-[18px]" />
          </button>
          <Link href={DOCS_BASE} className="flex items-center gap-2 text-white">
            <LogoMark className="h-6 w-6" />
            <span className="text-[15px] font-semibold tracking-tight">Arcade</span>
            <span className="text-[15px] text-white/40">Docs</span>
          </Link>
          <span className="hidden rounded-full border border-white/10 px-2 py-px font-mono text-[11px] text-white/45 sm:block">{DOCS_VERSION}</span>

          <button
            onClick={() => setSearchOpen(true)}
            className="ml-auto flex h-8 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 text-[13px] text-white/45 transition hover:border-white/20 hover:text-white/70 md:ml-6 md:w-[260px]"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden md:block">Search the docs</span>
            <kbd className="ml-auto hidden rounded border border-white/12 px-1.5 text-[10.5px] text-white/40 md:block">Ctrl K</kbd>
          </button>

          <div className="flex items-center gap-1 md:ml-auto">
            <a href={SITE.github} target="_blank" rel="noreferrer" aria-label="GitHub" className="hidden h-8 w-8 place-items-center rounded-md text-white/55 transition hover:bg-white/[0.06] hover:text-white sm:grid">
              <GithubIcon className="h-[17px] w-[17px]" />
            </a>
            <ThemeToggle variant="site" className="!h-8 !w-8 !rounded-md" />
            <Link href={SITE.ade} className="flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[13px] font-medium text-black transition hover:bg-white/90">
              <SquareTerminal className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Open</span> Arcade
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1440px] px-4 md:px-6">
        <aside className="hidden w-[250px] shrink-0 lg:block">
          <div className="scrollbar-none sticky top-14 h-[calc(100vh-3.5rem)] overflow-y-auto pb-12 pr-4 pt-8">
            <SidebarNav current={current} />
          </div>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDrawer(null)} />
          <div className="scrollbar-thin absolute inset-y-0 left-0 w-[min(300px,86vw)] overflow-y-auto border-r border-white/10 bg-ink-950 p-4">
            <div className="mb-6 flex items-center justify-between">
              <span className="flex items-center gap-2 text-[15px] font-semibold text-white">
                <LogoMark className="h-6 w-6" /> Docs
              </span>
              <button aria-label="Close navigation" onClick={() => setDrawer(null)} className="grid h-8 w-8 place-items-center rounded-md text-white/60 hover:bg-white/[0.06]">
                <X className="h-[18px] w-[18px]" />
              </button>
            </div>
            <SidebarNav current={current} onNavigate={() => setDrawer(null)} />
          </div>
        </div>
      )}

      {searchOpen && <DocsSearch onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
