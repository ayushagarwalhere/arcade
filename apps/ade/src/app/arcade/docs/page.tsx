import type { Metadata } from "next";
import { notFound } from "next/navigation";
import DocArticle from "@/components/docs/DocArticle";
import { getPage } from "@/lib/docs/pages";

export function generateMetadata(): Metadata {
  const page = getPage("");
  return page ? { title: page.title, description: page.description } : {};
}

export default function DocsHome() {
  const page = getPage("");
  if (!page) notFound();
  return <DocArticle page={page} />;
}
