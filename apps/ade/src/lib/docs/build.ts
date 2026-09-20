import type { Block, FigureName, Tone } from "./types";

/* Terse block constructors, so content files read like a document. */

export const p = (text: string): Block => ({ t: "p", text });
export const h2 = (text: string): Block => ({ t: "h2", text });
export const h3 = (text: string): Block => ({ t: "h3", text });
export const code = (lang: string, body: string, title?: string): Block => ({ t: "code", lang, code: body, title });
export const ul = (...items: string[]): Block => ({ t: "list", items });
export const ol = (...items: string[]): Block => ({ t: "list", ordered: true, items });
export const steps = (...items: [title: string, text: string][]): Block => ({
  t: "steps",
  items: items.map(([title, text]) => ({ title, text })),
});
export const table = (head: string[], ...rows: string[][]): Block => ({ t: "table", head, rows });
export const cards = (...items: [title: string, text: string, href: string][]): Block => ({
  t: "cards",
  items: items.map(([title, text, href]) => ({ title, text, href })),
});
export const keys = (...rows: [keys: string, label: string][]): Block => ({
  t: "keys",
  rows: rows.map(([k, label]) => ({ keys: k.split("+"), label })),
});
export const figure = (name: FigureName, caption: string): Block => ({ t: "figure", name, caption });

const callout =
  (tone: Tone) =>
  (text: string, title?: string): Block => ({ t: "callout", tone, title, text });
export const note = callout("note");
export const tip = callout("tip");
export const warn = callout("warn");
export const danger = callout("danger");
