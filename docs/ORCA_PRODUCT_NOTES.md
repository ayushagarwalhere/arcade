# Arcade product notes

Arcade's first product surface is inspired by the local Orca documentation in
`orca/docs/`. The source material was distilled into product language rather
than copied wholesale into the interface.

## Product pillars

- **Parallel worktrees:** fan one task across isolated branches, compare the
  results, and merge the strongest implementation.
- **One command center:** track agent status, worktree health, terminal work,
  and recent sessions in one place.
- **Secure by default:** keep execution state owned by its host, isolate each
  agent, scan for secrets, and treat prompt injection as a first-class threat.
- **Searchable context:** find prior agent sessions by repository, agent, or
  time without leaving the workspace.
- **Review in the loop:** open diffs, annotate changes, and send precise
  follow-ups back to the responsible agent.

## Source map

The dashboard language is based on these local Orca references:

- `orca/README.md` for parallel worktrees, terminal splits, review workflows,
  and supported CLI agents.
- `orca/docs/STYLEGUIDE.md` for quiet chrome, state-driven color, dense rows,
  and editor-first UI patterns.
- `orca/docs/reference/agent-status-store.md` for host-owned status,
  worktree isolation, and a single source of truth for agent state.
- `orca/docs/reference/agent-session-search-contract.md` for scoped session
  search, freshness, and transport-aware exposure boundaries.

This file is a product brief for the hackathon prototype, not a replacement
for Orca's engineering documentation.
