"use client";
import { useState } from "react";
import { BookMarked, Loader2, Lock } from "lucide-react";
import { useGithubRepos, type GithubRepo } from "@arcade/core/github";

/** Searchable list of the connected account's repositories. Renders nothing useful unless GitHub is connected. */
export default function GithubRepos({ onPick, autoFocus = false }: { onPick: (r: GithubRepo) => void; autoFocus?: boolean }) {
  const { repos, error, loading } = useGithubRepos();
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const results = q ? repos?.filter((r) => r.fullName.toLowerCase().includes(q)) : repos;

  return (
    <div>
      <input
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a repository"
        aria-label="Find a repository"
        className="block h-8 w-full border-b border-ade-line bg-transparent px-3 text-[12.5px] text-ade-fg outline-none placeholder:text-ade-faint"
      />
      <div className="scrollbar-thin max-h-[236px] overflow-y-auto py-1">
        {loading && (
          <div className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-ade-muted">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading repositories
          </div>
        )}
        {error && <div className="px-3 py-2 text-[12.5px] text-amber-200/90">{error}</div>}
        {results?.map((r) => (
          <button
            key={r.id}
            onClick={() => onPick(r)}
            title={r.description ?? r.fullName}
            className="flex h-7 w-full items-center gap-2 px-3 text-left text-[13px] text-ade-fg/85 transition hover:bg-white/[0.06] hover:text-white"
          >
            <BookMarked className="h-3.5 w-3.5 shrink-0 text-ade-muted" strokeWidth={1.7} />
            <span className="truncate">{r.fullName}</span>
            {r.private && <Lock className="h-3 w-3 shrink-0 text-ade-faint" aria-label="Private" />}
            <span className="ml-auto shrink-0 font-mono text-[11px] text-ade-faint">{r.defaultBranch}</span>
          </button>
        ))}
        {results && !results.length && <div className="px-3 py-2 text-[12.5px] text-ade-muted">{q ? "No matching repositories" : "No repositories on this account"}</div>}
      </div>
    </div>
  );
}
