import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View, type ScrollViewProps } from "react-native";
import ApprovalBanner from "./ApprovalBanner";
import ModeBanner from "./ModeBanner";
import { C } from "./theme";

/**
 * Page chrome shared by every screen: scrolling content with the approval
 * banner docked underneath, so a paused run is visible wherever you are.
 */
export default function Screen({ children, scroll = true, ...rest }: { children: ReactNode; scroll?: boolean } & ScrollViewProps) {
  return (
    <View style={s.root}>
      <ModeBanner />
      {scroll ? (
        <ScrollView {...rest} style={s.fill} contentContainerStyle={[s.content, rest.contentContainerStyle]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={s.fill}>{children}</View>
      )}
      <ApprovalBanner />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.editor },
  fill: { flex: 1 },
  content: { padding: 16, paddingBottom: 32, gap: 24 },
});
