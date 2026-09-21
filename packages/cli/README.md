# arcade-security

The Arcade command line and MCP server: a static security scanner for the code you (or your coding agent) just wrote,
fixes that are re-checked before they are called fixed, SARIF for CI, disposable Docker sandboxes, and a bridge to the
coding agents already installed on your machine.

No dependencies. Node.js 20 or newer. Nothing leaves your machine unless you ask for a push or a pull request.

```bash
npm install -g arcade-security     # provides `arcade` and `arcade-mcp`
arcade scan
```

Without installing: `npx arcade-security scan`. Per project: `npm install --save-dev arcade-security`, then
`npx arcade scan`.

## Quick start

```bash
cd your-project
arcade init                        # writes .arcade/config.json
arcade scan                        # real scan; saved to .arcade/last-scan.json
arcade findings                    # what it found
arcade evidence ARC-001            # where, the code, why it matters, how to fix it
arcade fix ARC-003                 # dry run: prints the patch, writes nothing
arcade fix ARC-003 --apply         # writes the change, then re-runs the rule over the file
arcade verify ARC-003              # re-check any time, e.g. after fixing something by hand
```

Run `arcade doctor` if something doesn't work; it checks Node, git, Docker, your agents and your GitHub token.

## What is what

| | How it works | Needs |
|---|---|---|
| `scan`, `findings`, `evidence`, `map`, `status`, `rules`, `verify` | **Static analysis.** 14 pattern rules read your source. Nothing is executed, no request is sent, nothing is uploaded. | Node |
| `fix <id>` | The rule set's own one-line rewrite, where one exists (today: weak hashes, wildcard CORS, disabled TLS verification). | Node |
| `fix <id> --agent <id>`, `agent` | Hands the work to a coding agent CLI **you** installed and signed in to. It runs under your account and may cost money. Arcade judges the result itself. | Claude Code, Codex, Gemini CLI, Cursor CLI or OpenCode |
| `fix --commit / --push / --pr` | Real `git` commits and pushes; pull requests through the GitHub API. | git; `GITHUB_TOKEN` or `GH_TOKEN` for `--pr` |
| `sandbox …` | Real containers with the network cut. | Docker |
| `demo` | A fictional sample run, labelled as such. The only command that does not describe your project. | — |

## Commands

Every command accepts `--json` (errors included: `{"ok": false, "error": "…"}`) and `--cwd <dir>`.

**Exit codes:** `0` ok · `1` findings at or above the threshold, or a fix that did not verify · `2` usage or runtime error.

### `arcade init [path]`

Creates `.arcade/config.json` and `.arcade/.gitignore` (which keeps the scan cache out of your commits). Run it twice
and the second run changes nothing and says so.

```json
{ "version": 1, "scope": "source", "failOn": "high", "ignore": [] }
```

| Key | Values |
|---|---|
| `scope` | `source` skips tests, fixtures, examples, docs and `public/`; `all` scans everything. `node_modules`, `dist`, `build`, `.next` and similar are never crawled. |
| `failOn` | `critical`, `high`, `medium`, `low` or `none`. `arcade scan` exits 1 when an open finding is at or above it. Without a config file the default is `none`. |
| `ignore` | gitignore-style globs: `"fixtures"` (any depth), `"legacy/"` (folders), `"src/generated/**"` (anchored). |

### `arcade scan [path]`

```bash
arcade scan                                   # current folder
arcade scan services/api --scope all
arcade scan . --fail-on high                  # exit 1 if anything high or critical is open
arcade scan . --sarif arcade.sarif            # SARIF 2.1.0 for GitHub code scanning
arcade scan . --json | jq '.counts'
```

The result is saved to `<path>/.arcade/last-scan.json`; the commands below read it (from that folder or any folder
beneath it). Findings are numbered `ARC-001…`, strongest first, and keep their number until the next scan.

Credential findings are redacted everywhere: in the terminal, in `--json`, in SARIF, in the saved scan and in anything
an agent receives over MCP. The scan never copies a secret out of your source file.

### `arcade findings [--severity <s>] [--all]`

Open findings of the last scan. `--severity high` keeps high and critical; `--all` includes the ones already fixed.
The last column says whether Arcade can rewrite it (`rewrite`) or the fix needs an agent or a person (`agent`).

### `arcade evidence <id>`

Location, the flagged code, why it matters, the root cause and ranked mitigations. `ARC-003`, `arc-3` and `3` are the
same finding. The evidence is static: the pattern was matched in source; no exploit was run.

