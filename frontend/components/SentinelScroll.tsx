"use client";
import { useEffect, useRef, useState } from "react";
import { Bug, Map as MapIcon, ShieldCheck, Swords, UserCheck, Wrench } from "lucide-react";
import { gsap, ScrollTrigger } from "@/lib/gsap";

type L = { c: "dim" | "ok" | "err" | "add" | "del" | "txt" | "warn"; t: string };
const STEPS: { id: string; name: string; agent: string; body: string; Icon: typeof Bug; lines: L[] }[] = [
  {
    id: "map", name: "Map", agent: "Mapper agent", Icon: MapIcon,
    body: "Reads your project and builds a security map: every route, trust boundary, data store and dependency. This is what the other agents work from.",
    lines: [
      { c: "dim", t: "mapper › indexing 312 files" }, { c: "txt", t: "routes         14   /api/*, /admin/*" }, { c: "txt", t: "auth flows      3   session, jwt, oauth" },
      { c: "txt", t: "data stores     2   postgres, s3" }, { c: "warn", t: "deps           41   3 with known CVEs" }, { c: "ok", t: "security-map.json written" },
    ],
  },
  {
    id: "attack", name: "Attack", agent: "Attacker agent", Icon: Swords,
    body: "Actively tries to break the app inside an isolated sandbox. It reports a finding only when it can reproduce the exploit.",
    lines: [
      { c: "dim", t: "attacker › sandbox-7f2c (network: none)" }, { c: "txt", t: "GET /api/orders?id=1' OR '1'='1" }, { c: "warn", t: "200 OK · 4,312 rows (expected 1)" },
      { c: "err", t: "CRITICAL SQL injection reproduced" }, { c: "dim", t: "evidence/A-0142.json saved" },
    ],
  },
  {
    id: "defend", name: "Defend", agent: "Defender agent", Icon: ShieldCheck,
    body: "Traces how the attack got through, works out the blast radius, and proposes mitigations ranked by how much they fix and how much they change.",
    lines: [
      { c: "dim", t: "defender › tracing exploit A-0142" }, { c: "txt", t: "req.query.id → string concat → db.query" }, { c: "warn", t: "impact: full read of orders table" },
      { c: "ok", t: "1  parameterized query   recommended" }, { c: "txt", t: "2  uuid validation" }, { c: "txt", t: "3  ownership check (user_id)" },
    ],
  },
  {
    id: "fix", name: "Remediate", agent: "Remediation agent", Icon: Wrench,
    body: "Writes the fix and a regression test that replays the exploit, on its own branch, so your working tree stays untouched.",
    lines: [
      { c: "dim", t: "remediation › fix/orders-sqli" }, { c: "del", t: "- db.query(`... WHERE id = '${id}'`)" }, { c: "add", t: "+ db.query('... WHERE id = $1 AND user_id = $2'," },
      { c: "add", t: "+           [parsed.data, req.user.id])" }, { c: "add", t: "+ tests/security/exploit-A-0142.test.ts" },
    ],
  },
  {
    id: "verify", name: "Verify", agent: "Verification agent", Icon: Bug,
    body: "A separate agent, with no memory of the fix, runs the original attack again plus hundreds of variations. If any of them work, the finding stays open.",
    lines: [
      { c: "dim", t: "verifier › replaying A-0142" }, { c: "txt", t: "400 Bad Request · 0 rows" }, { c: "txt", t: "212 mutated payloads · 0 successful" },
      { c: "txt", t: "regression suite · 148 passed" }, { c: "ok", t: "Fix verified" },
    ],
  },
  {
    id: "approve", name: "Approve", agent: "You", Icon: UserCheck,
    body: "Sentinel never decides alone. Merging a fix or changing production config waits for your approval, with the full evidence trail one click away.",
    lines: [
      { c: "dim", t: "approval requested" }, { c: "txt", t: "merge fix/orders-sqli → main" }, { c: "txt", t: "evidence: discovered, reproduced, fixed, verified" },
      { c: "warn", t: "waiting for human approval…" }, { c: "ok", t: "approved by you · merged" },
    ],
  },
];

