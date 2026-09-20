/**
 * Training-data generator for the false-positive classifier.
 *
 * Every row is a finding produced by Arcade's real scanner (packages/core), so
 * training data has exactly the shape production findings have. Two sources:
 *
 *   real       hits in real repositories, weakly labelled by provenance:
 *              deliberately vulnerable apps → true positive, mature audited
 *              libraries → false positive. Noisy labels, real code.
 *   synthetic  randomised variants per rule with exact labels, covering rules
 *              real repositories rarely trigger.
 *
 * The holdout is frozen and disjoint: whole repositories and whole synthetic
 * families the model never trains on, so its score measures generalisation.
 *
 * Training rows are emitted as shards over time (`--interval` seconds apart) to
 * data/incoming/, which the pipeline watches — data arrives while training runs.
 *
 *   npx tsx ml/generate.ts --repos %LOCALAPPDATA%\arcade-ml\repos --shards 4 --interval 45
 */
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { findingText, windowAround } from "../packages/core/src/finding-text";
import { memoryFs } from "../packages/core/src/fs";
import { scanWorkspace, type Hit } from "../packages/core/src/scanner";

interface Row {
  id: string;
  source: "real" | "synthetic";
  /** Repository name, or the synthetic family — the unit the train/holdout split is made on. */
  group: string;
  ruleId: string;
  severity: string;
  path: string;
  line: number;
  /** The model input: rule, path, and the code window with the flagged line marked. */
  text: string;
  /** 1 = true positive, 0 = false positive. */
  label: 0 | 1;
  /** True when the label comes from provenance rather than construction. */
  weak: boolean;
}

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const OUT = arg("out", "ml/data");
const REPOS = arg("repos", "");
const SHARDS = Number(arg("shards", "4"));
const INTERVAL = Number(arg("interval", "0"));
const PER_FAMILY = Number(arg("per-family", "60"));
const WINDOW = 8;

/* ------------------------------------------------------------------ helpers */

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type R = () => number;
const pick = <T>(r: R, xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
const hex = (r: R, n: number) => Array.from({ length: n }, () => "0123456789abcdef"[Math.floor(r() * 16)]).join("");
const alnum = (r: R, n: number) => Array.from({ length: n }, () => "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789"[Math.floor(r() * 56)]).join("");

// Shared with the API's scorer, so the model is asked about exactly what it was trained on.
const toText = (ruleId: string, path: string, source: string, line: number) => findingText(ruleId, path, windowAround(source, line, WINDOW));

const rowOf = (hit: Hit, source: string, meta: Pick<Row, "source" | "group" | "label" | "weak">, n: number): Row => ({
  id: `${meta.group}:${hit.path}:${hit.match.line}:${hit.rule.id}:${n}`,
  ...meta,
  ruleId: hit.rule.id,
  severity: hit.rule.severity,
  path: hit.path,
  line: hit.match.line,
  text: toText(hit.rule.id, hit.path, source, hit.match.line),
});

/* -------------------------------------------------------------- real repos */

/** Provenance labels. Holdout repositories are never trained on. */
const REPO_LABEL: Record<string, { label: 0 | 1; holdout?: boolean }> = {
  nodegoat: { label: 1 },
  dvna: { label: 1 },
  vulnnode: { label: 1 },
  goof: { label: 1, holdout: true },
  express: { label: 0 },
  fastify: { label: 0 },
  lodash: { label: 0 },
  passport: { label: 0 },
  socketio: { label: 0 },
  helmet: { label: 0 },
  koa: { label: 0, holdout: true },
  axios: { label: 0, holdout: true },
};

const SKIP_DIR = new Set(["node_modules", ".git", "dist", "build", "coverage", "vendor", "bower_components", ".next"]);
const TEXT_EXT = /\.(?:[cm]?[jt]sx?|vue|html?|json|ya?ml|env|py|php|rb|go|sql|sh|ejs|pug|hbs)$/i;
const NON_PROD = /(?:^|\/)(?:tests?|__tests__|spec|e2e|fixtures?|examples?|docs?|benchmarks?|scripts?)(?:\/|$)|\.(?:test|spec)\.[cm]?[jt]sx?$/i;

function readRepo(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (SKIP_DIR.has(name)) continue;
      const full = join(d, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (TEXT_EXT.test(name) && !/\.min\./.test(name) && st.size < 300_000) files[relative(dir, full).replaceAll("\\", "/")] = readFileSync(full, "utf8");
    }
  };
  walk(dir);
  return files;
}

