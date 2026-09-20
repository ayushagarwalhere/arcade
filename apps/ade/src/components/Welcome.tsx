"use client";
import { useState } from "react";
import { FlaskConical, FolderOpen, FolderPlus, HardDrive, History } from "lucide-react";
import { LogoMark } from "@arcade/ui/components/logo";
import { GithubIcon } from "@arcade/ui/components/icons";
import GithubConnect, { GithubConnectForm } from "@arcade/ui/components/GithubConnect";
import ThemeToggle from "@arcade/ui/components/ThemeToggle";
import GithubRepos from "@arcade/ui/components/GithubRepos";
import { FolderAccessUnavailable, createFolder, isDesktop, loadRecents, openFolder, type WorkspaceRef } from "@arcade/core/workspace";
import { repoWorkspace, useGithub } from "@arcade/core/github";
import { SITE } from "@arcade/ui/lib/site";

type Panel = "open" | "create" | "recents";

const TILE =
  "flex flex-col items-start gap-2.5 rounded-md border border-ade-line bg-ade-base px-3 py-2.5 text-left transition hover:border-white/15 hover:bg-ade-raised focus-visible:border-white/30 focus-visible:outline-none disabled:opacity-50";

/** First screen of the ADE: nothing is open yet, so there is nothing to show but where to start. */
export default function Welcome({
  sample,
  onOpen,
  onDryRun,
}: {
  /** The bundled sample project, always available under previous workspaces. */
  sample: { name: string; path: string };
  onOpen: (w: WorkspaceRef | null) => void;
  onDryRun: () => void;
}) {
  const gh = useGithub();
  // One tile's panel at a time: choosing another tile replaces what the last one opened.
  // "open" offers both places a project can live: this computer and GitHub.
  const [panel, setPanel] = useState<Panel | null>(null);
  const [recents, setRecents] = useState<WorkspaceRef[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (picker: () => Promise<WorkspaceRef | null>) => {
    setError(null);
    setBusy(true);
    try {
      const w = await picker();
      if (w) onOpen(w);
    } catch (e) {
      setError(e instanceof FolderAccessUnavailable ? "This browser can't open folders. Use the desktop app or a Chromium browser — or try a dry run." : "That folder couldn't be opened.");
    } finally {
      setBusy(false);
    }
  };

  /** Opens a tile's panel (or closes it if it is already open), dropping any other panel and stale error. */
  const toggle = (next: Panel) => {
    setError(null);
    if (next === "recents" && panel !== "recents") setRecents(loadRecents());
    setPanel(panel === next ? null : next);
  };

  const onCreate = () => {
    // The desktop dialog asks for the name itself; a browser can only pick a parent.
    if (isDesktop()) {
      setPanel(null);
      pick(() => createFolder(""));
    } else toggle("create");
  };

  const OPTIONS: { label: string; hint: string; Icon: typeof FolderOpen; panel?: Panel; run: () => void }[] = [
    { label: "Open folder", hint: "This computer or GitHub", Icon: FolderOpen, panel: "open", run: () => toggle("open") },
    { label: "Create folder", hint: "New project", Icon: FolderPlus, panel: "create", run: onCreate },
    { label: "Previous workspaces", hint: "Continue earlier work", Icon: History, panel: "recents", run: () => toggle("recents") },
    { label: "Dry run", hint: "Scripted sample app", Icon: FlaskConical, run: onDryRun },
  ];

  return (
    <div className="page-ground flex h-full flex-col bg-ade-editor text-ade-fg">
      <header className="flex h-9 shrink-0 items-center justify-end gap-1 px-2.5">
        <GithubConnect variant="ade" onOpenRepo={(r) => onOpen(repoWorkspace(r))} />
        <ThemeToggle variant="ade" />
      </header>
      <div className="scrollbar-thin grid min-h-0 flex-1 place-items-center overflow-y-auto px-6 py-10">
        <div className="w-full max-w-[700px]">
          <LogoMark className="h-9 w-9 text-ade-fg" />
          <h1 className="mt-5 text-[22px] font-semibold tracking-tight text-white">Welcome to Arcade</h1>
          <p className="mt-1 text-[13px] text-ade-muted">Open a project to map, attack and fix it — with you approving every high-impact step.</p>

          <div className="mt-7 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {OPTIONS.map(({ label, hint, Icon, panel: own, run }) => (
              <button
                key={label}
                onClick={run}
                disabled={busy}
                aria-expanded={own ? panel === own : undefined}
                className={`${TILE} ${own && panel === own ? "!border-white/25 !bg-ade-raised" : ""}`}
              >
                <Icon className="h-4 w-4 text-ade-muted" strokeWidth={1.7} />
                <span>
                  <span className="block text-[13px] text-ade-fg">{label}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-4 text-ade-faint">{hint}</span>
                </span>
              </button>
            ))}
          </div>

          {panel === "open" && (
            <div className="mt-3 animate-fade-in overflow-hidden rounded-md border border-ade-line bg-ade-base">
              <button
                onClick={() => pick(openFolder)}
                disabled={busy}
                className="flex h-9 w-full items-center gap-2 px-3 text-left text-[13px] text-ade-fg/85 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-50"
              >
                <HardDrive className="h-3.5 w-3.5 shrink-0 text-ade-muted" strokeWidth={1.7} />
                Browse this computer…
              </button>
              <div className="flex h-7 items-center gap-2 border-y border-ade-line bg-ade-chrome px-3 text-[11px] font-semibold uppercase tracking-wide text-ade-muted">
                <GithubIcon className="h-3 w-3" />
                <span className="flex-1">GitHub repositories</span>
                {gh.status === "connected" && <span className="font-mono text-[11px] font-normal normal-case tracking-normal text-ade-faint">@{gh.user.login}</span>}
              </div>
              {gh.status === "connected" ? <GithubRepos onPick={(r) => onOpen(repoWorkspace(r))} /> : gh.status === "disconnected" && <GithubConnectForm />}
            </div>
          )}

          {panel === "create" && (
            <form
              className="mt-3 flex animate-fade-in gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = name.trim();
                if (n) pick(() => createFolder(n));
              }}
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setPanel(null)}
                placeholder="New folder name"
                aria-label="New folder name"
                className="h-7 min-w-0 flex-1 rounded border border-ade-line bg-ade-base px-2 text-[13px] text-ade-fg outline-none placeholder:text-ade-faint focus:border-white/25"
              />
              <button type="submit" disabled={busy || !name.trim()} className="h-7 rounded bg-ade-fg px-3 text-[12px] font-medium text-black transition hover:bg-white disabled:bg-ade-hover disabled:text-ade-faint">
                Choose location
              </button>
            </form>
          )}

          {error && <p className="mt-3 text-[12.5px] text-amber-200/90">{error}</p>}

          {panel === "recents" && (
            <div className="mt-3 animate-fade-in">
              <h2 className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-ade-muted">Previous workspaces</h2>
              {[...recents.map((w) => ({ w, sample: false })), { w: { ...sample, openedAt: 0 }, sample: true }].map(({ w, sample: isSample }) => (
                <button
                  key={w.path}
                  onClick={() => onOpen(isSample ? null : w)}
                  className="-mx-2 flex h-7 w-[calc(100%+1rem)] items-center gap-3 rounded px-2 text-left text-[13px] transition hover:bg-white/[0.05]"
                >
                  <span className="shrink-0 text-ade-fg">{w.name}</span>
                  <span className="min-w-0 flex-1 truncate text-right font-mono text-[11.5px] text-ade-faint">{isSample ? "bundled sample" : w.path}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <footer className="flex h-[22px] shrink-0 items-center justify-between px-3 text-[11.5px] text-ade-faint">
        <span>Arcade ADE 0.1.0</span>
        <a href={SITE.home} className="transition hover:text-ade-fg">
          arcade.dev
        </a>
      </footer>
    </div>
  );
}
