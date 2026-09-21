/**
 * Incoming `arcade://` links.
 *
 *   arcade://repo/<owner>/<name>            open that repository
 *   arcade://repo/<owner>/<name>/assess     open it on the assessment screen
 *
 * Pure, so it can be tested without a device. Anything it does not recognise is
 * passed through untouched for expo-router to resolve (or reject) as a route.
 */
const NAME = /^[A-Za-z0-9_.-]+$/;

export function routeForLink(path: string): string {
  try {
    const url = new URL(path, "arcade://app");
    // `arcade://repo/o/n` parses with "repo" as the host; `/repo/o/n` and `arcade:///repo/o/n` carry it in the path.
    const parts = [url.protocol === "arcade:" && url.hostname !== "app" ? url.hostname : "", ...url.pathname.split("/")].filter(Boolean).map(decodeURIComponent);
    if (parts[0] !== "repo" || parts.length < 3) return path;
    const [, owner, name, action] = parts;
    if (!NAME.test(owner) || !NAME.test(name) || owner.startsWith(".") || name === "." || name === "..") return "/";
    const repo = encodeURIComponent(`${owner}/${name}`);
    return action === "assess" ? `/assess?repo=${repo}` : `/repo?repo=${repo}`;
  } catch {
    return "/";
  }
}
