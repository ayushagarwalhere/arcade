"use client";
import { useLayoutEffect, useSyncExternalStore } from "react";
import { applyTheme, currentTheme, storedTheme, subscribeTheme, type Theme } from "../lib/theme";

export function useTheme(): Theme {
  // In development, Strict Mode's remount resets <html> to the attributes React
  // manages, dropping the one THEME_SCRIPT set. Re-apply before paint; a no-op in production.
  useLayoutEffect(() => {
    if (storedTheme() !== currentTheme()) applyTheme(storedTheme());
  }, []);
  return useSyncExternalStore(subscribeTheme, currentTheme, () => "dark");
}
