import { useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useRun } from "@/run/RunProvider";
import ApprovalBanner from "@/ui/ApprovalBanner";
import Segmented from "@/ui/Segmented";
import TerminalLines from "@/ui/TerminalLines";
import TimelineList from "@/ui/TimelineList";
import { C } from "@/ui/theme";

const TABS = ["Timeline", "Terminal"] as const;

export default function ActivityScreen() {
  const { state } = useRun();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Timeline");
  const scroller = useRef<ScrollView>(null);

  return (
    <View style={s.root}>
      <Segmented options={TABS} value={tab} onChange={setTab} />
      {/* Both feeds are append-only, so new output keeps the view pinned to the end. */}
      <ScrollView
        key={tab}
        ref={scroller}
        style={[{ flex: 1 }, tab === "Terminal" && { backgroundColor: C.chrome }]}
        contentContainerStyle={s.content}
        onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })}
      >
        {tab === "Timeline" ? (
          <TimelineList events={state.timeline} empty="Nothing yet. Start the security loop from Overview and every agent action lands here." />
        ) : (
          <TerminalLines lines={state.terminal} />
        )}
      </ScrollView>
      <ApprovalBanner />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.editor },
  content: { padding: 16, paddingBottom: 28 },
});
