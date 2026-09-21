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
  // Desktop builds are produced by electron-builder and attached to GitHub Releases by
  // .github/workflows/release.yml — a 100 MB binary doesn't belong in the static site
  // bundle. The asset names carry no version (see `artifactName` in apps/ade/package.json),
  // so `releases/latest/download/<name>` always resolves to the newest build.
  downloads: {
    windows: `${RELEASES}/latest/download/Arcade-Setup.exe`,
    macArm: `${RELEASES}/latest/download/Arcade-arm64.dmg`,
    macIntel: `${RELEASES}/latest/download/Arcade-x64.dmg`,
    linux: `${RELEASES}/latest/download/Arcade-x86_64.AppImage`,
  },
  appStore: RELEASES,
  apk: RELEASES,
  stars: "GitHub",
} as const;
