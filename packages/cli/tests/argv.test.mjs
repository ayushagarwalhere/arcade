import assert from "node:assert/strict";
import { test } from "node:test";
import { UsageError, parseArgv } from "../argv.mjs";

test("command, positionals and boolean flags", () => {
  const r = parseArgv(["scan", ".", "--json"]);
  assert.equal(r.command, "scan");
  assert.deepEqual(r.positionals, ["."]);
  assert.deepEqual(r.flags, { json: true });
});

test("a flag's value is never mistaken for the command or a positional", () => {
  const r = parseArgv(["--fail-on", "high", "scan", "--sarif", "out.sarif", "src"]);
  assert.equal(r.command, "scan");
  assert.deepEqual(r.positionals, ["src"]);
  assert.deepEqual(r.flags, { "fail-on": "high", sarif: "out.sarif" });
});

test("--flag=value, including values with = and spaces", () => {
  const r = parseArgv(["fix", "ARC-001", "--branch=fix/a=b", "--agent=codex", "--model=gpt 5"]);
  assert.deepEqual(r.flags, { branch: "fix/a=b", agent: "codex", model: "gpt 5" });
  assert.deepEqual(r.positionals, ["ARC-001"]);
});

test("boolean forms: --no-x, --x=false, --x=true", () => {
  assert.deepEqual(parseArgv(["fix", "1", "--no-apply"]).flags, { apply: false });
  assert.deepEqual(parseArgv(["fix", "1", "--apply=false"]).flags, { apply: false });
  assert.deepEqual(parseArgv(["fix", "1", "--apply=true"]).flags, { apply: true });
  assert.throws(() => parseArgv(["fix", "1", "--apply=maybe"]), UsageError);
});

test("-- passes everything after it through as positionals", () => {
  const r = parseArgv(["agent", "--edit", "--", "--json", "is", "a", "flag"]);
  assert.equal(r.command, "agent");
  assert.deepEqual(r.flags, { edit: true });
  assert.deepEqual(r.positionals, ["--json", "is", "a", "flag"]);
});

test("a string flag without a value is a usage error", () => {
  assert.throws(() => parseArgv(["scan", "--sarif"]), /--sarif needs a value/);
  assert.throws(() => parseArgv(["scan", "--sarif", "--json"]), /--sarif needs a value/);
  assert.throws(() => parseArgv(["scan", "--sarif="]), /--sarif needs a value/);
});

test("unknown options are rejected, not silently treated as positionals", () => {
  assert.throws(() => parseArgv(["scan", "--fial-on", "high"]), /unknown option --fial-on/);
  assert.throws(() => parseArgv(["-x", "scan"]), /unknown option -x/);
});

test("short flags", () => {
  assert.deepEqual(parseArgv(["-h"]).flags, { help: true });
  assert.deepEqual(parseArgv(["-v"]).flags, { version: true });
  assert.equal(parseArgv(["-v"]).command, null);
});

test("sandbox gets its raw argv by position, even when 'sandbox' appears earlier as a value", () => {
  // The old parser used argv.indexOf("sandbox") and sliced from the wrong place here.
  const r = parseArgv(["--cwd", "sandbox", "sandbox", "exec", "sandbox-1", "--timeout", "5", "--", "npm", "test", "--json"]);
  assert.equal(r.command, "sandbox");
  assert.equal(r.flags.cwd, "sandbox");
  assert.deepEqual(r.raw, ["exec", "sandbox-1", "--timeout", "5", "--", "npm", "test", "--json"]);
});

test("sandbox flags this parser doesn't know are left alone", () => {
  const r = parseArgv(["sandbox", "create", ".", "--offline", "--image", "node:22"]);
  assert.deepEqual(r.raw, ["create", ".", "--offline", "--image", "node:22"]);
  assert.deepEqual(r.flags, {});
});

test("a lone dash and a negative number after the command are positionals", () => {
  assert.deepEqual(parseArgv(["agent", "-", "-5"]).positionals, ["-", "-5"]);
});