async function realRows(): Promise<{ train: Row[]; holdout: Row[] }> {
  const train: Row[] = [];
  const holdout: Row[] = [];
  if (!REPOS) return { train, holdout };
  for (const [name, meta] of Object.entries(REPO_LABEL)) {
    let files: Record<string, string>;
    try {
      files = readRepo(join(REPOS, name));
    } catch {
      console.warn(`  ${name}: not found, skipped`);
      continue;
    }
    const scan = await scanWorkspace(memoryFs(files), { scope: "all" }, () => false);
    let n = 0;
    for (const hit of scan.hits) {
      // In a vulnerable app, only code that ships is the vulnerability; its tests and docs are not.
      const label = meta.label === 1 && NON_PROD.test(hit.path) ? 0 : meta.label;
      (meta.holdout ? holdout : train).push(rowOf(hit, files[hit.path], { source: "real", group: name, label, weak: true }, n++));
    }
    console.log(`  ${name.padEnd(10)} ${String(Object.keys(files).length).padStart(5)} files  ${String(scan.hits.length).padStart(4)} hits  → ${meta.holdout ? "holdout" : "train"}`);
  }
  return { train, holdout };
}

/* --------------------------------------------------------------- synthetic */

interface Family {
  rule: string;
  name: string;
  label: 0 | 1;
  holdout?: boolean;
  /** Returns a file path and the one line under test; filler is added around it. */
  make: (r: R) => { path: string; line: string; before?: string[]; after?: string[] };
}

const SRC = ["src/api", "src/routes", "src/services", "src/lib", "server/controllers", "app/handlers", "lib"] as const;
const TEST = ["test", "tests", "__tests__", "spec", "src/__tests__"] as const;
const NOUN = ["user", "order", "invoice", "account", "report", "session", "customer", "payment", "profile", "ticket"] as const;
const DB = ["db", "pool", "client", "conn", "knex", "sequelize"] as const;
const src = (r: R, ext = "ts") => `${pick(r, SRC)}/${pick(r, NOUN)}${pick(r, ["", "s", "Service", "Controller", "-handler"])}.${ext}`;
const tst = (r: R, ext = "ts") => `${pick(r, TEST)}/${pick(r, NOUN)}.${pick(r, ["test", "spec"])}.${ext}`;
const FILLER = [
  "const { Router } = require('express');",
  "import { logger } from '../lib/logger';",
  "const router = Router();",
  "async function handler(req, res, next) {",
  "  const started = Date.now();",
  "  if (!req.user) return res.status(401).end();",
  "  try {",
  "    const limit = Number(req.query.limit) || 20;",
  "  } catch (err) {",
  "    logger.error(err);",
  "    next(err);",
  "  }",
  "}",
  "module.exports = router;",
  "export default handler;",
  "  res.json({ ok: true });",
  "  return result;",
  "",
] as const;

