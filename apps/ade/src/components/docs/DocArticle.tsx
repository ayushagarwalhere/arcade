import Link from "next/link";
import { ArrowLeft, ArrowRight, ChevronRight, MessageSquareWarning } from "lucide-react";
import { SITE } from "@arcade/ui/lib/site";
import type { DocPage } from "@/lib/docs/types";
import { DOCS_BASE, docHref, groupOf, neighbors } from "@/lib/docs/nav";
import { headingsOf } from "@/lib/docs/pages";
import Blocks from "./Blocks";
import Toc from "./Toc";

export default function DocArticle({ page }: { page: DocPage }) {
  const { prev, next } = neighbors(page.slug);
  const group = groupOf(page.slug);
  const issue = `${SITE.issues}/new?title=${encodeURIComponent(`Docs: ${page.title}`)}`;

  return (
    <div className="flex justify-between gap-10 xl:gap-14">
      <article className="mx-auto min-w-0 max-w-[760px] flex-1 pb-24 pt-8 lg:pl-8 lg:pt-10">
        <div className="flex items-center gap-1.5 text-[13px] text-white/40">
          <Link href={DOCS_BASE} className="transition hover:text-white/80">
            Docs
          </Link>
          {group && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-emerald-300/80">{group}</span>
            </>
          )}
        </div>

        <h1 className="mt-4 text-[34px] font-semibold leading-[1.1] tracking-[-0.03em] text-white md:text-[42px]">{page.title}</h1>
        <p className="mt-4 text-[18px] leading-8 text-white/50">{page.description}</p>

        <div className="mt-2">
          <Blocks blocks={page.blocks} />
        </div>

        <footer className="mt-16">
          <div className="grid gap-3 sm:grid-cols-2">
            {prev ? (
              <Link href={docHref(prev.slug)} className="group rounded-xl border border-white/10 p-4 transition hover:border-white/20 hover:bg-white/[0.03]">
                <div className="flex items-center gap-1.5 text-[12px] text-white/40">
                  <ArrowLeft className="h-3 w-3 transition group-hover:-translate-x-0.5" /> Previous
                </div>
                <div className="mt-1 text-[15px] font-medium text-white/90">{prev.label}</div>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={docHref(next.slug)} className="group rounded-xl border border-white/10 p-4 text-right transition hover:border-emerald-400/30 hover:bg-white/[0.03]">
                <div className="flex items-center justify-end gap-1.5 text-[12px] text-white/40">
                  Next <ArrowRight className="h-3 w-3 transition group-hover:translate-x-0.5" />
                </div>
                <div className="mt-1 text-[15px] font-medium text-white/90">{next.label}</div>
              </Link>
            )}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.07] pt-6 text-[13px] text-white/35">
            <a href={issue} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 transition hover:text-white/75">
              <MessageSquareWarning className="h-3.5 w-3.5" /> Something wrong or unclear? Tell us
            </a>
            <span>© {new Date().getFullYear()} Arcade</span>
          </div>
        </footer>
      </article>

      <aside className="hidden w-[210px] shrink-0 xl:block">
        <div className="scrollbar-none sticky top-14 max-h-[calc(100vh-3.5rem)] overflow-y-auto pb-10 pt-12">
          <Toc key={page.slug} headings={headingsOf(page)} />
        </div>
      </aside>
    </div>
  );
}
