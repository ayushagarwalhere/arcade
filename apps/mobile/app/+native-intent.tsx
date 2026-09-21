import { routeForLink } from "@/links";

/** expo-router hands every incoming system link here before routing. Must never throw. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    return routeForLink(path);
  } catch {
    return "/";
  }
}
