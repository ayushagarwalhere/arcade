import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CircleCheck, CircleDot, GitPullRequest, Lock, ShieldCheck, TriangleAlert } from "lucide-react-native";
import { parseGate, useAssess } from "@/assess/AssessmentProvider";
import { Notice } from "@/assess/LiveFinding";
import { issueText } from "@/assess/fix";
import type { Approval } from "@/core/types";
import { useRun } from "@/run/RunProvider";
import DiffView, { DiffFile } from "@/ui/DiffView";
import ModeBanner from "@/ui/ModeBanner";
import { Badge, Button, Mono, SectionLabel, Stats, T } from "@/ui/atoms";
import { C, F, alpha, white } from "@/ui/theme";

/**
 * The human-in-the-loop moment, sized for a phone: what is about to happen,
 * why, exactly what it touches — then approve or reject. For a real assessment
 * this is the confirmation in front of every write to GitHub, so it names the
 * repository and the branch; nothing happens until Approve is pressed.
 */
export default function ApprovalScreen() {
  const run = useRun();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  // Held from open: deciding clears the pending approval while the sheet is still sliding away.
  const [approval] = useState(() => (id ? run.state.approvals.find((a) => a.id === id && a.status === "pending") : undefined) ?? run.pendingApproval);

  if (!approval) {
    return (
      <View style={s.done}>
        <CircleCheck size={28} color={C.emerald400} />
        <T style={s.doneTitle}>Nothing is waiting for you</T>
        <T style={s.doneText}>Whenever something is about to change code or write to GitHub, it stops and asks here first.</T>
        <Button label="Close" onPress={() => router.back()} style={{ alignSelf: "stretch", marginTop: 8 }} />
      </View>
    );
  }
  return parseGate(approval.id) ? <LiveApproval approval={approval} /> : <SampleApproval approval={approval} />;
}

/* ------------------------------------------------------- real assessment */

function LiveApproval({ approval }: { approval: Approval }) {
  const { assessment, findings, fixes, issues, decide } = useAssess();
  const router = useRouter();
  const gate = parseGate(approval.id)!;
  const finding = findings.find((f) => f.id === gate.findingId);
  const fix = fixes[gate.findingId];
  const prepared = fix && "fix" in fix ? fix : null;
  const recommended = finding?.mitigations.find((m) => m.recommended);
  const issue = issues[gate.findingId];

  const close = (yes: boolean) => {
    decide(approval.id, yes);
    router.back();
  };

  const writes = gate.action !== "fix";
  const Icon = gate.action === "ship" ? GitPullRequest : gate.action === "issue" ? CircleDot : Lock;
  const approveLabel = gate.action === "fix" ? "Approve — prepare the fix" : gate.action === "ship" ? "Commit & open PR" : "Open the issue";

  return (
    <View style={s.root}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content}>
        <View style={[s.kicker, { backgroundColor: alpha(C.violet300, 0.1) }]}>
          <Icon size={14} color={C.violet300} />
          <T style={[s.kickerText, { color: C.violet300 }]}>{writes ? "This writes to GitHub — waiting for you" : "Approval required — nothing has been changed"}</T>
        </View>

        <View>
          <T style={s.title}>{approval.title}</T>
          <T style={s.reason}>{approval.reason}</T>
        </View>

        {gate.action === "ship" && prepared && assessment ? (
          <Stats
            title="Where it goes"
            rows={[
              ["Repository", assessment.meta.repo],
              ["New branch", prepared.fix.branch],
              ["Pull request into", prepared.base ?? "the default branch"],
              ["Written to the default branch", "nothing", C.emerald300],
            ]}
          />
        ) : (
          <View>
            <SectionLabel>What it touches</SectionLabel>
            <Mono style={s.target}>{approval.target}</Mono>
          </View>
        )}

        {gate.action === "fix" && recommended && (
          <View>
            <SectionLabel>Mitigation, from the rule</SectionLabel>
            <View style={s.mitigation}>
              <T style={s.mitigationTitle}>{recommended.title}</T>
              <View style={s.badges}>
                <Badge tone="green">Recommended</Badge>
                <Badge>{recommended.effort[0].toUpperCase() + recommended.effort.slice(1)} effort</Badge>
              </View>
              <T style={s.mitigationDetail}>{recommended.detail}</T>
            </View>
          </View>
        )}

        {gate.action === "ship" && prepared && (
          <>
            <View style={s.verified}>
              <ShieldCheck size={16} color={C.emerald300} style={{ marginTop: 1 }} />
              <T style={s.verifiedText}>{prepared.fix.verdict.summary} That is the only check: no tests were run and nothing was executed.</T>
            </View>
            {prepared.fix.caveat && <Notice tone="amber" text={prepared.fix.caveat} />}
            <View>
              <SectionLabel>The change that will be committed</SectionLabel>
              <DiffFile file={prepared.fix.file} />
            </View>
          </>
        )}

        {gate.action === "issue" && finding && assessment && (
          <>
            {issue?.stage === "confirming" && issue.isPrivate === false && <Notice tone="amber" text={`${assessment.meta.repo} is public. Everyone will be able to read this issue.`} />}
            <View>
              <SectionLabel>The issue that will be opened</SectionLabel>
              <View style={s.preview}>
                <T style={s.previewTitle}>{issueText(finding, assessment.meta).title}</T>
                <Mono style={s.previewBody}>{issueText(finding, assessment.meta).body}</Mono>
              </View>
            </View>
          </>
        )}
      </ScrollView>

      <Actions reject="Not now" approve={approveLabel} onDecide={close} />
    </View>
  );
}

