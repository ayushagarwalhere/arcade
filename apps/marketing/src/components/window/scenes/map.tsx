"use client";

import { Map } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";
import { PanelTitle, StatRow, Chip } from "../ui";
import type { Scene } from "../AppWindow";

function Center() {
  const count = useReveal(4, 420);
  const rows = [
    "Indexing 312 files",
    "Found 14 routes",
    "Mapped 3 trust boundaries",
    "Security map ready",
  ];
  return (
    <div className="h-full overflow-hidden">
      <PanelTitle
        title="Project mapper"
        right={<Map className="h-4 w-4 text-violet-300" />}
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
        title="Security map"
        right={<Chip tone="green">Ready</Chip>}
      />
      <StatRow label="Routes" value="14" />
      <StatRow label="Data stores" value="2" />
      <StatRow label="Dependencies" value="41" tone="amber" />
    </div>
  );
}

export const mapScene: Scene = {
  id: "map",
  label: "Map the project",
  caption:
    "The mapper agent builds the shared security map that every other agent uses.",
  tabs: [{ label: "security-map.json", icon: "file" }],
  rightTab: 1,
  Center,
  Right,
};
