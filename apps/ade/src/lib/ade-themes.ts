/**
 * Color themes for the workbench.
 *
 * A theme is data: nine chrome tokens and nine syntax tokens. The same record is
 * applied twice — as CSS variables over the ADE's `--color-ade-*` / `--syntax-*`
 * tokens (packages/ui/src/styles/theme.css), and as a Monaco theme — so the
 * editor and the shell around it can't drift apart. `base` picks which of the
 * site's two token remaps (dark / light) everything else inherits from.
 */

export interface AdeTheme {
  id: string;
  name: string;
  base: "dark" | "light";
  chrome: { chrome: string; base: string; editor: string; raised: string; hover: string; line: string; fg: string; muted: string; faint: string };
  syntax: { plain: string; comment: string; string: string; number: string; keyword: string; type: string; func: string; const: string; prop: string };
  /** Selection and the focused-line tint in the editor. */
  selection: string;
  accent: string;
}

const t = (
  id: string,
  name: string,
  base: AdeTheme["base"],
  chrome: [string, string, string, string, string, string, string, string, string],
  syntax: [string, string, string, string, string, string, string, string, string],
  selection: string,
  accent: string,
): AdeTheme => ({
  id,
  name,
  base,
  chrome: { chrome: chrome[0], base: chrome[1], editor: chrome[2], raised: chrome[3], hover: chrome[4], line: chrome[5], fg: chrome[6], muted: chrome[7], faint: chrome[8] },
  syntax: { plain: syntax[0], comment: syntax[1], string: syntax[2], number: syntax[3], keyword: syntax[4], type: syntax[5], func: syntax[6], const: syntax[7], prop: syntax[8] },
  selection,
  accent,
});

//            chrome     base       editor     raised     hover      line       fg         muted      faint
//            plain      comment    string     number     keyword    type       func       const      prop
export const ADE_THEMES: AdeTheme[] = [
  t("arcade-dark", "Arcade Dark", "dark",
    ["#111111", "#151515", "#1a1a1a", "#202020", "#272727", "#2a2a2a", "#d7d7d7", "#8c8c8c", "#5e5e5e"],
    ["#d6d6dd", "#6d6d6d", "#e394dc", "#ebc88d", "#83d6c5", "#87c3ff", "#efb080", "#aaa0fa", "#aa9bf5"], "#2f4f46", "#34d399"),
  t("arcade-light", "Arcade Light", "light",
    ["#f0f0f0", "#f7f7f7", "#ffffff", "#ffffff", "#e9e9e9", "#e1e1e1", "#2a2a2a", "#6a6a6a", "#9b9b9b"],
    ["#24292f", "#8b919a", "#a8246f", "#9a6700", "#0f766e", "#0a5cc2", "#b4540a", "#6d4fd1", "#6a4bc4"], "#c9eede", "#059669"),
  t("dark-modern", "Dark Modern", "dark",
    ["#181818", "#181818", "#1f1f1f", "#252526", "#2a2d2e", "#2b2b2b", "#cccccc", "#9d9d9d", "#6e6e6e"],
    ["#d4d4d4", "#6a9955", "#ce9178", "#b5cea8", "#569cd6", "#4ec9b0", "#dcdcaa", "#4fc1ff", "#9cdcfe"], "#264f78", "#0078d4"),
  t("light-modern", "Light Modern", "light",
    ["#f8f8f8", "#f8f8f8", "#ffffff", "#ffffff", "#e8e8e8", "#e5e5e5", "#3b3b3b", "#6f6f6f", "#a0a0a0"],
    ["#3b3b3b", "#008000", "#a31515", "#098658", "#0000ff", "#267f99", "#795e26", "#0070c1", "#001080"], "#add6ff", "#005fb8"),
  t("monokai", "Monokai", "dark",
    ["#1e1f1c", "#21221e", "#272822", "#2e2f29", "#3e3d32", "#34352f", "#f8f8f2", "#a59f85", "#75715e"],
    ["#f8f8f2", "#88846f", "#e6db74", "#ae81ff", "#f92672", "#66d9ef", "#a6e22e", "#ae81ff", "#fd971f"], "#49483e", "#a6e22e"),
  t("dracula", "Dracula", "dark",
    ["#21222c", "#21222c", "#282a36", "#343746", "#3c3f52", "#343746", "#f8f8f2", "#9aa0c0", "#6272a4"],
    ["#f8f8f2", "#6272a4", "#f1fa8c", "#bd93f9", "#ff79c6", "#8be9fd", "#50fa7b", "#bd93f9", "#ffb86c"], "#44475a", "#bd93f9"),
  t("one-dark", "One Dark", "dark",
    ["#21252b", "#21252b", "#282c34", "#2c313a", "#333842", "#181a1f", "#abb2bf", "#7f848e", "#5c6370"],
    ["#abb2bf", "#5c6370", "#98c379", "#d19a66", "#c678dd", "#e5c07b", "#61afef", "#56b6c2", "#e06c75"], "#3e4451", "#61afef"),
  t("nord", "Nord", "dark",
    ["#2e3440", "#2e3440", "#2e3440", "#3b4252", "#434c5e", "#3b4252", "#d8dee9", "#8f9bb3", "#616e88"],
    ["#d8dee9", "#616e88", "#a3be8c", "#b48ead", "#81a1c1", "#8fbcbb", "#88c0d0", "#5e81ac", "#d8dee9"], "#434c5e", "#88c0d0"),
  t("github-dark", "GitHub Dark", "dark",
    ["#010409", "#0d1117", "#0d1117", "#161b22", "#21262d", "#30363d", "#e6edf3", "#8d96a0", "#6e7681"],
    ["#e6edf3", "#8b949e", "#a5d6ff", "#79c0ff", "#ff7b72", "#ffa657", "#d2a8ff", "#79c0ff", "#7ee787"], "#1f3b5c", "#2f81f7"),
  t("github-light", "GitHub Light", "light",
    ["#f6f8fa", "#f6f8fa", "#ffffff", "#ffffff", "#eaeef2", "#d0d7de", "#1f2328", "#656d76", "#8c959f"],
    ["#1f2328", "#6e7781", "#0a3069", "#0550ae", "#cf222e", "#953800", "#8250df", "#0550ae", "#116329"], "#b6e3ff", "#0969da"),
  t("solarized-dark", "Solarized Dark", "dark",
    ["#00212b", "#00212b", "#002b36", "#073642", "#0a4050", "#073642", "#93a1a1", "#839496", "#586e75"],
    ["#93a1a1", "#586e75", "#2aa198", "#d33682", "#859900", "#b58900", "#268bd2", "#cb4b16", "#93a1a1"], "#274642", "#2aa198"),
  t("solarized-light", "Solarized Light", "light",
    ["#eee8d5", "#eee8d5", "#fdf6e3", "#fdf6e3", "#e4ddc8", "#ddd6c1", "#586e75", "#657b83", "#93a1a1"],
    ["#586e75", "#93a1a1", "#2aa198", "#d33682", "#859900", "#b58900", "#268bd2", "#cb4b16", "#657b83"], "#eee8d5", "#268bd2"),
  t("high-contrast", "High Contrast", "dark",
    ["#000000", "#000000", "#000000", "#0a0a0a", "#1a1a1a", "#6fc3df", "#ffffff", "#d4d4d4", "#a0a0a0"],
    ["#ffffff", "#7ca668", "#ce9178", "#b5cea8", "#569cd6", "#4ec9b0", "#dcdcaa", "#4fc1ff", "#9cdcfe"], "#264f78", "#f38518"),
];

