import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DocArticle from "@/components/docs/DocArticle";
import { PAGES, getPage } from "@/lib/docs/pages";

// Static export: every docs page is known at build time.
export const dynamicParams = false;

export function generateStaticParams() {
  return PAGES.filter((page) => page.slug).map((page) => ({ slug: page.slug.split("/") }));
}

export async function generateMetadata({ params }: PageProps<"/arcade/docs/[...slug]">): Promise<Metadata> {
  const { slug } = await params;
  const page = getPage(slug.join("/"));
  return page ? { title: page.title, description: page.description } : {};
}

export default async function DocsPage({ params }: PageProps<"/arcade/docs/[...slug]">) {
  const { slug } = await params;
  const page = getPage(slug.join("/"));
  if (!page) notFound();
  return <DocArticle page={page} />;
}
