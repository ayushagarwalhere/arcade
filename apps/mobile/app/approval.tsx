import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CircleCheck, Lock, ShieldCheck, TriangleAlert } from "lucide-react-native";
import { useRun } from "@/run/RunProvider";
import DiffView from "@/ui/DiffView";
import { Badge, Button, Mono, SectionLabel, T } from "@/ui/atoms";
import { C, F, alpha, white } from "@/ui/theme";

/**
 * The human-in-the-loop moment, sized for a phone: what the agent wants to do,
 * why, exactly what it touches, the evidence behind it — then approve or reject.
 */
export default function ApprovalScreen() {
  const run = useRun();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Held from open: deciding clears the pending approval while the sheet is still sliding away.
  const [approval] = useState(run.pendingApproval);

  if (!approval) {
    return (
      <View style={s.done}>
        <CircleCheck size={28} color={C.emerald400} />
        <T style={s.doneTitle}>Nothing is waiting for you</T>
        <T style={s.doneText}>When an agent needs to change code, ship a fix or do something destructive, the run pauses and asks here.</T>
        <Button label="Close" onPress={() => router.back()} style={{ alignSelf: "stretch", marginTop: 8 }} />
      </View>
    );
  }

  const destructive = approval.kind === "destructive";
  const ship = approval.kind === "ship";
  const accent = destructive ? C.red300 : C.violet300;
  const Icon = destructive ? TriangleAlert : ship ? ShieldCheck : Lock;
  const { finding } = run.state;
  const recommended = finding.mitigations.find((m) => m.recommended);

  const decide = (approve: boolean) => {
    (approve ? run.approve : run.reject)(approval.id);
    router.back();
  };

  return (
    <View style={s.root}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content}>
        <View style={[s.kicker, { backgroundColor: alpha(accent, 0.1) }]}>
          <Icon size={14} color={accent} />
          <T style={[s.kickerText, { color: accent }]}>{destructive ? "Destructive action — waiting for you" : "Approval required — run paused"}</T>
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
              {finding.id} verified fixed · original exploit returns {finding.verification.statusAfter} · {finding.verification.regressionPassed}/{finding.verification.regressionTotal} tests pass
            </T>
          </View>
        )}

        {!destructive && (
          <View>
            <SectionLabel>{ship ? "Diff to merge" : "Proposed diff"}</SectionLabel>
            <DiffView files={finding.remediation.files} commit={ship ? finding.remediation.commit : undefined} summary={finding.remediation.summary} />
          </View>
        )}
      </ScrollView>

      <View style={[s.actions, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Button label={destructive ? "Deny" : "Reject"} onPress={() => decide(false)} style={{ flex: 1 }} />
        <Button
          kind={destructive ? "danger" : "primary"}
          label={destructive ? "Allow once" : ship ? "Approve & merge" : "Approve"}
          onPress={() => decide(true)}
          style={{ flex: 1.4 }}
        />
      </View>
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
  actions: { flexDirection: "row", gap: 10, borderTopWidth: 1, borderTopColor: C.line, backgroundColor: C.chrome, paddingHorizontal: 16, paddingTop: 12 },
  done: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8, padding: 32, backgroundColor: C.editor },
  doneTitle: { fontFamily: F.semibold, fontSize: 17, color: C.white },
  doneText: { textAlign: "center", fontSize: 13.5, lineHeight: 21, color: C.muted },
});