export const DEFAULT_THEME = "arcade-dark";
export const themeById = (id: string | undefined) => ADE_THEMES.find((x) => x.id === id) ?? ADE_THEMES[0];

/** The CSS variables a theme sets on <html>. */
export function themeVars(theme: AdeTheme): Record<string, string> {
  const vars: Record<string, string> = { "--selection": `${theme.selection}cc`, "--ade-accent": theme.accent };
  for (const [k, v] of Object.entries(theme.chrome)) vars[`--color-ade-${k}`] = v;
  for (const [k, v] of Object.entries(theme.syntax)) vars[`--syntax-${k}`] = v;
  return vars;
}

const hex = (c: string) => c.replace("#", "");

/** The same theme as Monaco understands it. Typed loosely so this file needs no Monaco import. */
export function monacoTheme(theme: AdeTheme) {
  const s = theme.syntax;
  const rule = (token: string, color: string, fontStyle?: string) => ({ token, foreground: hex(color), ...(fontStyle ? { fontStyle } : {}) });
  return {
    base: theme.base === "light" ? ("vs" as const) : ("vs-dark" as const),
    inherit: true,
    rules: [
      rule("", s.plain),
      rule("comment", s.comment, "italic"),
      rule("string", s.string),
      rule("string.escape", s.const),
      rule("regexp", s.string),
      rule("number", s.number),
      rule("keyword", s.keyword),
      rule("operator", s.plain),
      rule("delimiter", s.plain),
      rule("type", s.type),
      rule("type.identifier", s.type),
      rule("class", s.type),
      rule("interface", s.type),
      rule("namespace", s.type),
      rule("function", s.func),
      rule("identifier", s.plain),
      rule("variable", s.plain),
      rule("variable.predefined", s.const),
      rule("constant", s.const),
      rule("tag", s.keyword),
      rule("attribute.name", s.prop),
      rule("attribute.value", s.string),
      rule("key", s.prop),
      rule("metatag", s.keyword),
      rule("annotation", s.func),
    ],
    colors: {
      "editor.background": theme.chrome.editor,
      "editor.foreground": s.plain,
      "editorLineNumber.foreground": theme.chrome.faint,
      "editorLineNumber.activeForeground": theme.chrome.fg,
      "editor.selectionBackground": theme.selection,
      "editor.inactiveSelectionBackground": `${theme.selection}99`,
      "editor.lineHighlightBackground": `${theme.chrome.hover}66`,
      "editor.lineHighlightBorder": "#00000000",
      "editorCursor.foreground": theme.accent,
      "editorIndentGuide.background1": theme.chrome.line,
      "editorIndentGuide.activeBackground1": theme.chrome.faint,
      "editorWhitespace.foreground": theme.chrome.line,
      "editorGutter.background": theme.chrome.editor,
      "editorWidget.background": theme.chrome.raised,
      "editorWidget.border": theme.chrome.line,
      "editorSuggestWidget.background": theme.chrome.raised,
      "editorSuggestWidget.border": theme.chrome.line,
      "editorSuggestWidget.selectedBackground": theme.chrome.hover,
      "editorHoverWidget.background": theme.chrome.raised,
      "editorHoverWidget.border": theme.chrome.line,
      "input.background": theme.chrome.base,
      "input.border": theme.chrome.line,
      "focusBorder": theme.accent,
      "scrollbarSlider.background": `${theme.chrome.faint}55`,
      "scrollbarSlider.hoverBackground": `${theme.chrome.faint}88`,
      "scrollbarSlider.activeBackground": `${theme.chrome.faint}aa`,
      "minimap.background": theme.chrome.editor,
      "diffEditor.insertedTextBackground": "#2ea04333",
      "diffEditor.removedTextBackground": "#f8514933",
      "diffEditor.insertedLineBackground": "#2ea0431f",
      "diffEditor.removedLineBackground": "#f851491f",
    },
  };
}
