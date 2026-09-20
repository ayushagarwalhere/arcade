"use client";
import { useReveal } from "@/hooks/useReveal";
import TerminalView, { type TLine } from "../Terminal";
import { PanelTitle, EvidenceTrail, Chip } from "../ui";
import type { Scene } from "../AppWindow";

const LINES: TLine[] = [
  { k: "cmd", t: "sentinel attack --target localhost:3000 --sandbox" },
  { k: "info", t: "Spawning isolated sandbox" },
  { k: "sub", t: "network: none · filesystem: overlay · secrets: stripped" },
  { k: "info", t: "Loading security map (14 endpoints, 3 high-risk paths)" },
  { k: "info", t: "Probing GET /api/orders?id=" },
  { k: "sub", t: "payload: 1' OR '1'='1" },
  { k: "sub", t: "200 OK · 4,312 rows returned (expected: 1)" },
  { k: "warn", t: "Response leaks other customers' orders" },
  { k: "info", t: "Saving reproduction" },
  { k: "sub", t: "evidence/A-0142.json · 3 requests · 1 replay script" },
  { k: "err", t: "CRITICAL  SQL injection in /api/orders (CWE-89)" },
  { k: "plain", t: "Exploit is reproducible. Handing off to defender agent." },
];

function Center() {
  const count = useReveal(LINES.length, 520);
  return (
    <div className="h-full overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3 text-[13px] text-white/60">
        <span>attacker <span className="mx-1.5 text-white/30">/</span> <span className="text-white">sandbox-7f2c</span></span>
        <span className="text-[11px] text-white/35">ISOLATED</span>
      </div>
      <TerminalView lines={LINES} count={count} />
    </div>
  );
}

function Right() {
  return (
    <div>
      <PanelTitle title="Finding A-0142" right={<Chip tone="red">Critical</Chip>} />
      <div className="mx-5 mb-4 rounded-xl bg-white/[0.04] px-4 py-3 text-[13px] leading-5 text-white/80">
        SQL injection lets anyone read every order without logging in.
      </div>
      <div className="px-5 pb-2 text-[12px] font-medium text-white/50">Evidence trail</div>
      <div className="px-5 pt-1"><EvidenceTrail done={2} compact /></div>
    </div>
  );
}

export const attackScene: Scene = {
  id: "attack",
  label: "Attack in a sandbox",
  caption: "The attacker agent tries to break your app inside an isolated environment, and only reports what it can prove.",
  tabs: [{ label: "attacker · sandbox-7f2c", icon: "terminal" }, { label: "A-0142.json", icon: "file" }],
  rightTab: 3,
  Center,
  Right,
};