"use client";
import { useState } from "react";
import type { ArcadeState, SurfaceNode } from "@arcade/core/types";
import { SURFACE_ICON, Badge } from "../atoms";

const CW = 1060;
const CH = 460;
const cx = (col: number) => 80 + col * 200;
const cy = (row: number) => 80 + row * 150;

const RISK_RING: Record<SurfaceNode["risk"], string> = {
  safe: "border-ade-line",
  attention: "border-amber-400/40",
  vulnerable: "border-red-500/60 shadow-[0_0_22px_-6px_rgba(239,68,68,0.6)]",
};

export default function AttackSurface({ state }: { state: ArcadeState }) {
  const { surface, revealedNodes } = state;
  const [selected, setSelected] = useState<string | null>("admin");

  const nodeIndex = new Map(surface.nodes.map((n, i) => [n.id, i]));
  const isRevealed = (id: string) => (nodeIndex.get(id) ?? 99) < revealedNodes;
  const byId = new Map(surface.nodes.map((n) => [n.id, n]));
  const sel = selected ? byId.get(selected) : undefined;
  const pathReady = surface.exploitPath.every(isRevealed) && state.phase !== "idle" && state.phase !== "mapping";

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-[15px] font-semibold text-white">Attack surface</h2>
          <div className="flex items-center gap-3 text-[11px] text-white/45">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-white/25" /> safe</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" /> attention</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-500" /> vulnerable</span>
          </div>
          {pathReady && <Badge tone="red">Proven exploit path highlighted</Badge>}
        </div>

        <div className="scrollbar-thin overflow-x-auto rounded-md border border-ade-line bg-ade-base bg-grid">
          <div className="relative" style={{ width: CW, height: CH }}>
            <svg width={CW} height={CH} className="absolute inset-0">
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" className="fill-white/30" />
                </marker>
                <marker id="arrow-red" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                  <path d="M0,0 L9,4.5 L0,9 Z" fill="#ef4444" />
                </marker>
              </defs>
              {surface.edges.map((e, i) => {
                const from = byId.get(e.from)!;
                const to = byId.get(e.to)!;
                if (!isRevealed(e.from) || !isRevealed(e.to)) return null;
                const x1 = cx(from.col) + 78;
                const y1 = cy(from.row) + 26;
                const x2 = cx(to.col) - 6;
                const y2 = cy(to.row) + 26;
                const vuln = e.vulnerable && pathReady;
                const mx = (x1 + x2) / 2;
                return (
                  <g key={i}>
                    <path
                      d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke={vuln ? "#ef4444" : undefined}
                      className={vuln ? undefined : "stroke-white/15"}
                      strokeWidth={vuln ? 2 : 1.25}
                      strokeDasharray={vuln ? "5 4" : undefined}
                      markerEnd={vuln ? "url(#arrow-red)" : "url(#arrow)"}
                    >
                      {vuln && <animate attributeName="stroke-dashoffset" from="18" to="0" dur="0.7s" repeatCount="indefinite" />}
                    </path>
                    {e.label && (
                      <text x={mx} y={(y1 + y2) / 2 - 6} textAnchor="middle" className="fill-white/35" style={{ fontSize: 10 }}>
                        {e.label}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>

            {surface.nodes.map((n, i) => {
              if (i >= revealedNodes) return null;
              const Icon = SURFACE_ICON[n.kind];
              const active = selected === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => setSelected(n.id)}
                  className={`absolute flex h-[52px] w-[156px] animate-fade-in items-center gap-2.5 rounded-md border bg-ade-raised px-3 text-left transition ${RISK_RING[n.risk]} ${
                    active ? "ring-2 ring-white/40" : "hover:border-white/30"
                  }`}
                  style={{ left: cx(n.col), top: cy(n.row) }}
                >
                  <span
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded ${
                      n.risk === "vulnerable" ? "bg-red-500/15 text-red-300" : n.risk === "attention" ? "bg-amber-400/12 text-amber-200" : "bg-white/[0.06] text-white/55"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[12.5px] font-medium text-white">{n.label}</span>
                    <span className="block truncate text-[10px] capitalize text-white/40">{n.kind}</span>
                  </span>
                </button>
              );
            })}

            {revealedNodes === 0 && (
              <div className="absolute inset-0 grid place-items-center text-[13px] text-white/40">
                Run the mapper to build the attack surface.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Node detail */}
      <div>
        {sel ? (
          <div className="rounded-md border border-ade-line bg-ade-base p-4">
            <div className="flex items-center gap-2.5">
              <span
                className={`grid h-9 w-9 place-items-center rounded ${
                  sel.risk === "vulnerable" ? "bg-red-500/15 text-red-300" : sel.risk === "attention" ? "bg-amber-400/12 text-amber-200" : "bg-white/[0.06] text-white/55"
                }`}
              >
                {(() => {
                  const Icon = SURFACE_ICON[sel.kind];
                  return <Icon className="h-4 w-4" />;
                })()}
              </span>
              <div>
                <div className="text-[14px] font-semibold text-white">{sel.label}</div>
                <div className="text-[11px] capitalize text-white/45">{sel.kind}</div>
              </div>
            </div>
            <div className="mt-3">
              <Badge tone={sel.risk === "vulnerable" ? "red" : sel.risk === "attention" ? "amber" : "green"}>
                {sel.risk === "vulnerable" ? "Vulnerable" : sel.risk === "attention" ? "Needs attention" : "Safe"}
              </Badge>
            </div>
            <p className="mt-3 text-[12.5px] leading-6 text-white/65">{sel.detail}</p>
            {sel.id === "admin" && (
              <div className="mt-3 rounded border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-[11.5px] text-red-200/90">
                Finding ARC-001 lives here. The proven exploit path runs User → Browser → API → Admin Export → PostgreSQL.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-ade-line bg-ade-base p-4 text-[13px] text-white/45">
            Select a node to inspect it.
          </div>
        )}
      </div>
    </div>
  );
}
