/**
 * Deterministic demo data for the Arcade ADE.
 *
 * A realistic AI-generated e-commerce backend ("acme-commerce") with one
 * flagship vulnerability that flows through the whole loop —
 * map → attack → evidence → defend → approve → remediate → test → verify —
 * plus a handful of secondary findings so the findings list feels real.
 *
 * The same shapes a real agent backend would emit (see types.ts). The store
 * replays this data on a timer so a demo run is repeatable and evidence-first.
 */
import type {
  Agent,
  AgentKind,
  AgentProvider,
  AttackSurface,
  Finding,
  Project,
  TargetEnvironment,
  TerminalLine,
  TimelineEvent,
  Workspace,
} from "./types";

export const PROJECT: Project = {
  id: "acme-commerce",
  name: "acme-commerce",
  repo: "acme/commerce-api",
  description:
    "AI-generated Next.js + Node commerce backend. Imported from a local folder 3 minutes ago.",
  technologies: ["Next.js 15", "Node 20", "PostgreSQL", "Prisma", "Stripe", "JWT sessions"],
  services: ["web", "api-gateway", "orders-service", "admin-service"],
  endpoints: 17,
  authBoundaries: 4,
  integrations: 3,
  privilegedOps: 2,
};

export const ENVIRONMENT: TargetEnvironment = {
  isolated: true,
  disposable: true,
  host: "localhost:3000",
  network: "none",
  sandboxId: "sandbox-7f2c",
};

export const PROVIDERS: AgentProvider[] = [
  { id: "claude-code", name: "Claude Code", connected: true },
  { id: "codex", name: "Codex", connected: true },
  { id: "cursor", name: "Cursor CLI", connected: false },
  { id: "opencode", name: "OpenCode", connected: false },
  { id: "gemini", name: "Gemini CLI", connected: false },
];

export const WORKSPACES: Workspace[] = [
  {
    id: "scan-admin-authz",
    name: "scan-admin-authz",
    branch: "fix/admin-export-authz",
    status: "active",
    agents: ["mapper", "attacker", "defender", "remediator", "verifier"],
  },
  {
    id: "scan-api-security",
    name: "scan-api-security",
    branch: "scan/api-security",
    status: "queued",
    agents: ["attacker", "verifier"],
  },
  {
    id: "scan-secrets",
    name: "scan-secrets",
    branch: "scan/secrets",
    status: "queued",
    agents: ["mapper", "attacker"],
  },
];

export const AGENT_META: Record<AgentKind, Pick<Agent, "kind" | "name" | "role">> = {
  mapper: { kind: "mapper", name: "Mapper", role: "Understands the application" },
  attacker: { kind: "attacker", name: "Attacker", role: "Reproduces exploits in a sandbox" },
  defender: { kind: "defender", name: "Defender", role: "Traces root cause, ranks fixes" },
  remediator: { kind: "remediator", name: "Remediator", role: "Writes the fix and tests" },
  verifier: { kind: "verifier", name: "Verifier", role: "Independently re-runs the attack" },
};

export function initialAgents(): Record<AgentKind, Agent> {
  const mk = (kind: AgentKind, task: string): Agent => ({
    ...AGENT_META[kind],
    status: "idle",
    task,
    progress: 0,
  });
  return {
    mapper: mk("mapper", "Waiting to start"),
    attacker: mk("attacker", "Waiting for the security map"),
    defender: mk("defender", "Waiting for a reproduced finding"),
    remediator: mk("remediator", "Waiting for an approved mitigation"),
    verifier: mk("verifier", "Waiting for a fix to verify"),
  };
}

