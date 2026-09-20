import { Check, Lock, Rocket, ShieldCheck } from "lucide-react";
import Frame from "./Frame";
import { Chip, EvidenceTrail, StatusDot } from "../window/ui";

const mono = "font-mono text-[12.5px]";

/* 1. Workspaces */
export function WorkspacesPanel() {
  const rows = [
    ["Claude Code", "feature/checkout-v2", "Writing code", "running"],
    ["Codex", "feature/auth-refresh", "Writing code", "running"],
    ["Sentinel · attacker", "scan/checkout-v2", "Probing 6 endpoints", "running"],
    ["Sentinel · verifier", "fix/orders-sqli", "Fix verified", "done"],
    ["Sentinel · mapper", "scan/auth-refresh", "Queued", "queued"],
  ] as const;
  return (
    <Frame path="worktrees / acme-web" status={<Chip>5 worktrees</Chip>}>
      <div className="divide-y divide-white/[0.06]">
        {rows.map(([a, b, c, s]) => (
          <div key={a} data-stagger className="flex items-start gap-3 px-5 py-4">
            <StatusDot s={s} />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-medium text-white">{a}</div>
              <div className={`${mono} mt-0.5 truncate text-white/40`}>{b}</div>
            </div>
            <span className="text-[13px] text-white/50">{c}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* 2. Orchestration */
export function OrchestrationPanel() {
  const steps = [
    ["Mapper", "Builds the security map"],
    ["Attacker", "Breaks it in a sandbox"],
    ["Defender", "Analyzes the attack path"],
    ["Remediation", "Writes the fix"],
    ["Verifier", "Runs the exploit again"],
    ["You", "Approve before it ships"],
  ];
  return (
    <Frame path="pipeline / sentinel" status={<Chip tone="violet">Human in the loop</Chip>}>
      <div className="relative px-6 py-6">
        <div className="absolute bottom-10 left-[35px] top-10 w-px overflow-hidden bg-white/10">
          <span className="absolute left-0 top-0 h-10 w-px animate-signal bg-gradient-to-b from-transparent via-emerald-400 to-transparent" />
        </div>
        <ul className="space-y-5">
          {steps.map(([n, d], i) => {
            const human = i === steps.length - 1;
            return (
              <li key={n} data-stagger className="relative flex items-center gap-4">
                <span className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full border text-[11px] ${human ? "border-violet-400 bg-violet-500/20 text-violet-200" : "border-white/25 bg-ink-900 text-white/70"}`}>
                  {human ? <Lock className="h-3 w-3" /> : i + 1}
                </span>
                <div>
                  <div className="text-[14px] font-medium text-white">{n}</div>
                  <div className="text-[13px] text-white/45">{d}</div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Frame>
  );
}

/* 3. Sandbox */
export function SandboxPanel() {
  const reqs = [
    ["GET", "/api/orders?id=1' OR '1'='1", "200", "red"],
    ["POST", "/api/auth  {alg: none}", "401", "green"],
    ["GET", "/admin/../../etc/passwd", "403", "green"],
    ["PUT", "/api/orders/42  {user_id: 7}", "200", "red"],
  ] as const;
  return (
    <Frame path="sandbox-7f2c" status={<Chip tone="green">Isolated</Chip>}>
      <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
        {[["Network", "none"], ["Filesystem", "overlay"], ["Secrets", "stripped"], ["Time limit", "90s"]].map(([k, v]) => (
          <div key={k} data-stagger className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-3 py-2.5">
            <div className="text-[11px] text-white/40">{k}</div>
            <div className="text-[13px] font-medium text-white">{v}</div>
          </div>
        ))}
      </div>
      <div className={`${mono} border-t border-white/[0.07]`}>
        {reqs.map(([m, p, s, t]) => (
          <div key={p} data-stagger className="flex items-center gap-3 border-b border-white/[0.05] px-5 py-3 last:border-0">
            <span className="w-11 text-white/40">{m}</span>
            <span className="min-w-0 flex-1 truncate text-white/85">{p}</span>
            <span className={t === "red" ? "text-red-400" : "text-emerald-400"}>{s}</span>
          </div>
        ))}
      </div>
      <div className="border-t border-white/[0.07] px-5 py-3 text-[12px] text-white/45">Two requests got through. Both are reproducible and saved as evidence.</div>
    </Frame>
  );
}

/* 4. Terminal */
export function TerminalPanel() {
  return (
    <Frame path="terminal · split" status={<Chip>2 panes</Chip>}>
      <div className="grid divide-white/[0.07] sm:grid-cols-2 sm:divide-x">
        <div className={`${mono} space-y-1.5 p-4 leading-6`}>
          <div data-stagger className="text-white/40">claude</div>
          <div data-stagger><span className="text-emerald-400">$</span> claude &quot;add promo codes to checkout&quot;</div>
          <div data-stagger className="text-white/60">● Edit src/checkout/promo.ts</div>
          <div data-stagger className="text-white/60">● Edit src/api/orders.ts</div>
          <div data-stagger className="text-white/60">● Bash npm test</div>
          <div data-stagger className="text-emerald-400">✓ 148 passed</div>
        </div>
        <div className={`${mono} space-y-1.5 p-4 leading-6`}>
          <div data-stagger className="text-white/40">sentinel watch</div>
          <div data-stagger><span className="text-emerald-400">$</span> sentinel watch</div>
          <div data-stagger className="text-white/60">● Change detected in orders.ts</div>
          <div data-stagger className="text-white/60">● Re-scanning affected routes</div>
          <div data-stagger className="text-red-400">✗ New finding: IDOR in /api/orders/:id</div>
          <div data-stagger className="text-amber-300">! Sent to claude with repro steps</div>
        </div>
      </div>
    </Frame>
  );
}

/* 5. Findings */
export function FindingsPanel() {
  const rows = [
    ["A-0142", "SQL injection in /api/orders", "Critical", "red", "Verified", "green"],
    ["A-0143", "Broken access control on /admin", "High", "amber", "Needs approval", "violet"],
    ["A-0144", "Path traversal in file upload", "Medium", "amber", "Fixing", "neutral"],
    ["A-0145", "JWT accepts alg: none", "High", "amber", "Attacking", "neutral"],
    ["A-0146", "3 dependencies with known CVEs", "Low", "neutral", "Queued", "neutral"],
  ] as const;
  return (
    <Frame path="findings / acme-web" status={<Chip>5 open</Chip>}>
      <div className="divide-y divide-white/[0.06]">
        {rows.map(([id, t, sev, st, status, stt]) => (
          <div key={id} data-stagger className="flex items-center gap-3 px-5 py-3.5">
            <span className={`${mono} w-14 shrink-0 text-white/40`}>{id}</span>
            <span className="min-w-0 flex-1 truncate text-[14px] text-white/90">{t}</span>
            <span className="hidden sm:block"><Chip tone={st as "red" | "amber" | "neutral"}>{sev}</Chip></span>
            <Chip tone={stt as "green" | "violet" | "neutral"}>{status}</Chip>
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* 6. Editor */
export function EditorPanel() {
  const code = [
    "export async function getOrder(req, res) {",
    "  const { id } = req.query",
    "  const rows = await db.query(",
    "    `SELECT * FROM orders WHERE id = '${id}'`",
    "  )",
    "  return res.json(rows[0])",
    "}",
  ];
  return (
    <Frame path="src/api/orders.ts" status={<Chip tone="red">1 finding</Chip>}>
      <div className={`${mono} py-3 leading-[1.9]`}>
        {code.map((l, i) => (
          <div key={i}>
            <div data-stagger className={`flex whitespace-pre ${i === 3 ? "bg-red-500/[0.08]" : ""}`}>
              <span className="w-12 shrink-0 select-none pr-4 text-right text-white/25">{i + 18}</span>
              <span className={i === 3 ? "underline decoration-red-400 decoration-wavy underline-offset-4" : "text-white/85"}>{l}</span>
            </div>
            {i === 3 && (
              <div data-stagger className="my-2 ml-12 mr-4 rounded-lg border border-red-400/25 bg-ink-800 p-3 font-sans text-[13px]">
                <div className="flex items-center gap-2 font-medium text-red-300"><ShieldCheck className="h-4 w-4" /> SQL injection · exploit reproduced</div>
                <p className="mt-1 text-white/55">User input is placed directly in the query. Sentinel read 4,312 rows without signing in.</p>
                <div className="mt-2.5 flex gap-2">
                  <span className="rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-black">Apply verified fix</span>
                  <span className="rounded-md border border-white/15 px-2.5 py-1 text-[12px] text-white/70">Show evidence</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </Frame>
  );
}

/* 7. Evidence */
export function EvidencePanel() {
  return (
    <Frame path="evidence / A-0142" status={<Chip tone="green">Complete</Chip>}>
      <div className="grid gap-6 p-6 sm:grid-cols-[1fr_auto]">
        <EvidenceTrail done={5} />
        <div className="space-y-2 sm:w-40">
          {["SARIF", "JSON", "PDF"].map((f) => (
            <div key={f} data-stagger className="rounded-lg border border-white/12 px-3 py-2 text-center text-[13px] text-white/75">Export {f}</div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

/* 8. Ship with AI */
export function ShipPanel() {
  const checks = [
    "All critical findings verified fixed",
    "No new findings since last change",
    "Regression suite passing (148 / 148)",
    "2 of 2 human approvals",
  ];
  return (
    <Frame path="ship gate / acme-web → production" status={<Chip tone="green">Open</Chip>}>
      <div className="p-6">
        <div className="flex items-center gap-5">
          <div data-stagger className="relative flex h-20 w-20 shrink-0 items-center justify-center">
            <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
              <circle cx="18" cy="18" r="16" fill="none" className="stroke-white/10" strokeWidth="2.5" />
              <circle cx="18" cy="18" r="16" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="100.5" strokeDashoffset="4" />
            </svg>
            <span className="text-[22px] font-semibold">96</span>
          </div>
          <div data-stagger>
            <div className="text-[16px] font-medium">Safe to ship</div>
            <div className="text-[13px] text-white/50">Every check below passed on commit 3f9a1c2.</div>
          </div>
        </div>
        <ul className="mt-6 space-y-3">
          {checks.map((c) => (
            <li key={c} data-stagger className="flex items-center gap-3 text-[14px] text-white/85">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-400 text-black"><Check className="h-3 w-3" strokeWidth={3} /></span>
              {c}
            </li>
          ))}
        </ul>
        <div data-stagger className="mt-6 flex items-center justify-center gap-2 rounded-xl bg-white py-3 text-[15px] font-medium text-black">
          <Rocket className="h-4 w-4" /> Deploy to production
        </div>
      </div>
    </Frame>
  );
}