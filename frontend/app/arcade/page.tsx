"use client";
import { useEffect, useRef, useState } from "react";
import { useArcadeRun } from "@/lib/arcade/store";
import Sidebar, { type View } from "@/components/arcade/Sidebar";
import TopBar from "@/components/arcade/TopBar";
import AgentFleet from "@/components/arcade/AgentFleet";
import ApprovalGate from "@/components/arcade/ApprovalGate";
import DiffView from "@/components/arcade/DiffView";
import Overview from "@/components/arcade/views/Overview";
import AttackSurface from "@/components/arcade/views/AttackSurface";
import Findings from "@/components/arcade/views/Findings";
import Evidence from "@/components/arcade/views/Evidence";
import Timeline from "@/components/arcade/views/Timeline";
import TerminalView from "@/components/arcade/views/TerminalView";
import Browser from "@/components/arcade/views/Browser";

const REMEDIATED = ["remediating", "testing", "verifying", "verified"];

export default function ArcadePage() {
  const run = useArcadeRun();
  const { state, pendingApproval } = run;

  const [view, setView] = useState<View>("overview");
  const [selectedFinding, setSelectedFinding] = useState(state.finding.id);
  const [activeWorkspace, setActiveWorkspace] = useState(state.workspaces[0].id);
  const [approvalHidden, setApprovalHidden] = useState(false);

  // Auto-start the demo run once so a visitor immediately sees the loop.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const t = setTimeout(() => run.start(), 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reveal a newly-created approval (a prior "review diff" may have hidden the last one).
  const lastApprovalId = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (pendingApproval && pendingApproval.id !== lastApprovalId.current) {
      lastApprovalId.current = pendingApproval.id;
      setApprovalHidden(false);
    }
    if (!pendingApproval) lastApprovalId.current = undefined;
  }, [pendingApproval]);

  const openFinding = (id: string) => {
    setSelectedFinding(id);
    setView("findings");
  };

  const fixApproved = REMEDIATED.includes(state.phase);
  // Show the proposed diff once a fix exists to review — either applied, or
  // pending your approval at either gate.
  const showDiff = fixApproved || pendingApproval?.kind === "code" || pendingApproval?.kind === "ship";

  return (
    <div className="flex h-full">
      <Sidebar
        state={state}
        view={view}
        onView={setView}
        activeWorkspace={activeWorkspace}
        onWorkspace={setActiveWorkspace}
        onToggleProvider={run.setProvider}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          state={state}
          view={view}
          running={run.running}
          progress={run.progress}
          pendingApproval={pendingApproval}
          onStart={run.start}
          onReset={() => {
            run.reset();
            started.current = true; // don't auto-restart after a manual reset
            setView("overview");
          }}
          onShowApproval={() => setApprovalHidden(false)}
        />

        <div className={`scrollbar-thin min-h-0 flex-1 overflow-y-auto bg-black ${view === "terminal" ? "p-5" : "p-5"}`}>
          {view === "overview" && <Overview state={state} onOpenFinding={openFinding} onView={setView} />}
          {view === "surface" && <AttackSurface state={state} />}
          {view === "findings" && <Findings state={state} selectedId={selectedFinding} onSelect={setSelectedFinding} />}
          {view === "evidence" && <Evidence state={state} />}
          {view === "timeline" && <Timeline state={state} />}
          {view === "terminal" && (
            <div className="h-[calc(100vh-8rem)]">
              <TerminalView state={state} />
            </div>
          )}
          {view === "browser" && <Browser state={state} onRequestReset={run.requestDestructive} />}
          {view === "diff" && (
            <div className="mx-auto max-w-[900px]">
              <h2 className="mb-3 text-[16px] font-semibold text-white">Proposed changes</h2>
              <DiffView
                files={showDiff ? state.finding.remediation.files : []}
                commit={showDiff ? state.finding.remediation.commit : undefined}
                summary={showDiff ? state.finding.remediation.summary : undefined}
              />
            </div>
          )}
        </div>
      </div>

      <AgentFleet state={state} />

      {pendingApproval && !approvalHidden && (
        <ApprovalGate
          approval={pendingApproval}
          onApprove={(id) => {
            run.approve(id);
            setApprovalHidden(false);
          }}
          onReject={run.reject}
          onReviewDiff={() => {
            setView("diff");
            setApprovalHidden(true);
          }}
        />
      )}
    </div>
  );
}