export function initialSurface(): AttackSurface {
  return {
    nodes: [
      { id: "user", label: "User", kind: "user", col: 0, row: 1, risk: "safe", detail: "Authenticated standard-tier customer. Holds a valid session cookie." },
      { id: "browser", label: "Browser", kind: "browser", col: 1, row: 1, risk: "safe", detail: "Next.js client. Sends the session cookie with every request." },
      { id: "api", label: "API Gateway", kind: "api", col: 2, row: 1, risk: "attention", detail: "Express gateway. 17 routes. Validates the session but does not consistently check roles." },
      { id: "auth", label: "Auth / Session", kind: "auth", col: 2, row: 0, risk: "attention", detail: "JWT sessions. validateSession() confirms the token is valid but returns no role claim to most handlers." },
      { id: "orders", label: "Orders Service", kind: "service", col: 3, row: 1, risk: "safe", detail: "Reads and writes orders for the signed-in user. Ownership enforced with user_id." },
      { id: "stripe", label: "Stripe API", kind: "thirdparty", col: 3, row: 0, risk: "safe", detail: "Outbound only. Secret key loaded from environment." },
      { id: "admin", label: "Admin Export", kind: "admin", col: 3, row: 2, risk: "vulnerable", detail: "POST /api/admin/export. Streams every customer's records. Checks that you are logged in — not that you are an admin." },
      { id: "db", label: "PostgreSQL", kind: "database", col: 4, row: 1, risk: "attention", detail: "Primary datastore. The admin export runs an unscoped SELECT across all tenants." },
      { id: "secrets", label: "Secrets / .env", kind: "secrets", col: 4, row: 2, risk: "attention", detail: "Stripe key and DB URL. One test key is committed to the repo history." },
    ],
    edges: [
      { from: "user", to: "browser" },
      { from: "browser", to: "api", label: "session cookie" },
      { from: "api", to: "auth", label: "validateSession()" },
      { from: "api", to: "orders" },
      { from: "orders", to: "db" },
      { from: "orders", to: "stripe" },
      { from: "api", to: "admin", vulnerable: true, label: "no role check" },
      { from: "admin", to: "db", vulnerable: true, label: "unscoped SELECT" },
      { from: "admin", to: "secrets" },
    ],
    exploitPath: ["user", "browser", "api", "admin", "db"],
  };
}

/* ---------------------------------------------------------------------------
 * Flagship finding — ARC-001, broken authorization on the admin export.
 * ------------------------------------------------------------------------- */

