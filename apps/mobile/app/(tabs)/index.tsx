import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Check, ChevronRight, Lock, Play, RotateCcw, ShieldCheck } from "lucide-react-native";
import { useAssess } from "@/assess/AssessmentProvider";
import LiveOverview from "@/assess/LiveOverview";
import Welcome from "@/assess/Welcome";
import type { AgentKind, Finding, RunPhase } from "@/core/types";
import { useRun } from "@/run/RunProvider";
import Screen from "@/ui/Screen";
import { AGENT_ICON, AgentDot, Button, Card, Mono, SEVERITY, SectionLabel, SeverityBadge, Stats, StatusBadge, T } from "@/ui/atoms";
import { overviewStyles as s } from "@/ui/overviewStyles";
import { C } from "@/ui/theme";

const PHASE_LABEL: Record<RunPhase, string> = {
  idle: "Idle — ready to scan",
  mapping: "Mapping the application",
  mapped: "Application mapped",
  attacking: "Attacking in the sandbox",
  attacked: "Exploit reproduced",
  defending: "Analyzing the attack",
  defended: "Mitigations proposed",
  "awaiting-fix-approval": "Awaiting your approval",
  remediating: "Writing the fix",
  testing: "Running tests",
  verifying: "Independently verifying",
  verified: "Verified — safe to merge",
};

const LOOP: { kind: AgentKind; step: string }[] = [
  { kind: "mapper", step: "Map" },
  { kind: "attacker", step: "Attack" },
  { kind: "defender", step: "Defend" },
  { kind: "remediator", step: "Remediate" },
  { kind: "verifier", step: "Verify" },
];

export default function Overview() {
  const { mode, restored } = useAssess();
  // Wait for the stored assessment before choosing a face, so the welcome screen never flashes first.
  if (!restored && mode === "none") return <Screen>{null}</Screen>;
  return mode === "live" ? <LiveOverview /> : mode === "sample" ? <SampleOverview /> : <Welcome />;
}

