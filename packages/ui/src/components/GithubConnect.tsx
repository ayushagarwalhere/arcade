"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Loader2, SquareTerminal } from "lucide-react";
import { GithubIcon } from "./icons";
import GithubRepos from "./GithubRepos";
import { SITE } from "../lib/site";
import {
  GithubAuthError,
  NEW_TOKEN_URL,
  canDeviceSignIn,
  connectWithToken,
  disconnectGithub,
  signInWithDevice,
  useGithub,
  type DeviceCode,
  type GithubRepo,
  type GithubUser,
} from "@arcade/core/github";

const BUTTON = "flex h-7 items-center justify-center gap-2 rounded px-3 text-[12px] font-medium transition";
const PRIMARY = `${BUTTON} bg-ade-fg text-black hover:bg-white disabled:bg-ade-hover disabled:text-ade-faint`;
const SECONDARY = `${BUTTON} bg-ade-hover text-ade-fg hover:bg-white/15 disabled:text-ade-faint`;

function Avatar({ user, className }: { user: GithubUser; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- remote avatar; the static export has no image optimizer
  return <img src={user.avatarUrl} alt="" referrerPolicy="no-referrer" className={`shrink-0 rounded-full bg-ade-hover ${className}`} />;
}

/** Sign-in form: device flow in the desktop app (when a client ID is configured), a personal access token anywhere. */
export function GithubConnectForm() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState<DeviceCode | null>(null);
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);

  const deviceSignIn = async () => {
    const ctl = new AbortController();
    pending.current = ctl;
    setError(null);
    setBusy(true);
    try {
      await signInWithDevice(setCode, ctl.signal);
    } catch (e) {
      if (!ctl.signal.aborted) setError(e instanceof Error ? e.message : "Sign-in failed.");
    } finally {
      if (!ctl.signal.aborted) {
        setBusy(false);
        setCode(null);
      }
    }
  };

  const cancelDevice = () => {
    pending.current?.abort();
    setBusy(false);
    setCode(null);
  };

  const tokenSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const t = token.trim();
    if (!t) return;
    setError(null);
    setBusy(true);
    try {
      await connectWithToken(t);
    } catch (err) {
      setError(err instanceof GithubAuthError ? "GitHub rejected that token." : "Couldn't reach GitHub.");
      setBusy(false);
    }
  };

  if (code) {
    return (
      <div className="p-3">
        <p className="text-[12.5px] leading-5 text-ade-muted">Enter this code on GitHub to finish signing in.</p>
        <div className="my-3 select-all text-center font-mono text-[22px] tracking-[0.2em] text-white">{code.userCode}</div>
        <button
          className={`${PRIMARY} w-full`}
          onClick={() => {
            navigator.clipboard?.writeText(code.userCode).catch(() => {});
            window.open(code.verificationUri, "_blank", "noopener");
          }}
        >
          Copy code and open GitHub
        </button>
        <div className="mt-2.5 flex items-center justify-between text-[12px] text-ade-faint">
          <span className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> Waiting for approval
          </span>
          <button onClick={cancelDevice} className="transition hover:text-ade-fg">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const device = canDeviceSignIn();
  return (
    <div className="p-3">
      {device && (
        <>
          <button onClick={deviceSignIn} disabled={busy} className={`${PRIMARY} w-full`}>
            <GithubIcon className="h-3.5 w-3.5" /> Sign in with GitHub
          </button>
          <div className="my-2.5 text-center text-[11px] text-ade-faint">or use a personal access token</div>
        </>
      )}
      <form onSubmit={tokenSignIn} className="flex gap-2">
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="ghp_… or github_pat_…"
          aria-label="Personal access token"
          className="h-7 min-w-0 flex-1 rounded border border-ade-line bg-ade-base px-2 font-mono text-[12px] text-ade-fg outline-none placeholder:font-sans placeholder:text-ade-faint focus:border-white/25"
        />
        <button type="submit" disabled={busy || !token.trim()} className={device ? SECONDARY : PRIMARY}>
          {busy && !device ? <Loader2 className="h-3 w-3 animate-spin" /> : "Connect"}
        </button>
      </form>
      {error && <p className="mt-2 text-[12px] text-amber-200/90">{error}</p>}
      <p className="mt-2.5 text-[11.5px] leading-[18px] text-ade-faint">
        <a href={NEW_TOKEN_URL} target="_blank" rel="noreferrer" className="text-ade-muted underline-offset-2 transition hover:text-ade-fg hover:underline">
          Create a token
        </a>{" "}
        with the <span className="font-mono">repo</span> scope. It stays on this device and is only ever sent to api.github.com.
      </p>
    </div>
  );
}

/**
 * Navbar entry for the GitHub connection. `site` sits in the marketing navbar,
 * `ade` in the workbench top bar; with `onOpenRepo` the menu lists repositories.
 */
export default function GithubConnect({ variant, onOpenRepo }: { variant: "site" | "ade"; onOpenRepo?: (r: GithubRepo) => void }) {
  const gh = useGithub();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const site = variant === "site";
  const connected = gh.status === "connected";

  return (
    <div ref={root} className={`relative ${site ? "hidden sm:block" : ""}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={gh.status === "loading"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={
          site
            ? "flex items-center gap-2 text-[15px] font-medium text-white/70 transition hover:text-white"
            : "flex h-6 items-center gap-1.5 rounded-md px-2 text-[12px] text-ade-muted transition hover:bg-white/[0.06] hover:text-ade-fg"
        }
      >
        {connected ? <Avatar user={gh.user} className={site ? "h-5 w-5" : "h-4 w-4"} /> : <GithubIcon className={site ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"} />}
        <span className={site ? "" : "hidden md:block"}>{connected ? gh.user.login : site ? "GitHub" : "Connect GitHub"}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="GitHub"
          className="absolute right-0 top-full z-50 mt-2 w-[min(320px,calc(100vw-1.5rem))] overflow-hidden rounded-lg border border-white/12 bg-ade-raised text-left shadow-pop"
        >
          {connected ? (
            <>
              <a href={gh.user.url} target="_blank" rel="noreferrer" className="group flex items-center gap-2.5 border-b border-ade-line px-3 py-2.5">
                <Avatar user={gh.user} className="h-7 w-7" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] text-ade-fg">{gh.user.name ?? gh.user.login}</span>
                  <span className="block truncate text-[11.5px] text-ade-faint">Connected as @{gh.user.login}</span>
                </span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-ade-faint transition group-hover:text-ade-fg" />
              </a>
              {onOpenRepo ? (
                <GithubRepos
                  autoFocus
                  onPick={(r) => {
                    setOpen(false);
                    onOpenRepo(r);
                  }}
                />
              ) : (
                <a href={SITE.ade} onClick={() => setOpen(false)} className="flex h-9 items-center gap-2 px-3 text-[13px] text-ade-fg/85 transition hover:bg-white/[0.06] hover:text-white">
                  <SquareTerminal className="h-3.5 w-3.5 text-emerald-400" /> Open a repository in the ADE
                </a>
              )}
            </>
          ) : (
            <>
              <div className="border-b border-ade-line px-3 py-2.5">
                <div className="text-[13px] text-ade-fg">Connect GitHub</div>
                <div className="mt-0.5 text-[11.5px] leading-[18px] text-ade-faint">Open your repositories in the ADE without cloning them first.</div>
              </div>
              <GithubConnectForm />
            </>
          )}

          <div className="flex h-8 items-center justify-between border-t border-ade-line px-3 text-[12px] text-ade-faint">
            <a href={SITE.github} target="_blank" rel="noreferrer" className="transition hover:text-ade-fg">
              Arcade source ↗
            </a>
            {connected && (
              <button onClick={() => void disconnectGithub()} className="transition hover:text-ade-fg">
                Disconnect
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
