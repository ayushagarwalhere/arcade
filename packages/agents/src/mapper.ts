/**
 * Mapper — the first agent. It understands the application.
 *
 * From the scan it builds two things every later agent and view reads: the
 * project profile (stack, rough size, privileged operations) and the
 * attack-surface graph. The graph is a fixed set of layers (user → browser →
 * api → services → data / secrets); the mapper marks a layer "vulnerable" when
 * a finding of the matching category lands on it and draws the exploit path to
 * the layer that carries the strongest finding.
 */
import type { AttackSurface, Finding, Project, SurfaceEdge, SurfaceNode } from "@arcade/core/types";
import type { Scan } from "@arcade/core/scanner";

const TECH_SIGNALS: { test: RegExp; label: string }[] = [
  { test: /(^|\/)next\.config\.(js|ts|mjs)$/, label: "Next.js" },
  { test: /(^|\/)package\.json$/, label: "Node" },
  { test: /(^|\/)tsconfig\.json$/, label: "TypeScript" },
  { test: /(^|\/)requirements\.txt$|(^|\/)pyproject\.toml$/, label: "Python" },
  { test: /(^|\/)go\.mod$/, label: "Go" },
  { test: /(^|\/)Gemfile$/, label: "Ruby" },
  { test: /(^|\/)pom\.xml$|(^|\/)build\.gradle$/, label: "Java" },
  { test: /(^|\/)Dockerfile$|(^|\/)docker-compose\.ya?ml$/, label: "Docker" },
  { test: /(^|\/)(prisma\/schema\.prisma|schema\.prisma)$/, label: "Prisma" },
  { test: /(^|\/).*\.sql$/, label: "SQL" },
  { test: /(^|\/)(migrations?)\//, label: "Migrations" },
];

const countRoutes = (paths: string[]) =>
  paths.filter((p) => /\/(api|routes?|controllers?|handlers?)\//i.test(p) || /route\.(t|j)sx?$/.test(p) || /\.controller\.(t|j)s$/.test(p)).length;

const serviceNames = (paths: string[]) => [
  ...new Set(paths.map((p) => p.match(/(?:^|\/)(?:services|apps|packages)\/([^/]+)\//)?.[1]).filter(Boolean) as string[]),
];

export function mapProject(scan: Scan, name: string, repo: string): Project {
  const techs = new Set<string>();
  for (const s of TECH_SIGNALS) if (scan.paths.some((p) => s.test.test(p))) techs.add(s.label);
  // Fall back to the dominant languages if no manifests were found.
  Object.entries(scan.languages)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .forEach(([lang]) => techs.add(lang));

  const endpoints = countRoutes(scan.paths);
  const authBoundaries = new Set(scan.hits.filter((h) => h.rule.category === "authz").map((h) => h.path)).size;
  const integrations = new Set(scan.hits.filter((h) => h.rule.category === "ssrf" || h.rule.category === "transport").map((h) => h.path)).size;
  const privilegedOps = scan.hits.filter((h) => h.rule.category === "authz").length;

  return {
    id: name,
    name,
    repo,
    description: `Imported from ${repo}. Indexed ${scan.paths.length} files; statically analysed ${scan.filesScanned}.`,
    technologies: [...techs].slice(0, 8),
    services: serviceNames(scan.paths).slice(0, 6),
    endpoints,
    authBoundaries: Math.max(authBoundaries, 0),
    integrations,
    privilegedOps,
  };
}

/** Map a finding's category to the surface layer it threatens. */
const LAYER_FOR = {
  authz: "admin",
  injection: "database",
  secrets: "secrets",
  crypto: "auth",
  xss: "browser",
  transport: "thirdparty",
  ssrf: "service",
  path: "service",
  config: "api",
} as const;

export function mapSurface(findings: Finding[], scan: Scan): AttackSurface {
  const risky = new Set<SurfaceNode["kind"]>(findings.map((f) => LAYER_FOR[categoryOf(f, scan)]));
  const hasThird = scan.hits.some((h) => h.rule.category === "transport" || h.rule.category === "ssrf");
  const hasSecrets = scan.hits.some((h) => h.rule.category === "secrets");

  const riskOf = (id: SurfaceNode["kind"]): SurfaceNode["risk"] =>
    risky.has(id) ? "vulnerable" : id === "api" || id === "auth" ? "attention" : "safe";

  const nodes: SurfaceNode[] = [
    { id: "user", label: "User", kind: "user", col: 0, row: 1, risk: "safe", detail: "External caller. Holds whatever session the app issues." },
    { id: "browser", label: "Client", kind: "browser", col: 1, row: 1, risk: riskOf("browser"), detail: "Front-end that renders responses and forwards the session." },
    { id: "api", label: "API / Routes", kind: "api", col: 2, row: 1, risk: riskOf("api"), detail: `${scan.paths.length ? countRoutes(scan.paths) : 0} route-like files. Entry point for requests.` },
    { id: "auth", label: "Auth", kind: "auth", col: 2, row: 0, risk: riskOf("auth"), detail: "Session / token verification and any role checks." },
    { id: "service", label: "Services", kind: "service", col: 3, row: 1, risk: riskOf("service"), detail: "Business logic: outbound calls, file access, subprocesses." },
    { id: "admin", label: "Privileged ops", kind: "admin", col: 3, row: 2, risk: riskOf("admin"), detail: "Handlers that perform privileged actions." },
    { id: "db", label: "Data store", kind: "database", col: 4, row: 1, risk: riskOf("database"), detail: "Primary datastore reached through queries." },
  ];
  if (hasSecrets) nodes.push({ id: "secrets", label: "Secrets", kind: "secrets", col: 4, row: 2, risk: "vulnerable", detail: "Credentials found at rest in the source." });
  if (hasThird) nodes.push({ id: "thirdparty", label: "3rd-party", kind: "thirdparty", col: 4, row: 0, risk: riskOf("thirdparty"), detail: "Outbound integrations over the network." });

  const ids = new Set(nodes.map((n) => n.id));
  const edge = (from: string, to: string, extra?: Partial<SurfaceEdge>): SurfaceEdge | null =>
    ids.has(from) && ids.has(to) ? { from, to, ...extra } : null;

  const top = findings[0];
  const topLayer = top ? LAYER_FOR[categoryOf(top, scan)] : "api";
  const topNodeId = nodes.find((n) => n.kind === topLayer)?.id;

  const edges = [
    edge("user", "browser"),
    edge("browser", "api", { label: "session" }),
    edge("api", "auth", { label: "verify" }),
    edge("api", "service"),
    edge("api", "admin", top?.severity === "critical" && topLayer === "admin" ? { vulnerable: true, label: "no authz" } : undefined),
    edge("service", "db"),
    edge("admin", "db", topLayer === "database" || topLayer === "admin" ? { vulnerable: true } : undefined),
    edge("service", "thirdparty"),
    edge("service", "secrets"),
    edge("admin", "secrets"),
  ].filter(Boolean) as SurfaceEdge[];

  // Exploit path: user → api → the layer carrying the strongest finding.
  const path = ["user", "browser", "api", topNodeId];
  if (topLayer === "database" && ids.has("db")) path.push("db");
  const exploitPath = [...new Set(path.filter(Boolean) as string[])];

  return { nodes, edges, exploitPath };
}

/** Recover a finding's rule category from the scan (findings don't carry it). */
function categoryOf(f: Finding, scan: Scan): keyof typeof LAYER_FOR {
  const hit = scan.hits.find((h) => h.path === f.vulnerableCode.path && h.match.line === (f.vulnerableCode.lines.find((l) => l.flagged)?.no ?? -1));
  return (hit?.rule.category ?? "config") as keyof typeof LAYER_FOR;
}
