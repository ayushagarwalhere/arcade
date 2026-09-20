import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { Check, ChevronRight, Lock, Play, RotateCcw, ShieldCheck } from "lucide-react-native";
import type { AgentKind, Finding, RunPhase } from "@/core/types";
import { useRun } from "@/run/RunProvider";
import Screen from "@/ui/Screen";
import { AGENT_ICON, AgentDot, Button, Card, Mono, SEVERITY, SectionLabel, SeverityBadge, Stats, StatusBadge, T } from "@/ui/atoms";
import { C, F, alpha, white } from "@/ui/theme";

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
          <Button kind="secondary" icon={RotateCcw} label="Reset the run" onPress={run.reset} style={{ flex: 1 }} />
        ) : run.running ? (
          <Button kind="secondary" label="Agents are working…" onPress={() => {}} disabled style={{ flex: 1 }} />
        ) : (
          <Button kind="primary" icon={Play} label={started ? "Resume run" : "Run security loop"} onPress={run.start} style={{ flex: 1 }} />
        )}
        {started && !finished && <Button kind="secondary" icon={RotateCcw} label="Reset" onPress={run.reset} />}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  kicker: { fontSize: 11.5, color: C.muted },
  title: { marginTop: 4, fontFamily: F.semibold, fontSize: 24, lineHeight: 30, letterSpacing: -0.6, color: C.white },
  lede: { marginTop: 6, fontSize: 14, lineHeight: 21, color: C.muted },

  control: { marginTop: 16, gap: 12 },
  controlButtons: { flexDirection: "row", gap: 10 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressText: { width: 36, textAlign: "right", fontSize: 11.5, color: C.muted },
  track: { marginTop: 8, height: 3, borderRadius: 2, backgroundColor: white(0.08), overflow: "hidden" },
  trackFill: { height: 3, borderRadius: 2 },

  agent: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  agentDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  agentBody: { flex: 1, minWidth: 0 },
  agentStep: { fontFamily: F.medium, fontSize: 14, color: C.white },
  agentTask: { marginTop: 1, fontSize: 12.5, lineHeight: 18, color: C.muted },

  finding: { borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.base, overflow: "hidden", paddingVertical: 14, paddingLeft: 18, paddingRight: 14 },
  severityBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  findingHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  findingTitle: { marginTop: 10, fontFamily: F.semibold, fontSize: 16, lineHeight: 22, color: C.white },
  findingTarget: { marginTop: 3, fontSize: 11.5, color: C.faint },
  findingSummary: { marginTop: 8, fontSize: 13.5, lineHeight: 21, color: alpha(C.fg, 0.75) },
  verified: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  verifiedText: { fontSize: 12.5, color: C.emerald300 },
  findingOpen: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 2 },
  findingOpenText: { fontFamily: F.medium, fontSize: 13, color: C.fg },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderRadius: 5, borderWidth: 1, borderColor: C.line, paddingHorizontal: 7, paddingVertical: 3, fontSize: 11.5, color: alpha(C.fg, 0.8) },
  footnote: { marginTop: 14, fontSize: 12, lineHeight: 18, color: C.faint },
});
