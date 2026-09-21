"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, File as FileGlyph, FolderClosed, GitBranch, Palette, PanelBottom, PanelLeft, PanelRight, Play, RotateCcw, Save, Settings as SettingsIcon, ShieldAlert, SquareTerminal } from "lucide-react";
import { useArcadeRun } from "@arcade/core/store";
import { isDesktop, rememberWorkspace, type WorkspaceRef } from "@arcade/core/workspace";
import { githubToken, repoWorkspace } from "@arcade/core/github";
import { isGithubWorkspace } from "@arcade/core/github-fs";
import type { GateDef } from "@arcade/core/engine";
import { useGit } from "@/hooks/useGit";
import { useAgentChat } from "@/hooks/useAgentChat";
import { useTerminal } from "@/hooks/useTerminal";
import { ADE_THEMES } from "@/lib/ade-themes";
import { updateSettings, useSettings } from "@/lib/settings";
import { forget, isDirty, release, releaseAll, reloadFromDisk, save as saveDocument, saveAll, useDirtyPaths } from "@/lib/documents";
import { runLiveLoop, type LoopWorkspace } from "@/lib/live-loop";
import GitDiffView from "@/components/GitDiffView";
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
import AgentPane, { type AgentTab } from "@/components/AgentPane";
import BottomPanel, { type PanelTab } from "@/components/BottomPanel";
import CommandPalette, { type Command } from "@/components/CommandPalette";
import DiffView from "@/components/DiffView";
import Overview from "@/components/views/Overview";
import AttackSurface from "@/components/views/AttackSurface";
import Findings from "@/components/views/Findings";
import Evidence from "@/components/views/Evidence";
import Timeline from "@/components/views/Timeline";
import Browser from "@/components/views/Browser";
import CloudSync, { type SyncState } from "@/components/CloudSync";
import { apiUrl, cloudConfigured, completeSignIn, getToken } from "@/lib/cloud-auth";
import { saveAssessment } from "@arcade/core/cloud-sync";

const REMEDIATED = ["remediating", "testing", "verifying", "verified"];

const HANDLE = "absolute z-20 transition-colors hover:bg-white/20 active:bg-white/30";

