import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Arcade ADE — security run",
  description:
    "The Arcade Agent Development Environment. Map, attack, defend, remediate and independently verify AI-generated code, with a human approving every high-impact action.",
};

export default function ArcadeLayout({ children }: { children: React.ReactNode }) {
  return <div className="h-screen overflow-hidden bg-black text-white">{children}</div>;
}
