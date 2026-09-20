import Link from "next/link";
import { ArrowUpRight, Info, Lightbulb, OctagonAlert, TriangleAlert } from "lucide-react";
import type { Block, Tone } from "@/lib/docs/types";
import { slugify } from "@/lib/docs/inline";
import { docHref } from "@/lib/docs/nav";
import Inline from "./Inline";
import CodeBlock from "./CodeBlock";
import Figure from "./Figures";

const TONES: Record<Tone, { label: string; Icon: typeof Info; box: string; icon: string }> = {
  note: { label: "Note", Icon: Info, box: "border-white/10 bg-white/[0.03]", icon: "text-white/50" },
  tip: { label: "Tip", Icon: Lightbulb, box: "border-emerald-500/25 bg-emerald-500/[0.05]", icon: "text-emerald-300" },
  warn: { label: "Heads up", Icon: TriangleAlert, box: "border-amber-500/25 bg-amber-500/[0.05]", icon: "text-amber-300" },
  danger: { label: "Careful", Icon: OctagonAlert, box: "border-red-500/30 bg-red-500/[0.05]", icon: "text-red-300" },
};

function Anchor({ id }: { id: string }) {
  return (
    <a href={`#${id}`} aria-label="Link to this section" className="ml-2 text-white/20 opacity-0 transition hover:text-emerald-300 group-hover:opacity-100">
      #
    </a>
  );
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case "p":
      return (
        <p className="mt-5 text-[15.5px] leading-[1.8] text-white/65">
          <Inline text={b.text} />
        </p>
      );

    case "h2": {
      const id = slugify(b.text);
      return (
        <h2 id={id} className="group mt-14 scroll-mt-24 border-t border-white/[0.07] pt-10 first:mt-8 first:border-t-0 first:pt-0 text-[24px] font-semibold tracking-[-0.02em] text-white">
          <Inline text={b.text} />
          <Anchor id={id} />
        </h2>
      );
    }

    case "h3": {
      const id = slugify(b.text);
      return (
        <h3 id={id} className="group mt-9 scroll-mt-24 text-[17.5px] font-semibold tracking-[-0.01em] text-white">
          <Inline text={b.text} />
          <Anchor id={id} />
        </h3>
      );
    }

    case "code":
      return <CodeBlock code={b.code} lang={b.lang} title={b.title} />;

    case "callout": {
      const tone = TONES[b.tone];
      return (
        <div className={`mt-6 flex gap-3 rounded-xl border px-4 py-3.5 ${tone.box}`}>
          <tone.Icon className={`mt-[3px] h-4 w-4 shrink-0 ${tone.icon}`} />
          <div className="min-w-0 text-[14.5px] leading-7 text-white/70">
            <span className="font-semibold text-white/90">{b.title ?? tone.label}. </span>
            <Inline text={b.text} />
          </div>
        </div>
      );
    }

    case "list": {
      const Tag = b.ordered ? "ol" : "ul";
      return (
        <Tag className={`mt-5 space-y-2.5 pl-5 text-[15.5px] leading-[1.75] text-white/65 marker:text-white/30 ${b.ordered ? "list-decimal" : "list-disc"}`}>
          {b.items.map((item, i) => (
            <li key={i} className="pl-1.5">
              <Inline text={item} />
            </li>
          ))}
        </Tag>
      );
    }

    case "steps":
      return (
        <ol className="mt-7">
          {b.items.map((s, i) => (
            <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
              {i < b.items.length - 1 && <span className="absolute left-[13px] top-8 bottom-1 w-px bg-white/10" />}
              <span className="grid h-[27px] w-[27px] shrink-0 place-items-center rounded-full border border-white/15 bg-ink-900 font-mono text-[12px] text-white/70">{i + 1}</span>
              <div className="min-w-0 pt-0.5">
                <div className="text-[15px] font-semibold text-white">
                  <Inline text={s.title} />
                </div>
                <p className="mt-1 text-[14.5px] leading-7 text-white/60">
                  <Inline text={s.text} />
                </p>
              </div>
            </li>
          ))}
        </ol>
      );

    case "table":
      return (
        <div className="scrollbar-thin mt-6 overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full min-w-[460px] border-collapse text-left text-[14px]">
            <thead>
              <tr className="bg-white/[0.03]">
                {b.head.map((h) => (
                  <th key={h} className="whitespace-nowrap px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-white/45">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((row, r) => (
                <tr key={r} className="border-t border-white/[0.07]">
                  {row.map((cell, c) => (
                    <td key={c} className={`px-4 py-3 align-top leading-6 ${c === 0 ? "text-white/85" : "text-white/60"}`}>
                      <Inline text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case "cards":
      return (
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          {b.items.map((c) => (
            <Link
              key={c.href}
              href={c.href.startsWith("doc:") ? docHref(c.href.slice(4)) : c.href}
              className="group rounded-xl border border-white/10 bg-white/[0.02] p-4 transition hover:border-emerald-400/30 hover:bg-white/[0.04]"
            >
              <div className="flex items-center justify-between gap-3 text-[15px] font-semibold text-white">
                <Inline text={c.title} />
                <ArrowUpRight className="h-4 w-4 shrink-0 text-white/25 transition group-hover:text-emerald-300" />
              </div>
              <p className="mt-1.5 text-[13.5px] leading-6 text-white/50">
                <Inline text={c.text} />
              </p>
            </Link>
          ))}
        </div>
      );

    case "keys":
      return (
        <dl className="mt-6 overflow-hidden rounded-xl border border-white/10">
          {b.rows.map((row, i) => (
            <div key={i} className={`flex items-center justify-between gap-6 px-4 py-2.5 ${i ? "border-t border-white/[0.07]" : ""}`}>
              <dt className="text-[14.5px] text-white/70">{row.label}</dt>
              <dd className="flex shrink-0 items-center gap-1">
                {row.keys.map((k) => (
                  <kbd key={k} className="min-w-[26px] rounded-md border border-white/12 border-b-white/20 bg-white/[0.05] px-1.5 py-0.5 text-center font-sans text-[12px] text-white/80">
                    {k}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      );

    case "figure":
      return <Figure name={b.name} caption={b.caption} />;
  }
}

export default function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} />
      ))}
    </>
  );
}
