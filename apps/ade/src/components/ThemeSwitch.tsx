"use client";
import { Moon, Sun } from "lucide-react";
import { themeById } from "@/lib/ade-themes";
import { updateSettings, useSettings } from "@/lib/settings";

// A theme's light/dark counterpart, where it has one; the rest fall back to Arcade's own pair.
const PAIRS: Record<string, string> = {
  "arcade-dark": "arcade-light",
  "arcade-light": "arcade-dark",
  "dark-modern": "light-modern",
  "light-modern": "dark-modern",
  "github-dark": "github-light",
  "github-light": "github-dark",
  "solarized-dark": "solarized-light",
  "solarized-light": "solarized-dark",
};

/** Light ↔ dark for the workbench. The full list of color themes is in Settings and the command palette. */
export default function ThemeSwitch() {
  const { themeId } = useSettings();
  const theme = themeById(themeId);
  const next = PAIRS[theme.id] ?? (theme.base === "dark" ? "arcade-light" : "arcade-dark");
  const Icon = theme.base === "dark" ? Sun : Moon;
  return (
    <button
      onClick={() => updateSettings({ themeId: next })}
      title={`Switch to ${themeById(next).name} · more themes in Settings (Ctrl+,)`}
      aria-label="Switch between light and dark"
      className="grid h-6 w-6 place-items-center rounded-md text-ade-muted transition hover:bg-white/[0.06] hover:text-ade-fg"
    >
      <Icon className="h-[15px] w-[15px]" strokeWidth={1.7} />
    </button>
  );
}
