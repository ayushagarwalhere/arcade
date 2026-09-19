import { Check } from "lucide-react";
import Reveal from "./Reveal";

const ROWS: [string, string][] = [
  ["Maps your app's attack surface", "Sometimes"],
  ["Attacks your app in an isolated sandbox", "—"],
  ["Proves a vulnerability is exploitable", "—"],
  ["Writes the fix and a regression test", "Suggestions only"],
  ["Re-runs the original attack to verify the fix", "—"],
  ["Human approval for high-impact actions", "—"],
  ["Evidence trail for every finding", "—"],
  ["Works with Claude Code, Codex and more", "One or two"],
  ["Scans any local folder or repo", "Limited"],
  ["CLI so agents can drive the environment", "—"],
  ["MCP, hooks, and skills", "Partial"],
  ["macOS, Windows, and Linux", "macOS only"],
];

export default function Comparison() {
  return (
    <section className="mx-auto max-w-[1440px] px-6 py-20 md:px-10">
      <div className="grid gap-8 lg:grid-cols-2 lg:items-end">
        <Reveal><h2 className="h-display text-[40px] font-medium md:text-[64px]">Security built in,<br />not bolted on</h2></Reveal>
        <Reveal delay={0.1}>
          <p className="text-[20px] leading-8 text-white/50 md:text-[22px]">
            Code review tools point at problems. Scanners produce lists. Arcade runs the whole loop: find it, prove it, fix it, and prove the fix.
          </p>
        </Reveal>
      </div>
      <Reveal className="mt-14 overflow-x-auto rounded-3xl border border-white/[0.09] bg-white/[0.015]">
        <table className="w-full min-w-[640px] text-left">
          <thead>
            <tr className="border-b border-white/[0.07] text-[15px]">
              <th className="px-7 py-5 font-normal text-white/45">Capability</th>
              <th className="w-44 px-4 py-5 text-center font-semibold">Arcade</th>
              <th className="w-56 px-4 py-5 text-center font-normal text-white/45">Chat review and scanners</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([cap, other]) => (
              <tr key={cap} className="border-b border-white/[0.06] last:border-0">
                <td className="px-7 py-5 text-[16px] text-white/90">{cap}</td>
                <td className="px-4 py-5"><Check className="mx-auto h-[18px] w-[18px]" /></td>
                <td className="px-4 py-5 text-center text-[15px] text-white/45">{other}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Reveal>
    </section>
  );
}