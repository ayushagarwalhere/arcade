/**
 * Docs navigation. This file is deliberately content-free so the client shell
 * can import it without pulling every page into its bundle.
 */

/** The route the docs are mounted at. Change this one line to move them. */
export const DOCS_BASE = "/arcade/docs";

export const DOCS_VERSION = "v0.1";

export interface NavItem {
  slug: string;
  label: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    title: "Start here",
    items: [
      { slug: "", label: "What is Arcade?" },
      { slug: "install", label: "Install" },
      { slug: "first-run", label: "Your first security run" },
    ],
  },
  {
    title: "The Arcade model",
    items: [
      { slug: "model/security-loop", label: "The security loop" },
      { slug: "model/agents", label: "The five agents" },
      { slug: "model/findings", label: "Findings" },
      { slug: "model/evidence", label: "Evidence & verification" },
      { slug: "model/approvals", label: "Approval gates" },
      { slug: "model/sandbox", label: "Sandboxes" },
    ],
  },
  {
    title: "The workbench",
    items: [
      { slug: "workbench/tour", label: "Workbench tour" },
      { slug: "workbench/attack-surface", label: "Attack Surface" },
      { slug: "workbench/reviewing-fixes", label: "Reviewing fixes" },
      { slug: "workbench/shortcuts", label: "Command palette & shortcuts" },
    ],
  },
  {
    title: "Working with agents",
    items: [
      { slug: "agents/providers", label: "Bring your own agent" },
      { slug: "agents/claude-code", label: "Claude Code with Arcade" },
      { slug: "agents/codex", label: "Codex with Arcade" },
    ],
  },
  {
    title: "CLI & automation",
    items: [
      { slug: "cli/overview", label: "CLI overview" },
      { slug: "cli/reference", label: "CLI reference" },
      { slug: "cli/mcp", label: "MCP server" },
    ],
  },
  {
    title: "Recipes",
    items: [
      { slug: "recipes/agent-self-check", label: "Let your agent check its own work" },
      { slug: "recipes/triage-critical", label: "Triage a critical finding" },
      { slug: "recipes/gate-a-merge", label: "Gate a merge on verification" },
    ],
  },
  {
    title: "Reference",
    items: [
      { slug: "reference/statuses", label: "Severity & status reference" },
      { slug: "reference/security", label: "Security & threat model" },
      { slug: "reference/privacy", label: "Privacy & telemetry" },
      { slug: "reference/troubleshooting", label: "Troubleshooting & FAQ" },
    ],
  },
];

export const FLAT: (NavItem & { group: string })[] = NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.title })));

/** Resolve a docs slug (optionally with a #hash) to a site path. */
export function docHref(slug: string): string {
  const [path, hash] = slug.split("#");
  return `${DOCS_BASE}${path ? `/${path}` : ""}${hash ? `#${hash}` : ""}`;
}

/** The docs slug for a pathname, tolerant of the trailing slash static export adds. */
export function slugFromPath(pathname: string): string {
  return pathname.replace(/\/+$/, "").slice(DOCS_BASE.length).replace(/^\/+/, "");
}

export function neighbors(slug: string) {
  const i = FLAT.findIndex((n) => n.slug === slug);
  return { prev: i > 0 ? FLAT[i - 1] : undefined, next: i >= 0 ? FLAT[i + 1] : undefined };
}

export function groupOf(slug: string): string | undefined {
  return FLAT.find((n) => n.slug === slug)?.group;
}