const color: Record<L["c"], string> = {
  dim: "text-white/40", ok: "text-emerald-400", err: "text-red-400", add: "bg-emerald-500/[0.14] text-emerald-200", del: "bg-red-500/[0.12] text-red-200", txt: "text-white/80", warn: "text-amber-300",
};

export default function SentinelScroll() {
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLDivElement | null)[]>([]);
  const line = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Which agent is centered decides what the pinned left half shows.
      cards.current.forEach((el, i) => {
        if (!el) return;
        ScrollTrigger.create({ trigger: el, start: "top 60%", end: "bottom 60%", onToggle: (self) => self.isActive && setActive(i) });
        gsap.fromTo(el.querySelector(".sc-body"), { y: 60, opacity: 0.2 }, { y: 0, opacity: 1, ease: "none", scrollTrigger: { trigger: el, start: "top 90%", end: "top 55%", scrub: true } });
      });
      // The thin progress line fills as the whole right column scrolls past.
      gsap.fromTo(line.current, { scaleY: 0 }, { scaleY: 1, ease: "none", scrollTrigger: { trigger: ".sc-track", start: "top 60%", end: "bottom 60%", scrub: true } });
    }, root);
    return () => ctx.revert();
  }, []);

  const s = STEPS[active];
  return (
    <section ref={root} className="relative border-t border-white/[0.07]">
      <div className="mx-auto grid max-w-[1440px] gap-10 px-6 md:px-10 lg:grid-cols-2 lg:gap-24">
        {/* Fixed half */}
        <div className="pt-24 lg:sticky lg:top-0 lg:self-start lg:flex lg:h-screen lg:flex-col lg:justify-center lg:pt-16">
          <h2 className="h-display text-[40px] font-medium md:text-[64px]">
            Five agents.<br />One verdict.
          </h2>
          <p className="mt-6 max-w-xl text-[19px] leading-8 text-white/50">
            A chatbot can tell you your code might be vulnerable. Sentinel finds the problem, proves it, fixes it, and proves the fix, with you approving the final call.
          </p>
          <div className="mt-10 flex gap-6">
            <div className="relative w-px shrink-0 bg-white/10">
              <div ref={line} className="absolute inset-0 origin-top bg-white" style={{ transform: "scaleY(0)" }} />
            </div>
            <ul className="space-y-1">
              {STEPS.map((st, i) => (
                <li key={st.id} className={`flex items-center gap-3 py-1.5 text-[17px] font-medium transition-all duration-500 ${i === active ? "translate-x-1 text-white" : "text-white/35"}`}>
                  <st.Icon className="h-[18px] w-[18px]" /> {st.name}
                  <span className={`text-[14px] font-normal transition-opacity duration-500 ${i === active ? "text-white/45 opacity-100" : "opacity-0"}`}>{st.agent}</span>
                </li>
              ))}
            </ul>
          </div>
          <p key={s.id} className="mt-8 hidden max-w-md animate-fade-in text-[16px] leading-7 text-white/60 lg:block">{s.body}</p>
        </div>

        {/* Moving half */}
        <div className="sc-track pb-24 lg:pb-[20vh]">
          {STEPS.map((st, i) => (
            <div key={st.id} ref={(el) => { cards.current[i] = el; }} className="flex items-center py-8 lg:min-h-screen lg:py-0">
              <div className="sc-body w-full">
                <div className="mb-4 flex items-center gap-3 text-[15px] text-white/60">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/12 bg-white/[0.04]"><st.Icon className="h-[18px] w-[18px]" /></span>
                  {st.agent}
                </div>
                <div className="overflow-hidden rounded-2xl border border-white/[0.09] bg-ink-900">
                  <div className="flex items-center gap-2 border-b border-white/[0.07] px-4 py-3">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]/80" /><span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]/80" /><span className="h-2.5 w-2.5 rounded-full bg-[#28c840]/80" />
                  </div>
                  <div className="space-y-1 p-5 font-mono text-[13px] leading-7">
                    {st.lines.map((l, j) => <div key={j} className={`whitespace-pre-wrap break-words rounded px-1.5 ${color[l.c]}`}>{l.t}</div>)}
                  </div>
                </div>
                <p className="mt-5 text-[16px] leading-7 text-white/55 lg:hidden">{st.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}