/**
 * Small single-pass syntax highlighter for the read-only editor.
 *
 * Not a parser: it recognises comments, strings, numbers, keywords, calls and
 * capitalised type names per language family, which is what carries most of a
 * theme's colour. The whole text is scanned once (so block comments and
 * template strings can span lines) and the tokens are then split into lines.
 */
import { baseName, extOf } from "./fs";

export type TokenType = "plain" | "comment" | "string" | "number" | "keyword" | "type" | "func" | "const" | "prop" | "tag";
export interface Token {
  t: TokenType;
  s: string;
}

/** Per-theme values live in app/globals.css (--syntax-*). */
export const TOKEN_COLOR: Record<TokenType, string | undefined> = {
  plain: undefined,
  comment: "var(--syntax-comment)",
  string: "var(--syntax-string)",
  number: "var(--syntax-number)",
  keyword: "var(--syntax-keyword)",
  type: "var(--syntax-type)",
  func: "var(--syntax-func)",
  const: "var(--syntax-const)",
  prop: "var(--syntax-prop)",
  tag: "var(--syntax-type)",
};

interface Grammar {
  line: string[];
  block: [string, string][];
  /** Quote characters; a string ends at the line end unless listed in `multiline`. */
  quotes: string[];
  multiline: string[];
  keywords: Set<string>;
  consts: Set<string>;
  caseInsensitive?: boolean;
  /** Colour a quoted string followed by ":" as a property (JSON). */
  keyStrings?: boolean;
  /** Colour names after "<" / "</" as tags (HTML, XML, JSX-ish). */
  tags?: boolean;
}

const words = (s: string) => new Set(s.split(" "));
const CONSTS = words("true false null undefined NaN Infinity None True False nil");

const C_LIKE = { line: ["//"], block: [["/*", "*/"]] as [string, string][], quotes: ['"', "'"], multiline: [] as string[], consts: CONSTS };

const JS: Grammar = {
  ...C_LIKE,
  quotes: ['"', "'", "`"],
  multiline: ["`"],
  tags: true,
  keywords: words(
    "abstract as async await break case catch class const continue debugger declare default delete do else enum export extends finally for from function get if implements import in instanceof interface is keyof let namespace new of override private protected public readonly return satisfies set static super switch this throw try type typeof var void while yield",
  ),
};

const GRAMMARS: Record<string, Grammar> = {
  js: JS,
  json: { line: ["//"], block: [["/*", "*/"]], quotes: ['"'], multiline: [], keywords: new Set(), consts: CONSTS, keyStrings: true },
  py: {
    line: ["#"],
    block: [],
    quotes: ['"""', "'''", '"', "'"],
    multiline: ['"""', "'''"],
    consts: CONSTS,
    keywords: words("and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case self"),
  },
  go: { ...C_LIKE, quotes: ['"', "'", "`"], multiline: ["`"], keywords: words("break case chan const continue default defer else fallthrough for func go goto if import interface map package range return select struct switch type var") },
  rust: {
    ...C_LIKE,
    quotes: ['"'],
    multiline: ['"'],
    keywords: words("as async await break const continue crate dyn else enum extern fn for if impl in let loop match mod move mut pub ref return self Self static struct super trait type unsafe use where while"),
  },
  c: {
    ...C_LIKE,
    keywords: words(
      "abstract auto bool break case catch char class const continue default delete do double else enum explicit extends extern final finally float for friend goto if implements import inline instanceof int interface long namespace new operator override package private protected public return short signed sizeof static struct super switch template this throw throws try typedef union unsigned using var virtual void volatile while",
    ),
  },
  php: { ...C_LIKE, line: ["//", "#"], keywords: words("abstract as break case catch class const continue default do echo else elseif extends final finally fn for foreach function global if implements interface namespace new private protected public return static switch throw trait try use var while") },
  rb: { line: ["#"], block: [], quotes: ['"', "'"], multiline: [], consts: CONSTS, keywords: words("alias and begin break case class def do else elsif end ensure for if in module next not or redo require rescue retry return self super then unless until when while yield") },
  sh: { line: ["#"], block: [], quotes: ['"', "'"], multiline: ['"', "'"], consts: CONSTS, keywords: words("if then else elif fi for while until do done case esac function in return export local readonly echo exit set unset source cd") },
  yaml: { line: ["#"], block: [], quotes: ['"', "'"], multiline: [], consts: words("true false null yes no on off"), keywords: new Set() },
  sql: {
    line: ["--"],
    block: [["/*", "*/"]],
    quotes: ["'", '"'],
    multiline: ["'"],
    consts: words("null true false"),
    caseInsensitive: true,
    keywords: words("select from where and or not in is as join left right inner outer on group by order having limit offset insert into values update set delete create table alter drop index primary key foreign references default unique constraint begin commit rollback with union all distinct case when then else end"),
  },
  css: { line: [], block: [["/*", "*/"]], quotes: ['"', "'"], multiline: [], consts: new Set(), keywords: words("important media import supports keyframes from to font-face layer theme") },
  html: { line: [], block: [["<!--", "-->"]], quotes: ['"', "'"], multiline: ['"', "'"], consts: new Set(), keywords: new Set(), tags: true },
  prisma: { ...C_LIKE, keywords: words("datasource generator model enum type") },
  plain: { line: [], block: [], quotes: [], multiline: [], consts: new Set(), keywords: new Set() },
};

