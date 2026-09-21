// Adds the platform-specific optional packages a lockfile is missing.
//
// npm has a long-standing bug: a package-lock.json written while node_modules exists records
// only the CURRENT platform's optional native packages (@next/swc-win32-x64-msvc, but not the
// linux or darwin builds). `npm ci` on another OS then installs no native binary at all and
// `next build` fails there — which is what breaks CI for a lockfile that was written on Windows.
//
// Regenerating the lockfile would fix it, and would also float every ranged dependency to a new
// version. This does the narrow thing instead: for every package already in the lockfile, look at
// the platform packages it declares in optionalDependencies, and add the ones that are missing —
// at the version the parent already asks for, with the tarball URL and integrity hash the registry
// publishes for that exact version. Nothing that is already locked is changed.
//
//   node scripts/complete-lockfile.mjs            add what is missing
//   node scripts/complete-lockfile.mjs --check    exit 1 if anything is missing (for CI)
//
// Run it after any `npm install` on a single machine, before committing the lockfile.
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lockFile = path.join(root, "package-lock.json");
const check = process.argv.includes("--check");

const raw = fs.readFileSync(lockFile, "utf8");
const lock = JSON.parse(raw);
const eol = raw.includes("\r\n") ? "\r\n" : "\n";

// Real operating systems only. wasm32/wasi fallbacks pull in a runtime of their own and are never
// what a desktop or CI machine selects.
const OSES = new Set(["win32", "linux", "darwin", "freebsd", "android", "openbsd", "sunos", "netbsd", "openharmony", "aix"]);

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const cache = new Map();
function registry(name, version) {
  const key = `${name}@${version}`;
  if (!cache.has(key)) {
    let meta = null;
    try {
      // npm is a .cmd on Windows and has to go through a shell there, so the command line is built
      // here as one string from fixed words plus a package coordinate that is checked first.
      if (!/^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i.test(name) || !/^[0-9A-Za-z.+-]+$/.test(version)) throw new Error("not a package coordinate");
      const fields = "name version dist os cpu libc engines license optionalDependencies dependencies";
      const out = process.platform === "win32" ? execSync(`npm view ${key} --json ${fields}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }) : execFileSync(npmCmd, ["view", key, "--json", ...fields.split(" ")], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      meta = JSON.parse(out);
    } catch {
      meta = null; // unpublished, or the range didn't resolve to one version
    }
    cache.set(key, meta);
  }
  return cache.get(key);
}

const isExact = (v) => /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/.test(v);
const added = [];
const skipped = [];

const original = JSON.parse(raw).packages;
/** New entries, grouped by the existing key they are written after — so the diff is insertions, not a re-sort. */
const after = new Map();

/** Where a missing sibling belongs: next to a variant of the same family that is already locked, else beside its parent. */
function placeFor(parentKey, name) {
  const family = name.replace(/-(?:win32|linux|darwin|freebsd|android|openbsd|sunos|netbsd|openharmony|aix).*$/, "-");
  const siblings = Object.keys(lock.packages).filter((k) => k.split("node_modules/").pop().startsWith(family) && k !== parentKey);
  const sibling = siblings[siblings.length - 1];
  const prefix = sibling ? sibling.slice(0, sibling.lastIndexOf("node_modules/")) : "";
  return { key: `${prefix}node_modules/${name}`, anchor: sibling ?? parentKey };
}

function visit(parentKey, entry) {
  for (const [name, wanted] of Object.entries(entry.optionalDependencies ?? {})) {
    const present = Object.keys(lock.packages).some((k) => k.endsWith(`node_modules/${name}`));
    if (present) continue;
    if (!isExact(wanted)) {
      skipped.push(`${name}@${wanted} (a range; left to npm)`);
      continue;
    }
    const meta = registry(name, wanted);
    if (!meta?.dist?.integrity) {
      skipped.push(`${name}@${wanted} (not found in the registry)`);
      continue;
    }
    const oses = [].concat(meta.os ?? []);
    if (!oses.length || !oses.some((o) => OSES.has(o))) continue; // wasm / generic fallbacks
    // A platform package may only depend on more platform packages (sharp → libvips). Anything with
    // ordinary dependencies would need real dependency resolution, which is npm's job, not this script's.
    if (meta.dependencies && Object.keys(meta.dependencies).length) {
      skipped.push(`${name}@${wanted} (has ordinary dependencies; only a full npm install can add it)`);
      continue;
    }
    if (check) {
      added.push(`${name}@${wanted}`);
      continue;
    }
    const { key, anchor } = placeFor(parentKey, name);
    const fresh = {
      version: meta.version,
      resolved: meta.dist.tarball,
      integrity: meta.dist.integrity,
      ...(meta.cpu ? { cpu: [].concat(meta.cpu) } : {}),
      ...(meta.libc ? { libc: [].concat(meta.libc) } : {}),
      ...(meta.license ? { license: meta.license } : {}),
      optional: true,
      os: oses,
      ...(meta.optionalDependencies ? { optionalDependencies: meta.optionalDependencies } : {}),
      ...(meta.engines ? { engines: meta.engines } : {}),
    };
    lock.packages[key] = fresh;
    after.set(anchor, [...(after.get(anchor) ?? []), key]);
    added.push(`${name}@${wanted}`);
    visit(key, fresh);
  }
}

for (const [key, entry] of Object.entries({ ...lock.packages })) visit(key, entry);

if (check) {
  if (added.length) {
    console.error(`package-lock.json is missing ${added.length} platform package(s), so installs on other operating systems will break:\n  ${added.join("\n  ")}\nRun: node scripts/complete-lockfile.mjs`);
    process.exit(1);
  }
  console.log("package-lock.json covers every platform its packages publish for.");
  process.exit(0);
}

if (added.length) {
  // Existing entries keep their order; each new one is written straight after its sibling or parent.
  const ordered = {};
  const emit = (key) => {
    ordered[key] = lock.packages[key];
    for (const next of after.get(key) ?? []) emit(next);
  };
  for (const key of Object.keys(original)) emit(key);

  // The whole point is to change nothing that was already locked. Prove it before writing.
  const lost = Object.keys(original).filter((k) => JSON.stringify(ordered[k]) !== JSON.stringify(original[k]));
  const unplaced = Object.keys(lock.packages).filter((k) => !(k in ordered));
  if (lost.length || unplaced.length) {
    console.error(`Refusing to write: ${lost.length} existing entr${lost.length === 1 ? "y" : "ies"} would change, ${unplaced.length} new one(s) had nowhere to go.\n  ${[...lost, ...unplaced].slice(0, 10).join("\n  ")}`);
    process.exit(2);
  }
  lock.packages = ordered;
  fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2).replace(/\n/g, eol) + eol);
}
console.log(added.length ? `Added ${added.length} platform package(s):\n  ${added.join("\n  ")}` : "Nothing was missing.");
if (skipped.length) console.log(`\nLeft alone (${skipped.length}):\n  ${[...new Set(skipped)].join("\n  ")}`);
