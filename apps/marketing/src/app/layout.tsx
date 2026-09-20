import type { Metadata } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { THEME_SCRIPT } from "@arcade/ui/lib/theme";

export const metadata: Metadata = {
  title: "Arcade — Build at AI speed. Ship at security confidence.",
  description:
    "Arcade is a multi-agent security engineering environment for AI-built software. Map, attack, defend, remediate and independently verify AI-generated code before it ships.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Runs while the HTML is parsed, so a saved light theme is on <html> before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
