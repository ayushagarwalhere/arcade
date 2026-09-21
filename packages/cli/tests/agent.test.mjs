// The agent path, exercised only through a FAKE `codex` on a private PATH.
// No real coding agent is ever started by this file: every run names
// `--agent codex`, the stub's folder is first on PATH, and HOME is an empty folder.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { after, test } from "node:test";
import { AgentError, detectAgents, findAgentBinary, runAgent } from "../agent-runner.mjs";
import { cleanup, fakeCodex, fakeCodexScript, makeFixture, runCli, sealedEnv, stubPath, tempDir } from "./helpers.mjs";

after(cleanup);

const HELLO = ['{"type":"thread.started","thread_id":"t1"}', '{"type":"item.completed","item":{"type":"agent_message","text":"hello"}}', '{"type":"turn.completed"}'];

const stubEnv = (stubDir) => {
  const env = sealedEnv({ PATH: stubPath(stubDir) });
  delete env.Path; // Windows keeps PATH under either spelling; make sure only ours is seen
  env.PATH = stubPath(stubDir);
  return env;
};

test("runAgent turns Codex JSONL into normalized events (the .cmd-via-shell path on Windows)", async () => {
  const stub = fakeCodex(HELLO);
  const env = stubEnv(stub);
  const home = env.HOME;

  assert.equal(path.dirname(findAgentBinary("codex", { env, home })), stub);
  const seen = detectAgents({ env, home });
  assert.deepEqual(seen.filter((a) => a.runnable).map((a) => a.id), ["codex"], "only the stub is discoverable in the sealed environment");

  const events = [];
  const done = await runAgent({ id: "codex", cwd: tempDir(), prompt: "say hello", mode: "read", env, home, onEvent: (ev) => events.push(ev) });

  assert.deepEqual(events[0], { type: "start", sessionId: "t1" });
  assert.deepEqual(events[1], { type: "text", text: "hello", delta: false });
  const last = events.at(-1);
  assert.equal(last.type, "done");
  assert.equal(last.ok, true);
  assert.equal(last.exitCode, 0);
  assert.equal(last.sessionId, "t1");
  assert.deepEqual(events.map((e) => e.type), ["start", "text", "done"]);
  assert.equal(done.ok, true);
  assert.equal(done.cancelled, false);
});

