import type { Metadata } from "next";
import DocsShell from "@/components/docs/DocsShell";

export const metadata: Metadata = {
  title: { default: "Arcade Docs", template: "%s — Arcade Docs" },
  description: "Guides, concepts and reference for Arcade — the security workbench for AI-generated software.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}
