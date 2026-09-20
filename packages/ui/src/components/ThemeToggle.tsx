"use client";
import { Moon, Sun } from "lucide-react";
import { toggleTheme } from "../lib/theme";
import { useTheme } from "../hooks/useTheme";

/** `site` sits in the marketing and docs navbars, `ade` in the workbench top bar. */
export default function ThemeToggle({ variant, className = "" }: { variant: "site" | "ade"; className?: string }) {
  const theme = useTheme();
  const label = theme === "light" ? "Switch to dark mode" : "Switch to light mode";
  const Icon = theme === "light" ? Moon : Sun;
  const site = variant === "site";

  return (
    <button
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      className={`grid shrink-0 place-items-center transition ${
        site ? "h-9 w-9 rounded-lg text-white/70 hover:bg-white/[0.06] hover:text-white" : "h-6 w-6 rounded-md text-ade-muted hover:bg-white/[0.06] hover:text-ade-fg"
      } ${className}`}
    >
      <Icon className={site ? "h-[18px] w-[18px]" : "h-[15px] w-[15px]"} strokeWidth={1.7} />
    </button>
  );
}