export const FLAGSHIP: Finding = {
  id: "ARC-001",
  title: "Broken authorization on admin export",
  severity: "critical",
  status: "reproduced",
  target: "POST /api/admin/export",
  cwe: "CWE-862 · Missing Authorization",
  summary:
    "Any logged-in standard user can call the admin-only export endpoint and download every customer's orders and personal data.",
  description:
    "The export handler confirms the caller has a valid session, but never checks that the session belongs to an administrator. Because validateSession() returns only that the token is valid — not the caller's role — the handler treats every authenticated user as authorized. A standard-tier customer can POST to /api/admin/export and receive the full multi-tenant dataset.",
  attackNarrative:
    "The attacker signed in as a normal customer (tier: standard), captured the session cookie the browser already sends, and replayed it against POST /api/admin/export. The gateway ran validateSession(), saw a valid token, and streamed 48,210 records belonging to other customers. No admin role was ever required.",
  vulnerableCode: {
    path: "src/api/admin/export.ts",
    lines: [
      { no: 12, text: "export async function POST(req: Request) {" },
      { no: 13, text: "  const session = await validateSession(req)" },
      { no: 14, text: "  if (!session) return json({ error: 'unauthenticated' }, 401)" },
      { no: 15, text: "  // TODO: gate to admins — added later", flagged: true },
      { no: 16, text: "  const rows = await db.query('SELECT * FROM orders')" },
      { no: 17, text: "  return json({ records: rows })" },
      { no: 18, text: "}" },
    ],
  },
  evidence: {
    method: "POST",
    target: "https://localhost:3000/api/admin/export",
    requestHeaders: [
      "Cookie: session=eyJhbGciOi…q0v8  (tier: standard)",
      "Content-Type: application/json",
      "X-Arcade-Sandbox: sandbox-7f2c",
    ],
    requestBody: '{ "format": "json", "range": "all" }',
    statusBefore: "200 OK",
    responseBody:
      '{ "records": [ { "id": 1, "email": "dana@ex.com", "total": 429.10 }, { "id": 2, "email": "lee@ex.com", "total": 88.00 }, … 48208 more ] }',
    steps: [
      "Sign in through the normal login form as a standard-tier user",
      "Capture the session cookie the browser already sends",
      "Replay the cookie against POST /api/admin/export",
      "Receive 48,210 records belonging to other customers",
    ],
    artifact: "evidence/ARC-001.json · 3 requests · 1 replay script",
    capturedAt: "09:44:02",
  },
  mitigations: [
    {
      title: "Require the admin role with requireRole(\"admin\")",
      detail:
        "Add a role gate after the session check. validateSession() must return the role claim so the handler can reject non-admins with 403 before any query runs.",
      recommended: true,
      effort: "low",
    },
    {
      title: "Scope the export query to the caller",
      detail:
        "Even for admins, replace SELECT * FROM orders with a tenant-scoped query so a mistake never leaks the whole table.",
      recommended: false,
      effort: "medium",
    },
    {
      title: "Move export behind the admin service boundary",
      detail:
        "Relocate the route to the admin service, reachable only on the internal network. Highest assurance, largest change.",
      recommended: false,
      effort: "high",
    },
  ],
  remediation: {
    branch: "fix/admin-export-authz",
    commit: "3f9a1c2",
    summary: "fix(admin): require admin role on export and scope the query",
    rootCause:
      "validateSession() proved authentication but not authorization. The handler had a TODO where the role check belonged.",
    files: [
      {
        path: "src/api/admin/export.ts",
        status: "M",
        additions: 5,
        deletions: 2,
        diff: [
          { kind: "hunk", text: "@@ -12,7 +12,10 @@ export async function POST(req: Request) {" },
          { kind: "context", oldNo: 12, newNo: 12, text: "export async function POST(req: Request) {" },
          { kind: "del", oldNo: 13, text: "  const session = await validateSession(req)" },
          { kind: "add", newNo: 13, text: "  const session = await validateSession(req)" },
          { kind: "context", oldNo: 14, newNo: 14, text: "  if (!session) return json({ error: 'unauthenticated' }, 401)" },
          { kind: "del", oldNo: 15, text: "  // TODO: gate to admins — added later" },
          { kind: "add", newNo: 15, text: "  if (session.role !== 'admin')" },
          { kind: "add", newNo: 16, text: "    return json({ error: 'forbidden' }, 403)" },
          { kind: "del", oldNo: 16, text: "  const rows = await db.query('SELECT * FROM orders')" },
          { kind: "add", newNo: 17, text: "  const rows = await db.query(" },
          { kind: "add", newNo: 18, text: "    'SELECT * FROM orders WHERE tenant_id = $1', [session.tenantId])" },
          { kind: "context", oldNo: 17, newNo: 19, text: "  return json({ records: rows })" },
          { kind: "context", oldNo: 18, newNo: 20, text: "}" },
        ],
      },
      {
        path: "src/auth/session.ts",
        status: "M",
        additions: 2,
        deletions: 1,
        diff: [
          { kind: "hunk", text: "@@ -40,7 +40,8 @@ export async function validateSession(req) {" },
          { kind: "context", oldNo: 40, newNo: 40, text: "  const claims = verify(token, key)" },
          { kind: "del", oldNo: 41, text: "  return { userId: claims.sub }" },
          { kind: "add", newNo: 41, text: "  return { userId: claims.sub, role: claims.role," },
          { kind: "add", newNo: 42, text: "           tenantId: claims.tid }" },
          { kind: "context", oldNo: 42, newNo: 43, text: "}" },
        ],
      },
      {
        path: "tests/security/exploit-ARC-001.test.ts",
        status: "A",
        additions: 24,
        deletions: 0,
        diff: [
          { kind: "hunk", text: "@@ -0,0 +1,24 @@" },
          { kind: "add", newNo: 1, text: "// Regression: replays the original ARC-001 exploit." },
          { kind: "add", newNo: 2, text: "test('standard user cannot call admin export', async () => {" },
          { kind: "add", newNo: 3, text: "  const cookie = await loginAs('standard')" },
          { kind: "add", newNo: 4, text: "  const res = await post('/api/admin/export', { cookie })" },
          { kind: "add", newNo: 5, text: "  expect(res.status).toBe(403)" },
          { kind: "add", newNo: 6, text: "})" },
        ],
      },
    ],
    tests: [
      { name: "standard user cannot call admin export", suite: "exploit-ARC-001", passed: true, ms: 41 },
      { name: "admin can still export their tenant", suite: "admin-export", passed: true, ms: 55 },
      { name: "export is scoped to one tenant", suite: "admin-export", passed: true, ms: 38 },
      { name: "session returns role + tenant claims", suite: "auth-session", passed: true, ms: 12 },
    ],
    commands: ["git checkout -b fix/admin-export-authz", "npm test -- security"],
  },
  verification: {
    outcome: "pending",
    independent: true,
    replaySummary: "Rebuilt the sandbox from the fix branch and replayed the original request plus 64 mutations.",
    statusBefore: "200 OK",
    statusAfter: "403 Forbidden",
    mutatedPayloads: 64,
    mutatedSucceeded: 0,
    regressionPassed: 156,
    regressionTotal: 156,
  },
  timeline: [],
  agent: "Attacker",
  createdAt: "09:44",
};

