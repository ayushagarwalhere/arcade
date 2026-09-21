// SAMPLE DATA — a fictional security run against a project that does not exist
// ("acme/commerce-api"). It is printed only by `arcade demo`, under a banner that
// says so, to show what a full run in the desktop app looks like. No other command
// and no MCP tool reads this file: they report on the real project they run in.

export const SNAPSHOT = {
  version: "0.1.0",
  run: "scan-admin-authz",
  phase: "verified",
  project: {
    id: "acme-commerce",
    repo: "acme/commerce-api",
    technologies: ["Next.js 15", "Node 20", "PostgreSQL", "Prisma", "Stripe", "JWT sessions"],
    endpoints: 17,
    authBoundaries: 4,
    integrations: 3,
    privilegedOps: 2,
  },
  environment: { sandboxId: "sandbox-7f2c", isolated: true, disposable: true, network: "none", host: "localhost:3000" },
  agents: {
    mapper: "done",
    attacker: "done",
    defender: "done",
    remediator: "done",
    verifier: "done",
  },
  attackSurface: {
    nodes: [
      { id: "user", label: "User", risk: "safe" },
      { id: "browser", label: "Browser", risk: "safe" },
      { id: "api", label: "API Gateway", risk: "attention" },
      { id: "auth", label: "Auth / Session", risk: "attention" },
      { id: "orders", label: "Orders Service", risk: "safe" },
      { id: "admin", label: "Admin Export", risk: "vulnerable" },
      { id: "db", label: "PostgreSQL", risk: "attention" },
      { id: "stripe", label: "Stripe API", risk: "safe" },
      { id: "secrets", label: "Secrets / .env", risk: "attention" },
    ],
    exploitPath: ["user", "browser", "api", "admin", "db"],
  },
  findings: [
    {
      id: "ARC-001",
      title: "Broken authorization on admin export",
      severity: "critical",
      status: "verified",
      target: "POST /api/admin/export",
      cwe: "CWE-862",
      agent: "Attacker",
      evidence: {
        method: "POST",
        target: "https://localhost:3000/api/admin/export",
        statusBefore: "200 OK",
        artifact: "evidence/ARC-001.json",
        reproduction: [
          "Sign in as a standard-tier user",
          "Capture the session cookie",
          "POST /api/admin/export with that cookie",
          "Receive 48,210 records belonging to other customers",
        ],
      },
      verification: {
        outcome: "verified",
        independent: true,
        statusBefore: "200 OK",
        statusAfter: "403 Forbidden",
        mutatedPayloads: 64,
        mutatedSucceeded: 0,
        regression: "156/156",
      },
    },
    { id: "ARC-002", title: "SQL injection in order lookup", severity: "high", status: "remediating", target: "GET /api/orders", cwe: "CWE-89", agent: "Attacker" },
    { id: "ARC-003", title: "JWT accepts alg: none", severity: "high", status: "analyzing", target: "POST /api/auth/verify", cwe: "CWE-347", agent: "Attacker" },
    { id: "ARC-004", title: "Stripe test key committed to history", severity: "medium", status: "reproduced", target: ".env.example @ a91f", cwe: "CWE-798", agent: "Attacker" },
    { id: "ARC-005", title: "Missing security headers", severity: "low", status: "reproduced", target: "All responses", cwe: "CWE-693", agent: "Attacker" },
  ],
  timeline: [
    { time: "09:41", actor: "Mapper", text: "Imported acme-commerce and indexed 312 files" },
    { time: "09:43", actor: "Attacker", text: "Replayed a standard cookie against admin export" },
    { time: "09:44", actor: "Attacker", text: "Exploit reproduced · 200 OK · evidence captured" },
    { time: "09:47", actor: "Defender", text: "Root cause: session proved authn, never authz" },
    { time: "09:49", actor: "You", text: "Approved the proposed fix" },
    { time: "09:52", actor: "Remediator", text: "Wrote fix + regression test on fix/admin-export-authz" },
    { time: "09:55", actor: "Verifier", text: "Replayed original attack against the fix" },
    { time: "09:56", actor: "Verifier", text: "200 OK → 403 Forbidden · 0/64 mutations · VERIFIED" },
  ],
};
