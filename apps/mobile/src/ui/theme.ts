/**
 * Arcade design tokens for React Native — the same palette as the ADE
 * (packages/ui/src/styles/theme.css): neutral editor greys, hairline borders, and
 * red / amber / emerald / violet as the only accents.
 */
import type { TokenType } from "@/core/highlight";

export const C = {
  chrome: "#111111",
  base: "#151515",
  editor: "#1a1a1a",
  raised: "#202020",
  hover: "#272727",
  line: "#2a2a2a",
  fg: "#d7d7d7",
  muted: "#8c8c8c",
  faint: "#5e5e5e",
  white: "#ffffff",

  red200: "#fecaca",
  red300: "#fca5a5",
  red400: "#f87171",
  red500: "#ef4444",
  orange300: "#fdba74",
  orange500: "#f97316",
  amber200: "#fde68a",
  amber300: "#fcd34d",
  amber400: "#fbbf24",
  emerald100: "#d1fae5",
  emerald300: "#6ee7b7",
  emerald400: "#34d399",
  emerald500: "#10b981",
  violet300: "#c4b5fd",
  violet400: "#a78bfa",
  violet500: "#8b5cf6",
  cyan300: "#67e8f9",
  cyan500: "#06b6d4",
  slate300: "#cbd5e1",
  slate400: "#94a3b8",
} as const;

/** `#rrggbb` + opacity → rgba(), for the translucent fills the web app gets from Tailwind's `/12`. */
export function alpha(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export const white = (a: number) => `rgba(255, 255, 255, ${a})`;

/** Font family names registered in app/_layout.tsx. */
export const F = {
  sans: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  mono: "JetBrainsMono_400Regular",
  monoBold: "JetBrainsMono_700Bold",
} as const;

export const SYNTAX: Record<TokenType, string> = {
  plain: "#d6d6dd",
  comment: "#6d6d6d",
  string: "#e394dc",
  number: "#ebc88d",
  keyword: "#83d6c5",
  type: "#87c3ff",
  func: "#efb080",
  const: "#aaa0fa",
  prop: "#aa9bf5",
  tag: "#87c3ff",
};
