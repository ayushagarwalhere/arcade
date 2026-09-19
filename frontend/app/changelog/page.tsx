import PageShell from "@/components/PageShell";

const ENTRIES = [
  { v: "0.1.0", d: "Sep 20, 2026", items: ["First public preview", "Sentinel: mapper, attacker, defender, remediation and verification agents", "Isolated attack sandbox", "Evidence trail with SARIF, JSON and PDF export", "Human approval for high-impact actions"] },
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