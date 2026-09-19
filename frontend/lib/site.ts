const GITHUB = "https://github.com/ayushagarwalhere/arcade";
const RELEASES = `${GITHUB}/releases`;

export const SITE = {
  github: GITHUB,
  releases: RELEASES,
  issues: `${GITHUB}/issues`,
  discussions: `${GITHUB}/discussions`,
  docs: "/docs",
  ade: "/arcade",
  orca: {
    site: "https://www.onorca.dev/",
    github: "https://github.com/stablyai/orca",
    docs: "https://www.onorca.dev/docs",
  },
  // The Windows desktop build is produced by electron-builder and served
  // directly from the site (public/download). macOS and Linux builds are
  // produced on those platforms and published to GitHub Releases; until then
  // their buttons land on the releases page, with install-from-source always
  // available.
  desktopWin: "/download/Arcade-Windows-x64.exe",
  downloads: {
    windows: "/download/Arcade-Windows-x64.exe",
    macArm: RELEASES,
    macIntel: RELEASES,
    linux: RELEASES,
  },
  appStore: RELEASES,
  apk: RELEASES,
  stars: "GitHub",
} as const;
