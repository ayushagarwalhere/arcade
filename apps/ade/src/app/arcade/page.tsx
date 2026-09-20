"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, File as FileGlyph, FolderClosed, PanelBottom, PanelLeft, PanelRight, Play, RotateCcw, ShieldAlert, SunMoon } from "lucide-react";
import { useArcadeRun } from "@arcade/core/store";
import { rememberWorkspace, type WorkspaceRef } from "@arcade/core/workspace";
import { repoWorkspace } from "@arcade/core/github";
import { toggleTheme } from "@arcade/ui/lib/theme";
import Welcome from "@/components/Welcome";
import AssessmentLaunch from "@/components/AssessmentLaunch";
import type { Assessment } from "@arcade/orchestrator/pipeline";
import { useResize } from "@/hooks/useResize";
import { useEditorTabs } from "@/hooks/useEditorTabs";
import { useAgentConnections } from "@/hooks/useAgentConnections";
import { baseName, crawl, dirName, type WorkspaceFs } from "@arcade/core/fs";
import { fsFor } from "@arcade/core/workspace-fs";
import { sampleFs } from "@arcade/core/sample-fs";
import EditorTabs from "@/components/EditorTabs";
import CodeView, { type FileInfo } from "@/components/CodeView";
import type { FileDecoration } from "@/components/FileTree";
import type { AgentProvider, Finding } from "@arcade/core/types";
import type { AgentConnection } from "@arcade/core/agent-connections";
import { LogoMark } from "@arcade/ui/components/logo";
import Sidebar, { ActivityBar, VIEW_META, type Activity, type View } from "@/components/Sidebar";
import TopBar, { type Layout } from "@/components/TopBar";
import StatusBar from "@/components/StatusBar";
import AgentPane from "@/components/AgentPane";
import BottomPanel, { type PanelTab } from "@/components/BottomPanel";
import CommandPalette, { type Command } from "@/components/CommandPalette";
import DiffView from "@/components/DiffView";
import Overview from "@/components/views/Overview";
import AttackSurface from "@/components/views/AttackSurface";
import Findings from "@/components/views/Findings";
import Evidence from "@/components/views/Evidence";
import Timeline from "@/components/views/Timeline";
import Browser from "@/components/views/Browser";

const REMEDIATED = ["remediating", "testing", "verifying", "verified"];

const HANDLE = "absolute z-20 transition-colors hover:bg-white/20 active:bg-white/30";

/** Providers as the run lists them, with real connection state where the desktop app knows it. */
function withConnections(providers: AgentProvider[], list: AgentConnection[] | null) {
  return providers.map((p) => ({ ...p, connected: list?.find((a) => a.id === p.id)?.connected ?? p.connected }));
}

