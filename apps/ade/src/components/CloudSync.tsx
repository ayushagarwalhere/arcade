"use client";
import { Cloud, CloudOff, Loader2, LogOut } from "lucide-react";
import { cloudConfigured, signIn, signOut, useCloudSession } from "@/lib/cloud-auth";

export type SyncState = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; findings: number; scored: number } | { kind: "error"; message: string };

/** Top-bar control: sign in to Arcade, and see whether the current scan reached the backend. */
export default function CloudSync({ sync }: { sync: SyncState }) {
  const session = useCloudSession();
  if (!cloudConfigured) return null;

  if (!session) {
    return (
      <button onClick={() => void signIn()} title="Sign in to save scans to your Arcade account" className="flex h-7 items-center gap-1.5 rounded px-2 text-[12px] text-ade-muted hover:bg-ade-hover hover:text-ade-text">
        <CloudOff size={13} /> Sign in
      </button>
    );
  }

  const status =
    sync.kind === "saving" ? (
      <span className="flex items-center gap-1 text-ade-muted"><Loader2 size={12} className="animate-spin" /> Saving…</span>
    ) : sync.kind === "saved" ? (
      <span className="text-emerald-400" title={`${sync.findings} findings saved · ${sync.scored} scored by the classifier`}>Saved · {sync.findings}</span>
    ) : sync.kind === "error" ? (
      <span className="text-amber-400" title={sync.message}>Not saved</span>
    ) : null;

  return (
    <div className="flex h-7 items-center gap-2 rounded px-2 text-[12px] text-ade-muted">
      <Cloud size={13} />
      <span className="max-w-[140px] truncate" title={session.email}>{session.email ?? "Signed in"}</span>
      {status}
      <button onClick={signOut} title="Sign out" className="rounded p-1 hover:bg-ade-hover hover:text-ade-text"><LogOut size={12} /></button>
    </div>
  );
}
