import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export so the ADE can be bundled inside the Electron desktop build and
  // served over the app:// protocol. Every route is static/client-only.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@arcade/core","@arcade/agents","@arcade/orchestrator","@arcade/ui"],
  // Set when the ADE is served next to the marketing site on one domain (see
  // scripts/build-web.mjs), so the two apps' /_next assets can't collide.
  assetPrefix: process.env.ARCADE_ASSET_PREFIX || undefined,
};

export default nextConfig;
