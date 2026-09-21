"use client";
/**
 * Workbench settings — theme, editor preferences, which agent the pane talks to,
 * and how much the security loop may do with git on its own.
 *
 * One object in localStorage, read through `useSettings()`. Applying a theme is a
 * side effect of the store (CSS variables on <html>), so every surface follows it
 * without being told, and a second window picks the change up from the storage event.
 */
import { useSyncExternalStore } from "react";
import { setTheme } from "@arcade/ui/lib/theme";
import { DEFAULT_THEME, themeById, themeVars } from "./ade-themes";

export interface Settings {
  themeId: string;
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  /** Save a changed file when its tab loses focus. */
  autoSave: boolean;
  /** The agent the pane runs; "" picks the first one installed. */
  agentId: string;
  /** Model passed to the agent's CLI; "" leaves the agent's own default. */
  agentModel: string;
  /** May the agent change files, or only read them? */
  agentMode: "read" | "edit";
  /** Shell for the terminal; "" is the platform default. */
  shell: string;
  /**
   * After a fix verifies: "ask" stops at the ship gate before anything leaves the
   * machine; "auto" pushes the fix branch and opens the pull request on its own.
   * A fix is always committed to its own branch, never to the branch you were on.
   */
  shipMode: "ask" | "auto";
  /** Run the project's tests before a fix may be committed. */
  testsBeforeCommit: boolean;
}

export const DEFAULTS: Settings = {
  themeId: DEFAULT_THEME,
  fontSize: 13,
  tabSize: 2,
  wordWrap: false,
  minimap: true,
  lineNumbers: true,
  autoSave: false,
  agentId: "",
  agentModel: "",
  agentMode: "edit",
  shell: "",
  shipMode: "ask",
  testsBeforeCommit: true,
};

const KEY = "arcade.settings";
const listeners = new Set<() => void>();
let current: Settings = DEFAULTS;
let loaded = false;

function sanitize(raw: unknown): Settings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d);
  const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
  const str = (v: unknown, d: string) => (typeof v === "string" ? v.slice(0, 80) : d);
  return {
    themeId: themeById(str(r.themeId, DEFAULT_THEME)).id,
    fontSize: num(r.fontSize, 10, 24, DEFAULTS.fontSize),
    tabSize: num(r.tabSize, 1, 8, DEFAULTS.tabSize),
    wordWrap: bool(r.wordWrap, DEFAULTS.wordWrap),
    minimap: bool(r.minimap, DEFAULTS.minimap),
    lineNumbers: bool(r.lineNumbers, DEFAULTS.lineNumbers),
    autoSave: bool(r.autoSave, DEFAULTS.autoSave),
    agentId: str(r.agentId, ""),
    agentModel: str(r.agentModel, ""),
    agentMode: r.agentMode === "read" ? "read" : "edit",
    shell: str(r.shell, ""),
    shipMode: r.shipMode === "auto" ? "auto" : "ask",
    testsBeforeCommit: bool(r.testsBeforeCommit, DEFAULTS.testsBeforeCommit),
  };
}

function applyThemeVars(s: Settings) {
  const theme = themeById(s.themeId);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(themeVars(theme))) root.style.setProperty(k, v);
  root.dataset.adeTheme = theme.id;
  // The site-wide light/dark remap still drives everything that isn't a workbench token.
  setTheme(theme.base);
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    // First run: follow the light/dark choice already made on the site.
    current = raw ? sanitize(JSON.parse(raw)) : { ...DEFAULTS, themeId: document.documentElement.dataset.theme === "light" ? "arcade-light" : DEFAULT_THEME };
  } catch {
    current = DEFAULTS;
  }
  applyThemeVars(current);
  window.addEventListener("storage", (e) => {
    if (e.key !== KEY || !e.newValue) return;
    try {
      current = sanitize(JSON.parse(e.newValue));
      applyThemeVars(current);
      listeners.forEach((l) => l());
    } catch {
      /* someone else's malformed write */
    }
  });
}

export function getSettings(): Settings {
  load();
  return current;
}

export function updateSettings(patch: Partial<Settings>) {
  load();
  current = sanitize({ ...current, ...patch });
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage blocked; the change lasts for this window */
  }
  if (patch.themeId !== undefined) applyThemeVars(current);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  load();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export const useSettings = () => useSyncExternalStore(subscribe, getSettings, () => DEFAULTS);