export default function ArcadePage() {
  const run = useArcadeRun();
  const { pendingApproval } = run;

  // Nothing is open on launch: the welcome screen decides what the workbench shows.
  const [welcome, setWelcome] = useState(true);
  const [folder, setFolder] = useState<WorkspaceRef | null>(null);
  // In the desktop app, Claude Code and Codex show as connected only when they really are.
  const agents = useAgentConnections();
  const providers = withConnections(run.state.providers, agents.list);
  // An opened folder names the project; the run data is still the reference snapshot.
  const state = useMemo(
    () => ({ ...run.state, providers, project: folder ? { ...run.state.project, name: folder.name, repo: folder.path } : run.state.project }),
    [run.state, providers, folder],
  );

  const editor = useEditorTabs();
  const view: View | null = editor.active?.kind === "view" ? editor.active.view : null;
  const activeFile = editor.active?.kind === "file" ? editor.active : null;

  // The opened folder's files, resolved after entering; the sample project brings its own.
  const [folderFs, setFolderFs] = useState<{ of: WorkspaceRef; fs: WorkspaceFs | null } | null>(null);
  const [index, setIndex] = useState<{ fs: WorkspaceFs; files: string[]; done: boolean } | null>(null);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [selectedFinding, setSelectedFinding] = useState(state.finding.id);
  const [activeWorkspace, setActiveWorkspace] = useState(state.workspaces[0].id);

  const [activity, setActivity] = useState<Activity>("explorer");
  const [layout, setLayout] = useState<Layout>({ sidebar: true, panel: true, agent: true });
  // Panes start open but stay out of the way on narrow screens until asked for.
  const [touched, setTouched] = useState<Partial<Record<keyof Layout, boolean>>>({});
  const [panelTab, setPanelTab] = useState<PanelTab>("terminal");
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Shown after a real folder is imported: choose and launch the assessment.
  const [showLaunch, setShowLaunch] = useState(false);

  const [sidebarW, dragSidebar] = useResize(248, 180, 420, "right");
  const [agentW, dragAgent] = useResize(360, 300, 560, "left");
  const [panelH, dragPanel] = useResize(220, 110, 520, "up");

  const enter = (w: WorkspaceRef | null, dryRun = false) => {
    if (w) rememberWorkspace(w);
    setFolder(w);
    if (w) {
      fsFor(w)
        .catch(() => null)
        .then((fs) => setFolderFs({ of: w, fs }));
    }
    editor.reset();
    setActivity("explorer");
    // Start from the scripted sample; a real assessment plan replaces it on launch.
    run.resetDemo();
    // Only a dry run plays the scripted loop on its own; a project waits for you.
    if (dryRun) run.start();
    setWelcome(false);
    // A real project opens straight into the assessment launcher.
    setShowLaunch(!!w && !dryRun);
  };

  const show = (k: keyof Layout, open: boolean) => {
    setLayout((l) => ({ ...l, [k]: open }));
    setTouched((t) => ({ ...t, [k]: true }));
  };
  const toggle = (k: keyof Layout) => {
    setLayout((l) => ({ ...l, [k]: !l[k] }));
    setTouched((t) => ({ ...t, [k]: true }));
  };

  useEffect(() => {
    if (welcome) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = e.key.toLowerCase();
      if (e.shiftKey) {
        if (k !== "f" && k !== "e") return;
        setActivity(k === "f" ? "search" : "explorer");
        show("sidebar", true);
      } else if (k === "k" || k === "p") setPaletteOpen((o) => !o);
      else if (k === "b") toggle("sidebar");
      else if (k === "j") toggle("panel");
      else if (k === "l") toggle("agent");
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [welcome]);

  const openView = editor.openView;
  const openFinding = (id: string) => {
    setSelectedFinding(id);
    openView("findings");
  };
  const openActivity = (a: Activity) => {
    show("sidebar", !(layout.sidebar && activity === a));
    setActivity(a);
  };
  const openPanel = (t: PanelTab) => {
    setPanelTab(t);
    show("panel", true);
  };

  const reset = () => {
    run.reset();
    openView("overview");
  };
  const restart = () => {
    run.reset();
    run.start();
  };
  const closeWorkspace = () => {
    run.reset();
    setWelcome(true);
  };

  // Loading a real assessment plan swaps the demo data for the scanned project's
  // findings and starts all five agents through the loop.
  const onLaunch = (a: Assessment) => {
    run.loadPlan(a.plan);
    setSelectedFinding(a.findings[0]?.id ?? "ARC-000");
    setShowLaunch(false);
    openView("overview");
  };
  // For a real folder that hasn't been assessed yet, "run" reopens the launcher;
  // otherwise it resumes the loaded run.
  const startOrLaunch = () => {
    if (folder && !run.live) setShowLaunch(true);
    else run.start();
  };

  const findings: Finding[] = [state.finding, ...state.secondaryFindings];
  const fixApproved = REMEDIATED.includes(state.phase);
  // Show the proposed diff once a fix exists to review — either applied, or
  // pending your approval at either gate.
  const showDiff = fixApproved || pendingApproval?.kind === "code" || pendingApproval?.kind === "ship";
  const changes = showDiff ? state.finding.remediation.files : [];
  const workspace = state.workspaces.find((w) => w.id === activeWorkspace)?.name ?? activeWorkspace;
  // A pending approval always brings the agent pane back: the run is waiting on it.
  const agentOpen = layout.agent || !!pendingApproval;

  // Files. The sample tree flips to the fixed sources once the remediator has written the fix.
  const sampleFiles = useMemo(() => sampleFs(fixApproved), [fixApproved]);
  const workspaceFs: WorkspaceFs | null | "none" = !folder ? sampleFiles : folderFs?.of === folder ? (folderFs.fs ?? "none") : null;
  const liveFs = workspaceFs && workspaceFs !== "none" ? workspaceFs : null;
  useEffect(() => {
    if (!liveFs) return;
    let cancelled = false;
    crawl(liveFs, () => cancelled, (files) => setIndex({ fs: liveFs, files, done: false })).then((files) => {
      if (!cancelled) setIndex({ fs: liveFs, files, done: true });
    });
    return () => {
      cancelled = true;
    };
  }, [liveFs]);
  const indexed = index?.fs === liveFs ? index : null;
  const filePaths = indexed?.files ?? [];

  // Tree and tab badges: the sample and a live assessment both describe real files.
  const decorations: Record<string, FileDecoration> = {};
  if (!folder) {
    if (fixApproved) {
      for (const f of state.finding.remediation.files) {
        decorations[f.path] = { badge: f.status, tone: f.status === "A" ? "green" : "amber", title: `${f.path} • ${f.status === "A" ? "added" : "modified"} by the remediator` };
      }
    } else if (state.finding.vulnerableCode.lines.length) {
      decorations[state.finding.vulnerableCode.path] = { badge: "1", tone: "red", title: `${state.finding.id} · ${state.finding.title}` };
    }
  } else if (run.live) {
    if (fixApproved) {
      for (const f of state.finding.remediation.files) {
        if (f.path) decorations[f.path] = { badge: f.status, tone: f.status === "A" ? "green" : "amber", title: `${f.path} • proposed ${f.status === "A" ? "addition" : "change"}` };
      }
    }
    // Flag every file a finding lives in (strongest wins the tooltip).
    for (const f of findings) {
      const p = f.vulnerableCode.path;
      if (!p || decorations[p]) continue;
      decorations[p] = { badge: "!", tone: "red", title: `${f.id} · ${f.title}` };
    }
  }
  const flaggedLines = (path: string) =>
    (!folder || run.live) && !fixApproved && path === state.finding.vulnerableCode.path
      ? state.finding.vulnerableCode.lines.filter((l) => l.flagged).map((l) => l.no)
      : undefined;

  const commands: Command[] = [
    ...(Object.keys(VIEW_META) as View[]).map((v) => ({ id: `view:${v}`, group: "View", label: VIEW_META[v].label, Icon: VIEW_META[v].Icon, run: () => openView(v) })),
    ...findings.map((f) => ({ id: `finding:${f.id}`, group: "Finding", label: f.id, hint: f.title, Icon: ShieldAlert, run: () => openFinding(f.id) })),
    { id: "run:start", group: "Run", label: folder && !run.live ? "Assess workspace" : state.phase === "idle" ? "Run security loop" : "Resume run", Icon: Play, run: startOrLaunch },
    { id: "run:reset", group: "Run", label: "Reset run", Icon: RotateCcw, run: reset },
    { id: "workspace:close", group: "Workspace", label: "Close workspace", hint: "Back to welcome", Icon: FolderClosed, run: closeWorkspace },
    { id: "layout:sidebar", group: "Layout", label: "Toggle sidebar", hint: "Ctrl+B", Icon: PanelLeft, run: () => toggle("sidebar") },
    { id: "layout:panel", group: "Layout", label: "Toggle panel", hint: "Ctrl+J", Icon: PanelBottom, run: () => toggle("panel") },
    { id: "layout:agent", group: "Layout", label: "Toggle agent", hint: "Ctrl+L", Icon: PanelRight, run: () => toggle("agent") },
    { id: "layout:theme", group: "Layout", label: "Toggle light / dark theme", Icon: SunMoon, run: toggleTheme },
    { id: "panel:terminal", group: "Panel", label: "Show terminal", run: () => openPanel("terminal") },
    { id: "panel:problems", group: "Panel", label: "Show problems", run: () => openPanel("problems") },
    { id: "panel:output", group: "Panel", label: "Show output", run: () => openPanel("output") },
    // Only built while the palette is open: a workspace can hold thousands of files.
    ...(paletteOpen ? filePaths : []).map((p) => ({ id: `file:${p}`, group: "File", label: baseName(p), hint: dirName(p), Icon: FileGlyph, run: () => editor.openFile(p, { preview: false }) })),
  ];

  if (welcome) {
    return <Welcome sample={{ name: run.state.project.name, path: run.state.project.repo }} onOpen={(w) => enter(w)} onDryRun={() => enter(null, true)} />;
  }

  return (
    <div className="flex h-full flex-col bg-ade-editor text-ade-fg">
      <TopBar
        state={state}
        workspace={workspace}
        running={run.running}
        pendingApproval={pendingApproval}
        layout={{ ...layout, agent: agentOpen }}
        onToggle={toggle}
        onPalette={() => setPaletteOpen(true)}
        onHome={closeWorkspace}
        onStart={startOrLaunch}
        onReset={reset}
        onShowApproval={() => show("agent", true)}
        onOpenRepo={(r) => enter(repoWorkspace(r))}
      />

      <div className="relative flex min-h-0 flex-1">
        {folder && showLaunch && !run.live && (
          workspaceFs === "none" ? (
            <div className="absolute inset-0 z-40 grid place-items-center bg-ade-editor/95 px-6 backdrop-blur-sm">
              <div className="max-w-[420px] text-center">
                <p className="text-[13px] text-amber-200/90">This folder couldn&apos;t be read, so it can&apos;t be assessed.</p>
                <button onClick={() => setShowLaunch(false)} className="mt-3 h-8 rounded-md border border-ade-line px-3 text-[13px] text-ade-fg transition hover:bg-ade-raised">
                  Browse anyway
                </button>
              </div>
            </div>
          ) : !liveFs ? (
            <div className="absolute inset-0 z-40 grid place-items-center bg-ade-editor/95 backdrop-blur-sm">
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent" />
            </div>
          ) : (
            <AssessmentLaunch project={{ name: folder.name, path: folder.path }} fs={liveFs} onLaunch={onLaunch} onDismiss={() => setShowLaunch(false)} />
          )
        )}
        <ActivityBar activity={activity} sidebarOpen={layout.sidebar} onActivity={openActivity} findingCount={findings.length} changeCount={changes.length} />

        {layout.sidebar && (
          <div style={{ width: sidebarW }} className={`relative shrink-0 border-r border-ade-line ${touched.sidebar ? "" : "max-md:hidden"}`}>
            <Sidebar
              state={state}
              activity={activity}
              view={view}
              onView={openView}
              activeWorkspace={activeWorkspace}
              onWorkspace={setActiveWorkspace}
              findings={findings}
              selectedFinding={selectedFinding}
              onOpenFinding={openFinding}
              changes={changes}
              files={{ fs: workspaceFs, index: filePaths, indexing: !!liveFs && !indexed?.done, activePath: activeFile?.path ?? null, decorations, onOpenFile: editor.openFile }}
              onToggleProvider={run.setProvider}
              agents={agents}
            />
            <div onPointerDown={dragSidebar} className={`${HANDLE} inset-y-0 -right-0.5 w-1 cursor-col-resize`} />
          </div>
        )}

        {/* Editor group */}
        <main className="flex min-w-0 flex-1 flex-col">
          <EditorTabs
            tabs={editor.tabs}
            activeId={editor.active?.id ?? null}
            selectedFinding={selectedFinding}
            changeCount={changes.length}
            decorations={decorations}
            onActivate={editor.activate}
            onPin={editor.pin}
            onClose={editor.close}
          />

          {activeFile ? (
            <>
              <div className="flex h-[22px] shrink-0 items-center gap-1 px-4 text-[12px] text-ade-muted">
                {[state.project.name, ...activeFile.path.split("/")].map((c, i, all) => (
                  <span key={i} className="flex min-w-0 items-center gap-1">
                    <span className={`truncate ${i === all.length - 1 ? "text-ade-fg/85" : ""}`}>{c}</span>
                    {i < all.length - 1 && <ChevronRight className="h-3 w-3 shrink-0 text-ade-faint" />}
                  </span>
                ))}
              </div>
              <div className="min-h-0 flex-1">
                {liveFs && <CodeView fs={liveFs} path={activeFile.path} line={activeFile.line} jump={activeFile.jump} flagged={flaggedLines(activeFile.path)} onInfo={setFileInfo} />}
              </div>
            </>
          ) : view ? (
            <>
              <div className="flex h-[22px] shrink-0 items-center gap-1 px-4 text-[12px] text-ade-muted">
                {[state.project.name, workspace, VIEW_META[view].label, ...(view === "findings" ? [selectedFinding] : [])].map((c, i, all) => (
                  <span key={i} className="flex min-w-0 items-center gap-1">
                    <span className={`truncate ${i === all.length - 1 ? "text-ade-fg/85" : ""}`}>{c}</span>
                    {i < all.length - 1 && <ChevronRight className="h-3 w-3 shrink-0 text-ade-faint" />}
                  </span>
                ))}
              </div>
              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-3">
                {view === "overview" && <Overview state={state} onOpenFinding={openFinding} onView={openView} />}
                {view === "surface" && <AttackSurface state={state} />}
                {view === "findings" && (
                  <Findings
                    key={selectedFinding}
                    state={state}
                    selectedId={selectedFinding}
                    onOpenFile={run.live || (!folder && !fixApproved) ? (path, line) => editor.openFile(path, { preview: false, line }) : undefined}
                  />
                )}
                {view === "evidence" && <Evidence state={state} />}
                {view === "timeline" && <Timeline state={state} />}
                {view === "browser" && <Browser state={state} onRequestReset={run.requestDestructive} />}
                {view === "diff" && (
                  <div className="mx-auto max-w-[920px]">
                    <DiffView files={changes} commit={showDiff ? state.finding.remediation.commit : undefined} summary={showDiff ? state.finding.remediation.summary : undefined} />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="grid min-h-0 flex-1 place-items-center">
              <div className="text-center">
                <LogoMark className="mx-auto h-14 w-14 text-white/[0.06]" />
                <dl className="mt-6 space-y-2 text-[12.5px] text-ade-muted">
                  {[
                    ["Go to file, view or command", "Ctrl P"],
                    ["Search across files", "Ctrl Shift F"],
                    ["Toggle terminal", "Ctrl J"],
                    ["Toggle agent", "Ctrl L"],
                    ["Toggle sidebar", "Ctrl B"],
                  ].map(([label, keys]) => (
                    <div key={label} className="flex items-center justify-between gap-10">
                      <dt>{label}</dt>
                      <dd>
                        <kbd className="rounded border border-ade-line bg-ade-raised px-1.5 py-0.5 font-sans text-[11px] text-ade-fg/80">{keys}</kbd>
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}

          {layout.panel && (
            <div style={{ height: panelH }} className="relative shrink-0 border-t border-ade-line">
              <div onPointerDown={dragPanel} className={`${HANDLE} inset-x-0 -top-0.5 h-1 cursor-row-resize`} />
              <BottomPanel state={state} findings={findings} tab={panelTab} onTab={setPanelTab} onOpenFinding={openFinding} onClose={() => show("panel", false)} />
            </div>
          )}
        </main>

        {agentOpen && (
          <div
            style={{ width: agentW }}
            className={`relative max-w-full shrink-0 border-l border-ade-line max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:shadow-2xl ${
              touched.agent || pendingApproval ? "" : "max-lg:hidden"
            }`}
          >
            <div onPointerDown={dragAgent} className={`${HANDLE} inset-y-0 -left-0.5 w-1 cursor-col-resize`} />
            <AgentPane
              state={state}
              running={run.running}
              pendingApproval={pendingApproval}
              changes={changes}
              onStart={startOrLaunch}
              onRestart={restart}
              onApprove={run.approve}
              onReject={run.reject}
              onReviewDiff={() => openView("diff")}
              onProviders={() => {
                setActivity("providers");
                show("sidebar", true);
              }}
              onClose={() => show("agent", false)}
            />
          </div>
        )}
      </div>

      <StatusBar
        state={state}
        findings={findings}
        running={run.running}
        progress={run.progress}
        snapshot={!!folder}
        file={activeFile && fileInfo?.path === activeFile.path ? fileInfo : undefined}
        onProblems={() => openPanel("problems")}
        onProviders={() => {
          setActivity("providers");
          show("sidebar", true);
        }}
      />

      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