### `arcade map` · `arcade status`

`map` prints the project profile (detected stack, route-like files) and which attack-surface layers the findings land
on. It is a model built from the scan, not a traced exploit. `status` summarises the last scan: open and fixed counts,
and whether the project currently passes its `failOn` threshold.

### `arcade rules`

The rule set with severity, CWE, languages, and whether an automatic rewrite exists.

### `arcade fix <id>`

```bash
arcade fix ARC-003                                        # dry run (default): print the patch
arcade fix ARC-003 --apply                                # write it, then re-run the rule over the file
arcade fix ARC-003 --commit --branch fix/weak-hash        # new branch + one commit holding only the fix
arcade fix ARC-003 --pr                                   # branch arcade/arc-003-weak-hash, commit, push, open a PR
arcade fix ARC-002 --agent claude-code                    # dry run: print the prompt; no agent is started
arcade fix ARC-002 --agent codex --model gpt-5.1-codex --apply
```

- **Nothing is written without `--apply`** (`--commit`, `--push` and `--pr` imply it).
- For rules without a real rewrite, Arcade says so and changes nothing. It never inserts a `FIXME` and calls it a fix.
- With `--agent`, the agent runs in edit mode with a narrow prompt (one finding, one file, minimal change, no git).
  Arcade then shows the **real diff** of the file and re-runs the rule. An agent that says "done" but changed nothing,
  or changed the file without closing the finding, is reported as a failure (exit 1).
- A rewrite that would delete a line holding other code is refused unless you pass `--force`.
- **Nothing is committed when the re-check fails** (unless `--force`). Commits contain only the files the fix touched;
  if you have staged changes of your own, Arcade stops before touching anything.
- `--pr` needs a `github.com` origin and `GITHUB_TOKEN` / `GH_TOKEN` with the `repo` scope. This is checked before any
  change is made. The token is never printed.

"Verified" means the rule that raised the finding no longer matches the file. It does not mean the program still works.
Review the diff and run your tests (`arcade sandbox test .` runs them in an isolated container).

### `arcade verify <id>`

Re-runs the finding's rule over the file as it is on disk now. Exit 0 when the flagged code is gone, 1 when it is still
there. Use it after fixing something by hand.

### `arcade agent "<prompt>" [--agent <id>] [--edit] [--model <m>]`

Runs an installed coding agent headlessly in the current folder and streams what it says and does. Read-only unless
`--edit`. Without `--agent`, the first installed agent is used. Your prompt is sent over stdin, never on a command line.

```bash
arcade agent "where do we verify JWTs, and is the algorithm pinned?"
arcade agent --edit --agent codex "add a regression test for the order lookup"
```

### `arcade agents` · `arcade connect [agent]` · `arcade disconnect [agent]`

`agents` lists the agent CLIs Arcade can run and which agents have Arcade's MCP server registered. `connect` registers
the MCP server with Claude Code (`~/.claude.json`) and/or Codex (`~/.codex/config.toml`), touching only the `arcade`
entry; `disconnect` removes it.

### `arcade sandbox <create|test|exec|ls|destroy>`

```bash
arcade sandbox test .               # fresh container → install → cut the network → run the tests → destroy
arcade sandbox test . --ref HEAD    # from a commit instead of the working tree
arcade sandbox create . && arcade sandbox ls
arcade sandbox exec <id> -- npm test
```

Needs Docker. The project is snapshotted without `.env` files, keys or credential-bearing configs; the container gets
no host mounts, no capabilities, resource limits, and its network is disconnected after the install step (and verified
to be `none` before anything runs). Docker labels are the only state, so `ls` and `destroy` cannot drift from reality.

### `arcade doctor` · `arcade demo` · `arcade --version`

`doctor` reports what works on this machine. It shows whether a GitHub token is set, never its value.
`demo` prints a fictional sample run under a "SAMPLE DATA" banner.

## CI

```yaml
# .github/workflows/arcade.yml
name: Arcade security scan
on: [push, pull_request]

permissions:
  contents: read
  security-events: write          # lets the job upload SARIF to code scanning

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Scan
        run: npx --yes arcade-security scan . --fail-on high --sarif arcade.sarif
      - name: Upload results to GitHub code scanning
        if: always()               # upload even when the scan step failed the build
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: arcade.sarif
          category: arcade
```

The scan step fails the job (exit 1) when an open finding is at or above `--fail-on`; findings appear under
**Security → Code scanning**. Pin a version in CI (`arcade-security@0.2.0`) so a new rule can't fail a build unannounced.

