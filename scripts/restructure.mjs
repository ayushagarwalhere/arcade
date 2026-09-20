#!/usr/bin/env node
// One-time migration of the Arcade repo to an npm-workspaces monorepo:
//
//   frontend/  →  apps/marketing   the landing site          (Next.js, :3000)
//                 apps/ade         the workbench + Electron  (Next.js, :3001)
//                 packages/core    platform-neutral model, engine, scanner, fs
//                 packages/agents  mapper / attacker / defender / …
//                 packages/orchestrator  whatever drives the agents (pipeline, live engine)
//                 packages/ui     components, hooks and theme both apps share
//   cli/       →  packages/cli
//   mobile/    →  apps/mobile      (stays outside the workspace; EAS uploads it alone)
//
// Where a file goes is decided from the import graph at run time, not from a
// hard-coded list, so the script can be re-run on a tree that has moved on.
// Everything is planned first; nothing is touched if the plan has errors.
//
//   node restructure.mjs <repoRoot> [--dry]

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { builtinModules } from "node:module";

const ROOT = path.resolve(process.argv[2] ?? ".");
const DRY = process.argv.includes("--dry");
const FE = path.join(ROOT, "frontend");

const die = (m) => {
  console.error(`\nABORTED — ${m}`);
  process.exit(1);
};
if (!fs.existsSync(path.join(FE, "package.json"))) die(`${FE} is not the Arcade frontend`);
if (fs.existsSync(path.join(ROOT, "apps")) || fs.existsSync(path.join(ROOT, "packages"))) die("apps/ or packages/ already exists");

const warnings = [];
const warn = (m) => warnings.push(m);
const posix = (p) => p.split(path.sep).join("/");
const read = (p) => fs.readFileSync(p, "utf8");

// ───────────────────────────────────────────────────────────── inventory ──

const SKIP_DIRS = new Set(["node_modules", ".next", "out", "release", "dist", ".turbo"]);
const SKIP_FILES = new Set(["tsconfig.tsbuildinfo", "next-env.d.ts", "package-lock.json"]);
const CODE = /\.(tsx?|jsx?|mjs|cjs)$/;

function walk(dir, skipDirs = SKIP_DIRS, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isSymbolicLink()) continue; // junctions (node_modules) are never followed
    if (e.isDirectory()) {
      if (!skipDirs.has(e.name)) walk(p, skipDirs, out);
    } else if (!SKIP_FILES.has(e.name)) out.push(p);
  }
  return out;
}

const feFiles = walk(FE).map((p) => posix(path.relative(FE, p)));
const feSet = new Set(feFiles);

// ─────────────────────────────────────────────────────────── import graph ──

const IMPORT_RE = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)(["'])([^"'\n]+)\2/g;
const RESOLVE_EXT = ["", ".ts", ".tsx", ".js", ".mjs", ".css", "/index.ts", "/index.tsx", "/index.js"];

/** Old frontend-relative path an import points at, or null for packages / unknown files. */
function resolveOld(fromRel, spec) {
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith(".")) base = path.posix.join(path.posix.dirname(fromRel), spec);
  else return null;
  for (const ext of RESOLVE_EXT) if (feSet.has(base + ext)) return { rel: base + ext, ext };
  return null;
}

const deps = new Map();
for (const f of feFiles) {
  if (!CODE.test(f)) continue;
  const found = [];
  for (const m of read(path.join(FE, f)).matchAll(IMPORT_RE)) {
    const r = resolveOld(f, m[3]);
    if (r) found.push(r.rel);
  }
  deps.set(f, found);
}

function reach(entries) {
  const seen = new Set();
  const stack = [...entries];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    stack.push(...(deps.get(f) ?? []));
  }
  return seen;
}
const isRootApp = (f) => f.startsWith("app/") && !f.startsWith("app/(site)/") && !f.startsWith("app/arcade/");
const rootAppFiles = feFiles.filter(isRootApp);
const siteReach = reach([...feFiles.filter((f) => f.startsWith("app/(site)/")), ...rootAppFiles]);
const adeReach = reach([...feFiles.filter((f) => f.startsWith("app/arcade/")), ...rootAppFiles]);

// ─────────────────────────────────────────────────────────── destinations ──

const M = "apps/marketing";
const A = "apps/ade";
const CORE = "packages/core";
const AGENTS = "packages/agents";
const ORCH = "packages/orchestrator";
const UI = "packages/ui";
const LIBS = [CORE, AGENTS, ORCH, UI];
const UNITS = [M, A, ...LIBS];
const PKG_NAME = { [CORE]: "@arcade/core", [AGENTS]: "@arcade/agents", [ORCH]: "@arcade/orchestrator", [UI]: "@arcade/ui" };

