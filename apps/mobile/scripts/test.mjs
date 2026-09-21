/**
 * Runs the unit tests for the app's non-UI logic (tests/*.test.ts) under Node.
 *
 * No test framework is installed: the tests are bundled with the esbuild that
 * the monorepo root already has, React Native's native modules are swapped for
 * the small stubs in tests/stubs, and the result runs on `node --test`.
 *
 *   npm test
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const esbuildMain = [path.join(app, "node_modules/esbuild/lib/main.js"), path.resolve(app, "../../node_modules/esbuild/lib/main.js")].find(existsSync);
if (!esbuildMain) {
  console.error("esbuild was not found. Run `npm install` at the repository root (it provides esbuild), then try again.");
  process.exit(1);
}
const esbuild = await import(pathToFileURL(esbuildMain).href);

const stub = (name) => path.join(app, "tests/stubs", name);
const out = mkdtempSync(path.join(tmpdir(), "arcade-mobile-tests-"));
const entries = readdirSync(path.join(app, "tests")).filter((f) => f.endsWith(".test.ts")).map((f) => path.join(app, "tests", f));

let status = 1;
try {
  await esbuild.build({
    entryPoints: entries,
    outdir: out,
    outExtension: { ".js": ".mjs" },
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: "inline",
    logLevel: "warning",
    tsconfig: path.join(app, "tsconfig.json"),
    define: { __DEV__: "true" },
    alias: {
      "react-native": stub("react-native.ts"),
      "expo-secure-store": stub("expo-secure-store.ts"),
      "@react-native-async-storage/async-storage": stub("async-storage.ts"),
    },
  });
  const built = readdirSync(out).filter((f) => f.endsWith(".mjs")).map((f) => path.join(out, f));
  status = spawnSync(process.execPath, ["--test", ...built], { stdio: "inherit" }).status ?? 1;
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(status);
