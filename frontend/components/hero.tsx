"use client";
import { useEffect, useRef } from "react";
import { ShieldCheck } from "lucide-react";
import { gsap } from "@/lib/gsap";
import DownloadActions from "./DownloadActions";

export default function Hero() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from(".hero-in", { opacity: 0, y: 28, duration: 0.9, stagger: 0.12, ease: "power3.out", delay: 0.1 });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={root} className="relative overflow-hidden px-6 pb-16 pt-24 text-center md:pt-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(255,255,255,0.07),transparent)]" />
      <div className="relative mx-auto max-w-[1200px]">
        <div className="hero-in mx-auto flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1.5 pl-3 pr-4 text-[14px] text-white/70">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          Meet Sentinel, the security team built into your IDE
        </div>
        <h1 className="hero-in h-display mt-8 text-[44px] font-medium sm:text-[64px] lg:text-[92px]">
          Ship 100x with the<br className="hidden sm:block" /> secure agent IDE
        </h1>
        <p className="hero-in mx-auto mt-8 max-w-[860px] text-[18px] leading-[1.55] text-white/55 md:text-[24px]">
          Run Claude Code, Codex, and any coding agent in parallel. Sentinel attacks what they build, fixes what breaks, and proves the fix worked before anything reaches production.
        </p>
        <div className="hero-in mt-12">
          <DownloadActions />
        </div>
      </div>
    </section>
  );
}