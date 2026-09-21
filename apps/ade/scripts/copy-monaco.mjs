// Copies Monaco's self-contained build into public/ so the editor loads from the
// app itself. The desktop build has to work offline and a static export has no
// server to proxy a CDN, so the editor can't be fetched at runtime.
//
//   node_modules/monaco-editor/min/vs  →  public/arcade-static/monaco/vs
//
// Runs before `dev` and `build`; the copy is git-ignored and skipped when current.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const pkgFile = require.resolve("monaco-editor/package.json");
const { version } = JSON.parse(readFileSync(pkgFile, "utf8"));

const from = path.join(path.dirname(pkgFile), "min", "vs");
const to = path.join(here, "..", "public", "arcade-static", "monaco");
const stamp = path.join(to, ".version");

if (existsSync(stamp) && readFileSync(stamp, "utf8") === version) process.exit(0);

rmSync(to, { recursive: true, force: true });
mkdirSync(to, { recursive: true });
cpSync(from, path.join(to, "vs"), { recursive: true });
writeFileSync(stamp, version);
console.log(`monaco-editor ${version} → public/arcade-static/monaco`);
