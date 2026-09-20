// Arcade sandboxes — real, Docker-backed, dependency-free.
//
// A sandbox is one hardened container holding a *copy* of the project. How one
// gets created (createSandbox, below):
//
//   1. snapshot   list the project's files (working tree, or a git ref for the
//                 Verifier's "fresh sandbox from the fix branch"), withholding
//                 secret files (.env, keys, registry tokens) and symlinks
//   2. detect     pick a base image and the install/test commands from the
//                 stack, or from .arcade/sandbox.json
//   3. create     start the container: no host mounts, all capabilities
//                 dropped, no-new-privileges, memory/CPU/pid limits, and
//                 throwaway values for every secret-looking env key
//   4. copy       stream the snapshot into /workspace — the host working tree
//                 is never mounted, so nothing inside can modify it
//   5. install    install dependencies; the only moment the network is attached
//   6. isolate    disconnect the network, then verify with `docker inspect`
//                 that no network is left before handing the sandbox out
//
// Docker labels are the only state: `ls` and `destroy` read them back from the
// daemon, so there is no state file to drift from reality.

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export class SandboxError extends Error {}

const LABEL = "arcade.sandbox";
const WORKDIR = "/workspace";
const LIMITS = { memory: "2g", cpus: "2", pids: "512" };
const ID_RE = /^sandbox-[0-9a-f]{4}$/;
const WALK_IGNORE = new Set([".git", "node_modules", ".venv", "venv", "__pycache__", ".next"]);
const MAX_OUTPUT = 64 * 1024;
const containerName = (id) => `arcade-${id}`;

// ── process helpers ──────────────────────────────────────────────────────────

function run(cmd, args, { cwd, onOutput, stdin } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true, stdio: [stdin ? "pipe" : "ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout = (stdout + d).slice(-MAX_OUTPUT * 4);
      onOutput?.(d.toString());
    });
    child.stderr.on("data", (d) => {
      stderr = (stderr + d).slice(-MAX_OUTPUT);
      onOutput?.(d.toString());
    });
    child.on("error", (e) => reject(e.code === "ENOENT" ? new SandboxError(`${cmd} is not installed or not on PATH`) : e));
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    if (stdin) stdin(child.stdin);
  });
}

// Docker Desktop's installer doesn't always reach the PATH of an already-open
// shell, so fall back to its default location before giving up.
const DOCKER_FALLBACKS = process.platform === "win32" ? [path.join(process.env.ProgramFiles || "C:\\Program Files", "Docker", "Docker", "resources", "bin", "docker.exe")] : ["/usr/local/bin/docker", "/opt/homebrew/bin/docker"];
let dockerBin = "docker";

async function docker(args, opts) {
  try {
    return await run(dockerBin, args, opts);
  } catch (e) {
    const fallback = dockerBin === "docker" && e instanceof SandboxError && DOCKER_FALLBACKS.find((p) => fs.existsSync(p));
    if (!fallback) throw e;
    dockerBin = fallback;
    process.env.PATH = `${path.dirname(fallback)}${path.delimiter}${process.env.PATH}`; // docker's credential helpers live beside it
    return run(dockerBin, args, opts);
  }
}

async function dockerOk(args, what, opts) {
  const res = await docker(args, opts);
  if (res.code !== 0) throw new SandboxError(`${what} failed: ${(res.stderr || res.stdout).trim().split("\n").pop()}`);
  return res.stdout;
}

export async function ensureDocker() {
  const res = await docker(["version", "--format", "{{.Server.Version}}"]);
  if (res.code !== 0) {
    throw new SandboxError("Docker is installed but the daemon is not running. Start Docker Desktop (or dockerd) and retry.");
  }
  return res.stdout.trim();
}

// ── 1. snapshot ──────────────────────────────────────────────────────────────

const SECRET_EXT = /\.(pem|key|p12|pfx|jks|keystore)$/;
const SECRET_NAME = /^(id_(rsa|dsa|ecdsa|ed25519).*|\.netrc|\.pypirc|(credentials|service-account).*\.json)$/;
const ENV_TEMPLATE = /\.(example|sample|template|defaults|dist)$/;
const REGISTRY_CONFIG = new Set([".npmrc", ".yarnrc.yml"]);

function isSecretName(rel) {
  const base = rel.split("/").pop().toLowerCase();
  if (base === ".env" || base.startsWith(".env.")) return !ENV_TEMPLATE.test(base);
  return SECRET_EXT.test(base) || SECRET_NAME.test(base);
}