const FAMILIES: Family[] = [
  // hardcoded-secret
  { rule: "hardcoded-secret", name: "secret-live-key", label: 1, make: (r) => ({ path: src(r), line: `  ${pick(r, ["apiKey", "secret", "token", "accessKey"])}: "${pick(r, ["sk_live_", ""])}${alnum(r, 24)}",` }) },
  { rule: "hardcoded-secret", name: "secret-aws-key", label: 1, holdout: true, make: (r) => ({ path: src(r, "js"), line: `const awsKey = "AKIA${alnum(r, 16).toUpperCase().replace(/[^A-Z0-9]/g, "A")}";` }) },
  { rule: "hardcoded-secret", name: "secret-db-password", label: 1, make: (r) => ({ path: `config/${pick(r, ["database", "prod", "default"])}.js`, line: `  password: "${alnum(r, 14)}",` }) },
  { rule: "hardcoded-secret", name: "secret-ui-message", label: 0, make: (r) => ({ path: `src/${pick(r, ["i18n", "locales", "messages"])}/${pick(r, ["en", "errors", "auth"])}.ts`, line: `  password: "${pick(r, ["Password must be at least 8 characters", "Enter your password to continue", "Passwords do not match, try again"])}",` }) },
  { rule: "hardcoded-secret", name: "secret-test-fixture", label: 0, make: (r) => ({ path: tst(r), line: `  const password = "${pick(r, ["correct-horse-battery", "test-password-123", "hunter2hunter2"])}";`, before: [`describe("${pick(r, NOUN)} login", () => {`, `  it("rejects a wrong password", async () => {`] }) },
  { rule: "hardcoded-secret", name: "secret-schema-doc", label: 0, holdout: true, make: (r) => ({ path: `docs/${pick(r, NOUN)}-api.ts`, line: `  token: "string, required — bearer token",` }) },

  // sql-injection
  { rule: "sql-injection", name: "sql-concat-request", label: 1, make: (r) => ({ path: src(r, "js"), line: `  const rows = await ${pick(r, DB)}.query("SELECT * FROM ${pick(r, NOUN)}s WHERE id = " + req.${pick(r, ["params.id", "query.id", "body.id"])});` }) },
  { rule: "sql-injection", name: "sql-template-request", label: 1, holdout: true, make: (r) => ({ path: src(r), line: `  const result = await ${pick(r, DB)}.query(\`SELECT * FROM ${pick(r, NOUN)}s WHERE email = '\${req.body.email}'\`);` }) },
  { rule: "sql-injection", name: "sql-constant-table", label: 0, make: (r) => ({ path: src(r), line: `  const rows = await ${pick(r, DB)}.query(\`SELECT * FROM \${TABLE} WHERE id = $1\`, [id]);`, before: [`const TABLE = "${pick(r, NOUN)}s";`] }) },
  { rule: "sql-injection", name: "sql-log-message", label: 0, make: (r) => ({ path: src(r), line: `  logger.debug("query finished: SELECT took " + (Date.now() - started) + "ms");` }) },

  // command-injection
  { rule: "command-injection", name: "cmd-request-concat", label: 1, make: (r) => ({ path: src(r, "js"), line: `  exec("${pick(r, ["ping -c 1 ", "nslookup ", "convert ", "tar -xf "])}" + req.${pick(r, ["query.host", "body.file", "params.name"])}, (err, out) => res.send(out));` }) },
  { rule: "command-injection", name: "cmd-constant-dir", label: 0, make: (r) => ({ path: `scripts/${pick(r, ["release", "version", "build"])}.js`, line: `const sha = execSync(\`git -C \${__dirname} rev-parse --short HEAD\`).toString().trim();` }) },

  // code-injection
  { rule: "code-injection", name: "eval-request", label: 1, make: (r) => ({ path: src(r, "js"), line: `  const value = eval(req.${pick(r, ["body.expression", "query.formula", "body.filter"])});` }) },
  { rule: "code-injection", name: "eval-global-this", label: 0, make: (r) => ({ path: `src/${pick(r, ["polyfills", "lib", "utils"])}/global.js`, line: `const root = typeof globalThis !== "undefined" ? globalThis : new Function("return this")();` }) },

  // xss-inner-html
  { rule: "xss-inner-html", name: "xss-user-content", label: 1, make: (r) => ({ path: `src/components/${pick(r, ["Comment", "Bio", "Message", "Review"])}.tsx`, line: `  return <div dangerouslySetInnerHTML={{ __html: ${pick(r, ["comment.body", "props.html", "user.bio", "message.text"])} }} />;` }) },
  { rule: "xss-inner-html", name: "xss-dom-assign", label: 1, holdout: true, make: (r) => ({ path: `public/js/${pick(r, NOUN)}.js`, line: `  el.innerHTML = "<b>" + ${pick(r, ["params.get('q')", "location.hash.slice(1)", "data.name"])} + "</b>";` }) },
  { rule: "xss-inner-html", name: "xss-sanitized", label: 0, make: (r) => ({ path: `src/components/${pick(r, ["Markdown", "RichText", "Preview"])}.tsx`, line: `  return <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(${pick(r, ["html", "rendered", "props.content"])}) }} />;`, before: [`import DOMPurify from "dompurify";`] }) },
  { rule: "xss-inner-html", name: "xss-static-markup", label: 0, make: (r) => ({ path: `src/ui/${pick(r, ["spinner", "icon", "badge"])}.js`, line: `  el.innerHTML = "<span class=\\"${pick(r, ["spinner", "dot", "icon-ok"])}\\"></span>";` }) },

  // weak-hash
  { rule: "weak-hash", name: "hash-password", label: 1, make: (r) => ({ path: src(r, "js"), line: `  const hashed = crypto.createHash("${pick(r, ["md5", "sha1"])}").update(${pick(r, ["password", "req.body.password", "user.password"])}).digest("hex");` }) },
  { rule: "weak-hash", name: "hash-etag", label: 0, make: (r) => ({ path: `src/lib/${pick(r, ["cache", "etag", "assets"])}.ts`, line: `  const ${pick(r, ["etag", "cacheKey", "checksum"])} = createHash("${pick(r, ["md5", "sha1"])}").update(${pick(r, ["fileContents", "body", "buffer"])}).digest("hex");` }) },

  // insecure-random
  { rule: "insecure-random", name: "random-reset-token", label: 1, make: (r) => ({ path: src(r, "js"), line: `  const ${pick(r, ["resetToken", "sessionId", "apiKey", "otp"])} = Math.random().toString(36).slice(2);` }) },
  { rule: "insecure-random", name: "random-ui-choice", label: 0, make: (r) => ({ path: `src/ui/${pick(r, ["avatar", "confetti", "placeholder"])}.ts`, line: `  const colorCode = COLORS[Math.floor(Math.random() * COLORS.length)];` }) },
  { rule: "insecure-random", name: "random-backoff", label: 0, holdout: true, make: (r) => ({ path: `src/lib/retry.ts`, line: `  const sessionRetryDelay = base * 2 ** attempt + Math.random() * 100;` }) },

  // tls-verification-disabled
  { rule: "tls-verification-disabled", name: "tls-prod-client", label: 1, make: (r) => ({ path: src(r, "js"), line: `  const agent = new https.Agent({ rejectUnauthorized: false });` }) },
  { rule: "tls-verification-disabled", name: "tls-local-test", label: 0, make: (r) => ({ path: tst(r, "js"), line: `  const agent = new https.Agent({ rejectUnauthorized: false }); // self-signed cert on localhost`, before: [`const server = https.createServer(selfSigned, app).listen(0);`] }) },

  // ssrf
  { rule: "ssrf", name: "ssrf-user-url", label: 1, make: (r) => ({ path: src(r, "js"), line: `  const upstream = await ${pick(r, ["axios.get", "fetch", "got"])}(req.${pick(r, ["query.url", "body.webhook", "query.target"])});` }) },
  { rule: "ssrf", name: "ssrf-fixed-host", label: 0, make: (r) => ({ path: src(r), line: `  const upstream = await fetch(\`\${API_BASE}/${pick(r, NOUN)}s/\${encodeURIComponent(req.params.id)}\`);`, before: [`const API_BASE = "https://api.internal.example.com";`] }) },

  // path-traversal
  { rule: "path-traversal", name: "path-user-file", label: 1, make: (r) => ({ path: src(r, "js"), line: `  fs.readFile("./uploads/" + req.${pick(r, ["query.file", "params.name", "body.path"])}, (err, data) => res.send(data));` }) },
  { rule: "path-traversal", name: "path-basename", label: 0, make: (r) => ({ path: src(r, "js"), line: `  res.sendFile(path.join(PUBLIC_DIR, path.basename(req.params.name)));` }) },

  // weak-jwt
  { rule: "weak-jwt", name: "jwt-none-alg", label: 1, make: (r) => ({ path: src(r, "js"), line: `  const payload = jwt.verify(token, key, { algorithms: ["none", "HS256"] });` }) },
  { rule: "weak-jwt", name: "jwt-decode-auth", label: 1, holdout: true, make: (r) => ({ path: `src/middleware/auth.js`, line: `  req.user = jwt.decode(req.headers.authorization.split(" ")[1]);` }) },
  { rule: "weak-jwt", name: "jwt-decode-expiry", label: 0, make: (r) => ({ path: `src/ui/session-timer.ts`, line: `  const { exp } = jwt.decode(verifiedToken) as { exp: number }; // display only; verified server-side` }) },
];