## MCP server

```bash
arcade connect                     # Claude Code and Codex, whichever are installed
# or register it yourself:
claude mcp add arcade -- npx -y -p arcade-security arcade-mcp
```

```toml
# ~/.codex/config.toml
[mcp_servers.arcade]
command = "npx"
args = ["-y", "-p", "arcade-security", "arcade-mcp"]
```

JSON-RPC 2.0 over stdio, protocol `2024-11-05`, methods `initialize`, `tools/list`, `tools/call`, `ping`. The server
reports on the folder it was started in, and `arcade_scan` refuses any path outside it.

| Tool | What it does |
|---|---|
| `arcade_scan {path?, scope?}` | A real scan of the project (or a folder inside it). |
| `arcade_get_findings {severity?}` · `arcade_get_evidence {id}` · `arcade_get_attack_surface` · `arcade_get_status` | Read the last real scan. An error tells the agent to scan first; sample data is never returned. |
| `arcade_propose_fix {id}` | The rule set's patch as a unified diff, or `concrete: false` when there is no automatic rewrite. Writes nothing. |
| `arcade_verify_fix {id}` | Re-runs the rule over the file on disk after the agent changed it. |
| `arcade_request_approval {action, kind?, reason?, target?}` · `arcade_get_approval {id, runId}` | Ask a person through the Arcade API, and poll for the answer. Agents can ask; only a signed-in person can decide. |
| `arcade_sandbox_test` · `arcade_sandbox_list` | Docker sandboxes. |

Approvals need `ARCADE_API_URL`, `ARCADE_TOKEN` (an `arc_` API token), `ARCADE_ORG_ID` and `ARCADE_PROJECT_ID`
(`ARCADE_RUN_ID` is optional; a run is opened when it is missing). The ids can also live under `"cloud"` in
`.arcade/config.json`; the token cannot. Without the API configured the tool answers
`{"status": "unavailable", "reason": "…"}` and nobody has been asked.

A prompt worth keeping in your agent's instructions:

> After changing anything that touches auth, routing, queries, file access or outbound requests, run `arcade_scan`.
> For each new finding read `arcade_get_evidence`, fix it, then call `arcade_verify_fix` and show me the result.

## Limitations

- **It is a pattern scanner.** 14 rules over single lines (plus one whole-file heuristic for missing authorization).
  There is no data-flow or taint analysis, no dependency (CVE) scanning, and no runtime testing. Expect false positives
  (for example `exec(` on a constant string) and false negatives. A clean scan is not proof of security.
- **"Verified" is static.** It means the rule no longer matches. It cannot tell you the fix is correct or that the
  program still works.
- **Automatic rewrites are one-line substitutions** and exist for two rules: `weak-hash` (the algorithm name inside
  `createHash` / `hashlib` / `MessageDigest`) and `tls-verification-disabled` (the flag is flipped in place). Every other
  rule, including wildcard CORS, needs knowledge of your project, so its fix comes from `--agent` or from you.
- **Untracked files are scanned too.** A local `.env` will be reported as a hard-coded secret even though it is not in
  your repository. Add `".env*"` to `ignore` if that is noise for you.
- **Limits:** files over 1.5 MB and binary files are skipped; at most 8000 files are indexed, 4000 scanned, and a scan
  stops at 400 hits (it says so when that happens).
- **Finding ids are per scan.** `ARC-003` may be a different finding after the next `arcade scan`.
- **Agents are yours.** Arcade starts the CLI you installed, under your account and your billing. Arcade constrains
  the prompt and checks the result, but an agent in edit mode can change any file in the project folder.
- **Pull requests are GitHub-only.** Pushing works with any remote your git credentials can reach.
- **Sandbox hardening still open:** the container runs as root with a writable root filesystem, images are not pinned
  by digest, and the install step has unrestricted network access.

## Development

This package lives in the Arcade monorepo (`packages/cli`). The analysis engine is TypeScript in `packages/core` and
`packages/agents`; `engine.mjs` is that code bundled into one dependency-free file and **committed**, so `npm pack` and
the desktop app (which copies the flat `*.mjs` files) need no build step.

```bash
npm run build:engine -w packages/cli      # after changing packages/core or packages/agents
npm run check:engine -w packages/cli      # fails if the committed engine.mjs is stale (also runs on prepack)
npm test -w packages/cli                  # node --test; agents are exercised only through a fake stub
```

Every runtime module must stay a flat `.mjs` file in this folder. `scripts/` and `tests/` are not shipped.

MIT licensed.
