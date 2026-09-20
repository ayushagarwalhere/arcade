/**
 * Light / dark theme. The source of truth is `data-theme` on <html> (see the
 * theme block in app/globals.css); the choice persists in localStorage and is
 * applied before first paint by THEME_SCRIPT in app/layout.tsx.
 *
 * No React in here: the root layout, a Server Component, imports the script.
 * Components read the theme through hooks/useTheme.ts.
 */

export type Theme = "dark" | "light";

const KEY = "arcade.theme";

/** Dark is the default, so only a saved "light" needs applying. */
export const THEME_SCRIPT = `try{if(localStorage.getItem("${KEY}")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

const listeners = new Set<() => void>();

export const currentTheme = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

export function applyTheme(t: Theme) {
  if (t === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
  listeners.forEach((l) => l());
}

export function storedTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return currentTheme(); // storage blocked; the choice lasts for this page only
  }
}

export function setTheme(t: Theme) {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* see storedTheme() */
  }
  applyTheme(t);
}

export const toggleTheme = () => setTheme(currentTheme() === "light" ? "dark" : "light");

export function subscribeTheme(l: () => void) {
  listeners.add(l);
  // Follow a change made in another tab or window.
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) applyTheme(storedTheme());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(l);
    window.removeEventListener("storage", onStorage);
  };
}
