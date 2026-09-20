import { StyleSheet, View } from "react-native";
import { BadgeCheck, FileSearch, FlaskConical, Info, Lock, Map as MapIcon, ShieldCheck, Swords, UserCheck, Wrench, type LucideIcon } from "lucide-react-native";
import type { TimelineEvent, TimelineKind } from "@/core/types";
import { Empty, Mono, T } from "./atoms";
import { C, F, alpha, white } from "./theme";

const KIND: Record<TimelineKind, { Icon: LucideIcon; fg: string; bg: string }> = {
  map: { Icon: MapIcon, fg: C.violet300, bg: alpha(C.violet500, 0.12) },
  attack: { Icon: Swords, fg: C.red300, bg: alpha(C.red500, 0.12) },
  evidence: { Icon: FileSearch, fg: C.red300, bg: alpha(C.red500, 0.12) },
  defend: { Icon: ShieldCheck, fg: C.emerald300, bg: alpha(C.emerald500, 0.12) },
  approve: { Icon: Lock, fg: C.violet300, bg: alpha(C.violet500, 0.12) },
  remediate: { Icon: Wrench, fg: C.amber300, bg: alpha(C.amber400, 0.12) },
  test: { Icon: FlaskConical, fg: C.cyan300, bg: alpha(C.cyan500, 0.12) },
  verify: { Icon: BadgeCheck, fg: C.emerald300, bg: alpha(C.emerald500, 0.12) },
  human: { Icon: UserCheck, fg: C.white, bg: white(0.1) },
  info: { Icon: Info, fg: white(0.6), bg: white(0.06) },
};

export default function TimelineList({ events, empty = "Nothing yet." }: { events: TimelineEvent[]; empty?: string }) {
  if (!events.length) return <Empty text={empty} />;
  return (
    <View>
      {events.map((e, i) => {
        const k = KIND[e.kind];
        const last = i === events.length - 1;
        return (
          <View key={i} style={s.row}>
            <View style={s.rail}>
              <View style={[s.icon, { backgroundColor: k.bg }]}>
                <k.Icon size={16} color={k.fg} />
              </View>
              {!last && <View style={s.connector} />}
            </View>
            <View style={s.body}>
              <View style={s.head}>
                <Mono style={s.time}>{e.time}</Mono>
                <T style={s.actor}>{e.actor}</T>
              </View>
              <T style={s.text}>{e.text}</T>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", gap: 14 },
  rail: { alignItems: "center" },
  icon: { width: 32, height: 32, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  connector: { flex: 1, width: 1, backgroundColor: C.line },
  body: { flex: 1, minWidth: 0, paddingTop: 2, paddingBottom: 18 },
  head: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  time: { fontSize: 11, color: white(0.4) },
  actor: { fontFamily: F.medium, fontSize: 12.5, color: white(0.85) },
  text: { marginTop: 2, fontSize: 13.5, lineHeight: 20, color: white(0.6) },
});