async function syntheticRows(): Promise<{ train: Row[]; holdout: Row[] }> {
  const train: Row[] = [];
  const holdout: Row[] = [];
  const r = rng(20260920);
  for (const fam of FAMILIES) {
    let kept = 0;
    for (let i = 0; i < PER_FAMILY; i++) {
      const v = fam.make(r);
      const filler = (n: number) => Array.from({ length: n }, () => pick(r, FILLER));
      const above = [...filler(2 + Math.floor(r() * 8)), ...(v.before ?? [])];
      const source = [...above, v.line, ...(v.after ?? []), ...filler(2 + Math.floor(r() * 8))].join("\n");
      const scan = await scanWorkspace(memoryFs({ [v.path]: source }), { scope: "all" }, () => false);
      // Keep the row only if the real scanner flags the intended line for the intended rule.
      const hit = scan.hits.find((h) => h.rule.id === fam.rule && h.match.line === above.length + 1);
      if (!hit) continue;
      (fam.holdout ? holdout : train).push(rowOf(hit, source, { source: "synthetic", group: fam.name, label: fam.label, weak: false }, i));
      kept++;
    }
    if (kept < PER_FAMILY / 2) console.warn(`  family ${fam.name}: only ${kept}/${PER_FAMILY} variants were flagged by the scanner`);
  }
  return { train, holdout };
}

