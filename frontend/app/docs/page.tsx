import PageShell from "@/components/PageShell";

const STEPS = [
  ["Install Arcade", "Download the app for your platform from the home page and open a project folder."],
  ["Connect your coding agent", "Arcade detects Claude Code and Codex on your PATH. Each one runs in its own git worktree."],
  ["Run your first scan", "Ask Sentinel to map the project, then attack it. Findings show up with proof and a fix."],
  ["Approve and ship", "Review the evidence trail, approve the verified fix, and merge."],
];

export default function Docs() {
  return (
    <PageShell title="Docs" intro="Everything you need to go from install to a verified fix.">
      <ol className="space-y-10">
        {STEPS.map(([t, d], i) => (
          <li key={t} className="flex gap-6">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 text-[15px] text-white/70">{i + 1}</span>
            <div>
              <h3 className="text-[20px] font-medium">{t}</h3>
              <p className="mt-2 text-[17px] leading-7 text-white/55">{d}</p>
            </div>
          </li>
        ))}
      </ol>
      <pre className="mt-14 overflow-x-auto rounded-2xl border border-white/10 bg-ink-900 p-6 font-mono text-[14px] leading-7 text-white/80">
{`$ arcade open ./my-app
$ sentinel map
$ sentinel attack --sandbox
$ sentinel verify A-0142 --replay`}
      </pre>
    </PageShell>
  );
}
