const GITHUB = "https://github.com/ayushagarwalhere/arcade";
const RELEASES = `${GITHUB}/releases`;

const DEV = process.env.NODE_ENV === "development";

export const SITE = {
  github: GITHUB,
  releases: RELEASES,
  issues: `${GITHUB}/issues`,
  discussions: `${GITHUB}/discussions`,
  docs: "/docs",
  // The site and the ADE are separate apps (zones): same domain in production,
  // two dev servers locally. Link between them with <a>, not <Link>.
  home: process.env.NEXT_PUBLIC_SITE_URL ?? (DEV ? "http://localhost:3000/" : "/"),
  ade: process.env.NEXT_PUBLIC_ADE_URL ?? (DEV ? "http://localhost:3001/arcade/" : "/arcade/"),
  // Desktop builds are produced by electron-builder (apps/ade/release/) and
  // published to GitHub Releases — a 96 MB binary doesn't belong in the static
  // site bundle. Install-from-source and the in-browser ADE are the always-on
  // paths.
  downloads: {
    windows: RELEASES,
    macArm: RELEASES,
    macIntel: RELEASES,
    linux: RELEASES,
  },
  appStore: RELEASES,
  apk: RELEASES,
  stars: "GitHub",
} as const;