/* ---------------------------------------------------------------------------
 * Secondary findings — populate the findings list; lighter but complete.
 * ------------------------------------------------------------------------- */

function makeSecondary(f: Partial<Finding> & Pick<Finding, "id" | "title" | "severity" | "status" | "target" | "cwe" | "summary">): Finding {
  return {
    description: f.summary,
    attackNarrative: "",
    vulnerableCode: { path: f.target, lines: [] },
    evidence: {
      method: "GET",
      target: f.target,
      requestHeaders: [],
      statusBefore: "—",
      responseBody: "—",
      steps: [],
      artifact: "",
      capturedAt: "",
    },
    mitigations: [],
    remediation: { branch: "", commit: "", summary: "", rootCause: "", files: [], tests: [], commands: [] },
    verification: { outcome: "pending", independent: true, replaySummary: "", statusBefore: "—", statusAfter: "—", mutatedPayloads: 0, mutatedSucceeded: 0, regressionPassed: 0, regressionTotal: 0 },
    timeline: [],
    agent: "Attacker",
    createdAt: "09:45",
    ...f,
  } as Finding;
}

export const SECONDARY_FINDINGS: Finding[] = [
  makeSecondary({
    id: "ARC-002",
    title: "SQL injection in order lookup",
    severity: "high",
    status: "remediating",
    target: "GET /api/orders",
    cwe: "CWE-89 · SQL Injection",
    summary: "The id query parameter is concatenated into a SQL string, letting an attacker read the whole orders table.",
  }),
  makeSecondary({
    id: "ARC-003",
    title: "JWT accepts alg: none",
    severity: "high",
    status: "analyzing",
    target: "POST /api/auth/verify",
    cwe: "CWE-347 · Improper Signature Verification",
    summary: "Tokens signed with alg: none are accepted, so a forged token grants any identity.",
  }),
  makeSecondary({
    id: "ARC-004",
    title: "Stripe test key committed to history",
    severity: "medium",
    status: "reproduced",
    target: ".env.example @ commit a91f",
    cwe: "CWE-798 · Hard-coded Credentials",
    summary: "A live-shaped Stripe test key is present in git history and readable from the repo.",
  }),
  makeSecondary({
    id: "ARC-005",
    title: "Missing security headers",
    severity: "low",
    status: "reproduced",
    target: "All responses",
    cwe: "CWE-693 · Protection Mechanism Failure",
    summary: "No Content-Security-Policy, HSTS or X-Content-Type-Options on any response.",
  }),
];

/* ---------------------------------------------------------------------------
 * Phase scripts — terminal output + timeline events appended per phase.
 * ------------------------------------------------------------------------- */

export interface PhaseScript {
  terminal: TerminalLine[];
  timeline: TimelineEvent[];
}

