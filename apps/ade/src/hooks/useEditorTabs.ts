"use client";
import { useState } from "react";
import type { View } from "@/components/Sidebar";

export type EditorTab =
  | { id: string; kind: "view"; view: View }
  | {
      id: string;
      kind: "file";
      path: string;
      /** A preview tab (italic) is reused by the next single-click open, like VS Code. */
      preview: boolean;
      /** Line to reveal; `jump` changes each time so revealing the same line twice still scrolls. */
      line?: number;
      jump: number;
    };

const viewTab = (view: View): EditorTab => ({ id: `view:${view}`, kind: "view", view });

/** The editor group's tabs: run views and workspace files side by side. */
export function useEditorTabs(initial: View = "overview") {
  const [tabs, setTabs] = useState<EditorTab[]>([viewTab(initial)]);
  const [activeId, setActiveId] = useState<string | null>(`view:${initial}`);

  const active = tabs.find((t) => t.id === activeId) ?? null;

  const openView = (view: View) => {
    const tab = viewTab(view);
    setTabs((ts) => (ts.some((t) => t.id === tab.id) ? ts : [...ts, tab]));
    setActiveId(tab.id);
  };

  const openFile = (path: string, opts: { preview?: boolean; line?: number } = {}) => {
    const { preview = true, line } = opts;
    const id = `file:${path}`;
    setTabs((ts) => {
      const existing = ts.find((t) => t.id === id);
      if (existing?.kind === "file") {
        return ts.map((t) => (t.id === id ? { ...existing, preview: existing.preview && preview, line: line ?? existing.line, jump: existing.jump + (line ? 1 : 0) } : t));
      }
      const tab: EditorTab = { id, kind: "file", path, preview, line, jump: line ? 1 : 0 };
      const reuse = preview ? ts.findIndex((t) => t.kind === "file" && t.preview) : -1;
      return reuse >= 0 ? ts.map((t, i) => (i === reuse ? tab : t)) : [...ts, tab];
    });
    setActiveId(id);
  };

  const pin = (id: string) => setTabs((ts) => ts.map((t) => (t.id === id && t.kind === "file" && t.preview ? { ...t, preview: false } : t)));

  const close = (id: string) => {
    const i = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    setTabs(next);
    if (activeId === id) setActiveId(next[Math.min(i, next.length - 1)]?.id ?? null);
  };

  /** Back to a single view tab — used when a different workspace is opened. */
  const reset = (view: View = initial) => {
    setTabs([viewTab(view)]);
    setActiveId(`view:${view}`);
  };

  return { tabs, active, activate: setActiveId, openView, openFile, pin, close, reset };
}
