"use client";
import { useState } from "react";
import { Lock, RotateCcw, Trash2 } from "lucide-react";
import type { ArcadeState } from "@/lib/arcade/types";
import { Badge } from "../atoms";

export default function Browser({ state, onRequestReset }: { state: ArcadeState; onRequestReset: () => void }) {
  const [tab, setTab] = useState<"app" | "network">("app");
  const AFTER_ATTACK = ["attacked", "defending", "defended", "awaiting-fix-approval", "remediating", "testing", "verifying", "verified"];
  const reproduced = AFTER_ATTACK.includes(state.phase);

  return (
    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      {/* Browser chrome */}
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-ink-900">
        <div className="flex items-center gap-2 border-b border-white/[0.07] px-3 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/80" />
          <div className="ml-2 flex flex-1 items-center gap-2 rounded-md bg-black/40 px-3 py-1.5">
            <Lock className="h-3 w-3 text-emerald-400" />
            <span className="font-mono text-[11.5px] text-white/60">http://{state.environment.host}</span>
            <Badge tone="green" className="ml-auto">
              sandbox
            </Badge>
          </div>
          <button onClick={onRequestReset} title="Reset sandbox" className="grid h-7 w-7 place-items-center rounded-md text-white/40 transition hover:bg-white/[0.05] hover:text-white/80">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Rendered app */}
        <div className="min-h-[360px] bg-gradient-to-b from-[#0e0f12] to-[#0b0c0e] p-6">
          <div className="mx-auto max-w-md rounded-xl border border-white/[0.08] bg-ink-850 p-5">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold text-white">acme-commerce</span>
              <span className="text-[11px] text-white/40">signed in · standard</span>
            </div>
            <div className="mt-4 space-y-2">
              {["Order #4821 — $429.10", "Order #4822 — $88.00", "Order #4823 — $216.40"].map((o) => (
                <div key={o} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-3 py-2 text-[12.5px] text-white/70">
                  {o}
                  <span className="text-white/30">view</span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-red-500/25 bg-red-500/[0.05] px-3 py-2.5 text-[12px] text-red-200/90">
              Hidden route <span className="font-mono">/api/admin/export</span> is reachable by this standard account.
            </div>
          </div>
        </div>
      </div>

      {/* Inspector */}
      <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-ink-900">
        <div className="flex border-b border-white/[0.07] text-[12px]">
          {(["app", "network"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 capitalize transition ${tab === t ? "border-b-2 border-emerald-400 text-white" : "text-white/45 hover:text-white/80"}`}
            >
              {t === "network" ? "Network" : "Session"}
            </button>
          ))}
        </div>
        {tab === "app" ? (
          <div className="space-y-2.5 p-4 text-[12.5px]">
            <Row k="User" v="standard-tier customer" />
            <Row k="Session" v="valid · role: (none)" />
            <Row k="Cookie" v="session=eyJhbGciOi…q0v8" mono />
            <Row k="CSP" v="not set" warn />
            <Row k="HSTS" v="not set" warn />
          </div>
        ) : (
          <div className="font-mono text-[12px]">
            <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-white/[0.06] px-4 py-2 text-white/70">
              <span className="truncate">POST /api/admin/export</span>
              <span className={reproduced ? "text-red-400" : "text-white/40"}>{reproduced ? "200" : "—"}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-white/[0.06] px-4 py-2 text-white/60">
              <span className="truncate">GET /api/orders</span>
              <span className="text-emerald-400">200</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-2 px-4 py-2 text-white/60">
              <span className="truncate">POST /api/auth/verify</span>
              <span className="text-emerald-400">200</span>
            </div>
            {reproduced && (
              <div className="border-t border-white/[0.07] bg-red-500/[0.05] px-4 py-2.5 text-[11.5px] text-red-200/90">
                admin/export returned 200 for a standard session — see Evidence.
              </div>
            )}
          </div>
        )}
        <div className="border-t border-white/[0.07] p-3">
          <button
            onClick={onRequestReset}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-500/25 bg-red-500/[0.05] px-3 py-2 text-[12px] font-medium text-red-200/90 transition hover:bg-red-500/[0.1]"
          >
            <Trash2 className="h-3.5 w-3.5" /> Reset sandbox database
          </button>
          <p className="mt-1.5 text-center text-[10.5px] text-white/35">Destructive — asks for your approval first.</p>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, mono, warn }: { k: string; v: string; mono?: boolean; warn?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] pb-2 last:border-0">
      <span className="text-white/45">{k}</span>
      <span className={`${mono ? "font-mono" : ""} ${warn ? "text-amber-300" : "text-white/75"}`}>{v}</span>
    </div>
  );
}
