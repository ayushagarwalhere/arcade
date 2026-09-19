import PageShell from "@/components/PageShell";

const POINTS = [
  ["Private by default", "Run Sentinel against code that never leaves your infrastructure."],
  ["Audit-ready evidence", "Every finding comes with how it was found, fixed and verified."],
  ["Approval policies", "Decide which actions need a human, and who that human is."],
  ["Works with your agents", "Bring Claude Code, Codex or your own. Arcade orchestrates them."],
];

export default function Enterprise() {
  return (
    <PageShell title="Enterprise" intro="Ship AI-written software at scale without shipping AI-sized risk.">
      <div className="grid gap-4 sm:grid-cols-2">
        {POINTS.map(([t, d]) => (
          <div key={t} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
            <h3 className="text-[18px] font-medium">{t}</h3>
            <p className="mt-2 text-[16px] leading-7 text-white/55">{d}</p>
          </div>
        ))}
      </div>
      <a href="mailto:hello@arcade.dev" className="mt-10 inline-flex rounded-xl bg-white px-7 py-4 text-[17px] font-medium text-black transition hover:bg-white/90">Talk to us</a>
    </PageShell>
  );
}