const BY_EXT: Record<string, string> = {
  ts: "js", tsx: "js", mts: "js", cts: "js", js: "js", jsx: "js", mjs: "js", cjs: "js", vue: "html", svelte: "html",
  json: "json", jsonc: "json", map: "json",
  py: "py", go: "go", rs: "rust", rb: "rb", php: "php",
  c: "c", h: "c", cpp: "c", cc: "c", hpp: "c", cs: "c", java: "c", kt: "c", swift: "c", scss: "css", less: "css", css: "css",
  sh: "sh", bash: "sh", zsh: "sh", ps1: "sh", dockerfile: "sh",
  yml: "yaml", yaml: "yaml", toml: "yaml", ini: "yaml", env: "yaml", gitignore: "yaml",
  sql: "sql", prisma: "prisma", graphql: "prisma",
  html: "html", htm: "html", xml: "html", svg: "html", md: "md", mdx: "md",
};

function grammarFor(path: string): Grammar | "md" {
  const name = baseName(path).toLowerCase();
  if (name === "dockerfile" || name === "makefile") return GRAMMARS.sh;
  if (name.startsWith(".env") || name.startsWith(".git") || name.startsWith(".npm")) return GRAMMARS.yaml;
  const id = BY_EXT[extOf(path)];
  return id === "md" ? "md" : GRAMMARS[id ?? "plain"];
}

const isIdStart = (c: string) => /[A-Za-z_$]/.test(c);
const isIdPart = (c: string) => /[\w$]/.test(c);
const isDigit = (c: string) => c >= "0" && c <= "9";

function scan(text: string, g: Grammar): Token[] {
  const out: Token[] = [];
  let plain = "";
  const push = (t: TokenType, s: string) => {
    if (plain) {
      out.push({ t: "plain", s: plain });
      plain = "";
    }
    out.push({ t, s });
  };
  const n = text.length;
  let i = 0;

  scanning: while (i < n) {
    const c = text[i];

    for (const [open, close] of g.block) {
      if (text.startsWith(open, i)) {
        const end = text.indexOf(close, i + open.length);
        const stop = end < 0 ? n : end + close.length;
        push("comment", text.slice(i, stop));
        i = stop;
        continue scanning;
      }
    }
    for (const open of g.line) {
      if (text.startsWith(open, i)) {
        const end = text.indexOf("\n", i);
        const stop = end < 0 ? n : end;
        push("comment", text.slice(i, stop));
        i = stop;
        continue scanning;
      }
    }

    for (const q of g.quotes) {
      if (!text.startsWith(q, i)) continue;
      const multi = g.multiline.includes(q);
      let j = i + q.length;
      while (j < n) {
        if (text[j] === "\\") j += 2;
        else if (text.startsWith(q, j)) {
          j += q.length;
          break;
        } else if (text[j] === "\n" && !multi) break;
        else j++;
      }
      j = Math.min(j, n);
      let type: TokenType = "string";
      if (g.keyStrings) {
        let k = j;
        while (text[k] === " ") k++;
        if (text[k] === ":") type = "prop";
      }
      push(type, text.slice(i, j));
      i = j;
      continue scanning;
    }

    if (isDigit(c) && !(i > 0 && isIdPart(text[i - 1]))) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(text[j])) j++;
      push("number", text.slice(i, j));
      i = j;
      continue;
    }

    if (isIdStart(c)) {
      let j = i + 1;
      while (j < n && (isIdPart(text[j]) || (g === GRAMMARS.css && text[j] === "-"))) j++;
      const word = text.slice(i, j);
      const key = g.caseInsensitive ? word.toLowerCase() : word;
      const prev = text[i - 1];
      let type: TokenType = "plain";
      if (g.tags && (prev === "<" || (prev === "/" && text[i - 2] === "<"))) type = "tag";
      else if (prev === "." && text[j] !== "(") type = "plain";
      else if (g.keywords.has(key) && prev !== ".") type = "keyword";
      else if (g.consts.has(key)) type = "const";
      else if (text[j] === "(") type = "func";
      else if (word.length > 1 && word[0] >= "A" && word[0] <= "Z" && /[a-z]/.test(word)) type = "type";
      if (type === "plain") plain += word;
      else push(type, word);
      i = j;
      continue;
    }

    plain += c;
    i++;
  }
  if (plain) out.push({ t: "plain", s: plain });
  return out;
}

/** Markdown is line-oriented, so it gets its own tiny pass. */
function scanMarkdown(text: string): Token[][] {
  let fenced = false;
  return text.split("\n").map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      return [{ t: "comment", s: line }];
    }
    if (fenced) return [{ t: "string", s: line }];
    if (/^#{1,6}\s/.test(line)) return [{ t: "keyword", s: line }];
    if (/^\s*>/.test(line)) return [{ t: "comment", s: line }];
    const parts: Token[] = [];
    let last = 0;
    for (const m of line.matchAll(/`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)/g)) {
      if (m.index > last) parts.push({ t: "plain", s: line.slice(last, m.index) });
      parts.push({ t: m[0][0] === "`" ? "string" : m[0][0] === "[" ? "type" : "const", s: m[0] });
      last = m.index + m[0].length;
    }
    if (last < line.length) parts.push({ t: "plain", s: line.slice(last) });
    const bullet = parts[0]?.t === "plain" && /^\s*([-*+]|\d+\.)\s/.exec(parts[0].s);
    if (bullet) parts.splice(0, 1, { t: "keyword", s: bullet[0] }, { t: "plain", s: parts[0].s.slice(bullet[0].length) });
    return parts;
  });
}

/** Tokens per line. Tabs are left as-is; the view sets `tab-size`. */
export function highlight(text: string, path: string): Token[][] {
  const g = grammarFor(path);
  if (g === "md") return scanMarkdown(text);

  const lines: Token[][] = [[]];
  for (const tok of scan(text, g)) {
    const parts = tok.s.split("\n");
    parts.forEach((s, k) => {
      if (k > 0) lines.push([]);
      if (s) lines[lines.length - 1].push({ t: tok.t, s });
    });
  }
  return lines;
}
