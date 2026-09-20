import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { ArrowRight, CircleCheck, CircleX } from "lucide-react-native";
import type { Finding, RunPhase } from "@/core/types";
import { useRun } from "@/run/RunProvider";
import ApprovalBanner from "@/ui/ApprovalBanner";
import DiffView from "@/ui/DiffView";
import Segmented from "@/ui/Segmented";
import TimelineList from "@/ui/TimelineList";
import { Badge, Empty, Mono, SeverityBadge, StatusBadge, T } from "@/ui/atoms";
import { C, F, alpha, white } from "@/ui/theme";

const TABS = ["Overview", "Attack path", "Evidence", "Code", "Fix", "Verification", "Timeline"] as const;
type Tab = (typeof TABS)[number];

const REMEDIATED: RunPhase[] = ["remediating", "testing", "verifying", "verified"];

export default function FindingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useRun();
  const [tab, setTab] = useState<Tab>("Overview");

  const all: Finding[] = [state.finding, ...state.secondaryFindings];
  const finding = all.find((f) => f.id === id) ?? state.finding;
  const isFlagship = finding.id === state.finding.id;
  const fixApproved = isFlagship && REMEDIATED.includes(state.phase);
  const verified = isFlagship && finding.verification.outcome === "verified";
  const exploitPath = state.surface.exploitPath.map((nodeId) => state.surface.nodes.find((n) => n.id === nodeId)!);

  return (
    <View style={s.root}>
      <Stack.Screen options={{ title: finding.id }} />

      <View style={s.header}>
        <View style={s.badges}>
          <SeverityBadge severity={finding.severity} />
          <StatusBadge status={finding.status} />
        </View>
        <T style={s.title}>{finding.title}</T>
        <Mono style={s.target}>{finding.target}</Mono>
        <Mono style={s.cwe}>{finding.cwe}</Mono>
      </View>
      <Segmented options={TABS} value={tab} onChange={setTab} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content}>
        {tab === "Overview" && (
          <>
            <T style={s.lead}>{finding.summary}</T>
            {finding.description !== finding.summary && <T style={s.para}>{finding.description}</T>}
            <View style={s.facts}>
              <Fact k="Severity" v={finding.severity} capitalize />
              <Fact k="Discovered by" v={finding.agent} />
              <Fact k="Target" v={finding.target} mono />
              <Fact k="Created" v={finding.createdAt} />
            </View>
          </>
        )}

        {tab === "Attack path" && (
          <>
            <T style={finding.attackNarrative ? s.lead : s.para}>{finding.attackNarrative || finding.summary}</T>
            {isFlagship && (
              <View style={s.path}>
                {exploitPath.map((n, i) => {
                  const hot = n.risk === "vulnerable" || i === exploitPath.length - 1;
                  return (
                    <View key={n.id} style={s.pathStep}>
                      <T style={[s.pathNode, hot && s.pathNodeHot]}>{n.label}</T>
                      {i < exploitPath.length - 1 && <ArrowRight size={14} color={white(0.3)} />}
                    </View>
                  );
                })}
              </View>
            )}
            {isFlagship && (
              <View style={{ gap: 8 }}>
                <T style={s.subhead}>Mitigations ranked by the defender</T>
                {finding.mitigations.map((m) => (
                  <View key={m.title} style={[s.box, m.recommended && s.boxGood]}>
                    <T style={s.mitigationTitle}>{m.title}</T>
                    <View style={s.badges}>
                      {m.recommended && <Badge tone="green">Recommended</Badge>}
                      <Badge>{m.effort[0].toUpperCase() + m.effort.slice(1)} effort</Badge>
                    </View>
                    <T style={s.mitigationDetail}>{m.detail}</T>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {tab === "Evidence" &&
          (finding.evidence.artifact ? (
            <>
              <View style={s.panel}>
                <T style={s.panelHead}>Request</T>
                <View style={s.panelBody}>
                  <Mono style={s.code}>
                    <Mono style={{ color: C.emerald400 }}>{finding.evidence.method}</Mono> <Mono style={{ color: white(0.85) }}>{finding.evidence.target}</Mono>
                  </Mono>
                  {finding.evidence.requestHeaders.map((h) => (
                    <Mono key={h} style={[s.code, { color: white(0.5) }]}>
                      {h}
                    </Mono>
                  ))}
                  {finding.evidence.requestBody && <Mono style={[s.code, { marginTop: 8, color: white(0.75) }]}>{finding.evidence.requestBody}</Mono>}
                </View>
              </View>
              <View style={[s.panel, { borderColor: alpha(C.red500, 0.25) }]}>
                <View style={s.panelHeadRow}>
                  <T style={s.panelHeadText}>Response</T>
                  <Mono style={{ fontFamily: F.monoBold, color: C.red300 }}>{finding.evidence.statusBefore}</Mono>
                </View>
                <View style={s.panelBody}>
                  <Mono style={[s.code, { color: white(0.75) }]}>{finding.evidence.responseBody}</Mono>
                </View>
              </View>
              <View style={{ gap: 8 }}>
                <T style={s.subhead}>Steps to reproduce</T>
                {finding.evidence.steps.map((step, i) => (
                  <View key={step} style={s.step}>
                    <Mono style={s.stepNo}>{i + 1}</Mono>
                    <T style={s.stepText}>{step}</T>
                  </View>
                ))}
              </View>
              <Mono style={s.artifact}>
                {finding.evidence.artifact} · captured {finding.evidence.capturedAt}
              </Mono>
            </>
          ) : (
            <Empty text="No reproduction captured for this finding yet." />
          ))}

        {tab === "Code" &&
          (finding.vulnerableCode.lines.length ? (
            <View style={s.panel}>
              <Mono style={s.panelHead}>{finding.vulnerableCode.path}</Mono>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ paddingVertical: 6, minWidth: "100%" }}>
                  {finding.vulnerableCode.lines.map((l) => (
                    <View key={l.no} style={[s.codeLine, l.flagged && { backgroundColor: alpha(C.red500, 0.1) }]}>
                      <Mono style={s.lineNo}>{l.no}</Mono>
                      <Mono style={[s.lineText, l.flagged && { color: C.red200 }]}>{l.text}</Mono>
                    </View>
                  ))}
                </View>
              </ScrollView>
            </View>
          ) : (
            <Empty text="Vulnerable source not extracted for this finding." />
          ))}

        {tab === "Fix" &&
          (fixApproved && finding.remediation.files.length ? (
            <>
              <View style={s.box}>
                <T style={s.boxLabel}>Root cause</T>
                <T style={s.boxText}>{finding.remediation.rootCause}</T>
              </View>
              <DiffView files={finding.remediation.files} commit={finding.remediation.commit} summary={finding.remediation.summary} />
              <View style={s.box}>
                <T style={s.boxLabel}>Tests</T>
                {finding.remediation.tests.map((t) => (
                  <View key={t.name} style={s.test}>
                    <CircleCheck size={14} color={C.emerald400} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <T style={s.testName}>{t.name}</T>
                      <Mono style={s.testMeta}>
                        {t.suite} · {t.ms}ms
                      </Mono>
                    </View>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <Empty text={isFlagship ? "The fix is proposed but not yet approved. Approve it to generate the diff and run tests." : "This finding has no approved remediation yet."} />
          ))}

        {tab === "Verification" &&
          (verified ? (
            <>
              <View style={s.verdict}>
                <CircleCheck size={24} color={C.emerald400} />
                <View style={{ flex: 1 }}>
                  <T style={s.verdictTitle}>Verified</T>
                  <T style={s.verdictText}>{finding.verification.replaySummary}</T>
                </View>
              </View>
              {finding.verification.independent && <Badge tone="violet" style={{ alignSelf: "flex-start" }}>Independent verifier</Badge>}
              <View style={s.box}>
                <T style={s.boxLabel}>Original exploit</T>
                <View style={s.beforeAfter}>
                  <Mono style={s.before}>{finding.verification.statusBefore}</Mono>
                  <ArrowRight size={16} color={white(0.4)} />
                  <Mono style={s.after}>{finding.verification.statusAfter}</Mono>
                </View>
              </View>
              <View style={s.box}>
                <T style={s.boxLabel}>Adversarial replay</T>
                <T style={s.boxText}>
                  {finding.verification.mutatedSucceeded}/{finding.verification.mutatedPayloads} mutated payloads succeeded · {finding.verification.regressionPassed}/
                  {finding.verification.regressionTotal} tests pass
                </T>
              </View>
            </>
          ) : finding.status === "verification-failed" ? (
            <View style={[s.verdict, { borderColor: alpha(C.red500, 0.25), backgroundColor: alpha(C.red500, 0.06) }]}>
              <CircleX size={24} color={C.red400} />
              <T style={[s.verdictText, { flex: 1, fontSize: 14, color: C.red200 }]}>Verification failed — the original exploit still succeeds. Finding stays open.</T>
            </View>
          ) : (
            <Empty text="Not verified yet. A separate agent re-runs the original attack after the fix." />
          ))}

        {tab === "Timeline" && <TimelineList events={finding.timeline} empty="No timeline events for this finding yet." />}
      </ScrollView>

      <ApprovalBanner />
    </View>
  );
}

function Fact({ k, v, mono, capitalize }: { k: string; v: string; mono?: boolean; capitalize?: boolean }) {
  return (
    <View style={s.fact}>
      <T style={s.factKey}>{k}</T>
      {mono ? <Mono style={s.factValue}>{v}</Mono> : <T style={[s.factValue, capitalize && { textTransform: "capitalize" }]}>{v}</T>}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.editor },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  badges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  title: { marginTop: 10, fontFamily: F.semibold, fontSize: 21, lineHeight: 27, letterSpacing: -0.4, color: C.white },
  target: { marginTop: 4, fontSize: 12, color: C.muted },
  cwe: { marginTop: 2, fontSize: 11.5, color: C.faint },
  content: { padding: 16, paddingBottom: 32, gap: 14 },

  lead: { fontSize: 14.5, lineHeight: 23, color: white(0.78) },
  para: { fontSize: 13.5, lineHeight: 22, color: white(0.55) },
  subhead: { fontFamily: F.semibold, fontSize: 12.5, color: white(0.6) },

  facts: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  fact: { flexGrow: 1, flexBasis: "45%", borderRadius: 6, borderWidth: 1, borderColor: C.line, backgroundColor: C.raised, paddingHorizontal: 12, paddingVertical: 9 },
  factKey: { fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: white(0.35) },
  factValue: { marginTop: 3, fontSize: 13, color: white(0.8) },

  path: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  pathStep: { flexDirection: "row", alignItems: "center", gap: 6 },
  pathNode: { borderRadius: 5, borderWidth: 1, borderColor: "transparent", backgroundColor: white(0.05), paddingHorizontal: 10, paddingVertical: 6, fontSize: 12.5, color: white(0.7), overflow: "hidden" },
  pathNodeHot: { borderColor: alpha(C.red500, 0.25), backgroundColor: alpha(C.red500, 0.12), color: C.red200 },

  box: { gap: 6, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.raised, paddingHorizontal: 14, paddingVertical: 12 },
  boxGood: { borderColor: alpha(C.emerald500, 0.25), backgroundColor: alpha(C.emerald500, 0.05) },
  boxLabel: { fontFamily: F.semibold, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: white(0.4) },
  boxText: { fontSize: 13.5, lineHeight: 21, color: white(0.72) },
  mitigationTitle: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: white(0.9) },
  mitigationDetail: { fontSize: 12.5, lineHeight: 19, color: white(0.55) },

  panel: { borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.base, overflow: "hidden" },
  panelHead: { borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: white(0.02), paddingHorizontal: 12, paddingVertical: 9, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: white(0.4) },
  panelHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: white(0.02), paddingHorizontal: 12, paddingVertical: 9 },
  panelHeadText: { fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: white(0.4) },
  panelBody: { padding: 12 },
  code: { fontSize: 12, lineHeight: 20 },
  step: { flexDirection: "row", gap: 10 },
  stepNo: { width: 20, height: 20, borderRadius: 10, backgroundColor: white(0.06), textAlign: "center", lineHeight: 20, fontSize: 11, color: white(0.6), overflow: "hidden" },
  stepText: { flex: 1, fontSize: 13.5, lineHeight: 20, color: white(0.7) },
  artifact: { fontSize: 11, lineHeight: 17, color: white(0.35) },

  codeLine: { flexDirection: "row" },
  lineNo: { width: 38, paddingRight: 10, textAlign: "right", fontSize: 12, lineHeight: 22, color: white(0.25) },
  lineText: { paddingRight: 16, fontSize: 12, lineHeight: 22, color: white(0.8) },

  test: { flexDirection: "row", gap: 8, paddingTop: 4 },
  testName: { fontSize: 13, lineHeight: 19, color: white(0.8) },
  testMeta: { fontSize: 11, color: white(0.35) },

  verdict: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 8, borderWidth: 1, borderColor: alpha(C.emerald500, 0.25), backgroundColor: alpha(C.emerald500, 0.06), paddingHorizontal: 14, paddingVertical: 14 },
  verdictTitle: { fontFamily: F.semibold, fontSize: 16, color: C.emerald300 },
  verdictText: { marginTop: 2, fontSize: 12.5, lineHeight: 19, color: white(0.55) },
  beforeAfter: { flexDirection: "row", alignItems: "center", gap: 12 },
  before: { fontSize: 15, color: C.red300, textDecorationLine: "line-through" },
  after: { fontFamily: F.monoBold, fontSize: 15, color: C.emerald300 },
});
