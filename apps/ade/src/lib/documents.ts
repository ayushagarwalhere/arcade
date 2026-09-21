"use client";
/**
 * Open documents — what is on disk versus what is in the editor.
 *
 * Monaco keeps one model per file for as long as its tab is open, so switching
 * tabs never loses an edit. This module remembers the text each model was last
 * saved with, which is what "unsaved" means, and owns saving, reloading after
 * something else (an agent, git) changed the file, and closing.
 */
import { useSyncExternalStore } from "react";
import type { WorkspaceFs } from "@arcade/core/fs";

/** The part of a Monaco text model this module uses. */
export interface DocModel {
  getValue(): string;
  setValue(text: string): void;
  dispose(): void;
  isDisposed(): boolean;
}

interface Doc {
  model: DocModel;
  saved: string;
}

const docs = new Map<string, Doc>();
const listeners = new Set<() => void>();
let dirtySnapshot: ReadonlySet<string> = new Set();

function publish() {
  const next = new Set<string>();
  for (const [path, d] of docs) if (!d.model.isDisposed() && d.model.getValue() !== d.saved) next.add(path);
  const same = next.size === dirtySnapshot.size && [...next].every((p) => dirtySnapshot.has(p));
  if (same) return;
  dirtySnapshot = next;
  listeners.forEach((l) => l());
}

/** Called when the editor creates (or re-attaches to) a file's model. */
export function attach(path: string, model: DocModel, savedText: string) {
  const existing = docs.get(path);
  if (existing?.model === model) return;
  docs.set(path, { model, saved: savedText });
  publish();
}

/** The editor's content changed. */
export const touched = () => publish();

export const isDirty = (path: string) => dirtySnapshot.has(path);

export async function save(fs: WorkspaceFs, path: string): Promise<boolean> {
  const d = docs.get(path);
  if (!d || !fs.write) return false;
  const text = d.model.getValue();
  await fs.write.save(path, text);
  d.saved = text;
  publish();
  return true;
}

export async function saveAll(fs: WorkspaceFs) {
  for (const path of [...dirtySnapshot]) await save(fs, path);
}

/**
 * Something outside the editor changed files (an agent turn, a checkout, a discard).
 * Documents without unsaved edits take the new text; ones with edits are left alone
 * and reported, so nobody's typing is silently overwritten.
 */
export async function reloadFromDisk(fs: WorkspaceFs, only?: string[]): Promise<{ reloaded: string[]; conflicted: string[] }> {
  const reloaded: string[] = [];
  const conflicted: string[] = [];
  for (const [path, d] of docs) {
    if (only && !only.includes(path)) continue;
    if (d.model.isDisposed()) continue;
    let text: string;
    try {
      const c = await fs.read(path);
      if (c.kind !== "text") continue;
      text = c.text;
    } catch {
      continue; // deleted on disk; the tab keeps what it has
    }
    if (text === d.saved) continue;
    if (d.model.getValue() !== d.saved) {
      conflicted.push(path);
      continue;
    }
    d.saved = text;
    d.model.setValue(text);
    reloaded.push(path);
  }
  publish();
  return { reloaded, conflicted };
}

/** A tab closed: drop its model. */
export function release(path: string) {
  const d = docs.get(path);
  if (!d) return;
  docs.delete(path);
  if (!d.model.isDisposed()) d.model.dispose();
  publish();
}

/** A different workspace opened: nothing from the old one carries over. */
export function releaseAll() {
  for (const path of [...docs.keys()]) release(path);
}

/** A file was renamed or deleted in the explorer. */
export function forget(path: string) {
  for (const p of [...docs.keys()]) if (p === path || p.startsWith(`${path}/`)) release(p);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
const EMPTY: ReadonlySet<string> = new Set();

/** Paths with unsaved edits. */
export const useDirtyPaths = () => useSyncExternalStore(subscribe, () => dirtySnapshot, () => EMPTY);
