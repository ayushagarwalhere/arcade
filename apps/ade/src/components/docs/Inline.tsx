import Link from "next/link";
import { INLINE } from "@/lib/docs/inline";
import { docHref } from "@/lib/docs/nav";

const LINK = "font-medium text-emerald-300 underline decoration-emerald-300/30 underline-offset-[3px] transition hover:decoration-emerald-300";

/** Renders the docs inline syntax: `code`, **bold**, *emphasis*, [label](href). */
export default function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(INLINE).map((part, i) => {
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code key={i} className="rounded-[5px] border border-white/[0.08] bg-white/[0.05] px-[5px] py-[1.5px] font-mono text-[0.86em] text-white/85">
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={i} className="font-semibold text-white/90">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return <em key={i}>{part.slice(1, -1)}</em>;
        }
        const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
        if (link) {
          const [, label, href] = link;
          if (href.startsWith("doc:")) {
            return (
              <Link key={i} href={docHref(href.slice(4))} className={LINK}>
                <Inline text={label} />
              </Link>
            );
          }
          if (href.startsWith("/")) {
            return (
              <Link key={i} href={href} className={LINK}>
                <Inline text={label} />
              </Link>
            );
          }
          return (
            <a key={i} href={href} target="_blank" rel="noreferrer" className={LINK}>
              <Inline text={label} />
            </a>
          );
        }
        return part;
      })}
    </>
  );
}
