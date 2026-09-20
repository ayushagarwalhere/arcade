// Builds the marketing site and the ADE and lays them out as one static site:
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
console.log("\nStatic site ready in dist/web");
