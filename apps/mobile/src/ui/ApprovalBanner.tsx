import { Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, Lock, TriangleAlert } from "lucide-react-native";
import { useRun } from "@/run/RunProvider";
import { T } from "./atoms";
import { C, F, alpha } from "./theme";

/** Docked above the tab bar while the run is paused at a gate. Opens the approval sheet. */
export default function ApprovalBanner() {
  const { pendingApproval } = useRun();
  const router = useRouter();
  if (!pendingApproval) return null;

  const destructive = pendingApproval.kind === "destructive";
  const accent = destructive ? C.red300 : C.violet300;
  const Icon = destructive ? TriangleAlert : Lock;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Approval required: ${pendingApproval.title}`}
      onPress={() => router.push("/approval")}
      style={({ pressed }) => [s.root, { borderTopColor: alpha(accent, 0.4), backgroundColor: destructive ? "#241416" : "#1d1926" }, pressed && { opacity: 0.85 }]}
    >
      <Icon size={16} color={accent} />
      <View style={s.body}>
        <T style={[s.kicker, { color: accent }]}>{destructive ? "Destructive action — waiting for you" : "Approval required — run paused"}</T>
        <T style={s.title} numberOfLines={1}>
          {pendingApproval.title}
        </T>
      </View>
      <T style={[s.review, { color: accent }]}>Review</T>
      <ChevronRight size={16} color={accent} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flexDirection: "row", alignItems: "center", gap: 10, borderTopWidth: 1, paddingHorizontal: 16, paddingVertical: 11 },
  body: { flex: 1, minWidth: 0 },
  kicker: { fontFamily: F.medium, fontSize: 11 },
  title: { marginTop: 1, fontFamily: F.medium, fontSize: 14, color: C.white },
  review: { fontFamily: F.medium, fontSize: 13 },
});
