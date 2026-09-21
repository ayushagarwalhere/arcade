import { useState } from "react";
import { ScrollView, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { ArrowRight, CircleCheck, CircleX } from "lucide-react-native";
import type { Finding, RunPhase } from "@/core/types";
import { useAssess } from "@/assess/AssessmentProvider";
import LiveFinding from "@/assess/LiveFinding";
import { useRun } from "@/run/RunProvider";
import ApprovalBanner from "@/ui/ApprovalBanner";
import DiffView from "@/ui/DiffView";
import ModeBanner from "@/ui/ModeBanner";
import Segmented from "@/ui/Segmented";
import TimelineList from "@/ui/TimelineList";
import { Badge, Empty, Mono, SeverityBadge, StatusBadge, T } from "@/ui/atoms";
import { findingStyles as s } from "@/ui/findingStyles";
import { C, F, alpha, white } from "@/ui/theme";

const TABS = ["Overview", "Attack path", "Evidence", "Code", "Fix", "Verification", "Timeline"] as const;
type Tab = (typeof TABS)[number];

const REMEDIATED: RunPhase[] = ["remediating", "testing", "verifying", "verified"];

export default function FindingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { mode } = useAssess();
  if (mode === "live") return <LiveFinding id={id} />;
  if (mode === "sample") return <SampleFinding id={id} />;
  return (
    <View style={[s.root, { padding: 16 }]}>
      <Empty text="No assessment is loaded, so there is no finding to show. Assess a repository from Overview." />
    </View>
  );
}

/** The scripted sample's finding, with its scripted evidence, fix and verification. Labelled as a sample on screen. */
function SampleFinding({ id }: { id: string }) {
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
      <ModeBanner />

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
