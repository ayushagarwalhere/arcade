import { ChevronRight, Lock, ShieldCheck, UserRound } from "lucide-react";
import type { FigureName } from "@/lib/docs/types";

/* Diagrams drawn in markup rather than shipped as screenshots: they stay sharp,
   follow the design system, and can't drift out of date with a UI change. */

const LOOP: { label: string; by: string; gate?: boolean; end?: boolean }[] = [
  { label: "Map", by: "Mapper" },
  { label: "Attack", by: "Attacker" },
  { label: "Defend", by: "Defender" },
  { label: "Approve fix", by: "You", gate: true },
  { label: "Remediate", by: "Remediator" },
  { label: "Verify", by: "Verifier" },
  { label: "Approve merge", by: "You", gate: true },
  { label: "Verified", by: "Closed", end: true },
];

function Loop() {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {LOOP.map((s, i) => (
        <li
          key={s.label}
          className={`relative rounded-lg border px-3 py-2.5 ${
            s.gate ? "border-violet-400/35 bg-violet-500/[0.08]" : s.end ? "border-emerald-400/35 bg-emerald-500/[0.08]" : "border-white/10 bg-ink-900"
          }`}
        >
          <div className="flex items-center justify-between font-mono text-[10.5px] text-white/30">
            {String(i + 1).padStart(2, "0")}
            {i < LOOP.length - 1 && <ChevronRight className="h-3 w-3 text-white/25" />}
          </div>
          <div className={`mt-1.5 flex items-center gap-1.5 text-[13.5px] font-medium ${s.gate ? "text-violet-200" : s.end ? "text-emerald-200" : "text-white/90"}`}>
            {s.gate && <Lock className="h-3 w-3" />}
            {s.end && <ShieldCheck className="h-3 w-3" />}
            {s.label}
          </div>
          <div className="mt-0.5 font-mono text-[10.5px] text-white/40">{s.by}</div>
        </li>
      ))}
    </ol>
  );
}

function Region({ label, className = "", children }: { label: string; className?: string; children?: React.ReactNode }) {
  return (
    <div className={`flex min-h-0 flex-col rounded-[5px] border border-ade-line bg-ade-base p-2 ${className}`}>
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-ade-muted">{label}</div>
      {children}
    </div>
  );
}

const Bar = ({ w, tone = "bg-white/10" }: { w: string; tone?: string }) => <div className={`h-1.5 rounded-full ${tone}`} style={{ width: w }} />;

