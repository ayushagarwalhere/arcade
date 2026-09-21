import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useAssess } from "@/assess/AssessmentProvider";
import { describeRun } from "@/assess/assess";
import { statusOf } from "@/assess/status";
import { useStatusContext } from "@/assess/useStatus";
import type { Severity } from "@/core/types";
import Screen from "@/ui/Screen";
import { Badge, Empty, Mono, SEVERITY, SeverityBadge, T } from "@/ui/atoms";
import { C, F, alpha } from "@/ui/theme";

const ORDER: Severity[] = ["critical", "high", "medium", "low"];

export default function Findings() {
  const { mode, assessment, findings: all } = useAssess();
  const ctx = useStatusContext();
  const router = useRouter();
  const findings = [...all].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));
  const counts = ORDER.map((sev) => [sev, findings.filter((f) => f.severity === sev).length] as const).filter(([, n]) => n > 0);

  if (mode === "none") {
    return (
      <Screen>
        <Empty text="No findings, because nothing has been assessed yet. Pick a repository from Overview and Arcade will analyse it here." />
      </Screen>
    );
  }

  return (
    <Screen contentContainerStyle={{ gap: 12 }}>
      {assessment && (
        <T style={s.what}>
          {describeRun(assessment.meta)} · {assessment.meta.filesAnalysed} files · nothing executed
        </T>
      )}
      <View style={s.summary}>
        {counts.map(([sev, n]) => (
          <View key={sev} style={s.count}>
            <View style={[s.countDot, { backgroundColor: SEVERITY[sev].dot }]} />
            <T style={s.countText}>
              {n} {SEVERITY[sev].label.toLowerCase()}
            </T>
          </View>
        ))}
      </View>

      {findings.length === 0 && assessment && <Empty text={`None of the ${assessment.meta.rules} static rules matched. That does not show the repository is secure — only that none of the current rules fired on the files that were read.`} />}

      {findings.map((f) => {
        const status = statusOf(f, ctx);
        const line = f.vulnerableCode.lines.find((l) => l.flagged)?.no;
        return (
          <Pressable
            key={f.id}
            accessibilityRole="button"
            accessibilityLabel={`${f.id}, ${f.severity}: ${f.title}`}
            onPress={() => router.push(`/finding/${f.id}`)}
            style={({ pressed }) => [s.row, pressed && { backgroundColor: C.raised }]}
          >
            <View style={[s.bar, { backgroundColor: SEVERITY[f.severity].dot }]} />
            <View style={s.body}>
              <View style={s.head}>
                <Mono style={{ color: C.muted }}>{f.id}</Mono>
                <SeverityBadge severity={f.severity} />
                <Badge tone={status.tone}>{status.label}</Badge>
              </View>
              <T style={s.title}>{f.title}</T>
              <Mono style={s.target} numberOfLines={1} ellipsizeMode="head">
                {mode === "live" ? `${f.vulnerableCode.path}${line ? `:${line}` : ""}` : f.target}
              </Mono>
              <T style={s.text} numberOfLines={2}>
                {f.summary}
              </T>
            </View>
            <ChevronRight size={16} color={C.faint} />
          </Pressable>
        );
      })}
    </Screen>
  );
}

const s = StyleSheet.create({
  what: { fontSize: 12.5, lineHeight: 18, color: C.muted },
  summary: { flexDirection: "row", flexWrap: "wrap", gap: 14, paddingBottom: 4 },
  count: { flexDirection: "row", alignItems: "center", gap: 6 },
  countDot: { width: 7, height: 7, borderRadius: 4 },
  countText: { fontSize: 12.5, color: C.muted },
  row: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.base, overflow: "hidden", paddingRight: 10 },
  bar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  body: { flex: 1, minWidth: 0, paddingVertical: 13, paddingLeft: 17 },
  head: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  title: { marginTop: 8, fontFamily: F.semibold, fontSize: 15, lineHeight: 21, color: C.white },
  target: { marginTop: 2, fontSize: 11.5, color: C.faint },
  text: { marginTop: 6, fontSize: 13, lineHeight: 19.5, color: alpha(C.fg, 0.7) },
});
