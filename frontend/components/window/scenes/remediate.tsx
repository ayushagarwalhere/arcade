"use client";
import { ChevronDown, Plus, RefreshCw } from "lucide-react";
import { useReveal } from "@/hooks/useReveal";
import { PanelTitle } from "../ui";
import type { Scene } from "../AppWindow";

type D = { k: "hunk" | "ctx" | "add" | "del"; n?: string; t: string };
const DIFF: D[] = [
  { k: "hunk", t: "@@ -18,6 +18,11 @@ export async function getOrder(req, res) {" },
  { k: "ctx", n: "18", t: "export async function getOrder(req, res) {" },
  { k: "ctx", n: "19", t: "  const { id } = req.query" },
  { k: "del", n: "20", t: "  const rows = await db.query(`SELECT * FROM orders WHERE id = '${id}'`)" },
  { k: "add", n: "20", t: "  const parsed = z.string().uuid().safeParse(id)" },
  { k: "add", n: "21", t: "  if (!parsed.success) return res.status(400).end()" },
  { k: "add", n: "22", t: "  const rows = await db.query(" },
  { k: "add", n: "23", t: "    'SELECT * FROM orders WHERE id = $1 AND user_id = $2'," },
  { k: "add", n: "24", t: "    [parsed.data, req.user.id]" },
  { k: "add", n: "25", t: "  )" },
  { k: "ctx", n: "26", t: "  return res.json(rows[0])" },
  { k: "ctx", n: "27", t: "}" },
];

function Center() {
  const count = useReveal(DIFF.length, 380);
  return (
    <div className="h-full overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-3 text-[13px] text-white/60">
        <span>src/api <span className="mx-1.5 text-white/30">/</span> <span className="text-white">orders.ts</span></span>
        <span className="text-[11px] text-white/35">DIFF</span>
      </div>
      <div className="font-mono text-[12.5px] leading-[1.9]">
        {DIFF.slice(0, count).map((l, i) => {
          const bg = l.k === "add" ? "bg-emerald-500/[0.16]" : l.k === "del" ? "bg-red-500/[0.14]" : "";
          const color = l.k === "hunk" ? "text-white/45" : l.k === "add" ? "text-emerald-100" : l.k === "del" ? "text-red-200" : "text-white/85";
          return (
            <div key={i} className={`flex animate-fade-in whitespace-pre ${bg} ${color}`}>
              <span className="w-12 shrink-0 select-none pr-3 text-right text-white/30">{l.n ?? ""}</span>
              <span className="w-6 shrink-0 select-none text-white/50">{l.k === "add" ? "+" : l.k === "del" ? "−" : ""}</span>
              <span className="overflow-hidden text-ellipsis">{l.t}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Right() {
  const count = useReveal(3, 700, 900);
  const files: [string, string, string][] = [
    ["orders.ts", "src/api", "M"], ["orders.test.ts", "src/api", "M"], ["exploit-A-0142.test.ts", "tests/security", "A"],
  ];
  return (
    <div>
      <PanelTitle title="Source Control" right={<RefreshCw className="h-4 w-4 text-white/40" />} />
      <div className="mx-4 rounded-xl bg-black/50 px-4 py-3 text-[13px] leading-5 text-white/90">fix(orders): parameterize query and enforce ownership</div>
      <div className="mx-4 mt-3 flex overflow-hidden rounded-lg bg-white text-black">
        <span className="flex flex-1 items-center justify-center gap-2 py-2.5 text-[13px] font-medium"><Plus className="h-4 w-4" /> Stage All</span>
        <span className="flex w-10 items-center justify-center border-l border-black/15"><ChevronDown className="h-4 w-4" /></span>
      </div>
      <div className="mt-5 flex items-center gap-2 px-5 text-[12px] font-semibold tracking-wide text-white/70">
        <ChevronDown className="h-3.5 w-3.5" /> CHANGES <span className="text-white/45">{Math.min(count, 3)}</span>
      </div>
      <div className="mt-2 space-y-1 px-5">
        {files.slice(0, count).map(([f, p, s]) => (
          <div key={f} className="flex animate-fade-in items-center justify-between py-1.5 text-[13px]">
            <span className="min-w-0 truncate"><span className="text-white">{f}</span> <span className="text-white/40">{p}</span></span>
            <span className={`ml-2 text-[12px] font-semibold ${s === "A" ? "text-emerald-400" : "text-amber-300"}`}>{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const remediateScene: Scene = {
  id: "remediate",
  label: "Auto-remediate",
  caption: "The remediation agent writes the fix and a regression test that replays the exploit.",
  tabs: [{ label: "orders.ts — diff", icon: "file" }, { label: "orders.test.ts", icon: "file" }],
  rightTab: 2,
  Center,
  Right,
};