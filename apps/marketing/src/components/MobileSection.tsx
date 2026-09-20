"use client";
import { useState } from "react";
import { ArrowLeft, ArrowUp, Check, GitBranch, Mic } from "lucide-react";
import { AndroidIcon, AppleIcon } from "@arcade/ui/components/icons";
import Reveal from "./Reveal";
import { SITE } from "@arcade/ui/lib/site";

export default function MobileSection() {
  const [state, setState] = useState<"pending" | "approved" | "rejected">("pending");
  return (
    <section className="mx-auto grid max-w-[1440px] items-center gap-16 px-6 py-28 md:px-10 lg:grid-cols-[1fr_auto]">
      <Reveal>
        <h2 className="h-display text-[40px] font-medium md:text-[64px]">Approve fixes<br />from your phone.</h2>
        <p className="mt-8 max-w-[760px] text-[20px] leading-9 text-white/50 md:text-[24px]">
          Pair Arcade with the companion app to watch agents attack and fix in real time, read the evidence, and approve high-impact changes when you are away from your desk.
        </p>
        <div className="mt-10 flex max-w-[560px] flex-col gap-3">
          <a href={SITE.appStore} className="flex items-center justify-center gap-3 rounded-xl bg-white py-4 text-[17px] font-medium text-black transition hover:bg-white/90">
            <AppleIcon className="h-5 w-5" /> Open App Store
          </a>
          <a href={SITE.apk} className="flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] py-4 text-[17px] font-medium transition hover:bg-white/[0.06]">
            <AndroidIcon className="h-5 w-5 text-emerald-400" /> Android APK
          </a>
        </div>
      </Reveal>

      <Reveal delay={0.15} className="mx-auto">
        <div className="h-[720px] w-[350px] rounded-[46px] border-[3px] border-white/15 bg-ink-950 p-2 shadow-[0_40px_120px_-40px_rgba(255,255,255,0.15)]">
          <div className="flex h-full flex-col overflow-hidden rounded-[38px] bg-ink-900">
            <div className="flex items-center gap-3 px-5 pb-3 pt-9">
              <ArrowLeft className="h-4 w-4 text-white/60" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">fix/orders-sqli</div>
                <div className="flex items-center gap-1.5 text-[11px] text-white/50"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> 5 agents · 1 awaiting approval</div>
              </div>
              <GitBranch className="h-4 w-4 text-white/50" />
            </div>
            <div className="flex gap-5 border-b border-white/[0.07] px-5 text-[12px]">
              <span className="border-b-2 border-white pb-2 text-white">verifier</span><span className="pb-2 text-white/45">evidence</span><span className="pb-2 text-white/45">diff</span>
            </div>
            <div className="flex-1 space-y-2 overflow-hidden p-4 font-mono text-[10.5px] leading-[1.7]">
              <div><span className="text-emerald-400">$</span> sentinel verify A-0142</div>
              <div><span className="text-violet-400">●</span> Replay original exploit</div>
              <div className="pl-3 text-white/40">└ 400 Bad Request · 0 rows</div>
              <div><span className="text-violet-400">●</span> 212 mutated payloads</div>
              <div className="pl-3 text-white/40">└ 0 successful</div>
              <div><span className="text-violet-400">●</span> Regression suite</div>
              <div className="pl-3 text-white/40">└ 148 passed</div>
              <div className="text-emerald-400">✓ Fix verified</div>
            </div>
            <div className="mx-3 mb-3 rounded-2xl border border-white/12 bg-ink-800 p-4">
              <div className="text-[13px] font-medium">{state === "pending" ? "Approve merge to main?" : state === "approved" ? "Approved. Merging…" : "Changes requested"}</div>
              <p className="mt-1 text-[11.5px] leading-4 text-white/50">3 files changed. Exploit A-0142 no longer reproduces.</p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setState("rejected")} className="flex-1 rounded-lg border border-white/12 py-2 text-[12px] text-white/75">Request changes</button>
                <button onClick={() => setState("approved")} className={`flex flex-1 items-center justify-center gap-1 rounded-lg py-2 text-[12px] font-medium transition-colors ${state === "approved" ? "bg-emerald-400 text-black" : "bg-white text-black"}`}>
                  {state === "approved" && <Check className="h-3.5 w-3.5" strokeWidth={3} />} Approve
                </button>
              </div>
            </div>
            <div className="mx-3 mb-4 flex items-center gap-2 rounded-xl bg-white/[0.05] px-3 py-2.5 text-[12px] text-white/40">
              <span className="flex-1">Ask an agent…</span>
              <Mic className="h-4 w-4" />
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10"><ArrowUp className="h-3.5 w-3.5" /></span>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}