/** The scripted sample: the engine's demo beats, played on a timer. Labelled as a sample by the banner above it. */
function SampleOverview() {
  const run = useRun();
  const router = useRouter();
  const { state } = run;

  const findings: Finding[] = [state.finding, ...state.secondaryFindings];
  const reproduced = findings.filter((x) => x.status !== "verification-failed").length;
  const critical = findings.filter((f) => f.severity === "critical").length;
  const verifiedFixes = findings.filter((f) => f.verification.outcome === "verified").length;
  const pending = state.approvals.filter((a) => a.status === "pending").length;
  const f = state.finding;

  return (
    <Screen>
      <View>
        <Mono style={s.kicker}>
          {state.project.repo} · {state.environment.sandboxId}
        </Mono>
        <T style={s.title}>{run.pendingApproval ? "Awaiting your approval" : PHASE_LABEL[state.phase]}</T>
        <T style={s.lede}>{state.project.description}</T>
        <RunControl />
      </View>

      <View>
        <SectionLabel>The security loop</SectionLabel>
        <Card>
          {LOOP.map(({ kind, step }, i) => {
            const a = state.agents[kind];
            const Icon = AGENT_ICON[kind];
            const live = a.status === "running" || a.status === "awaiting-approval";
            const iconColor = a.status === "done" ? C.emerald400 : a.status === "awaiting-approval" ? C.violet300 : live ? C.amber200 : C.faint;
            return (
              <View key={kind} style={[s.agent, i > 0 && s.agentDivider, live && { backgroundColor: C.raised }]}>
                <Icon size={17} color={iconColor} />
                <View style={s.agentBody}>
                  <T style={[s.agentStep, a.status === "idle" && { color: C.muted }]}>{step}</T>
                  <T style={s.agentTask} numberOfLines={2}>
                    {a.task}
                  </T>
                  {a.status === "running" && (
                    <View style={s.track}>
                      <View style={[s.trackFill, { width: `${Math.round(a.progress * 100)}%`, backgroundColor: C.amber400 }]} />
                    </View>
                  )}
                </View>
                {a.status === "done" ? <Check size={15} color={C.emerald400} /> : <AgentDot status={a.status} />}
              </View>
            );
          })}
        </Card>
      </View>

      <View>
        <SectionLabel>Primary finding</SectionLabel>
        <Pressable accessibilityRole="button" onPress={() => router.push(`/finding/${f.id}`)} style={({ pressed }) => [s.finding, pressed && { backgroundColor: C.raised }]}>
          <View style={[s.severityBar, { backgroundColor: SEVERITY[f.severity].dot }]} />
          <View style={s.findingHead}>
            <Mono style={{ color: C.muted }}>{f.id}</Mono>
            <SeverityBadge severity={f.severity} />
            <StatusBadge status={f.status} />
          </View>
          <T style={s.findingTitle}>{f.title}</T>
          <Mono style={s.findingTarget}>{f.target}</Mono>
          <T style={s.findingSummary}>{f.summary}</T>
          {f.verification.outcome === "verified" && (
            <View style={s.verified}>
              <ShieldCheck size={14} color={C.emerald300} />
              <T style={s.verifiedText}>
                Verified fixed — {f.verification.statusBefore} → {f.verification.statusAfter}
              </T>
            </View>
          )}
          <View style={s.findingOpen}>
            <T style={s.findingOpenText}>Open finding</T>
            <ChevronRight size={14} color={C.fg} />
          </View>
        </Pressable>
      </View>

      <Stats
        title="Findings"
        rows={[
          ["Open", `${findings.length - verifiedFixes} · ${reproduced} reproduced`],
          ["Critical", critical, C.red300],
          ["Verified fixes", verifiedFixes, C.emerald300],
          ["Awaiting approval", pending, pending ? C.violet300 : undefined],
        ]}
      />

      <Stats
        title="Attack surface"
        rows={[
          ["Endpoints", state.project.endpoints],
          ["Auth boundaries", state.project.authBoundaries],
          ["Integrations", state.project.integrations],
          ["Privileged operations", state.project.privilegedOps, C.amber200],
        ]}
      />

      <View>
        <SectionLabel>Stack</SectionLabel>
        <View style={s.chips}>
          {state.project.technologies.map((t) => (
            <Mono key={t} style={s.chip}>
              {t}
            </Mono>
          ))}
        </View>
        <T style={s.footnote}>
          Posture is measured, not scored: counts of surface, reproduced findings, and fixes that a separate agent re-attacked and could not break.
        </T>
      </View>
    </Screen>
  );
}

/** One control for the whole run: start it, watch it, answer its gate, resume or reset it. */
function RunControl() {
  const run = useRun();
  const router = useRouter();
  const started = run.progress > 0 || run.state.phase !== "idle";
  const finished = run.progress >= 1;

  return (
    <View style={s.control}>
      {started && (
        <View style={s.progressRow}>
          <View style={[s.track, { flex: 1, marginTop: 0 }]}>
            <View style={[s.trackFill, { width: `${Math.round(run.progress * 100)}%`, backgroundColor: finished ? C.emerald400 : C.fg }]} />
          </View>
          <Mono style={s.progressText}>{Math.round(run.progress * 100)}%</Mono>
        </View>
      )}
      <View style={s.controlButtons}>
        {run.pendingApproval ? (
          <Button kind="primary" icon={Lock} label="Review approval" onPress={() => router.push("/approval")} style={{ flex: 1 }} />
        ) : finished ? (
          <Button kind="secondary" icon={RotateCcw} label="Reset the sample" onPress={run.reset} style={{ flex: 1 }} />
        ) : run.running ? (
          <Button kind="secondary" label="Agents are working…" onPress={() => {}} disabled style={{ flex: 1 }} />
        ) : (
          <Button kind="primary" icon={Play} label={started ? "Resume the sample" : "Play the sample run"} onPress={run.start} style={{ flex: 1 }} />
        )}
        {started && !finished && <Button kind="secondary" icon={RotateCcw} label="Reset" onPress={run.reset} />}
      </View>
    </View>
  );
}