// Layering is core ← agents ← orchestrator. A lib/arcade file that reaches an agent,
// however indirectly, cannot live in core without making core ↔ agents circular.
const isAgent = (f) => f.startsWith("lib/arcade/agents/");
const drivesAgents = (f) => [...reach([f])].some(isAgent);

const ROOT_CONFIG = new Set(["package.json", "next.config.ts", "tsconfig.json", "eslint.config.mjs", "postcss.config.mjs", ".gitignore", "AGENTS.md", "CLAUDE.md", "README.md"]);
const dropped = [];

/** → list of new repo-relative paths (two for files both apps need), or [] when generated/dropped. */
function destOf(f) {
  if (f.startsWith("app/(site)/")) return [`${M}/src/${f}`];
  if (f.startsWith("app/arcade/")) return [`${A}/src/${f}`];
  if (f === "app/globals.css") return [`${UI}/src/styles/theme.css`];
  if (isRootApp(f)) return [`${M}/src/${f}`, `${A}/src/${f}`];
  if (f.startsWith("electron/") || f.startsWith("build-resources/")) return [`${A}/${f}`];
  if (f.startsWith("public/")) return [`${M}/${f}`];
  if (f.startsWith("types/")) {
    dropped.push(`frontend/${f} (stale copy of Next's generated types; the live ones are in .next/types)`);
    return [];
  }
  if (f.startsWith("lib/arcade/agents/")) return [`${AGENTS}/src/${f.slice("lib/arcade/agents/".length)}`];
  if (f.startsWith("lib/arcade/")) return [`${drivesAgents(f) ? ORCH : CORE}/src/${f.slice("lib/arcade/".length)}`];
  const m = /^(components|hooks|lib)\/(.+)$/.exec(f);
  if (m) {
    const [, kind, rest] = m;
    const inSite = siteReach.has(f);
    const inAde = adeReach.has(f);
    const adeFolder = /^(arcade|docs)\//.test(rest);
    const sub = rest.replace(/^arcade\//, "");
    if (inSite && inAde) return [`${UI}/src/${kind}/${sub}`];
    if (inAde || (!inSite && adeFolder)) return [`${A}/src/${kind}/${sub}`];
    return [`${M}/src/${kind}/${sub}`];
  }
  if (!f.includes("/")) {
    if (ROOT_CONFIG.has(f)) return []; // regenerated below
    if (f.startsWith(".env")) return [`${M}/${f}`, `${A}/${f}`];
  }
  warn(`no rule for frontend/${f} — left where it is`);
  return [];
}

const plan = new Map(); // old rel → [new rel, …]
const taken = new Map();
const errors = [];
for (const f of feFiles) {
  const to = destOf(f);
  plan.set(f, to);
  for (const t of to) {
    if (taken.has(t)) errors.push(`collision: ${taken.get(t)} and ${f} both map to ${t}`);
    taken.set(t, f);
  }
}
const unitOf = (p) => UNITS.find((u) => p.startsWith(u + "/"));

// ──────────────────────────────────────────────────────── import rewriting ──

const rewrites = [];

function newSpec(fromOld, fromNew, spec) {
  const r = resolveOld(fromOld, spec);
  if (!r) return spec;
  if (r.rel === "app/globals.css") return spec; // every app gets its own app/globals.css
  const targets = plan.get(r.rel) ?? [];
  if (!targets.length) {
    errors.push(`${fromOld} imports ${r.rel}, which is not being migrated`);
    return spec;
  }
  const fromUnit = unitOf(fromNew);
  const target = targets.find((t) => unitOf(t) === fromUnit) ?? targets[0];
  const toUnit = unitOf(target);
  // Keep the author's style: extension-less stays extension-less, a directory import stays one.
  const strip = (p) => (r.ext === "" ? p : r.ext.startsWith("/index") ? p.slice(0, -r.ext.length) : p.replace(/\.(tsx?|jsx?|mjs)$/, ""));

  if (toUnit === fromUnit) {
    const isApp = toUnit === M || toUnit === A;
    if (spec.startsWith("@/") && isApp && target.startsWith(`${toUnit}/src/`)) return "@/" + strip(target.slice(`${toUnit}/src/`.length));
    let rel = path.posix.relative(path.posix.dirname(fromNew), strip(target));
    if (!rel.startsWith(".")) rel = "./" + rel;
    return rel;
  }
  if (!PKG_NAME[toUnit]) {
    errors.push(`layering: ${fromNew} (from ${fromOld}) would import app code ${target}`);
    return spec;
  }
  return `${PKG_NAME[toUnit]}/${strip(target.slice(`${toUnit}/src/`.length))}`;
}

function rewriteImports(fromOld, fromNew, src) {
  return src.replace(IMPORT_RE, (all, lead, q, spec) => {
    const next = newSpec(fromOld, fromNew, spec);
    if (next !== spec) rewrites.push({ file: fromNew, from: spec, to: next });
    return `${lead}${q}${next}${q}`;
  });
}

// ─────────────────────────────────────────── cross-zone links & one-off patches ──

/** Turn `<Link href=X …>…</Link>` into `<a href=Y …>…</a>`: links that leave this app need a full page load. */
function zoneLinks(src, hrefSource, newHref) {
  const open = new RegExp(`<Link(\\s[^>]*?)href=${hrefSource}`, "g");
  let out = src;
  let count = 0;
  for (let m; (m = open.exec(out)); ) {
    const close = out.indexOf("</Link>", m.index);
    if (close < 0) break;
    out = out.slice(0, close) + "</a>" + out.slice(close + "</Link>".length);
    out = out.slice(0, m.index) + `<a${m[1]}href=${newHref}` + out.slice(m.index + m[0].length);
    count++;
    open.lastIndex = 0;
  }
  if (count && !/<Link[\s>]/.test(out)) out = out.replace(/^import Link from ["']next\/link["'];?\r?\n/m, "");
  return { out, count };
}

function ensureSiteImport(src, fromNew) {
  if (/\bimport\s*\{[^}]*\bSITE\b[^}]*\}/.test(src)) return src;
  const line = `import { SITE } from "@arcade/ui/lib/site";`;
  const lastImport = [...src.matchAll(/^import [^\n]*\n/gm)].pop();
  if (!lastImport) return `${line}\n${src}`;
  const at = lastImport.index + lastImport[0].length;
  return src.slice(0, at) + line + "\n" + src.slice(at);
}

const patchLog = [];
function patchSource(oldRel, newRel, src) {
  const unit = unitOf(newRel);
  let out = src;

  if (/\.tsx$/.test(newRel)) {
    // Out of the ADE, back to the site.
    if (unit === A) {
      const r = zoneLinks(out, `"/"`, "{SITE.home}");
      if (r.count) {
        out = ensureSiteImport(r.out, newRel);
        patchLog.push(`${newRel}: ${r.count} link(s) to the site made cross-zone`);
      }
    }
    // Into the ADE, from anywhere that is not the ADE.
    if (unit !== A) {
      const r = zoneLinks(out, `\\{SITE\\.ade\\}`, "{SITE.ade}");
      if (r.count) {
        out = r.out;
        patchLog.push(`${newRel}: ${r.count} link(s) to the ADE made cross-zone`);
      }
    }
  }

  if (oldRel === "lib/site.ts") {
    const before = out;
    out = out.replace(
      /^(\s*)ade:\s*"\/arcade\/?",[^\n]*\n/m,
      (_all, ind) =>
        `${ind}// The site and the ADE are separate apps (zones): same domain in production,\n` +
        `${ind}// two dev servers locally. Link between them with <a>, not <Link>.\n` +
        `${ind}home: process.env.NEXT_PUBLIC_SITE_URL ?? (DEV ? "http://localhost:3000/" : "/"),\n` +
        `${ind}ade: process.env.NEXT_PUBLIC_ADE_URL ?? (DEV ? "http://localhost:3001/arcade/" : "/arcade/"),\n`,
    );
    if (out === before) warn(`${newRel}: could not find \`ade: "/arcade"\` — add SITE.home / SITE.ade zone URLs by hand`);
    else {
      out = out.replace(/^export const SITE\b/m, `const DEV = process.env.NODE_ENV === "development";\n\nexport const SITE`);
      patchLog.push(`${newRel}: SITE.ade is zone-aware, SITE.home added`);
    }
  }

  if (oldRel.startsWith("electron/")) {
    const before = out;
    out = out.replaceAll("localhost:3000", "localhost:3001");
    out = out.replace(/path\.join\(__dirname,\s*"\.\.",\s*"\.\.",\s*"cli"\)/g, `path.join(__dirname, "..", "..", "..", "packages", "cli")`);
    out = out.replace("The CLI folder sits next to frontend/ in the repo", "The CLI lives in packages/cli in the repo");
    if (out !== before) patchLog.push(`${newRel}: dev URL → :3001 / CLI path → packages/cli`);
  }
  return out;
}

/** Path mentions in prose, comments and docs content. Order matters: most specific first. */
const TEXT_RULES = [
  [/frontend\/lib\/arcade\/agents\//g, "packages/agents/src/"],
  [/frontend\/lib\/arcade\//g, "packages/core/src/"],
  [/frontend\/lib\/arcade\b/g, "packages/core/src"],
  [/frontend\/app\/globals\.css/g, "packages/ui/src/styles/theme.css"],
  [/frontend\/components\/arcade\b/g, "apps/ade/src/components"],
  [/frontend\/(release|electron|\.env\.local)/g, "apps/ade/$1"],
  [/(?<![\w-])cli\/(?=[\w-]+\.mjs)/g, "packages/cli/"],
  [/`cli\/`/g, "`packages/cli/`"],
  [/`arcade\/cli`/g, "`arcade/packages/cli`"],
];
const TEXT_FILE = /\.(tsx?|jsx?|mjs|cjs|md|css)$/;
function patchText(src) {
  let out = src;
  for (const [re, to] of TEXT_RULES) out = out.replace(re, to);
  return out;
}

// ──────────────────────────────────────────────────────────── build the writes ──

const writes = new Map(); // new rel → string content
const copies = []; // [old abs, new rel] for binary / non-text files

for (const [f, targets] of plan) {
  if (!targets.length) continue;
  const abs = path.join(FE, f);
  if (!TEXT_FILE.test(f)) {
    for (const t of targets) copies.push([abs, t]);
    continue;
  }
  for (const t of targets) {
    let src = read(abs);
    if (CODE.test(f)) src = rewriteImports(f, t, src);
    src = patchSource(f, t, src);
    src = patchText(src);
    if (f === "app/globals.css") {
      const stripped = src.replace(/^@import\s+["']tailwindcss["'];?\s*\r?\n/m, "");
      if (stripped === src) warn(`${t}: expected to strip \`@import "tailwindcss"\` but did not find it`);
      src = `/* Shared Arcade theme. Each app's app/globals.css imports Tailwind, then this file. */\n` + stripped.replace(/^\s*\n/, "");
    }
    writes.set(t, src);
  }
}

// ── generated files ──

const oldPkg = JSON.parse(read(path.join(FE, "package.json")));
const oldTs = JSON.parse(read(path.join(FE, "tsconfig.json")));
const versions = { ...oldPkg.devDependencies, ...oldPkg.dependencies };
const json = (o) => JSON.stringify(o, null, 2) + "\n";

const oldNextConfig = read(path.join(FE, "next.config.ts"));
const configKeys = [...oldNextConfig.matchAll(/^ {2}([a-zA-Z]+)\s*:/gm)].map((m) => m[1]);
const unknownKeys = configKeys.filter((k) => !["output", "trailingSlash", "images"].includes(k));
if (unknownKeys.length) warn(`frontend/next.config.ts sets ${unknownKeys.join(", ")} — merge into both apps' next.config.ts by hand`);

function bareImports(unit) {
  const found = new Set();
  for (const [p, src] of writes) {
    if (!p.startsWith(unit + "/") || !/\.(tsx?|jsx?|mjs|cjs|css)$/.test(p)) continue;
    for (const m of src.matchAll(IMPORT_RE)) {
      const s = m[3];
      if (s.startsWith(".") || s.startsWith("@/") || s.startsWith("node:") || !/^[@a-z]/.test(s)) continue;
      const name = s.startsWith("@") ? s.split("/").slice(0, 2).join("/") : s.split("/")[0];
      if (!builtinModules.includes(name)) found.add(name);
    }
  }
  return found;
}
const pick = (names) => Object.fromEntries([...names].sort().map((n) => [n, versions[n]]));

function depsFor(unit, { peers = [] } = {}) {
  const used = bareImports(unit);
  const workspace = [...used].filter((n) => n.startsWith("@arcade/"));
  const third = [...used].filter((n) => !n.startsWith("@arcade/") && n !== "electron");
  const known = third.filter((n) => versions[n]);
  const unknown = third.filter((n) => !versions[n]);
  if (unknown.length) warn(`${unit} imports ${unknown.join(", ")} — not in frontend/package.json (sample code inside a string is fine; a real import needs adding)`);
  return {
    dependencies: { ...Object.fromEntries(workspace.sort().map((n) => [n, "*"])), ...pick(known.filter((n) => !peers.includes(n))) },
    peerDependencies: pick(known.filter((n) => peers.includes(n))),
    used,
  };
}

const APP_DEV = ["@tailwindcss/postcss", "@types/node", "@types/react", "@types/react-dom", "eslint", "eslint-config-next", "tailwindcss", "typescript"];
const pkgNames = Object.values(PKG_NAME);

function appPackage(unit, name, port, extra = {}) {
  const d = depsFor(unit);
  const dependencies = { ...d.dependencies, ...pick(["next", "react", "react-dom"]) };
  const dev = [...APP_DEV, ...(d.used.has("three") ? ["@types/three"] : []), ...(extra.dev ?? [])];
  return {
    name,
    version: oldPkg.version,
    private: true,
    ...(extra.head ?? {}),
    scripts: {
      dev: `next dev -p ${port}`,
      build: "next build",
      start: `next start -p ${port}`,
      lint: "eslint",
      typecheck: "next typegen && tsc --noEmit",
      ...(extra.scripts ?? {}),
    },
    dependencies: Object.fromEntries(Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b))),
    devDependencies: pick(dev.filter((n) => versions[n])),
    ...(extra.tail ?? {}),
  };
}

const desktopScripts = Object.fromEntries(Object.entries(oldPkg.scripts ?? {}).filter(([k]) => k.startsWith("desktop:")));
const build = structuredClone(oldPkg.build ?? {});
for (const r of build.extraResources ?? []) if (typeof r === "object" && /^\.\.\/cli\b/.test(r.from)) r.from = r.from.replace(/^\.\.\/cli/, "../../packages/cli");
const knownScripts = new Set(["dev", "build", "start", "lint", ...Object.keys(desktopScripts)]);
for (const k of Object.keys(oldPkg.scripts ?? {})) if (!knownScripts.has(k)) warn(`frontend/package.json script "${k}" was not carried over — add it to the right app`);

writes.set(`${M}/package.json`, json(appPackage(M, "@arcade/marketing", 3000, { head: { description: "Arcade — the marketing site" } })));
writes.set(
  `${A}/package.json`,
  json(
    appPackage(A, "@arcade/ade", 3001, {
      // productName keeps Electron's dev userData folder where it was ("arcade" → "Arcade", same folder on Windows).
      head: { productName: build.productName ?? "Arcade", description: oldPkg.description, author: oldPkg.author, main: oldPkg.main },
      scripts: desktopScripts,
      dev: ["cross-env", "electron", "electron-builder"],
      tail: { build },
    }),
  ),
);

function libPackage(unit, description, peers) {
  const d = depsFor(unit, { peers });
  const out = {
    name: PKG_NAME[unit],
    version: oldPkg.version,
    private: true,
    description,
    sideEffects: unit === UI ? ["**/*.css"] : false,
    exports: { "./*": ["./src/*.ts", "./src/*.tsx"], ...(unit === UI ? { "./styles/*": "./src/styles/*" } : {}) },
    scripts: { typecheck: "tsc --noEmit" },
  };
  if (Object.keys(d.dependencies).length) out.dependencies = d.dependencies;
  if (Object.keys(d.peerDependencies).length) out.peerDependencies = d.peerDependencies;
  out.devDependencies = pick(["@types/react", "typescript"].filter((n) => versions[n]));
  return out;
}
const PEERS = ["react", "react-dom", "next"];
writes.set(`${CORE}/package.json`, json(libPackage(CORE, "Arcade's platform-neutral core: data model, run engine, scanner, workspace and GitHub file systems.", PEERS)));
writes.set(`${AGENTS}/package.json`, json(libPackage(AGENTS, "Arcade's agents — mapper, attacker, defender, remediator, verifier — and the provider they run on.", PEERS)));
writes.set(`${ORCH}/package.json`, json(libPackage(ORCH, "Runs the agents: the assessment pipeline and the live run engine.", PEERS)));
writes.set(`${UI}/package.json`, json(libPackage(UI, "Components, hooks and the theme shared by the marketing site and the ADE.", PEERS)));

// tsconfig: shared options move to the root; each unit keeps only what is its own.
const { plugins, paths: _oldPaths, incremental, ...sharedOptions } = oldTs.compilerOptions;
writes.set("tsconfig.base.json", json({ compilerOptions: sharedOptions }));
const pkgPaths = (fromUnit) => Object.fromEntries(Object.entries(PKG_NAME).filter(([u]) => u !== fromUnit).map(([u, n]) => [`${n}/*`, [`${path.posix.relative(fromUnit, u)}/src/*`]]));
for (const app of [M, A])
  writes.set(`${app}/tsconfig.json`, json({ extends: "../../tsconfig.base.json", compilerOptions: { plugins, incremental, paths: { "@/*": ["./src/*"], ...pkgPaths(app) } }, include: oldTs.include, exclude: oldTs.exclude }));
for (const pkg of LIBS) writes.set(`${pkg}/tsconfig.json`, json({ extends: "../../tsconfig.base.json", compilerOptions: { paths: pkgPaths(pkg) }, include: ["src"] }));

const nextConfig = (comment, extra) => `import type { NextConfig } from "next";

const nextConfig: NextConfig = {
${comment}
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Workspace packages ship TypeScript source.
  transpilePackages: ${JSON.stringify(pkgNames)},${extra}
};

export default nextConfig;
`;
writes.set(`${M}/next.config.ts`, nextConfig("  // Static export: every route is static or client-only, so the site deploys to any file host.", ""));
writes.set(
  `${A}/next.config.ts`,
  nextConfig(
    "  // Static export so the ADE can be bundled inside the Electron desktop build and\n  // served over the app:// protocol. Every route is static/client-only.",
    `\n  // Set when the ADE is served next to the marketing site on one domain (see\n  // scripts/build-web.mjs), so the two apps' /_next assets can't collide.\n  assetPrefix: process.env.ARCADE_ASSET_PREFIX || undefined,`,
  ),
);

for (const app of [M, A]) {
  for (const f of ["eslint.config.mjs", "postcss.config.mjs", ".gitignore", "AGENTS.md", "CLAUDE.md"]) if (feSet.has(f)) writes.set(`${app}/${f}`, read(path.join(FE, f)));
  writes.set(`${app}/src/app/globals.css`, `@import "tailwindcss";\n@import "../../../../packages/ui/src/styles/theme.css";\n\n/* Tailwind only scans this app by default; class names also live in the shared packages. */\n@source "../../../../packages";\n`);
}
writes.set(
  `${A}/src/app/page.tsx`,
  `"use client";

import { useEffect } from "react";

/**
 * The workbench lives at /arcade, so it keeps its URL when it is served next to
 * the marketing site. On its own (desktop app, \`npm run dev\`) the root just
 * forwards there.
 */
export default function Root() {
  useEffect(() => {
    window.location.replace("/arcade/");
  }, []);
  return null;
}
`,
);

writes.set(
  "package.json",
  json({
    name: "arcade-monorepo",
    version: oldPkg.version,
    private: true,
    description: oldPkg.description,
    workspaces: [M, A, "packages/*"],
    scripts: {
      dev: "npm run dev:ade",
      "dev:marketing": `npm run dev -w ${M}`,
      "dev:ade": `npm run dev -w ${A}`,
      build: "npm run build --workspaces --if-present",
      "build:web": "node scripts/build-web.mjs",
      lint: "npm run lint --workspaces --if-present",
      typecheck: "npm run typecheck --workspaces --if-present",
      ...Object.fromEntries(Object.keys(desktopScripts).map((k) => [k, `npm run ${k} -w ${A}`])),
      cli: "node packages/cli/arcade.mjs",
      mcp: "node packages/cli/mcp-server.mjs",
    },
    engines: { node: ">=20" },
  }),
);

writes.set(
  ".gitignore",
  `# dependencies
node_modules/

# build output
.next/
out/
dist/
release/
*.tsbuildinfo
next-env.d.ts

# env files
.env*
!.env.example

# misc
.DS_Store
*.pem
npm-debug.log*
.vercel
.expo/
`,
);

writes.set(
  "scripts/build-web.mjs",
  `// Builds the marketing site and the ADE and lays them out as one static site:
//
//   dist/web/                 ← apps/marketing/out
//   dist/web/arcade/          ← the ADE's pages
//   dist/web/arcade-static/   ← the ADE's /_next assets (its assetPrefix)
//
// Deploy dist/web to any static host and both apps share a domain.
import { execSync } from "node:child_process";
import { cpSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PREFIX = "/arcade-static";
const run = (cmd, env = {}) => execSync(cmd, { cwd: root, stdio: "inherit", env: { ...process.env, ...env } });

run("npm run build -w apps/marketing");
run("npm run build -w apps/ade", { ARCADE_ASSET_PREFIX: PREFIX });

const web = path.join(root, "dist", "web");
rmSync(web, { recursive: true, force: true });
cpSync(path.join(root, "apps/marketing/out"), web, { recursive: true });
cpSync(path.join(root, "apps/ade/out/arcade"), path.join(web, "arcade"), { recursive: true });
cpSync(path.join(root, "apps/ade/out/_next"), path.join(web, PREFIX.slice(1), "_next"), { recursive: true });
console.log("\\nStatic site ready in dist/web");
`,
);

const pkgReadme = (title, body) => `# ${title}\n\n${body}\n`;
writes.set(`${M}/README.md`, pkgReadme("@arcade/marketing", "The Arcade landing site — `/`, `/docs`, `/changelog`, `/enterprise`. Next.js, statically exported.\n\n```bash\nnpm run dev:marketing   # from the repo root → http://localhost:3000\n```\n\nLinks into the ADE go through `SITE.ade` and are plain `<a>` tags: the ADE is a separate app."));
writes.set(`${A}/README.md`, pkgReadme("@arcade/ade", "The Arcade workbench (`/arcade`), its product docs (`/arcade/docs`) and the Electron desktop shell (`electron/`).\n\n```bash\nnpm run dev:ade            # from the repo root → http://localhost:3001/arcade/\nnpm run desktop:electron   # the desktop shell against the dev server\nnpm run desktop:build:win  # portable .exe + installer → apps/ade/release/\n```"));
writes.set(`${CORE}/README.md`, pkgReadme("@arcade/core", "Platform-neutral core: the data model, the run engine, the scanner and rules, and the workspace / GitHub file systems. No DOM or Next.js dependency — the mobile app runs copies of these files (`apps/mobile/scripts/sync-core.mjs`).\n\nImport by file: `import { … } from \"@arcade/core/engine\"`."));
writes.set(`${AGENTS}/README.md`, pkgReadme("@arcade/agents", "The agents of a security run — mapper, attacker, defender, remediator, verifier — and the provider abstraction they run on. Depends on `@arcade/core` only."));
writes.set(`${ORCH}/README.md`, pkgReadme("@arcade/orchestrator", "What drives the agents: the assessment pipeline and the live run engine. Sits above `@arcade/agents` and `@arcade/core`; anything in the core that needs to call an agent belongs here instead."));
writes.set(`${UI}/README.md`, pkgReadme("@arcade/ui", "What the marketing site and the ADE share: components (`src/components`), hooks (`src/hooks`), site constants and theme logic (`src/lib`) and the design tokens (`src/styles/theme.css`).\n\nA file belongs here only when both apps import it."));

// ── files outside frontend/ ──

const outside = []; // [abs, content] — patched in place, before their folder moves
function patchOutside(rel, fn = (s) => s) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  const before = read(abs);
  const after = fn(patchText(before));
  if (after !== before) outside.push([abs, after]);
  return after;
}
for (const dir of ["cli", "mobile"]) {
  if (!fs.existsSync(path.join(ROOT, dir))) continue;
  for (const p of walk(path.join(ROOT, dir), new Set([...SKIP_DIRS, ".expo", "ios", "android", "assets"]))) {
    const rel = posix(path.relative(ROOT, p));
    if (TEXT_FILE.test(rel) && rel !== "mobile/scripts/sync-core.mjs") patchOutside(rel);
  }
}
const sync = patchOutside("mobile/scripts/sync-core.mjs", (s) => s.replace(/"\.\.\/\.\.\/(frontend\/lib\/arcade|packages\/core\/src)"/, `"../../../packages/core/src"`));
if (sync !== null && !sync.includes(`"../../../packages/core/src"`)) warn("mobile/scripts/sync-core.mjs: could not repoint it at packages/core/src — fix the `from` path by hand");

const LAYOUT = `\`\`\`
apps/
  marketing/   Next.js — the landing site (/, /docs, /changelog, /enterprise)
  ade/         Next.js — the ADE (/arcade), product docs (/arcade/docs) and the Electron desktop shell
  mobile/      Expo — the mobile companion (standalone: not part of the npm workspace)
packages/
  core/        @arcade/core — data model, run engine, scanner, workspace + GitHub file systems
  agents/      @arcade/agents — mapper, attacker, defender, remediator, verifier, provider
  orchestrator/ @arcade/orchestrator — the pipeline and live engine that run the agents
  ui/         @arcade/ui — components, hooks and theme shared by both web apps
  cli/         @arcade/cli — the Arcade CLI + a dependency-free MCP server
scripts/       repo tooling (build-web.mjs lays both web apps out as one static site)
\`\`\`

Dependencies point one way: \`apps/*\` → \`orchestrator\` → \`agents\` → \`core\`, and \`apps/*\` → \`ui\` → \`core\`. Packages never import from an app.`;
patchOutside("README.md", (s) => {
  let out = s.replace(/(## Repository layout\s*\n+)```[\s\S]*?```/, `$1${LAYOUT}`);
  if (out === s) warn("README.md: no `## Repository layout` code block found — add the new layout by hand");
  out = out.replace(/```bash\ncd frontend\nnpm install\nnpm run dev[^\n]*\n```/, "```bash\nnpm install            # once, at the repo root (npm workspaces)\nnpm run dev:ade        # the ADE            → http://localhost:3001/arcade/\nnpm run dev:marketing  # the marketing site → http://localhost:3000\n```");
  return out.replace(/`http:\/\/localhost:3000\/arcade`/g, "`http://localhost:3001/arcade/`");
});

// ─────────────────────────────────────────────────────────────── report / run ──

// A cycle between packages would build today and rot tomorrow — refuse it.
const unitByName = Object.fromEntries(Object.entries(PKG_NAME).map(([u, n]) => [n, u]));
const edges = new Map(LIBS.map((u) => [u, [...bareImports(u)].map((n) => unitByName[n]).filter((v) => v && v !== u)]));
{
  const state = new Map();
  const visit = (u, trail) => {
    if (state.get(u) === 1) return void errors.push(`package cycle: ${[...trail.slice(trail.indexOf(u)), u].join(" → ")}`);
    if (state.get(u) === 2) return;
    state.set(u, 1);
    for (const v of edges.get(u)) visit(v, [...trail, u]);
    state.set(u, 2);
  };
  for (const u of LIBS) visit(u, []);
}

// The mobile app copies a fixed list of core files; they have to still be in core.
if (sync !== null) {
  const list = /const FILES = \[([^\]]*)\]/.exec(sync)?.[1] ?? "";
  for (const m of list.matchAll(/"([^"]+)"/g)) if (!writes.has(`${CORE}/src/${m[1]}`)) warn(`apps/mobile syncs ${m[1]}, which is not in packages/core/src after the move`);
}

const byUnit = {};
for (const t of [...writes.keys(), ...copies.map((r) => r[1])]) {
  const u = unitOf(t) ?? "(root)";
  (byUnit[u] ??= []).push(t);
}
console.log(`Plan for ${ROOT}${DRY ? "  [dry run]" : ""}\n`);
for (const [u, list] of Object.entries(byUnit).sort()) console.log(`  ${u.padEnd(18)} ${list.length} files`);
console.log(`  import specifiers rewritten: ${rewrites.length}`);
if (patchLog.length) console.log("\nPatches:\n" + patchLog.map((p) => "  · " + p).join("\n"));
if (dropped.length) console.log("\nNot migrated:\n" + dropped.map((p) => "  · " + p).join("\n"));

const remaining = [...writes].filter(([, src]) => /\bfrontend\//.test(src)).map(([p]) => p);
if (remaining.length) warn(`still mention "frontend/": ${remaining.join(", ")}`);

if (warnings.length) console.log("\nWarnings:\n" + warnings.map((w) => "  ! " + w).join("\n"));
if (errors.length) {
  console.log("\nErrors:\n" + [...new Set(errors)].map((e) => "  ✗ " + e).join("\n"));
  die("fix the errors above; nothing was changed");
}

const logFile = path.join(os.tmpdir(), `arcade-restructure-log${DRY ? "-dry" : ""}.json`);
fs.writeFileSync(logFile, JSON.stringify({ root: ROOT, plan: Object.fromEntries(plan), rewrites, patchLog, warnings, dropped }, null, 2));
console.log(`\nFull plan and every import rewrite: ${logFile}`);
if (DRY) process.exit(0);

// 1. New files first, so a failure half-way leaves the old tree intact.
for (const [rel, content] of writes) {
  const abs = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}
for (const [abs, rel] of copies) {
  const to = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(abs, to);
}
for (const [abs, content] of outside) fs.writeFileSync(abs, content);

// 2. Remove what was migrated from frontend/ (never node_modules, .next, out, release).
for (const f of feFiles) {
  const abs = path.join(FE, f);
  if ((plan.get(f) ?? []).length || ROOT_CONFIG.has(f) || f.startsWith("types/")) fs.rmSync(abs, { force: true });
}
for (const extra of ["package-lock.json", "tsconfig.tsbuildinfo", "next-env.d.ts"]) fs.rmSync(path.join(FE, extra), { force: true });
(function prune(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) if (e.isDirectory() && !e.isSymbolicLink() && !SKIP_DIRS.has(e.name)) prune(path.join(dir, e.name));
  if (dir !== FE && !fs.readdirSync(dir).length) fs.rmdirSync(dir);
})(FE);

// 3. Whole-folder moves.
function moveDir(from, to) {
  const a = path.join(ROOT, from);
  if (!fs.existsSync(a)) return;
  fs.mkdirSync(path.dirname(path.join(ROOT, to)), { recursive: true });
  try {
    fs.renameSync(a, path.join(ROOT, to));
    console.log(`moved ${from}/ → ${to}/`);
  } catch (e) {
    console.log(`! could not move ${from}/ → ${to}/ (${e.code}). Close anything using it (dev servers, editors), then move it by hand.`);
  }
}
moveDir("cli", "packages/cli");
moveDir("mobile", "apps/mobile");
moveDir("frontend/release", `${A}/release`);
// Reuse the existing install: a rename costs no disk, and `npm install` then only adds the workspace links.
if (!fs.existsSync(path.join(ROOT, "node_modules")) && fs.existsSync(path.join(FE, "node_modules")) && !fs.lstatSync(path.join(FE, "node_modules")).isSymbolicLink()) moveDir("frontend/node_modules", "node_modules");

const left = fs.existsSync(FE) ? fs.readdirSync(FE) : [];
if (fs.existsSync(FE) && !left.length) fs.rmdirSync(FE);
console.log(left.length ? `\nLeft in frontend/ (build output and node_modules — safe to delete once the new install works): ${left.join(", ")}` : "\nfrontend/ is gone.");
console.log("\nNext: create the root node_modules junction, then `npm install` at the repo root from PowerShell.");
