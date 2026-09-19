import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export so the whole app (marketing site + ADE) can be bundled inside
  // the Electron desktop build and served over file/app protocol. Every route
  // is already static/client-only, so nothing server-side is lost.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