test("runAgent reports a failed turn, validates its inputs, and refuses an agent that isn't installed", async () => {
  const stub = fakeCodex(['{"type":"thread.started","thread_id":"t2"}', '{"type":"turn.failed","error":{"message":"quota exceeded"}}']);
  const env = stubEnv(stub);
  const done = await runAgent({ id: "codex", cwd: tempDir(), prompt: "x", env, home: env.HOME });
  assert.equal(done.ok, false);
  assert.match(done.error, /quota exceeded/);

  assert.throws(() => runAgent({ id: "codex", cwd: tempDir(), prompt: "  ", env, home: env.HOME }), AgentError);
  assert.throws(() => runAgent({ id: "codex", cwd: tempDir(), prompt: "x", model: "bad model; rm -rf", env, home: env.HOME }), /isn't a model name/);
  assert.throws(() => runAgent({ id: "nope", cwd: tempDir(), prompt: "x", env, home: env.HOME }), /Unknown agent/);
  assert.throws(() => runAgent({ id: "gemini", cwd: tempDir(), prompt: "x", env, home: env.HOME }), /isn't installed/);
});

test("arcade agent streams the fake agent's reply, and answers in JSON", () => {
  const env = stubEnv(fakeCodex(HELLO));
  const cwd = tempDir();
  const text = runCli(["agent", "say", "hello", "--agent", "codex"], { cwd, env });
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /Codex · read-only/);
  assert.match(text.stdout, /session t1/);
  assert.match(text.stdout, /^hello$/m);
  assert.match(text.stdout, /✓ done/);

  const out = runCli(["agent", "--agent=codex", "--json", "--", "--starts-with-dashes"], { cwd, env }).json();
  assert.equal(out.ok, true);
  assert.equal(out.agent, "codex");
  assert.equal(out.mode, "read");
  assert.equal(out.text, "hello");

  const missing = runCli(["agent", "hi", "--agent", "gemini"], { cwd, env });
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /isn't installed/);
  assert.equal(runCli(["agent"], { cwd, env }).status, 2);
});

// A fake agent that really edits the file, the way a real one would in edit mode.
const FIXER = `
import fs from "node:fs";
import path from "node:path";
let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;
fs.writeFileSync(path.join(path.dirname(process.argv[1]), "prompt.txt"), prompt);
fs.writeFileSync(path.join(path.dirname(process.argv[1]), "argv.json"), JSON.stringify(process.argv.slice(2)));
const say = (o) => console.log(JSON.stringify(o));
say({ type: "thread.started", thread_id: "fix1" });
const file = path.join(process.cwd(), "src", "db.js");
const mode = process.env.FAKE_AGENT_MODE;
if (mode !== "lazy") {
  const next = mode === "wrong"
    ? fs.readFileSync(file, "utf8").replace("const id", "const orderId")
    : fs.readFileSync(file, "utf8").replace("return db.query(\`SELECT * FROM orders WHERE id = \${id}\`);", 'return db.query("SELECT * FROM orders WHERE id = $1", [id]);');
  fs.writeFileSync(file, next);
  say({ type: "item.completed", item: { id: "i1", type: "file_change", changes: [{ path: "src/db.js", kind: "update" }] } });
}
say({ type: "item.completed", item: { id: "i2", type: "agent_message", text: "Switched the query to a bound parameter." } });
say({ type: "turn.completed" });
`;

function scanned() {
  const root = makeFixture();
  assert.equal(runCli(["scan"], { cwd: root }).status, 0);
  const id = runCli(["findings", "--json"], { cwd: root }).json().find((f) => f.ruleId === "sql-injection").id;
  return { root, id, before: fs.readFileSync(path.join(root, "src/db.js"), "utf8") };
}

test("fix --agent: dry run starts nothing; --apply runs the agent, shows the real diff and re-verifies", () => {
  const stub = fakeCodexScript(FIXER);
  const env = stubEnv(stub);
  const { root, id, before } = scanned();

  const dry = runCli(["fix", id, "--agent", "codex"], { cwd: root, env });
  assert.equal(dry.status, 0);
  assert.match(dry.stdout, /Dry run: no agent was started/);
  assert.match(dry.stdout, /make the minimal change/i);
  assert.ok(!fs.existsSync(path.join(stub, "prompt.txt")), "a dry run must not start the agent");
  assert.equal(fs.readFileSync(path.join(root, "src/db.js"), "utf8"), before);

  const run = runCli(["fix", id, "--agent", "codex", "--model", "gpt-test", "--apply", "--json"], { cwd: root, env });
  assert.equal(run.status, 0, run.stderr + run.stdout);
  const out = run.json();
  assert.equal(out.ok, true);
  assert.equal(out.changed, true);
  assert.deepEqual(out.files, ["src/db.js"]);
  assert.equal(out.verification.closed, true);
  assert.match(out.patch, /^-  return db\.query\(`SELECT/m);
  assert.match(out.patch, /^\+  return db\.query\("SELECT \* FROM orders WHERE id = \$1", \[id\]\);/m);
  assert.equal(out.reply, "Switched the query to a bound parameter.");

  // The prompt went over stdin and is precise; argv carried only fixed flags and the checked model name.
  const prompt = fs.readFileSync(path.join(stub, "prompt.txt"), "utf8");
  for (const needle of [id, "sql-injection", "File: src/db.js", "Line: 3", "minimal change", "do not touch anything else", "Do not run git commands"]) assert.ok(prompt.includes(needle), `prompt lacks: ${needle}`);
  const argv = JSON.parse(fs.readFileSync(path.join(stub, "argv.json"), "utf8"));
  assert.deepEqual(argv, ["exec", "--json", "--skip-git-repo-check", "--sandbox", "workspace-write", "--model", "gpt-test", "-"]);
  assert.ok(!argv.join(" ").includes("minimal"), "prompt text must never reach argv");

  assert.equal(runCli(["verify", id], { cwd: root, env }).status, 0);
});

test("fix --agent is judged by the code, not by what the agent says", () => {
  const stub = fakeCodexScript(FIXER);
  const { root, id, before } = scanned();

  const lazy = runCli(["fix", id, "--agent", "codex", "--apply", "--json"], { cwd: root, env: { ...stubEnv(stub), FAKE_AGENT_MODE: "lazy" } });
  assert.equal(lazy.status, 1, "the agent claimed success but changed nothing");
  assert.equal(lazy.json().changed, false);
  assert.equal(lazy.json().ok, false);
  assert.equal(fs.readFileSync(path.join(root, "src/db.js"), "utf8"), before);

  const wrong = runCli(["fix", id, "--agent", "codex", "--apply"], { cwd: root, env: { ...stubEnv(stub), FAKE_AGENT_MODE: "wrong" } });
  assert.equal(wrong.status, 1, "the file changed but the weakness is still there");
  assert.match(wrong.stdout, /✗ not verified/);
  assert.match(wrong.stdout, /const orderId/);
});