/* --------------------------------------------------------------------- run */

const jsonl = (rows: Row[]) => rows.map((x) => JSON.stringify(x)).join("\n") + "\n";
const tally = (rows: Row[]) => `${rows.length} rows (${rows.filter((x) => x.label === 1).length} TP / ${rows.filter((x) => x.label === 0).length} FP; ${rows.filter((x) => x.source === "real").length} real)`;

async function main() {
mkdirSync(join(OUT, "incoming"), { recursive: true });
console.log("scanning real repositories…");
const real = await realRows();
console.log("generating synthetic variants…");
const synth = await syntheticRows();

const holdout = [...real.holdout, ...synth.holdout];
writeFileSync(join(OUT, "holdout.jsonl"), jsonl(holdout));
console.log(`holdout  ${tally(holdout)}`);

// Shuffle, then deal into shards so each one carries every source and rule.
const r = rng(7);
const train = [...real.train, ...synth.train].map((row) => [r(), row] as const).sort((a, b) => a[0] - b[0]).map(([, row]) => row);
for (let s = 0; s < SHARDS; s++) {
  const shard = train.filter((_, i) => i % SHARDS === s);
  const file = join(OUT, "incoming", `shard-${String(s + 1).padStart(4, "0")}.jsonl`);
  // Write-then-rename is not needed: the pipeline only picks up files that have stopped growing.
  writeFileSync(file, jsonl(shard));
  console.log(`shard ${s + 1}/${SHARDS}  ${tally(shard)}  ${new Date().toLocaleTimeString()}`);
  if (INTERVAL && s < SHARDS - 1) await new Promise((res) => setTimeout(res, INTERVAL * 1000));
}
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
