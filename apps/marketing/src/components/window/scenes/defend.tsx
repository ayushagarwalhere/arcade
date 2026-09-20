"use client";

import { ShieldCheck } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";
import { PanelTitle, StatRow, Chip } from "../ui";
import type { Scene } from "../AppWindow";

function Center() {
  const count = useReveal(4, 520);
  const rows = [
    "Tracing exploit A-0142",
    "req.query.id -> string concat",
    "Impact: full orders table",
    "Mitigation ranked",
  ];
  return (
    <div className="h-full overflow-hidden">
      <PanelTitle
        title="Defender analysis"
        right={<ShieldCheck className="h-4 w-4 text-emerald-300" />}
      />
      <div className="space-y-3 px-5 py-4 font-mono text-[13px] text-white/70">
        {rows.slice(0, count).map((row) => (
          <div key={row} className="animate-fade-in">
            {row}
          </div>
        ))}
      </div>
    </div>
  );
}

function Right() {
  return (
    <div>
      <PanelTitle
        title="Recommended fix"
        right={<Chip tone="amber">Review</Chip>}
      />
      <StatRow label="Parameterized query" value="Best" tone="green" />
      <StatRow label="UUID validation" value="Suggested" />
      <StatRow label="Ownership check" value="Suggested" />
    </div>
  );
}

export const defendScene: Scene = {
  id: "defend",
  label: "Analyze the attack",
  caption:
    "The defender agent traces the exploit path and ranks mitigations by impact and change size.",
  tabs: [{ label: "attack-path.md", icon: "file" }],
  rightTab: 2,
  Center,
  Right,
};
