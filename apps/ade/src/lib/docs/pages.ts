import type { Block, DocPage } from "./types";
import { slugify, stripInline } from "./inline";
import { START } from "./content/start";
import { MODEL } from "./content/model";
import { WORKBENCH } from "./content/workbench";
import { AGENTS } from "./content/agents";
import { CLI } from "./content/cli";
import { RECIPES } from "./content/recipes";
import { REFERENCE } from "./content/reference";

export const PAGES: DocPage[] = [...START, ...MODEL, ...WORKBENCH, ...AGENTS, ...CLI, ...RECIPES, ...REFERENCE];

const BY_SLUG = new Map(PAGES.map((page) => [page.slug, page]));

export function getPage(slug: string): DocPage | undefined {
  return BY_SLUG.get(slug);
}

export interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

/** The "On this page" outline. Ids match what the renderer puts on headings. */
export function headingsOf(page: DocPage): Heading[] {
  return page.blocks.flatMap((b) => (b.t === "h2" || b.t === "h3" ? [{ id: slugify(b.text), text: stripInline(b.text), level: b.t === "h2" ? 2 : 3 } as Heading] : []));
}

/** Searchable plain text of a block. Code is left out: it matches too much. */
export function blockText(b: Block): string {
  switch (b.t) {
    case "p":
    case "h2":
    case "h3":
      return stripInline(b.text);
    case "callout":
      return stripInline(`${b.title ?? ""} ${b.text}`);
    case "list":
      return b.items.map(stripInline).join(" ");
    case "steps":
      return b.items.map((i) => stripInline(`${i.title} ${i.text}`)).join(" ");
    case "table":
      return stripInline([...b.head, ...b.rows.flat()].join(" "));
    case "cards":
      return b.items.map((i) => `${i.title} ${i.text}`).join(" ");
    case "keys":
      return b.rows.map((r) => r.label).join(" ");
    case "figure":
      return b.caption;
    case "code":
      return "";
  }
}
