"use client";
import { useEffect, useState } from "react";
import { ChevronDown, Download } from "lucide-react";
import { DiscordIcon, GithubIcon } from "./icons";
import { SITE } from "@/lib/site";

type Plat = "windows" | "macArm" | "macIntel" | "linux";
const PLATS: { id: Plat; label: string; short: string }[] = [
  { id: "windows", label: "Windows", short: "Windows" },
  { id: "macArm", label: "macOS", short: "Apple Silicon" },
  { id: "macIntel", label: "macOS", short: "Intel" },
  { id: "linux", label: "Linux", short: "Linux" },
];

function detect(): Plat {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("android")) return "windows";
  if (ua.includes("mac")) return "macArm";
  if (ua.includes("linux")) return "linux";
  return "windows";
}

export default function DownloadActions({
  secondary = "github",
}: {
  secondary?: "github" | "discord";
}) {
  const [plat, setPlat] = useState<Plat>("windows");
  const [open, setOpen] = useState(false);
  useEffect(() => setPlat(detect()), []);

  const current = PLATS.find((p) => p.id === plat)!;
  const others = PLATS.filter((p) => p.id !== plat);

  return (
    <div id="download" className="flex flex-col items-center scroll-mt-32">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <a
          href={SITE.downloads[plat]}
          className="flex items-center gap-3 rounded-xl bg-white px-7 py-4 text-[17px] font-medium text-black transition hover:bg-white/90"
        >
          <Download className="h-5 w-5" /> Download for {current.label}
        </a>
        {secondary === "github" ? (
          <a
            href={SITE.github}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-black px-7 py-4 text-[17px] font-medium text-white transition hover:bg-white/[0.06]"
          >
            <GithubIcon className="h-5 w-5" /> View on GitHub
          </a>
        ) : (
          <a
            href={SITE.discord}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-black px-7 py-4 text-[17px] font-medium text-white transition hover:bg-white/[0.06]"
          >
            <DiscordIcon className="h-5 w-5" /> Join the Discord
          </a>
        )}
      </div>
      <div className="relative mt-5">
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-[14px] text-white/50 transition hover:text-white/80"
        >
          Also for {others.map((o) => o.short).join(" · ")}
          <ChevronDown
            className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <div className="absolute left-1/2 top-8 z-20 w-56 -translate-x-1/2 rounded-xl border border-white/10 bg-ink-800 p-1.5 text-left shadow-2xl animate-fade-in">
            {PLATS.map((p) => (
              <a
                key={p.id}
                href={SITE.downloads[p.id]}
                className="block rounded-lg px-3 py-2 text-sm text-white/80 hover:bg-white/[0.07]"
              >
                {p.label} <span className="text-white/40">· {p.short}</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