export default function ArcadePage() {
  const run = useArcadeRun();
  const { pendingApproval } = run;
  const settings = useSettings();

  // Nothing is open on launch: the welcome screen decides what the workbench shows.
  const [welcome, setWelcome] = useState(true);
  const [folder, setFolder] = useState<WorkspaceRef | null>(null);
  // Agents whose MCP config points at Arcade (desktop only).
  const agents = useAgentConnections();
  // An opened folder names the project, whether or not it has been assessed yet.
  const state = useMemo(() => ({ ...run.state, project: folder ? { ...run.state.project, name: folder.name, repo: folder.path } : run.state.project }), [run.state, folder]);

  // What only exists for a folder on this machine, in the desktop app: git, agents, a shell.
  const localRoot = folder && isDesktop() && !isGithubWorkspace(folder) ? folder.path : null;
  const git = useGit(localRoot);
  const term = useTerminal(localRoot, settings.shell);
  // Bumped whenever files changed on disk behind the editor's back; the tree, diffs and index follow it.
  const [fsVersion, setFsVersion] = useState(0);
  const fsRef = useRef<WorkspaceFs | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const filesChanged = useCallback(
    (files: string[]) => {
      setFsVersion((v) => v + 1);
      void git.refresh();
      if (!fsRef.current) return;
      void reloadFromDisk(fsRef.current, files.length ? files : undefined).then(({ conflicted }) => {
        if (conflicted.length) setNotice(`${conflicted.join(", ")} changed on disk while you have unsaved edits. Your edits were kept; save to overwrite, or close the tab to take the new version.`);
      });
    },
    [git],
  );
  const chat = useAgentChat(localRoot, filesChanged);
  const runnable = chat.agents?.filter((a) => a.runnable) ?? [];
  const activeAgent = runnable.find((a) => a.id === settings.agentId) ?? runnable[0] ?? null;
  const dirty = useDirtyPaths();

  const editor = useEditorTabs();
  const view: View | null = editor.active?.kind === "view" ? editor.active.view : null;
  const activeFile = editor.active?.kind === "file" ? editor.active : null;
  const activeDiff = editor.active?.kind === "diff" ? editor.active : null;
  const gitChangeCount = (git.status?.staged.length ?? 0) + (git.status?.unstaged.length ?? 0);

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
  const [panelTab, setPanelTab] = useState<PanelTab>("runlog");
  const [agentTab, setAgentTab] = useState<AgentTab>("run");
  const [cursor, setCursor] = useState<{ line: number; column: number } | undefined>();
  const [paletteOpen, setPaletteOpen] = useState(false);
  // Shown after a real folder is imported: choose and launch the assessment.
  const [showLaunch, setShowLaunch] = useState(false);

  const [sidebarW, dragSidebar] = useResize(248, 180, 420, "right");
  const [agentW, dragAgent] = useResize(360, 300, 560, "left");
  const [panelH, dragPanel] = useResize(220, 110, 520, "up");

  // The real half of the loop (lib/live-loop.ts) runs outside the beat player. `token` retires a
  // run that was reset underneath it; `waiters` are the approvals it is paused on.
  const loop = useRef({ token: 0, started: false, waiters: new Map<string, (ok: boolean) => void>(), seen: new Set<string>() });
  const [loopBusy, setLoopBusy] = useState(false);
  const stopLoop = () => {
    const l = loop.current;
    l.token++;
    l.started = false;
    for (const resolve of l.waiters.values()) resolve(false);
    l.waiters.clear();
    l.seen.clear();
    setLoopBusy(false);
  };
  // An approval the loop asked for was decided: approved resolves true; rejected (the store drops it) resolves false.
  useEffect(() => {
    const l = loop.current;
    for (const [id, resolve] of [...l.waiters]) {
      const approval = run.state.approvals.find((a) => a.id === id);
      if (approval) {
        l.seen.add(id);
        if (approval.status !== "approved") continue;
      } else if (!l.seen.has(id)) continue;
      l.waiters.delete(id);
      l.seen.delete(id);
      resolve(!!approval);
    }
  }, [run.state.approvals]);

  const enter = (w: WorkspaceRef | null, dryRun = false) => {
    if (w) rememberWorkspace(w);
    setFolder(w);
    if (w) {
      fsFor(w)
        .catch(() => null)
        .then((fs) => setFolderFs({ of: w, fs }));
    }
    editor.reset();
    releaseAll();
    stopLoop();
    setNotice(null);
    setActivity("explorer");
    // A real folder on this machine opens on the agent; the sample opens on its walkthrough.
    setAgentTab(w && !dryRun && isDesktop() && !isGithubWorkspace(w) ? "agent" : "run");
    setPanelTab(w && isDesktop() && !isGithubWorkspace(w) ? "terminal" : "runlog");
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
        if (k !== "f" && k !== "e" && k !== "g") return;
        setActivity(k === "f" ? "search" : k === "g" ? "scm" : "explorer");
        show("sidebar", true);
      } else if (k === "k" || k === "p") setPaletteOpen((o) => !o);
      else if (k === "b") toggle("sidebar");
      else if (k === "j") toggle("panel");
      else if (k === "l") toggle("agent");
      else if (k === "`") {
        setPanelTab("terminal");
        show("panel", true);
      } else if (k === ",") {
        setActivity("settings");
        show("sidebar", true);
      } else if (k === "s") {
        // The editor saves its own file; this catches Ctrl+S from anywhere else, instead of the browser's "save page".
        if (fsRef.current) void saveAll(fsRef.current).then(() => git.refresh(), (err) => setNotice(err instanceof Error ? err.message : "Could not save"));
      } else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- git.refresh is stable per folder
  }, [welcome, git.refresh]);

  // Leaving with unsaved edits asks first, the way an editor does.
  useEffect(() => {
    if (!dirty.size) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty.size]);

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
    stopLoop();
    run.reset();
    openView("overview");
  };
  const restart = () => {
    stopLoop();
    run.reset();
    run.start();
  };
  const closeWorkspace = () => {
    if (dirty.size && !window.confirm(`${dirty.size} file${dirty.size === 1 ? " has" : "s have"} unsaved changes. Close the workspace anyway?`)) return;
    stopLoop();
    chat.stop();
    releaseAll();
    run.reset();
    setWelcome(true);
  };
  const closeTab = (id: string) => {
    const tab = editor.tabs.find((t) => t.id === id);
    if (tab?.kind === "file") {
      if (isDirty(tab.path) && !window.confirm(`${baseName(tab.path)} has unsaved changes. Close it without saving?`)) return;
      // After the tab is gone, so the editor never holds a disposed model.
      const path = tab.path;
      setTimeout(() => release(path), 0);
    }
    editor.close(id);
  };

  // Loading a real assessment plan swaps the sample data for the scanned project's findings. The
  // plan covers what only reads source; the loop effect below takes over where code changes.
  const onLaunch = (a: Assessment) => {
    stopLoop();
    setAgentTab("run");
    setPanelTab("runlog");
    run.loadPlan(a.plan);
    setSelectedFinding(a.findings[0]?.id ?? "ARC-000");
    setShowLaunch(false);
    openView("overview");
    void saveToCloud(a);
  };

  // Desktop only: run the project's own tests in a real, network-isolated Docker sandbox and print
  // what actually happened. The website has no Docker to drive, so there this reports why and stops.
  const [sandboxBusy, setSandboxBusy] = useState(false);
  const runSandboxTests = async () => {
    const bridge = typeof window !== "undefined" ? window.arcade?.sandbox : undefined;
    const say = (kind: "cmd" | "info" | "sub" | "ok" | "err" | "warn", text: string) => run.appendTerminal({ agent: "system", kind, text });
    show("panel", true);
    setPanelTab("runlog");
    if (!bridge || !folder) {
      say("warn", "Real sandboxes need Docker on your machine — open this project in the Arcade desktop app, or run: arcade sandbox test .");
      return;
    }
    if (sandboxBusy) return;
    setSandboxBusy(true);
    say("cmd", `arcade sandbox test ${folder.path}`);
    const off = bridge.onEvent((e) => (e.kind === "step" ? say("info", `${e.step} · ${e.detail}`) : say("sub", e.line)));
    try {
      const r = await bridge.test(folder.path);
      if (!r.ok) say("err", r.error);
      else if (r.timedOut) say("err", `Timed out · sandbox ${r.sandboxId} destroyed`);
      else say(r.passed ? "ok" : "err", `${r.passed ? "Tests passed" : `Tests failed (exit ${r.exitCode})`} · ${(r.durationMs / 1000).toFixed(1)}s · network: ${r.network} · sandbox ${r.sandboxId} destroyed`);
    } finally {
      off();
      setSandboxBusy(false);
    }
  };

  // Signed in → the scan is recorded in the user's Arcade account (DynamoDB, via the API), where the
  // false-positive classifier scores each finding. Signed out → the scan stays local, exactly as before.
  const [sync, setSync] = useState<SyncState>({ kind: "idle" });
  useEffect(() => {
    if (cloudConfigured) void completeSignIn().catch(() => {});
  }, []);
  const saveToCloud = async (a: Assessment) => {
    if (!cloudConfigured || !folder) return;
    // A clean scan carries one placeholder finding; it is not a finding and must not be stored as one.
    const findings = a.findings.filter((f) => f.id !== "ARC-000");
    try {
      await getToken();
    } catch {
      return; // not signed in
    }
    setSync({ kind: "saving" });
    try {
      const saved = await saveAssessment({ apiUrl, getToken }, { projectName: folder.name, repo: a.project.repo, profile: a.findings[0]?.remediation.files.length ? "full" : "scan-only", filesScanned: a.scan.filesScanned, findings });
      setSync({ kind: "saved", findings: saved.stored, scored: saved.scored });
    } catch (e) {
      setSync({ kind: "error", message: e instanceof Error ? e.message : "Could not reach the Arcade API" });
    }
  };
  // For a real folder that hasn't been assessed yet, "run" reopens the launcher;
  // otherwise it resumes the loaded run.
  const startOrLaunch = () => {
    if (folder && !run.live) setShowLaunch(true);
    // A real run that has stopped (a rejected fix, a failed check) starts over rather than "resuming" nothing.
    else if (run.live && run.done && !loopBusy) restart();
    else run.start();
  };
  const busy = run.running || loopBusy;

  // An opened project that hasn't been assessed has no findings; the sample's are not its own.
  const unassessed = !!folder && !run.live;
  const findings: Finding[] = unassessed ? [] : [state.finding, ...state.secondaryFindings].filter((f) => f.id !== "ARC-000");
  const fixApproved = REMEDIATED.includes(state.phase);
  // Show the proposed diff once a fix exists to review — either applied, or
  // pending your approval at either gate.
  const showDiff = fixApproved || pendingApproval?.kind === "code" || pendingApproval?.kind === "ship";
  const changes = showDiff ? state.finding.remediation.files : [];
  // The sample has several named runs to pick from; a real project has the one it was assessed with.
  const workspace = folder && !run.live ? "not assessed yet" : ((state.workspaces.find((w) => w.id === activeWorkspace) ?? state.workspaces[0])?.name ?? "workspace");
  // A pending approval always brings the agent pane back: the run is waiting on it.
  const agentOpen = layout.agent || !!pendingApproval;

  // Files. The sample tree flips to the fixed sources once the remediator has written the fix.
  const sampleFiles = useMemo(() => sampleFs(fixApproved), [fixApproved]);
  const workspaceFs: WorkspaceFs | null | "none" = !folder ? sampleFiles : folderFs?.of === folder ? (folderFs.fs ?? "none") : null;
  const liveFs = workspaceFs && workspaceFs !== "none" ? workspaceFs : null;
  useEffect(() => {
    fsRef.current = liveFs;
  }, [liveFs]);
  useEffect(() => {
    if (!liveFs) return;
    let cancelled = false;
    crawl(liveFs, () => cancelled, (files) => setIndex({ fs: liveFs, files, done: false })).then((files) => {
      if (!cancelled) setIndex({ fs: liveFs, files, done: true });
    });
    return () => {
      cancelled = true;
    };
    // fsVersion: files were created, deleted or renamed, so quick-open and search need the new list.
  }, [liveFs, fsVersion]);

  // The assessment has ranked the fixes. From here the work changes things, so it is done for real
  // (lib/live-loop.ts) rather than played: approve → branch → fix → tests → re-check → commit → push.
  const loopReady = run.live && run.done && run.state.phase === "defended" && run.state.finding.id !== "ARC-000";
  useEffect(() => {
    if (!loopReady || loop.current.started || !liveFs || !folder) return;
    const l = loop.current;
    l.started = true;
    const token = ++l.token;
    const current = () => loop.current.token === token;
    const apply: typeof run.apply = (beat) => current() && run.apply(beat);
    const workspace: LoopWorkspace = localRoot ? { kind: "local", root: localRoot } : isGithubWorkspace(folder) ? { kind: "github", repo: folder.path.slice("github.com/".length) } : { kind: "browser" };
    setLoopBusy(true);
    runLiveLoop({
      finding: run.state.finding,
      fs: liveFs,
      workspace,
      git: window.arcade?.git,
      terminal: window.arcade?.terminal,
      agent: activeAgent ? { id: activeAgent.id, name: activeAgent.name, model: settings.agentModel || undefined } : undefined,
      askAgent: chat.canRun ? chat.send : undefined,
      githubToken,
      shipMode: settings.shipMode,
      runTests: settings.testsBeforeCommit,
      emit: apply,
      gate: (id: string, def: GateDef) =>
        new Promise<boolean>((resolve) => {
          if (!current()) return resolve(false);
          l.waiters.set(id, resolve);
          run.apply({ t: "gate", approvalId: id, def });
        }),
      filesChanged: (files) => current() && filesChanged(files),
      showAgent: () => current() && setAgentTab("agent"),
      showRun: () => current() && setAgentTab("run"),
    })
      .catch((e) => apply({ t: "term", line: { agent: "system", kind: "err", text: e instanceof Error ? e.message : "The run stopped unexpectedly" } }))
      .finally(() => current() && setLoopBusy(false));
    // Started once per run: the values it reads are the ones in force when the fixes were ranked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loopReady, liveFs, folder]);

  // A pending approval is the run waiting on you: bring its tab forward, once per approval.
  const [surfaced, setSurfaced] = useState<string | undefined>();
  if (pendingApproval?.id !== surfaced) {
    setSurfaced(pendingApproval?.id);
    if (pendingApproval) setAgentTab("run");
  }
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
    { id: "run:sandbox-tests", group: "Run", label: "Run tests in a Docker sandbox (desktop)", Icon: ShieldAlert, run: () => void runSandboxTests() },
    ...(liveFs?.write
      ? [
          { id: "file:save", group: "File", label: "Save", hint: "Ctrl+S", Icon: Save, run: () => void (activeFile && saveDocument(liveFs, activeFile.path).then(() => git.refresh(), (e) => setNotice(e instanceof Error ? e.message : "Could not save"))) },
          { id: "file:save-all", group: "File", label: "Save all", Icon: Save, run: () => void saveAll(liveFs).then(() => git.refresh(), (e) => setNotice(e instanceof Error ? e.message : "Could not save")) },
        ]
      : []),
    { id: "workspace:close", group: "Workspace", label: "Close workspace", hint: "Back to welcome", Icon: FolderClosed, run: closeWorkspace },
    { id: "scm:open", group: "Source Control", label: "Show source control", hint: "Ctrl+Shift+G", Icon: GitBranch, run: () => openActivity("scm") },
    { id: "layout:sidebar", group: "Layout", label: "Toggle sidebar", hint: "Ctrl+B", Icon: PanelLeft, run: () => toggle("sidebar") },
    { id: "layout:panel", group: "Layout", label: "Toggle panel", hint: "Ctrl+J", Icon: PanelBottom, run: () => toggle("panel") },
    { id: "layout:agent", group: "Layout", label: "Toggle agent", hint: "Ctrl+L", Icon: PanelRight, run: () => toggle("agent") },
    { id: "settings:open", group: "Preferences", label: "Open settings", hint: "Ctrl+,", Icon: SettingsIcon, run: () => openActivity("settings") },
    ...ADE_THEMES.map((t) => ({ id: `theme:${t.id}`, group: "Color theme", label: t.name, hint: t.id === settings.themeId ? "current" : undefined, Icon: Palette, run: () => updateSettings({ themeId: t.id }) })),
    { id: "panel:terminal", group: "Panel", label: "Show terminal", hint: "Ctrl+`", Icon: SquareTerminal, run: () => openPanel("terminal") },
    { id: "panel:runlog", group: "Panel", label: "Show run log", run: () => openPanel("runlog") },
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
        running={busy}
        pendingApproval={pendingApproval}
        layout={{ ...layout, agent: agentOpen }}
        onToggle={toggle}
        onPalette={() => setPaletteOpen(true)}
        onHome={closeWorkspace}
        onStart={startOrLaunch}
        onReset={reset}
        onShowApproval={() => show("agent", true)}
        onOpenRepo={(r) => enter(repoWorkspace(r))}
        cloud={<CloudSync sync={sync} />}
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
        <ActivityBar activity={activity} sidebarOpen={layout.sidebar} onActivity={openActivity} findingCount={folder && !run.live ? 0 : findings.length} changeCount={git.available ? gitChangeCount : changes.length} />

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
              files={{
                fs: workspaceFs,
                index: filePaths,
                indexing: !!liveFs && !indexed?.done,
                activePath: activeFile?.path ?? null,
                decorations,
                onOpenFile: editor.openFile,
                refreshKey: fsVersion,
                onChanged: () => filesChanged([]),
                onRemoved: (path) => {
                  forget(path);
                  editor.closePath(path);
                },
              }}
              agents={agents}
              live={run.live}
              sample={!folder}
              git={git}
              runnable={chat.agents}
              onOpenDiff={editor.openDiff}
              onGitChanged={() => filesChanged([])}
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
            dirty={dirty}
            onActivate={editor.activate}
            onPin={editor.pin}
            onClose={closeTab}
          />

          {notice && (
            <div className="flex shrink-0 items-start gap-2 border-b border-amber-400/30 bg-amber-400/[0.07] px-4 py-1.5 text-[12px] leading-5 text-amber-100/90">
              <span className="min-w-0 flex-1">{notice}</span>
              <button onClick={() => setNotice(null)} className="shrink-0 underline opacity-80 hover:opacity-100">
                dismiss
              </button>
            </div>
          )}

          {activeDiff && liveFs && localRoot ? (
            <>
              <div className="flex h-[22px] shrink-0 items-center gap-1 px-4 text-[12px] text-ade-muted">
                <span className="truncate text-ade-fg/85">{activeDiff.path}</span>
                <span className="text-ade-faint">· HEAD ↔ {activeDiff.staged ? "staged" : "working tree"}</span>
              </div>
              <div className="min-h-0 flex-1">
                <GitDiffView fs={liveFs} root={localRoot} path={activeDiff.path} refreshKey={fsVersion} />
              </div>
            </>
          ) : activeFile ? (
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
                {liveFs && (
                  <CodeView
                    fs={liveFs}
                    path={activeFile.path}
                    line={activeFile.line}
                    jump={activeFile.jump}
                    flagged={flaggedLines(activeFile.path)}
                    onInfo={setFileInfo}
                    onCursor={setCursor}
                    onSaved={() => {
                      editor.pin(activeFile.id);
                      void git.refresh(); // a save changes git's view, not the file list
                    }}
                    onError={setNotice}
                  />
                )}
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
                {/* A project that hasn't been assessed has no run to show — and the sample's data is not its data. */}
                {unassessed && (
                  <div className="mx-auto max-w-[460px] pt-16 text-center">
                    <ShieldAlert className="mx-auto h-7 w-7 text-ade-faint" strokeWidth={1.5} />
                    <p className="mt-4 text-[14px] text-ade-fg/90">{state.project.name} hasn&apos;t been assessed yet</p>
                    <p className="mt-1.5 text-[12.5px] leading-[1.55] text-ade-muted">An assessment reads the source, finds what is weak and ranks the fixes. {VIEW_META[view].label} fills in from that. Until then you can browse and edit files, use source control and the terminal, and talk to your agent.</p>
                    <button onClick={() => setShowLaunch(true)} className="mt-5 inline-flex h-8 items-center gap-1.5 rounded-md bg-ade-fg px-3.5 text-[12.5px] font-medium text-black transition hover:bg-white">
                      <Play className="h-3.5 w-3.5" /> Assess this project
                    </button>
                  </div>
                )}
                {!unassessed && view === "overview" && <Overview state={state} onOpenFinding={openFinding} onView={openView} />}
                {!unassessed && view === "surface" && <AttackSurface state={state} />}
                {!unassessed && view === "findings" && (
                  <Findings
                    key={selectedFinding}
                    state={state}
                    selectedId={selectedFinding}
                    onOpenFile={run.live || (!folder && !fixApproved) ? (path, line) => editor.openFile(path, { preview: false, line }) : undefined}
                  />
                )}
                {!unassessed && view === "evidence" && <Evidence state={state} />}
                {!unassessed && view === "timeline" && <Timeline state={state} />}
                {!unassessed && view === "browser" && <Browser state={state} onRequestReset={run.requestDestructive} />}
                {!unassessed && view === "diff" && (
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
              <BottomPanel state={state} findings={folder && !run.live ? [] : findings} term={term} tab={panelTab} onTab={setPanelTab} onOpenFinding={openFinding} onClose={() => show("panel", false)} />
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
              running={busy}
              pendingApproval={pendingApproval}
              changes={changes}
              tab={agentTab}
              onTab={setAgentTab}
              chat={chat}
              selectedFinding={run.live ? findings.find((f) => f.id === selectedFinding) : undefined}
              activeFile={activeFile?.path ?? null}
              onOpenFile={(path) => editor.openFile(path, { preview: false })}
              demo={!run.live}
              onStart={startOrLaunch}
              onRestart={restart}
              onApprove={run.approve}
              onReject={run.reject}
              onReviewDiff={() => openView("diff")}
              onClose={() => show("agent", false)}
            />
          </div>
        )}
      </div>

      <StatusBar
        state={state}
        findings={findings}
        running={busy}
        progress={run.progress}
        mode={!folder ? "sample" : run.live ? "live" : "unassessed"}
        git={git.info}
        changeCount={gitChangeCount}
        agentName={activeAgent?.name ?? null}
        file={activeFile && fileInfo?.path === activeFile.path ? fileInfo : undefined}
        cursor={activeFile ? cursor : undefined}
        editable={!!liveFs?.write}
        unsaved={dirty.size}
        onProblems={() => openPanel("problems")}
        onScm={() => openActivity("scm")}
        onProviders={() => {
          setActivity("providers");
          show("sidebar", true);
        }}
      />

      {paletteOpen && <CommandPalette commands={commands} onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