/* ------------------------------------------------------------ sample run */

function SampleApproval({ approval }: { approval: Approval }) {
  const run = useRun();
  const { decide } = useAssess();
  const router = useRouter();

  const destructive = approval.kind === "destructive";
  const ship = approval.kind === "ship";
  const accent = destructive ? C.red300 : C.violet300;
  const Icon = destructive ? TriangleAlert : ship ? ShieldCheck : Lock;
  const { finding } = run.state;
  const recommended = finding.mitigations.find((m) => m.recommended);

  const close = (yes: boolean) => {
    decide(approval.id, yes);
    router.back();
  };

  return (
    <View style={s.root}>
      <ModeBanner />
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content}>
        <View style={[s.kicker, { backgroundColor: alpha(accent, 0.1) }]}>
          <Icon size={14} color={accent} />
          <T style={[s.kickerText, { color: accent }]}>{destructive ? "Destructive action — waiting for you" : "Approval required — sample run paused"}</T>
        </View>

        <View>
          <T style={s.title}>{approval.title}</T>
          <T style={s.reason}>{approval.reason}</T>
        </View>

        <View>
          <SectionLabel>What it touches</SectionLabel>
          <Mono style={s.target}>{approval.target}</Mono>
        </View>

        {approval.kind === "code" && recommended && (
          <View>
            <SectionLabel>Proposed mitigation</SectionLabel>
            <View style={s.mitigation}>
              <T style={s.mitigationTitle}>{recommended.title}</T>
              <View style={s.badges}>
                <Badge tone="green">Recommended</Badge>
                <Badge>{recommended.effort[0].toUpperCase() + recommended.effort.slice(1)} effort</Badge>
              </View>
              <T style={s.mitigationDetail}>{recommended.detail}</T>
            </View>
          </View>
        )}

        {ship && (
          <View style={s.verified}>
            <ShieldCheck size={16} color={C.emerald300} style={{ marginTop: 1 }} />
            <T style={s.verifiedText}>
              {finding.id} verified fixed · original exploit returns {finding.verification.statusAfter} · {finding.verification.regressionPassed}/{finding.verification.regressionTotal} tests pass (scripted)
            </T>
          </View>
        )}

        {!destructive && (
          <View>
            <SectionLabel>{ship ? "Diff to merge (sample)" : "Proposed diff (sample)"}</SectionLabel>
            <DiffView files={finding.remediation.files} commit={ship ? finding.remediation.commit : undefined} summary={finding.remediation.summary} />
          </View>
        )}
      </ScrollView>

      <Actions reject={destructive ? "Deny" : "Reject"} approve={destructive ? "Allow once" : ship ? "Approve & merge (sample)" : "Approve"} danger={destructive} onDecide={close} />
    </View>
  );
}

function Actions({ reject, approve, danger, onDecide }: { reject: string; approve: string; danger?: boolean; onDecide: (yes: boolean) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.actions, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <Button label={reject} onPress={() => onDecide(false)} style={{ flex: 1 }} />
      <Button kind={danger ? "danger" : "primary"} label={approve} onPress={() => onDecide(true)} style={{ flex: 1.4 }} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.editor },
  content: { padding: 16, paddingBottom: 28, gap: 22 },
  kicker: { flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  kickerText: { fontFamily: F.medium, fontSize: 12 },
  title: { fontFamily: F.semibold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4, color: C.white },
  reason: { marginTop: 8, fontSize: 14.5, lineHeight: 22, color: C.muted },
  target: { borderRadius: 6, borderWidth: 1, borderColor: C.line, backgroundColor: C.base, paddingHorizontal: 12, paddingVertical: 10, fontSize: 12, lineHeight: 19, color: alpha(C.fg, 0.85) },
  mitigation: { gap: 8, borderRadius: 8, borderWidth: 1, borderColor: alpha(C.emerald500, 0.25), backgroundColor: alpha(C.emerald500, 0.05), paddingHorizontal: 14, paddingVertical: 12 },
  mitigationTitle: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: white(0.9) },
  mitigationDetail: { fontSize: 12.5, lineHeight: 19, color: white(0.55) },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  verified: { flexDirection: "row", gap: 8, borderRadius: 8, borderWidth: 1, borderColor: alpha(C.emerald500, 0.25), backgroundColor: alpha(C.emerald500, 0.06), paddingHorizontal: 14, paddingVertical: 12 },
  verifiedText: { flex: 1, fontSize: 13, lineHeight: 20, color: C.emerald300 },
  preview: { gap: 10, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.base, paddingHorizontal: 12, paddingVertical: 12 },
  previewTitle: { fontFamily: F.semibold, fontSize: 14.5, lineHeight: 21, color: C.white },
  previewBody: { fontSize: 11.5, lineHeight: 18, color: alpha(C.fg, 0.75) },
  actions: { flexDirection: "row", gap: 10, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.chrome, paddingHorizontal: 16, paddingTop: 12 },
  done: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 32, backgroundColor: C.editor },
  doneTitle: { fontFamily: F.semibold, fontSize: 17, color: C.white },
  doneText: { textAlign: "center", fontSize: 13.5, lineHeight: 21, color: C.muted },
});
