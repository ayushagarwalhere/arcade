/**
 * Client-side docs search. Loaded lazily the first time the search dialog
 * opens, so the page content stays out of the shell's bundle.
 */
import { FLAT } from "./nav";
import { slugify } from "./inline";
import { PAGES, blockText } from "./pages";

export interface SearchEntry {
  /** docs slug, with a #hash for section hits */
  slug: string;
  page: string;
  /** section heading, when the entry is a section rather than the page itself */
  section?: string;
  group: string;
  text: string;
}

export interface SearchHit extends SearchEntry {
  snippet: string;
}

function build(): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const page of PAGES) {
    const group = FLAT.find((n) => n.slug === page.slug)?.group ?? "Docs";
    let current: SearchEntry = { slug: page.slug, page: page.title, group, text: page.description };
    entries.push(current);
    for (const b of page.blocks) {
      if (b.t === "h2" || b.t === "h3") {
        const section = blockText(b);
        current = { slug: `${page.slug}#${slugify(b.text)}`, page: page.title, section, group, text: "" };
        entries.push(current);
      } else {
        current.text += ` ${blockText(b)}`;
      }
    }
  }
  return entries;
}

const INDEX = build();

function snippet(text: string, term: string): string {
  const clean = text.trim();
  const at = clean.toLowerCase().indexOf(term);
  if (at < 0) return clean.slice(0, 110);
  const start = Math.max(0, at - 40);
  return `${start ? "…" : ""}${clean.slice(start, start + 120)}${start + 120 < clean.length ? "…" : ""}`;
}

export function search(query: string, limit = 12): SearchHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored: { entry: SearchEntry; score: number }[] = [];
  for (const entry of INDEX) {
    const title = (entry.section ?? entry.page).toLowerCase();
    const page = entry.page.toLowerCase();
    const text = entry.text.toLowerCase();
    let score = 0;
    for (const term of terms) {
      const inTitle = title.includes(term);
      const inPage = page.includes(term);
      const inText = text.includes(term);
      if (!inTitle && !inPage && !inText) {
        score = 0;
        break;
      }
      score += (inTitle ? (title.startsWith(term) ? 12 : 8) : 0) + (inPage ? 3 : 0) + (inText ? 1 : 0);
    }
    // Prefer the page itself over one of its sections on an equal match.
    if (score) scored.push({ entry, score: score + (entry.section ? 0 : 2) });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry }) => ({ ...entry, snippet: snippet(entry.text, terms[0]) }));
}