export const SCRIPTS: Record<string, PhaseScript> = {
  mapping: {
    terminal: [
      { agent: "mapper", kind: "cmd", text: "arcade map ." },
      { agent: "mapper", kind: "info", text: "Indexing 312 files across 4 services" },
      { agent: "mapper", kind: "sub", text: "routes 17 · auth flows 3 · data stores 2 · integrations 3" },
      { agent: "mapper", kind: "info", text: "Building the attack-surface graph" },
      { agent: "mapper", kind: "warn", text: "POST /api/admin/export checks a session but no role" },
      { agent: "mapper", kind: "ok", text: "security-map.json written · 9 nodes, 9 edges" },
    ],
    timeline: [
      { time: "09:41", actor: "Mapper", kind: "map", text: "Imported acme-commerce and indexed 312 files" },
      { time: "09:42", actor: "Mapper", kind: "map", text: "Discovered POST /api/admin/export with no role check" },
    ],
  },
  attacking: {
    terminal: [
      { agent: "attacker", kind: "cmd", text: "arcade attack --target localhost:3000 --sandbox" },
      { agent: "attacker", kind: "info", text: "Spawned sandbox-7f2c · network: none · secrets: stripped" },
      { agent: "attacker", kind: "info", text: "Signing in as a standard-tier user" },
      { agent: "attacker", kind: "info", text: "POST /api/admin/export with the standard session cookie" },
      { agent: "attacker", kind: "sub", text: "200 OK · 48,210 records returned (expected: 403)" },
      { agent: "attacker", kind: "warn", text: "Response contains other customers' emails and totals" },
      { agent: "attacker", kind: "info", text: "Saving reproduction → evidence/ARC-001.json" },
      { agent: "attacker", kind: "err", text: "CRITICAL  Broken authorization on /api/admin/export (CWE-862)" },
    ],
    timeline: [
      { time: "09:43", actor: "Attacker", kind: "attack", text: "Replayed a standard user's cookie against the admin export" },
      { time: "09:44", actor: "Attacker", kind: "evidence", text: "Exploit reproduced · 200 OK · evidence captured" },
    ],
  },
  defending: {
    terminal: [
      { agent: "defender", kind: "cmd", text: "arcade defend ARC-001" },
      { agent: "defender", kind: "info", text: "Tracing exploit ARC-001" },
      { agent: "defender", kind: "sub", text: "validateSession() → returns valid, no role → SELECT * FROM orders" },
      { agent: "defender", kind: "warn", text: "Blast radius: every tenant's orders and PII" },
      { agent: "defender", kind: "ok", text: "1  requireRole('admin')  · recommended · low effort" },
      { agent: "defender", kind: "plain", text: "2  scope query to caller   3  move behind admin boundary" },
    ],
    timeline: [
      { time: "09:47", actor: "Defender", kind: "defend", text: "Root cause: session proved authn, never authz" },
      { time: "09:47", actor: "Defender", kind: "defend", text: "Proposed 3 mitigations, requireRole('admin') recommended" },
    ],
  },
  remediating: {
    terminal: [
      { agent: "remediator", kind: "cmd", text: "git checkout -b fix/admin-export-authz" },
      { agent: "remediator", kind: "info", text: "Applying requireRole('admin') and scoping the query" },
      { agent: "remediator", kind: "sub", text: "src/api/admin/export.ts · src/auth/session.ts" },
      { agent: "remediator", kind: "info", text: "Writing regression test that replays ARC-001" },
      { agent: "remediator", kind: "sub", text: "tests/security/exploit-ARC-001.test.ts" },
      { agent: "remediator", kind: "ok", text: "committed 3f9a1c2 on fix/admin-export-authz" },
    ],
    timeline: [
      { time: "09:52", actor: "Remediator", kind: "remediate", text: "Wrote the fix and a regression test on fix/admin-export-authz" },
    ],
  },
  testing: {
    terminal: [
      { agent: "remediator", kind: "cmd", text: "npm test -- security" },
      { agent: "remediator", kind: "sub", text: "PASS  exploit-ARC-001 · standard user cannot call admin export" },
      { agent: "remediator", kind: "sub", text: "PASS  admin-export · admin can still export their tenant" },
      { agent: "remediator", kind: "sub", text: "PASS  auth-session · returns role + tenant claims" },
      { agent: "remediator", kind: "ok", text: "156 passed · 0 failed" },
    ],
    timeline: [
      { time: "09:53", actor: "Remediator", kind: "test", text: "Regression suite green · 156/156" },
    ],
  },
  verifying: {
    terminal: [
      { agent: "verifier", kind: "cmd", text: "arcade verify ARC-001 --replay --independent" },
      { agent: "verifier", kind: "info", text: "Rebuilding sandbox from fix/admin-export-authz @ 3f9a1c2" },
      { agent: "verifier", kind: "info", text: "Replaying the original exploit" },
      { agent: "verifier", kind: "sub", text: "POST /api/admin/export (standard cookie) → 403 Forbidden · 0 records" },
      { agent: "verifier", kind: "info", text: "Re-attacking with 64 mutated payloads" },
      { agent: "verifier", kind: "sub", text: "0 successful" },
      { agent: "verifier", kind: "ok", text: "Fix verified · the original exploit no longer works" },
    ],
    timeline: [
      { time: "09:55", actor: "Verifier", kind: "verify", text: "Replayed the original attack against the fix" },
      { time: "09:56", actor: "Verifier", kind: "verify", text: "200 OK → 403 Forbidden · 0/64 mutations succeeded · VERIFIED" },
    ],
  },
};
