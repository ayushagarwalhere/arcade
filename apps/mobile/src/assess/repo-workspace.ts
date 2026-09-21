/**
 * A GitHub repository as the engine's WorkspaceFs.
 *
 * The scanner reads one file at a time and swallows read errors, which is right
 * for a local disk and wrong for a rate-limited API on a phone. This adapter
 * closes both gaps without touching the engine:
 *
 *  - It works out exactly which files the scanner will read (by running the
 *    scanner once over the file listing alone) and fetches them ahead of it, a
 *    few at a time, so the scan is not one slow request after another.
 *  - A rate limit or a rejected token is remembered as `fatal` and cancels the
 *    scan; the caller rethrows it. A scan cut short must never look like a
 *    clean result.
 *  - Any other file that could not be read is counted, and reported.
 */
import type { FileContent, WorkspaceFs } from "@/core/fs";
import { scanWorkspace, type ScanOptions } from "@/core/scanner";
import { GithubAuthError, GithubRateLimitError } from "@/github/github";
import { listDir, readFile } from "@/github/repo-fs";

/** Requests in flight at once. GitHub asks API clients not to fan out widely. */
const CONCURRENCY = 6;
/** How far ahead of the scanner to fetch. Bounded so a large repository is never all in memory. */
const WINDOW = 16;

export interface RepoWorkspace {
  fs: WorkspaceFs;
  /** The files the scanner will read for this scope, in the order it reads them. No file contents are fetched. */
  candidates(scope: ScanOptions["scope"]): Promise<string[]>;
  /** Start fetching ahead along `paths`. */
  prime(paths: string[]): void;
  /** Files handed to the scanner so far. */
  filesRead(): number;
  /** Files that could not be read, for a reason that is not fatal. */
  unreadable(): string[];
  /** The error that stopped the assessment, if one did. */
  fatal(): Error | null;
}

const isFatal = (e: unknown) => e instanceof GithubRateLimitError || e instanceof GithubAuthError;

export function repoWorkspace(repo: string, onRead?: (filesRead: number, path: string) => void): RepoWorkspace {
  let order: string[] = [];
  let indexOf = new Map<string, number>();
  let next = 0;
  let cursor = 0;
  let inflight = 0;
  let read = 0;
  let fatal: Error | null = null;
  const unreadable: string[] = [];

  const pump = () => {
    while (!fatal && inflight < CONCURRENCY && next < Math.min(order.length, cursor + WINDOW)) {
      const path = order[next++];
      inflight++;
      readFile(repo, path)
        .catch((e) => {
          if (isFatal(e)) fatal ??= e as Error;
          // Anything else is retried, and counted, when the scanner asks for the file itself.
        })
        .finally(() => {
          inflight--;
          pump();
        });
    }
  };

  const fs: WorkspaceFs = {
    list: (dir) => listDir(repo, dir),
    async read(file): Promise<FileContent> {
      if (fatal) throw fatal;
      const at = indexOf.get(file);
      if (at !== undefined) {
        cursor = at;
        next = Math.max(next, at + 1);
        pump();
      }
      try {
        const content = await readFile(repo, file);
        onRead?.(++read, file);
        return content;
      } catch (e) {
        if (isFatal(e)) fatal ??= e as Error;
        else unreadable.push(file);
        throw e;
      }
    },
  };

  return {
    fs,
    async candidates(scope) {
      const seen: string[] = [];
      const listing: WorkspaceFs = {
        list: fs.list,
        read: async (file) => {
          seen.push(file);
          return { kind: "binary", size: 0 };
        },
      };
      await scanWorkspace(listing, { scope }, () => false);
      return seen;
    },
    prime(paths) {
      order = paths;
      indexOf = new Map(paths.map((p, i) => [p, i]));
      next = 0;
      cursor = 0;
      pump();
    },
    filesRead: () => read,
    unreadable: () => unreadable,
    fatal: () => fatal,
  };
}
