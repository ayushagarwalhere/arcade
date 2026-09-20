import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { T } from "./atoms";
import { C, F } from "./theme";

/** Underlined tab strip, the same control the ADE uses inside a finding. Scrolls when it outgrows the screen. */
export default function Segmented<V extends string>({ options, value, onChange }: { options: readonly V[]; value: V; onChange: (v: V) => void }) {
  return (
    <View style={s.root}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip}>
        {options.map((o) => {
          const active = o === value;
          return (
            <Pressable key={o} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(o)} style={[s.tab, active && s.tabActive]}>
              <T style={[s.label, active && s.labelActive]}>{o}</T>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { borderBottomWidth: 1, borderBottomColor: C.line },
  strip: { gap: 20, paddingHorizontal: 16 },
  tab: { paddingTop: 12, paddingBottom: 10, borderBottomWidth: 2, borderBottomColor: "transparent", marginBottom: -1 },
  tabActive: { borderBottomColor: C.fg },
  label: { fontSize: 13.5, color: C.muted },
  labelActive: { fontFamily: F.medium, color: C.white },
});
