import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export: every route is static or client-only, so the site deploys to any file host.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@arcade/core","@arcade/agents","@arcade/orchestrator","@arcade/ui"],
};

export default nextConfig;