function Workbench() {
  return (
    <div className="overflow-hidden rounded-lg border border-ade-line bg-ade-chrome">
      <div className="flex h-7 items-center gap-1.5 border-b border-ade-line px-2.5">
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.08em] text-ade-muted">Top bar</span>
        <span className="mx-auto hidden h-4 w-40 rounded border border-ade-line bg-ade-base sm:block" />
        <span className="ml-auto h-4 w-10 rounded bg-white/10 sm:ml-0" />
      </div>
      <div className="grid h-[250px] grid-cols-[22px_1fr] gap-1.5 p-1.5 sm:grid-cols-[22px_120px_1fr_150px]">
        <div className="flex flex-col items-center gap-2 rounded-[5px] border border-ade-line bg-ade-base py-2" title="Activity bar">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={`h-2.5 w-2.5 rounded-[3px] ${i === 0 ? "bg-white/50" : "bg-white/15"}`} />
          ))}
        </div>
        <Region label="Sidebar" className="hidden sm:flex">
          <div className="mt-2.5 space-y-2">
            <Bar w="70%" />
            <Bar w="85%" tone="bg-white/25" />
            <Bar w="60%" />
            <Bar w="75%" />
          </div>
        </Region>
        <div className="grid min-h-0 grid-rows-[1fr_72px] gap-1.5">
          <Region label="Editor · views as tabs" className="bg-ade-editor">
            <div className="mt-2.5 grid flex-1 grid-cols-3 gap-1.5">
              <div className="rounded border border-ade-line bg-ade-base" />
              <div className="rounded border border-red-400/30 bg-red-500/[0.07]" />
              <div className="rounded border border-ade-line bg-ade-base" />
            </div>
          </Region>
          <Region label="Panel · problems / output / terminal">
            <div className="mt-2 space-y-1.5">
              <Bar w="45%" tone="bg-emerald-400/40" />
              <Bar w="62%" />
            </div>
          </Region>
        </div>
        <Region label="Agent pane" className="hidden sm:flex">
          <div className="mt-2.5 space-y-2">
            <Bar w="90%" />
            <Bar w="65%" />
          </div>
          <div className="mt-auto rounded border border-violet-400/40 bg-violet-500/10 p-1.5">
            <div className="font-mono text-[9.5px] text-violet-200">Approval required</div>
            <div className="mt-1.5 flex justify-end gap-1">
              <span className="h-2.5 w-7 rounded-sm border border-ade-line" />
              <span className="h-2.5 w-7 rounded-sm bg-ade-fg" />
            </div>
          </div>
        </Region>
      </div>
      <div className="flex h-5 items-center gap-3 border-t border-ade-line px-2.5 font-mono text-[10px] text-ade-muted">
        <span className="rounded-sm bg-emerald-500/15 px-1.5 text-emerald-300">sandbox-7f2c</span>
        <span className="uppercase tracking-[0.08em]">Status bar</span>
      </div>
    </div>
  );
}

function Box({ title, sub, tone = "neutral" }: { title: string; sub: string; tone?: "neutral" | "violet" | "emerald" }) {
  const c =
    tone === "violet"
      ? "border-violet-400/35 bg-violet-500/[0.08]"
      : tone === "emerald"
        ? "border-emerald-400/30 bg-emerald-500/[0.06]"
        : "border-white/10 bg-white/[0.03]";
  return (
    <div className={`rounded-lg border px-3 py-2.5 text-center ${c}`}>
      <div className="text-[13px] font-medium text-white/90">{title}</div>
      <div className="mt-0.5 text-[11.5px] leading-4 text-white/45">{sub}</div>
    </div>
  );
}

const Wire = () => <div className="mx-auto h-4 w-px bg-white/15" />;

function Architecture() {
  return (
    <div className="mx-auto max-w-[620px]">
      <div className="mx-auto w-fit">
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white/85">
          <UserRound className="h-3.5 w-3.5 text-white/50" /> You · your coding agent · CLI · MCP
        </div>
      </div>
      <Wire />
      <Box title="Arcade control plane" sub="Runs the loop · holds the gates · records the timeline" tone="emerald" />
      <Wire />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Box title="Mapper" sub="read-only" />
        <Box title="Attacker" sub="sandbox only" />
        <Box title="Defender" sub="read-only" />
        <Box title="Remediator" sub="own branch" />
        <Box title="Verifier" sub="fresh sandbox" />
      </div>
      <Wire />
      <div className="grid gap-2 sm:grid-cols-3">
        <Box title="Evidence store" sub="Requests, responses, repro steps" />
        <Box title="Sandbox" sub="Isolated · disposable · no network" />
        <Box title="Human gates" sub="Code · ship · destructive" tone="violet" />
      </div>
    </div>
  );
}

const FIGURES: Record<FigureName, () => React.ReactNode> = { loop: Loop, workbench: Workbench, architecture: Architecture };

export default function Figure({ name, caption }: { name: FigureName; caption: string }) {
  const Body = FIGURES[name];
  return (
    <figure className="mt-7">
      <div className="bg-grid rounded-xl border border-white/10 bg-ink-950 p-4 sm:p-6">
        <Body />
      </div>
      <figcaption className="mt-2.5 text-center text-[13px] leading-6 text-white/40">{caption}</figcaption>
    </figure>
  );
}
