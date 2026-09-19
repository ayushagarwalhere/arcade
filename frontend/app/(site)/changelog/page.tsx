import PageShell from "@/components/PageShell";

const ENTRIES = [
  {
    v: "0.1.0",
    d: "Sep 20, 2026",
    items: [
      "First public preview",
      "The Arcade ADE: three-pane environment with a live agent fleet, runs in your browser at /arcade",
      "Five agents — mapper, attacker, defender, remediator and independent verifier",
      "Attack-surface graph, findings, evidence trail, diff viewer, terminal and sandbox browser",
      "Isolated, disposable attack sandbox with no network access",
      "Human approval gates for applying a fix, merging, and destructive actions",
      "Deterministic demo run over a sample vulnerable app",
      "arcade CLI and a Model Context Protocol server so coding agents can drive the workflow",
    ],
  },
];

export default function Changelog() {
  return (
    <PageShell title="Changelog" intro="What shipped, and when.">
      {ENTRIES.map((e) => (
        <article key={e.v} className="border-t border-white/10 pt-8">
          <div className="flex items-baseline gap-4"><h2 className="text-[24px] font-medium">v{e.v}</h2><span className="text-white/40">{e.d}</span></div>
          <ul className="mt-5 list-disc space-y-2 pl-5 text-[17px] text-white/60">
            {e.items.map((i) => <li key={i}>{i}</li>)}
          </ul>
        </article>
      ))}
    </PageShell>
  );
}