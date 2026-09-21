import { Pressable, StyleSheet, View } from "react-native";
import { FlaskConical } from "lucide-react-native";
import { useAssess } from "@/assess/AssessmentProvider";
import { T } from "./atoms";
import { C, F, alpha } from "./theme";

/** Shown on every screen while the scripted sample is loaded, so it is never mistaken for a real result. */
export default function ModeBanner() {
  const { mode, leaveSample } = useAssess();
  if (mode !== "sample") return null;
  return (
    <View style={s.root}>
      <FlaskConical size={14} color={C.amber200} />
      <T style={s.text}>Sample run — scripted demo data, not your code</T>
      <Pressable accessibilityRole="button" accessibilityLabel="Leave the sample run" onPress={leaveSample} hitSlop={8}>
        <T style={s.leave}>Leave</T>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: alpha(C.amber400, 0.25), backgroundColor: alpha(C.amber400, 0.08), paddingHorizontal: 16, paddingVertical: 8 },
  text: { flex: 1, fontSize: 12, color: C.amber200 },
  leave: { fontFamily: F.medium, fontSize: 12.5, color: C.white },
});
