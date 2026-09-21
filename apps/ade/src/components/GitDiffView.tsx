"use client";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import type { WorkspaceFs } from "@arcade/core/fs";
import { CodeDiff } from "./CodeEditor";

type Sides = { before: string; after: string } | { error: string };

/** A changed file against HEAD: what git has on the left, what is on disk on the right. */
export default function GitDiffView({ fs, root, path, refreshKey }: { fs: WorkspaceFs; root: string; path: string; refreshKey: number }) {
  const [sides, setSides] = useState<Sides | null>(null);

  useEffect(() => {
    let live = true;
    const git = window.arcade?.git;
    if (!git) return; // only reachable from Source Control, which needs the same bridge
    Promise.all([git.show(root, path), fs.read(path).catch(() => null)]).then(([head, disk]) => {
      if (!live) return;
      if (!head.ok) return setSides({ error: head.error });
      if (disk && disk.kind !== "text") return setSides({ error: "This file isn't text, so there is no line diff to show." });
      // A file missing on one side is simply empty there: added, or deleted.
      setSides({ before: head.value ?? "", after: disk?.text ?? "" });
    });
    return () => {
      live = false;
    };
  }, [fs, root, path, refreshKey]);

  if (!sides) {
    return (
      <div className="grid h-full place-items-center text-ade-faint">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }
  if ("error" in sides) return <div className="grid h-full place-items-center px-6 text-center text-[13px] text-ade-muted">{sides.error}</div>;
  return <CodeDiff path={path} before={sides.before} after={sides.after} />;
}
