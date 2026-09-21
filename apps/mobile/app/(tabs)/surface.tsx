import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useAssess } from "@/assess/AssessmentProvider";
import { describeRun } from "@/assess/assess";
import { RULES_BY_ID } from "@/core/rules";
import { useRun } from "@/run/RunProvider";
import Screen from "@/ui/Screen";
import SurfaceGraph from "@/ui/SurfaceGraph";
import { Badge, Card, Empty, Mono, RISK, SURFACE_ICON, T } from "@/ui/atoms";
import { C, F, alpha, white } from "@/ui/theme";

export default function Surface() {
  const { state } = useRun();
  const { mode, assessment, findings } = useAssess();
  const router = useRouter();
  // undefined: nothing picked yet, so the node the path ends at is shown. null: deselected.
  const [picked, setPicked] = useState<string | null | undefined>(undefined);

  if (mode === "none") {
    return (
      <Screen>
        <Empty text="The attack-surface map is drawn from an assessment. Assess a repository from Overview to see its layers and where the findings sit." />
      </Screen>
    );
  }

  const live = mode === "live";
  const { surface, revealedNodes } = state;
  const pathEnd = surface.exploitPath[surface.exploitPath.length - 1];
  const selected = picked === undefined ? pathEnd : picked;
  const index = surface.nodes.findIndex((n) => n.id === selected);
  const sel = index >= 0 && index < revealedNodes ? surface.nodes[index] : undefined;
  const pathReady = revealedNodes >= surface.nodes.length && state.phase !== "idle" && state.phase !== "mapping";
  const pathLabels = surface.exploitPath.map((id) => surface.nodes.find((n) => n.id === id)?.label ?? id).join(" → ");

  // A real finding sits on the layer its rule names. The sample has one scripted finding, at the end of its path.
  const here = !sel ? [] : live ? findings.filter((f) => (f.ruleId ? RULES_BY_ID[f.ruleId]?.surface : undefined) === sel.kind) : sel.id === pathEnd && pathReady ? [state.finding] : [];
  const risk = sel ? RISK[sel.risk] : undefined;

  return (
    <Screen contentContainerStyle={{ gap: 14 }}>
      {assessment && <T style={s.what}>{describeRun(assessment.meta)}. The layers are the mapper's model of the repository; a layer is red when a finding's rule belongs to it.</T>}
      <View style={s.legend}>
        {(["safe", "attention", "vulnerable"] as const).map((r) => (
          <View key={r} style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: r === "safe" ? white(0.25) : r === "attention" ? C.amber400 : C.red500 }]} />
            <T style={s.legendText}>{live && r === "vulnerable" ? "has findings" : live && r === "safe" ? "no findings" : r}</T>
          </View>
        ))}
        <T style={[s.legendText, { marginLeft: "auto" }]}>
          {Math.min(revealedNodes, surface.nodes.length)}/{surface.nodes.length} nodes
        </T>
      </View>

      <SurfaceGraph state={state} selected={sel?.id ?? null} onSelect={setPicked} />
      {pathReady && surface.exploitPath.length > 1 && (live ? findings.length > 0 : true) && (
        <Badge tone="red" style={{ alignSelf: "flex-start" }}>
          {live ? "Path to the strongest finding highlighted" : "Proven exploit path highlighted (sample)"}
        </Badge>
      )}

      {sel && risk ? (
        <Card style={{ padding: 14 }}>
          <View style={s.detailHead}>
            <View style={[s.detailIcon, { backgroundColor: risk.bg }]}>
              {(() => {
                const Icon = SURFACE_ICON[sel.kind];
                return <Icon size={17} color={risk.fg} />;
              })()}
            </View>
            <View style={{ flex: 1 }}>
              <T style={s.detailTitle}>{sel.label}</T>
              <T style={s.detailKind}>{sel.kind}</T>
            </View>
            <Badge tone={risk.tone}>{live ? (sel.risk === "vulnerable" ? "Has findings" : sel.risk === "safe" ? "No findings" : risk.label) : risk.label}</Badge>
          </View>
          <T style={s.detailText}>{sel.detail}</T>

          {sel.id === pathEnd && pathReady && here.length > 0 && (
            <T style={s.pathNote}>
              {live
                ? `The highlighted path runs ${pathLabels}: the layers a request would cross to reach the strongest finding. It is a model, not a traced request.`
                : `The proven exploit path runs ${pathLabels}.`}
            </T>
          )}

          {here.slice(0, 6).map((f) => (
            <Pressable key={f.id} accessibilityRole="button" onPress={() => router.push(`/finding/${f.id}`)} style={({ pressed }) => [s.findingLink, pressed && { opacity: 0.75 }]}>
              <View style={{ flex: 1 }}>
                <T style={s.findingLinkText}>
                  {f.id} · {f.title}
                </T>
                {live && (
                  <Mono style={s.findingLinkPath} numberOfLines={1} ellipsizeMode="head">
                    {f.vulnerableCode.path}:{f.vulnerableCode.lines.find((l) => l.flagged)?.no ?? "?"}
                  </Mono>
                )}
              </View>
              <ChevronRight size={15} color={C.red200} />
            </Pressable>
          ))}
          {here.length > 6 && <T style={s.pathNote}>…and {here.length - 6} more on this layer. See Findings for the full list.</T>}
        </Card>
      ) : (
        revealedNodes > 0 && (
          <Card style={{ padding: 14 }}>
            <T style={{ fontSize: 13.5, color: white(0.45) }}>Tap a node to inspect it.</T>
          </Card>
        )
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  what: { fontSize: 12.5, lineHeight: 18, color: C.muted },
  legend: { flexDirection: "row", alignItems: "center", gap: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: white(0.45) },
  detailHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  detailIcon: { width: 36, height: 36, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  detailTitle: { fontFamily: F.semibold, fontSize: 15, color: C.white },
  detailKind: { fontSize: 11.5, textTransform: "capitalize", color: white(0.45) },
  detailText: { marginTop: 12, fontSize: 13.5, lineHeight: 21, color: white(0.65) },
  pathNote: { marginTop: 10, fontSize: 12.5, lineHeight: 19, color: white(0.5) },
  findingLink: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 6, borderWidth: 1, borderColor: alpha(C.red500, 0.25), backgroundColor: alpha(C.red500, 0.06), paddingHorizontal: 12, paddingVertical: 9 },
  findingLinkText: { fontSize: 12.5, lineHeight: 18.5, color: C.red200 },
  findingLinkPath: { marginTop: 1, fontSize: 11, color: alpha(C.red200, 0.6) },
});
