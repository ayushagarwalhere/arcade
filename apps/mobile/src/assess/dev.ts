/**
 * The development-only way to try the assessment screens without GitHub.
 * In a production bundle `__DEV__` is the constant false, so Metro drops the
 * block below and, with it, the only reference to the fixture module.
 */
import { mountMemoryRepo } from "@/github/repo-fs";

/** Mounts the fixture and returns its name — or null in a production build, where it does not exist. */
export function mountDevFixture(): string | null {
  if (__DEV__) {
    // The name lives in here too, so not even that string reaches a production bundle.
    const repo = "arcade-dev/fixture-shop";
    const { FIXTURE_FILES } = require("./dev-fixture") as typeof import("./dev-fixture");
    mountMemoryRepo(repo, FIXTURE_FILES);
    return repo;
  }
  return null;
}
