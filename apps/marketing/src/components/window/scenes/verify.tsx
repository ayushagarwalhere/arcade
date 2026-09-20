"use client";
import { useEffect, useState } from "react";
import { Check, Lock } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";
import TerminalView, { type TLine } from "../Terminal";
import { Chip, EvidenceTrail, PanelTitle } from "../ui";
import type { Scene } from "../AppWindow";

const LINES: TLine[] = [
  { k: "cmd", t: "sentinel verify A-0142 --replay" },
  { k: "info", t: "Rebuilding sandbox from fix/orders-sqli @ 3f9a1c2" },
  { k: "info", t: "Replaying the original exploit" },
  { k: "sub", t: "payload: 1' OR '1'='1" },
  { k: "sub", t: "400 Bad Request · 0 rows returned" },
  { k: "info", t: "Regression suite" },
  { k: "sub", t: "148 passed · 0 failed" },
  { k: "info", t: "Re-attacking with 212 mutated payloads" },
  { k: "sub", t: "0 successful" },
  { k: "ok", t: "Fix verified. The exploit no longer reproduces." },
];

function Center() {
  const count = useReveal(LINES.length, 480);
  const done = count >= LINES.length;
  const [approved, setApproved] = useState(false);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setApproved(true), 1800);
    return () => clearTimeout(t);
  }, [done]);

  return (
    <div className="relative h-full overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3 text-[13px] text-white/60">
        <span>verifier <span className="mx-1.5 text-white/30">/</span> <span className="text-white">replay</span></span>
        <span className="text-[11px] text-white/35">INDEPENDENT</span>
      </div>
      <TerminalView lines={LINES} count={count} />
      <div className="absolute inset-x-5 bottom-5 rounded-2xl border border-white/12 bg-ink-800/95 p-4 backdrop-blur transition-all duration-700" style={{ opacity: done ? 1 : 0, transform: done ? "none" : "translateY(16px)" }}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300"><Lock className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-medium text-white">Human approval required</div>
            <p className="mt-0.5 text-[13px] leading-5 text-white/55">Merge fix/orders-sqli into main · 3 files · exploit A-0142 verified fixed</p>
          </div>
        </div>
        <div className="mt-3.5 flex justify-end gap-2">
          <button className="rounded-lg border border-white/12 px-3.5 py-2 text-[13px] text-white/75">Request changes</button>
          <button className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors duration-500 ${approved ? "bg-emerald-400 text-black" : "bg-white text-black"}`}>
            {approved ? (<><Check className="h-4 w-4" strokeWidth={3} /> Approved</>) : "Approve & merge"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Right() {
  return (
    <div>
      <PanelTitle title="Finding A-0142" right={<Chip tone="green">Fixed</Chip>} />
      <div className="px-5 pt-1"><EvidenceTrail done={5} compact /></div>
      <div className="mx-5 mt-5 flex gap-2 text-[12px]">
        {["SARIF", "JSON", "PDF"].map((f) => (
          <span key={f} className="rounded-md border border-white/12 px-2.5 py-1.5 text-white/70">Export {f}</span>
        ))}
      </div>
    </div>
  );
}

export const verifyScene: Scene = {
  id: "verify",
  label: "Verify & approve",
  caption: "A separate verification agent re-runs the original attack. Nothing merges until you approve it.",
  tabs: [{ label: "verifier · replay", icon: "terminal" }, { label: "evidence", icon: "shield" }],
  rightTab: 3,
  Center,
  Right,
};