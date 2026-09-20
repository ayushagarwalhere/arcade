# @arcade/cli

The Arcade command line, a dependency-free MCP server, and the Docker sandbox. Plain Node (`.mjs`, no build step, no
dependencies), so the desktop app can bundle the same files it runs.

```bash
node packages/cli/arcade.mjs <command>      # or: npm run cli -- <command>
```

## What is real, and what is a reference snapshot

| Command | Status |
|---|---|
| `sandbox create · test · exec · ls · destroy` | **Real.** Drives Docker on this machine — see below. |
| `agents` · `connect [agent]` · `disconnect [agent]` | **Real.** Registers Arcade's MCP server with Claude Code (`~/.claude.json`) and Codex (`~/.codex/config.toml`), touching only the `arcade` entry, atomically. |
| `scan` · `map` · `attack` · `findings` · `evidence` · `verify` · `status` | **Reference snapshot.** They print the fixed sample run in [`arcade-data.mjs`](arcade-data.mjs) and ignore their arguments. They exist so the command surface is scriptable; they do not analyse your repository yet. |
| `init` | Prints a confirmation only; it does not write `.arcade/config.json` yet. |

Real analysis of a repository happens in the ADE (scanner in `packages/core`), not in these commands.

## The sandbox

```bash
node packages/cli/arcade.mjs sandbox test .               # fresh sandbox → run the project's tests → destroy
node packages/cli/arcade.mjs sandbox test . --ref HEAD    # from a commit instead of the working tree
node packages/cli/arcade.mjs sandbox create . && node packages/cli/arcade.mjs sandbox ls
```

Needs Docker running. [`sandbox.mjs`](sandbox.mjs) does six things, in order:

1. **Snapshot** the project (`git ls-files`, or a walk), withholding `.env` files, keys and credential-bearing configs.
2. **Detect** the stack (Node / Python / Go, or `.arcade/sandbox.json`) → image, install and test commands.
3. **Create** a container with every capability dropped, `no-new-privileges`, memory/CPU/PID limits, **no host mounts**,
   and throwaway values for any secret-looking environment variable.
4. **Copy** the snapshot in (symlinks skipped, so nothing can point back at the host).
5. **Install** dependencies — the only step with a network.
6. **Isolate**: disconnect the network, then re-read `docker inspect` and refuse to continue unless it really is `none`.

Verified on Windows + Docker Desktop: a planted `.env` never entered the container, the host filesystem was not
visible, and an outbound request failed with `EAI_AGAIN`. Docker labels are the only state, so `ls` and `destroy`
cannot drift from reality.

The desktop app exposes the same run through [`apps/ade/electron/sandbox-ipc.js`](../../apps/ade/electron/sandbox-ipc.js).
A website cannot — there is no Docker on a visitor's machine for it to drive.

Hardening still open: the container runs as root, the root filesystem is writable, images are not pinned by digest,
and the install step has unrestricted egress.

## MCP server

```bash
node packages/cli/mcp-server.mjs            # JSON-RPC 2.0 over stdio, protocol 2024-11-05
```

| Tool | Status |
|---|---|
| `arcade_sandbox_test`, `arcade_sandbox_list` | **Real** |
| `arcade_scan`, `arcade_get_attack_surface`, `arcade_get_findings`, `arcade_get_evidence`, `arcade_run_attack`, `arcade_request_approval`, `arcade_verify_fix`, `arcade_get_status` | **Reference snapshot** — an agent calling these receives the sample run, not facts about its repository. |

`arcade_request_approval` returns `pending` and reaches no one yet. The API now has the other half
(`POST …/approvals`, `GET …/approvals/:id`, and decisions that only a signed-in person can make); connecting this tool
to it with an `arc_` API token is the next step.

## Publishing

Not publish-ready: no `files` allow-list, no `publishConfig.access`, no `repository`/`homepage`, and the `@arcade` npm
scope would need to be owned.
