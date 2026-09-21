"use client";
import { useEffect, useRef, useState } from "react";
import Editor, { DiffEditor, loader, type Monaco, type OnMount } from "@monaco-editor/react";
import { Loader2 } from "lucide-react";
import type { WorkspaceFs } from "@arcade/core/fs";
import { ADE_THEMES, monacoTheme, themeById } from "@/lib/ade-themes";
import { useSettings, type Settings } from "@/lib/settings";
import { attach, save, touched } from "@/lib/documents";

// The editor ships inside the app (scripts/copy-monaco.mjs): the desktop build works
// offline and a static export has nothing to proxy a CDN through.
if (typeof window !== "undefined") loader.config({ paths: { vs: `${window.location.origin}/arcade-static/monaco/vs` } });

type CodeEditorInstance = Parameters<OnMount>[0];

const themeName = (id: string) => `arcade-${id}`;

let prepared = false;
/** Once per page: register every theme, and quiet the checks that need a project's node_modules to mean anything. */
function prepare(monaco: Monaco) {
  if (prepared) return;
  prepared = true;
  for (const t of ADE_THEMES) monaco.editor.defineTheme(themeName(t.id), monacoTheme(t));
  for (const defaults of [monaco.languages.typescript.typescriptDefaults, monaco.languages.typescript.javascriptDefaults]) {
    // Syntax errors are real; "cannot find module" is only true of this in-browser view of one file.
    defaults.setDiagnosticsOptions({ noSemanticValidation: true, noSyntaxValidation: false });
    defaults.setCompilerOptions({ ...defaults.getCompilerOptions(), jsx: monaco.languages.typescript.JsxEmit.Preserve, allowJs: true, allowNonTsExtensions: true, target: monaco.languages.typescript.ScriptTarget.ESNext });
  }
}

const options = (s: Settings, readOnly: boolean) => ({
  readOnly,
  fontSize: s.fontSize,
  tabSize: s.tabSize,
  fontFamily: '"JetBrains Mono Variable", ui-monospace, "SF Mono", Menlo, monospace',
  fontLigatures: true,
  lineHeight: Math.round(s.fontSize * 1.55),
  wordWrap: s.wordWrap ? ("on" as const) : ("off" as const),
  minimap: { enabled: s.minimap, renderCharacters: false },
  lineNumbers: s.lineNumbers ? ("on" as const) : ("off" as const),
  glyphMargin: true,
  smoothScrolling: true,
  cursorBlinking: "smooth" as const,
  cursorSmoothCaretAnimation: "on" as const,
  renderLineHighlight: "line" as const,
  scrollBeyondLastLine: false,
  bracketPairColorization: { enabled: true },
  guides: { indentation: true, bracketPairs: true },
  padding: { top: 8, bottom: 8 },
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
  stickyScroll: { enabled: true },
  automaticLayout: true,
  fixedOverflowWidgets: true,
});

const Spinner = () => (
  <div className="grid h-full place-items-center text-ade-faint">
    <Loader2 className="h-4 w-4 animate-spin" />
  </div>
);

/**
 * The code editor for one text file. One Monaco instance stays mounted while files
 * change underneath it; each file keeps its own model (and so its undo history,
 * scroll position and unsaved edits) until its tab is closed — see lib/documents.ts.
 */
export default function CodeEditor({
  fs,
  path,
  text,
  line,
  jump,
  flagged,
  onCursor,
  onSaved,
  onError,
}: {
  fs: WorkspaceFs;
  path: string;
  /** The file's text as read from disk; used only when this file has no model yet. */
  text: string;
  line?: number;
  jump: number;
  flagged?: number[];
  onCursor?: (pos: { line: number; column: number }) => void;
  onSaved?: (path: string) => void;
  onError?: (message: string) => void;
}) {
  const settings = useSettings();
  const readOnly = !fs.write;
  const [editor, setEditor] = useState<CodeEditorInstance | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorations = useRef<ReturnType<CodeEditorInstance["createDecorationsCollection"]> | null>(null);

  // The save command is registered once; it must act on whichever file is showing now.
  const live = useRef({ fs, path, onSaved, onError, autoSave: settings.autoSave });
  useEffect(() => {
    live.current = { fs, path, onSaved, onError, autoSave: settings.autoSave };
  });

  const saveCurrent = async () => {
    const { fs, path, onSaved, onError } = live.current;
    if (!fs.write) return;
    try {
      if (await save(fs, path)) onSaved?.(path);
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "Could not save the file");
    }
  };

  const onMount: OnMount = (ed, monaco) => {
    monacoRef.current = monaco;
    decorations.current = ed.createDecorationsCollection();
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void saveCurrent());
    ed.onDidChangeCursorPosition((e) => onCursor?.({ line: e.position.lineNumber, column: e.position.column }));
    ed.onDidBlurEditorText(() => {
      if (live.current.autoSave) void saveCurrent();
    });
    setEditor(ed);
  };

  // Register this file's model with the document store the first time it shows.
  useEffect(() => {
    const model = editor?.getModel();
    if (model) attach(path, model, text);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `text` seeds a new model only; later disk reads go through reloadFromDisk
  }, [editor, path]);

  useEffect(() => {
    monacoRef.current?.editor.setTheme(themeName(themeById(settings.themeId).id));
  }, [settings.themeId, editor]);

  useEffect(() => {
    if (!editor || !line) return;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
  }, [editor, path, line, jump]);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!editor || !monaco || !decorations.current) return;
    decorations.current.set(
      (flagged ?? []).map((no) => ({
        range: new monaco.Range(no, 1, no, 1),
        options: { isWholeLine: true, className: "arcade-flagged-line", glyphMarginClassName: "arcade-flagged-glyph", glyphMarginHoverMessage: { value: "A finding points at this line" }, overviewRuler: { color: "#f87171", position: monaco.editor.OverviewRulerLane.Right } },
      })),
    );
  }, [editor, path, flagged]);

  return (
    <Editor
      path={path}
      defaultValue={text}
      theme={themeName(themeById(settings.themeId).id)}
      options={options(settings, readOnly)}
      beforeMount={prepare}
      onMount={onMount}
      onChange={touched}
      keepCurrentModel
      saveViewState
      loading={<Spinner />}
    />
  );
}

/** Side-by-side (or inline, when narrow) comparison of two versions of a file. Read-only. */
export function CodeDiff({ path, before, after }: { path: string; before: string; after: string }) {
  const settings = useSettings();
  return (
    <DiffEditor
      original={before}
      modified={after}
      originalModelPath={`arcade-diff-a/${path}`}
      modifiedModelPath={`arcade-diff-b/${path}`}
      theme={themeName(themeById(settings.themeId).id)}
      beforeMount={prepare}
      options={{ ...options(settings, true), readOnly: true, originalEditable: false, renderSideBySide: true, useInlineViewWhenSpaceIsLimited: true, glyphMargin: false, stickyScroll: { enabled: false } }}
      loading={<Spinner />}
    />
  );
}
