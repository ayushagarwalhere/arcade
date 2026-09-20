/**
 * Arcade docs — content model.
 *
 * Pages are plain data: an ordered list of blocks. The renderer
 * (components/docs/Blocks.tsx), the "On this page" outline and the search index
 * are all derived from the same blocks, so a page is written once.
 *
 * Text fields accept a small inline syntax: `code`, **bold** and
 * [label](href). Use `doc:<slug>` hrefs for links between docs pages so the
 * docs can move to another base route without touching content.
 */

export type Tone = "note" | "tip" | "warn" | "danger";

export type FigureName = "loop" | "workbench" | "architecture";

export type Block =
  | { t: "p"; text: string }
  | { t: "h2"; text: string }
  | { t: "h3"; text: string }
  | { t: "code"; lang: string; code: string; title?: string }
  | { t: "callout"; tone: Tone; title?: string; text: string }
  | { t: "list"; ordered?: boolean; items: string[] }
  | { t: "steps"; items: { title: string; text: string }[] }
  | { t: "table"; head: string[]; rows: string[][] }
  | { t: "cards"; items: { title: string; text: string; href: string }[] }
  | { t: "keys"; rows: { keys: string[]; label: string }[] }
  | { t: "figure"; name: FigureName; caption: string };

export interface DocPage {
  /** Path under the docs base. "" is the docs home. */
  slug: string;
  title: string;
  description: string;
  blocks: Block[];
}
