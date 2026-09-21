/**
 * Entry point for the CLI's engine bundle (see build-engine.mjs).
 *
 * Re-exports the pure parts of the monorepo engine — scanner, rules, fixes, the
 * agents' static analysis and the GitHub write client — so the dependency-free
 * CLI and MCP server run exactly the code the desktop app runs.
 *
 * Keep this list free of anything that touches React, the DOM or browser storage
 * (`store.ts`, `github.ts`, `workspace.ts`): the build fails if one slips in.
 */
export { scanWorkspace } from "@arcade/core/scanner";
export { RULES, RULES_BY_ID, bySeverity } from "@arcade/core/rules";
export { ruleOf, matchRule, isConcrete, ruleEdit, applyEdit, diffTexts, verifyFile } from "@arcade/core/fixes";
export { desktopFs, memoryFs, crawl, HEAVY_DIRS, MAX_TEXT_BYTES, extOf, formatBytes } from "@arcade/core/fs";
export { commitFiles, openPullRequest, repoAccess, githubRepoOf, GithubWriteError } from "@arcade/core/github-write";
export { mapProject, mapSurface } from "@arcade/agents/mapper";
export { reproduce, toFinding } from "@arcade/agents/attacker";
export { defend } from "@arcade/agents/defender";
export { remediate } from "@arcade/agents/remediator";
export { verify } from "@arcade/agents/verifier";
export { LOCAL_PROVIDER } from "@arcade/agents/provider";

declare const __ARCADE_VERSION__: string;
/** The package version this bundle was built for. The desktop app ships the .mjs files without package.json. */
export const ENGINE_VERSION: string = __ARCADE_VERSION__;
