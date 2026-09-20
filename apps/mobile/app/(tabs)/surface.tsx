import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useRun } from "@/run/RunProvider";
import Screen from "@/ui/Screen";
import SurfaceGraph from "@/ui/SurfaceGraph";
import { Badge, Card, RISK, SURFACE_ICON, T } from "@/ui/atoms";
import { C, F, alpha, white } from "@/ui/theme";

export default function Surface() {
  const { state } = useRun();
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>("admin");

  const { surface, revealedNodes } = state;
  const index = surface.nodes.findIndex((n) => n.id === selected);
  const sel = index >= 0 && index < revealedNodes ? surface.nodes[index] : undefined;
  const pathReady = revealedNodes >= surface.nodes.length && state.phase !== "idle" && state.phase !== "mapping";

  return (
    <Screen contentContainerStyle={{ gap: 14 }}>
      <View style={s.legend}>
        {(["safe", "attention", "vulnerable"] as const).map((r) => (
          <View key={r} style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: r === "safe" ? white(0.25) : r === "attention" ? C.amber400 : C.red500 }]} />
            <T style={s.legendText}>{r}</T>
          </View>
        ))}
        <T style={[s.legendText, { marginLeft: "auto" }]}>
          {Math.min(revealedNodes, surface.nodes.length)}/{surface.nodes.length} nodes
        </T>
      </View>

      <SurfaceGraph state={state} selected={sel?.id ?? null} onSelect={setSelected} />
      {pathReady && <Badge tone="red" style={{ alignSelf: "flex-start" }}>Proven exploit path highlighted</Badge>}

      {sel ? (
        <Card style={{ padding: 14 }}>
          <View style={s.detailHead}>
            <View style={[s.detailIcon, { backgroundColor: RISK[sel.risk].bg }]}>
              {(() => {
                const Icon = SURFACE_ICON[sel.kind];
                return <Icon size={17} color={RISK[sel.risk].fg} />;
              })()}
            </View>
            <View style={{ flex: 1 }}>
              <T style={s.detailTitle}>{sel.label}</T>
              <T style={s.detailKind}>{sel.kind}</T>
            </View>
            <Badge tone={RISK[sel.risk].tone}>{RISK[sel.risk].label}</Badge>
          </View>
          <T style={s.detailText}>{sel.detail}</T>
          {sel.id === "admin" && (
            <Pressable accessibilityRole="button" onPress={() => router.push(`/finding/${state.finding.id}`)} style={({ pressed }) => [s.findingLink, pressed && { opacity: 0.75 }]}>
              <T style={s.findingLinkText}>Finding {state.finding.id} lives here. The proven exploit path runs User → Browser → API → Admin Export → PostgreSQL.</T>
              <ChevronRight size={15} color={C.red200} />
            </Pressable>
          )}
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
  legend: { flexDirection: "row", alignItems: "center", gap: 14 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, color: white(0.45) },
  detailHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  detailIcon: { width: 36, height: 36, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  detailTitle: { fontFamily: F.semibold, fontSize: 15, color: C.white },
  detailKind: { fontSize: 11.5, textTransform: "capitalize", color: white(0.45) },
  detailText: { marginTop: 12, fontSize: 13.5, lineHeight: 21, color: white(0.65) },
  findingLink: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 6, borderWidth: 1, borderColor: alpha(C.red500, 0.25), backgroundColor: alpha(C.red500, 0.06), paddingHorizontal: 12, paddingVertical: 9 },
  findingLinkText: { flex: 1, fontSize: 12.5, lineHeight: 18.5, color: C.red200 },
});