// The files that would enter the sandbox, plus a reader for stack detection.
// `ref` snapshots a commit without touching the working tree.
async function openSource(dir, ref) {
  const root = path.resolve(dir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new SandboxError(`not a directory: ${root}`);
  const git = (args) => run("git", ["-C", root, ...args]);
  const inGit = (await git(["rev-parse", "--is-inside-work-tree"]).catch(() => ({ code: 1 }))).code === 0;

  let listed;
  let read;
  let sha = null;
  if (ref) {
    if (!inGit) throw new SandboxError(`--ref needs a git repository: ${root}`);
    const rev = await git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
    if (rev.code !== 0) throw new SandboxError(`unknown git ref: ${ref}`);
    sha = rev.stdout.trim();
    listed = (await git(["ls-tree", "-r", "--name-only", "-z", sha])).stdout.split("\0").filter(Boolean);
    read = async (rel) => {
      const res = await git(["show", `${sha}:./${rel}`]);
      return res.code === 0 ? res.stdout : null;
    };
  } else {
    listed = inGit
      ? (await git(["ls-files", "-co", "--exclude-standard", "-z"])).stdout.split("\0").filter(Boolean)
      : walk(root);
    read = async (rel) => {
      try {
        return await fs.promises.readFile(path.join(root, rel), "utf8");
      } catch {
        return null;
      }
    };
  }

  const files = [];
  const withheld = [];
  for (const rel of listed) {
    const base = rel.split("/").pop();
    // Registry config is only a secret when it carries credentials.
    const secret = isSecretName(rel) || (REGISTRY_CONFIG.has(base) && /_auth|_password|npmAuthToken/i.test((await read(rel)) || ""));
    (secret ? withheld : files).push(rel);
  }
  return { root, ref: ref || null, sha, files, withheld, read, label: ref ? `${ref} @ ${sha.slice(0, 7)}` : "working tree" };
}

function walk(root, rel = "") {
  const out = [];
  for (const ent of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
    if (WALK_IGNORE.has(ent.name)) continue;
    const child = rel ? `${rel}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...walk(root, child));
    else if (ent.isFile()) out.push(child);
  }
  return out;
}

// ── 2. detect ────────────────────────────────────────────────────────────────

async function detectStack(source, imageOverride) {
  const has = (name) => source.files.includes(name);
  let stack = { stack: "generic", image: "alpine:3.20", install: null, test: null };

  if (has("package.json")) {
    let scripts = {};
    try {
      scripts = JSON.parse(await source.read("package.json")).scripts || {};
    } catch {
      /* malformed package.json: still a node project */
    }
    const pm = has("pnpm-lock.yaml") ? "pnpm" : has("yarn.lock") ? "yarn" : "npm";
    const install = {
      npm: has("package-lock.json") ? "npm ci" : "npm install",
      pnpm: "corepack enable && pnpm install --frozen-lockfile",
      yarn: "corepack enable && yarn install --immutable || yarn install --frozen-lockfile",
    }[pm];
    stack = { stack: "node", image: "node:22-bookworm-slim", install, test: scripts.test ? `${pm} test` : null };
  } else if (has("requirements.txt") || has("pyproject.toml")) {
    const install = has("requirements.txt") ? "pip install --no-cache-dir -r requirements.txt pytest" : "pip install --no-cache-dir -e . pytest";
    stack = { stack: "python", image: "python:3.12-slim", install, test: "python -m pytest" };
  } else if (has("go.mod")) {
    stack = { stack: "go", image: "golang:1.23", install: "go mod download", test: "go test ./..." };
  }

  // .arcade/sandbox.json overrides anything detected: { image, install, test }
  if (has(".arcade/sandbox.json")) {
    try {
      const cfg = JSON.parse(await source.read(".arcade/sandbox.json"));
      for (const k of ["image", "install", "test"]) if (typeof cfg[k] === "string" || cfg[k] === null) stack[k] = cfg[k];
      stack.stack = `${stack.stack} (.arcade/sandbox.json)`;
    } catch {
      throw new SandboxError(".arcade/sandbox.json is not valid JSON");
    }
  }
  if (imageOverride) stack.image = imageOverride;
  return stack;
}

// ── 3. throwaway credentials ─────────────────────────────────────────────────

const SECRET_KEY = /SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|API_?KEY|_KEY$/i;

function parseEnvKeys(text) {
  const out = new Map();
  for (const line of (text || "").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m) out.set(m[1], m[2].trim().replace(/^(['"])(.*)\1$/, "$2"));
  }
  return out;
}

// The app still sees every variable it expects, but never a real value: keys
// come from the env templates (and the *names* in a real .env); secret-looking
// keys get random values, the rest keep their public template defaults.
async function throwawayEnv(source) {
  const template = new Map();
  for (const name of [".env.example", ".env.sample", ".env.template"]) {
    if (source.files.includes(name)) for (const [k, v] of parseEnvKeys(await source.read(name))) template.set(k, v);
  }
  const keys = new Set(template.keys());
  if (!source.ref) for (const k of parseEnvKeys(await source.read(".env")).keys()) keys.add(k);

  const env = {};
  for (const k of keys) {
    if (SECRET_KEY.test(k)) env[k] = `arcade-throwaway-${randomBytes(12).toString("hex")}`;
    else if (template.get(k)) env[k] = template.get(k);
  }
  return env;
}

// ── 4. copy ──────────────────────────────────────────────────────────────────

async function copyIn(source, name) {
  if (source.ref) {
    // git archive → docker cp: the commit streams straight into the container.
    const excludes = source.withheld.map((f) => `:(exclude,literal)${f}`);
    const archive = spawn("git", ["-C", source.root, "archive", "--format=tar", source.sha, "--", ".", ...excludes], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    const cp = await docker(["cp", "-", `${name}:${WORKDIR}`], { stdin: (pipe) => archive.stdout.pipe(pipe) });
    if (cp.code !== 0) throw new SandboxError(`copying ${source.label} into the sandbox failed: ${cp.stderr.trim()}`);
    return { copied: source.files.length, skipped: 0 };
  }

  const staging = await fs.promises.mkdtemp(path.join(os.tmpdir(), "arcade-sandbox-"));
  let copied = 0;
  let skipped = 0;
  try {
    for (const rel of source.files) {
      const from = path.join(source.root, rel);
      const st = await fs.promises.lstat(from).catch(() => null);
      // Symlinks could point outside the project (~/.ssh); deleted-but-tracked files are gone.
      if (!st || !st.isFile()) {
        skipped++;
        continue;
      }
      const to = path.join(staging, rel);
      await fs.promises.mkdir(path.dirname(to), { recursive: true });
      await fs.promises.copyFile(from, to);
      copied++;
    }
    await dockerOk(["cp", `${staging}${path.sep}.`, `${name}:${WORKDIR}`], "copying the working tree into the sandbox");
  } finally {
    await fs.promises.rm(staging, { recursive: true, force: true });
  }
  return { copied, skipped };
}

// ── create / inspect / exec / destroy ────────────────────────────────────────

function describe(c) {
  const nets = Object.keys(c.NetworkSettings?.Networks || {}).filter((n) => n !== "none");
  const l = c.Config.Labels || {};
  return {
    sandboxId: l["arcade.id"],
    container: c.Name.replace(/^\//, ""),
    status: c.State.Status,
    image: c.Config.Image,
    stack: l["arcade.stack"],
    source: l["arcade.source"],
    path: l["arcade.path"],
    createdAt: l["arcade.created"],
    isolated: true,
    disposable: true,
    network: nets.length ? nets.join(",") : "none",
    workdir: WORKDIR,
    limits: LIMITS,
    test: l["arcade.test"] || null,
  };
}

async function inspect(names) {
  if (!names.length) return [];
  const res = await docker(["inspect", ...names]);
  if (res.code !== 0) return [];
  return JSON.parse(res.stdout).filter((c) => c.Config?.Labels?.[LABEL] === "1");
}

export async function listSandboxes() {
  await ensureDocker();
  const ids = (await dockerOk(["ps", "-aq", "--filter", `label=${LABEL}=1`], "listing sandboxes")).split(/\s+/).filter(Boolean);
  return (await inspect(ids)).map(describe);
}

export async function getSandbox(id) {
  if (!ID_RE.test(id || "")) throw new SandboxError(`not a sandbox id: ${id}`);
  const [c] = await inspect([containerName(id)]);
  if (!c) throw new SandboxError(`no sandbox ${id}`);
  return describe(c);
}

export async function createSandbox({ dir = ".", ref, image, offline = false, onStep = () => {}, onOutput } = {}) {
  await ensureDocker();

  const source = await openSource(dir, ref);
  if (!source.files.length) throw new SandboxError(`nothing to snapshot in ${source.root}`);
  onStep("snapshot", `${source.files.length} files from ${source.label}${source.withheld.length ? ` · ${source.withheld.length} secret file(s) withheld` : ""}`);

  const stack = await detectStack(source, image);
  onStep("detect", `${stack.stack} → ${stack.image}`);
  if ((await docker(["image", "inspect", stack.image])).code !== 0) {
    onStep("pull", stack.image);
    await dockerOk(["pull", stack.image], `pulling ${stack.image}`, { onOutput });
  }

  const env = await throwawayEnv(source);
  const id = `sandbox-${randomBytes(2).toString("hex")}`;
  const name = containerName(id);
  const online = !offline && !!stack.install;

  await dockerOk(
    [
      "run", "-d", "--name", name, "--hostname", id, "--init",
      "--label", `${LABEL}=1`,
      "--label", `arcade.id=${id}`,
      "--label", `arcade.stack=${stack.stack}`,
      "--label", `arcade.source=${source.label}`,
      "--label", `arcade.path=${source.root}`,
      "--label", `arcade.created=${new Date().toISOString()}`,
      "--label", `arcade.test=${stack.test || ""}`,
      "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges",
      "--memory", LIMITS.memory, "--cpus", LIMITS.cpus, "--pids-limit", LIMITS.pids,
      "--network", online ? "bridge" : "none",
      "-w", WORKDIR,
      "-e", `ARCADE_SANDBOX=${id}`, "-e", "CI=1",
      ...Object.entries(env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
      stack.image, "tail", "-f", "/dev/null",
    ],
    "creating the container",
  );
  onStep("create", `${name} · caps dropped · no host mounts · ${LIMITS.memory} / ${LIMITS.cpus} cpu / ${LIMITS.pids} pids${Object.keys(env).length ? ` · ${Object.keys(env).length} throwaway env var(s)` : ""}`);

  try {
    const { copied, skipped } = await copyIn(source, name);
    onStep("copy", `${copied} files → ${WORKDIR}${skipped ? ` · ${skipped} symlink(s)/missing skipped` : ""}`);

    if (online) {
      onStep("install", `${stack.install}  (network attached for this step only)`);
      const res = await docker(["exec", "-w", WORKDIR, name, "sh", "-c", stack.install], { onOutput });
      if (res.code !== 0) throw new SandboxError(`install failed (exit ${res.code}): ${(res.stderr || res.stdout).trim().split("\n").slice(-5).join("\n")}`);
      await dockerOk(["network", "disconnect", "bridge", name], "disconnecting the network");
    }

    // Trust the daemon, not our own flags: refuse to hand out a sandbox that still has a network.
    const info = await getSandbox(id);
    if (info.network !== "none") throw new SandboxError(`sandbox still attached to network "${info.network}"`);
    onStep("isolate", "network: none (verified with docker inspect)");
    return { ...info, withheld: source.withheld, env: Object.keys(env) };
  } catch (e) {
    await docker(["rm", "-f", "-v", name]);
    throw e;
  }
}

// Runs a shell command inside the sandbox. Output streams to onOutput and the
// tail is returned, so both people and agents get the result.
export async function execInSandbox(id, command, { onOutput, timeoutMs } = {}) {
  const info = await getSandbox(id);
  if (info.status !== "running") throw new SandboxError(`${id} is ${info.status}, not running`);
  const started = Date.now();
  let timedOut = false;
  const timer = timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        docker(["rm", "-f", "-v", info.container]); // the only reliable way to stop everything it started
      }, timeoutMs)
    : null;
  const res = await docker(["exec", "-w", WORKDIR, info.container, "sh", "-c", command], { onOutput });
  if (timer) clearTimeout(timer);
  return {
    sandboxId: id,
    command,
    exitCode: timedOut ? 124 : res.code,
    timedOut,
    durationMs: Date.now() - started,
    output: (res.stdout + res.stderr).slice(-MAX_OUTPUT),
  };
}

export async function destroySandbox(id) {
  const info = await getSandbox(id); // also proves it carries our label — never removes a foreign container
  await dockerOk(["rm", "-f", "-v", info.container], `destroying ${id}`);
  return { sandboxId: id, destroyed: true };
}

// One-shot: fresh sandbox → run the tests → throw the sandbox away.
export async function runTests({ dir = ".", ref, image, command, keep = false, timeoutMs = 15 * 60 * 1000, onStep = () => {}, onOutput } = {}) {
  const sandbox = await createSandbox({ dir, ref, image, onStep, onOutput });
  const test = command || sandbox.test;
  try {
    if (!test) throw new SandboxError("no test command detected — pass --cmd or set \"test\" in .arcade/sandbox.json");
    onStep("test", test);
    const result = await execInSandbox(sandbox.sandboxId, test, { onOutput, timeoutMs });
    return { ...result, passed: result.exitCode === 0, source: sandbox.source, image: sandbox.image, network: sandbox.network, kept: keep && !result.timedOut };
  } finally {
    if (!keep) await docker(["rm", "-f", "-v", sandbox.container]);
  }
}

// ── `arcade sandbox …` ───────────────────────────────────────────────────────

const C = {
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
};

const USAGE = `${C.b("arcade sandbox")} — real, disposable Docker sandboxes

  create [path] [--ref <git-ref>] [--image <img>] [--offline]   Build a sandbox from a project
  test   [path] [--ref <git-ref>] [--cmd "<command>"] [--keep]  Fresh sandbox → run tests → destroy
  exec   <id> -- <command...>                                   Run a command inside a sandbox
  ls                                                            List sandboxes
  destroy <id> | --all                                          Throw sandboxes away

  All subcommands accept --json.`;

function parse(argv) {
  const dashdash = argv.indexOf("--");
  const rest = dashdash === -1 ? [] : argv.slice(dashdash + 1);
  const head = dashdash === -1 ? argv : argv.slice(0, dashdash);
  const flags = {};
  const pos = [];
  for (let i = 0; i < head.length; i++) {
    const a = head[i];
    if (["--ref", "--image", "--cmd", "--timeout"].includes(a)) flags[a.slice(2)] = head[++i];
    else if (a.startsWith("--")) flags[a.slice(2)] = true;
    else pos.push(a);
  }
  return { flags, pos, rest };
}

export async function sandboxCli(argv) {
  const { flags, pos, rest } = parse(argv);
  const [sub = "help", target] = pos;
  const json = !!flags.json;
  const out = (obj) => console.log(JSON.stringify(obj, null, 2));
  const steps = [];
  const onStep = (step, detail) => {
    steps.push({ step, detail });
    if (!json) console.log(`  ${C.green("●")} ${step.padEnd(9)} ${C.dim(detail)}`);
  };
  const onOutput = json ? undefined : (s) => process.stdout.write(C.dim(s.replace(/^(?=.)/gm, "    │ ")));

  try {
    switch (sub) {
      case "create": {
        if (!json) console.log(`${C.b("arcade sandbox create")} ${target || "."}`);
        const sb = await createSandbox({ dir: target, ref: flags.ref, image: flags.image, offline: !!flags.offline, onStep, onOutput });
        if (json) return out({ ...sb, steps });
        console.log(`\n${C.green("✓")} ${C.b(sb.sandboxId)} ready · network: ${sb.network} · ${sb.image}`);
        console.log(C.dim(`  arcade sandbox exec ${sb.sandboxId} -- ${sb.test || "sh -c 'ls'"}\n  arcade sandbox destroy ${sb.sandboxId}`));
        return;
      }
      case "test": {
        if (!json) console.log(`${C.b("arcade sandbox test")} ${target || "."}`);
        const timeoutMs = flags.timeout ? Number(flags.timeout) * 1000 : undefined;
        const r = await runTests({ dir: target, ref: flags.ref, image: flags.image, command: flags.cmd, keep: !!flags.keep, timeoutMs, onStep, onOutput });
        if (json) out({ ...r, steps });
        else console.log(`\n${r.passed ? C.green("✓ passed") : C.red(r.timedOut ? "✗ timed out" : `✗ failed (exit ${r.exitCode})`)} ${C.dim(`· ${r.sandboxId} · ${(r.durationMs / 1000).toFixed(1)}s · ${r.kept ? "kept" : "destroyed"}`)}`);
        if (!r.passed) process.exitCode = 1;
        return;
      }
      case "exec": {
        if (!rest.length) throw new SandboxError("usage: arcade sandbox exec <id> -- <command...>");
        const r = await execInSandbox(target, rest.join(" "), { onOutput: json ? undefined : (s) => process.stdout.write(s) });
        if (json) out(r);
        process.exitCode = r.exitCode;
        return;
      }
      case "ls": {
        const all = await listSandboxes();
        if (json) return out(all);
        if (!all.length) return console.log(C.dim("no sandboxes"));
        for (const s of all) console.log(`  ${s.status === "running" ? C.green("●") : C.dim("○")} ${C.b(s.sandboxId)}  ${s.image.padEnd(24)} network: ${s.network}  ${C.dim(`${s.source} · ${s.path}`)}`);
        return;
      }
      case "destroy": {
        const ids = flags.all ? (await listSandboxes()).map((s) => s.sandboxId) : [target];
        const done = [];
        for (const id of ids) done.push(await destroySandbox(id));
        if (json) return out(done);
        console.log(done.length ? done.map((d) => `${C.green("✓")} destroyed ${d.sandboxId}`).join("\n") : C.dim("no sandboxes"));
        return;
      }
      default:
        console.log(USAGE);
    }
  } catch (e) {
    if (!(e instanceof SandboxError)) throw e;
    if (json) out({ error: e.message });
    else console.error(`arcade: ${e.message}`);
    process.exitCode = 1;
  }
}
