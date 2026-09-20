import { StyleSheet, View } from "react-native";
import type { TerminalLine } from "@/core/types";
import { Mono } from "./atoms";
import { C, F } from "./theme";

const AGENT: Record<TerminalLine["agent"], { label: string; color: string }> = {
  mapper: { label: "mapper", color: C.violet300 },
  attacker: { label: "attacker", color: C.red300 },
  defender: { label: "defender", color: C.emerald300 },
  remediator: { label: "remediator", color: C.amber300 },
  verifier: { label: "verifier", color: C.cyan300 },
  system: { label: "arcade", color: C.faint },
};

function Body({ l }: { l: TerminalLine }) {
  switch (l.kind) {
    case "cmd":
      return (
        <Mono style={s.body}>
          <Mono style={{ color: C.emerald400 }}>$</Mono> <Mono style={{ color: C.white }}>{l.text}</Mono>
        </Mono>
      );
    case "info":
      return (
        <Mono style={s.body}>
          <Mono style={{ color: C.violet400 }}>●</Mono> {l.text}
        </Mono>
      );
    case "sub":
      return <Mono style={[s.body, { paddingLeft: 12, color: C.muted }]}>└ {l.text}</Mono>;
    case "ok":
      return <Mono style={[s.body, { color: C.emerald400 }]}>✓ {l.text}</Mono>;
    case "err":
      return <Mono style={[s.body, { color: C.red400, fontFamily: F.monoBold }]}>✗ {l.text}</Mono>;
    case "warn":
      return <Mono style={[s.body, { color: C.amber300 }]}>! {l.text}</Mono>;
    default:
      return <Mono style={[s.body, { color: C.muted }]}>{l.text}</Mono>;
  }
}

/**
 * A phone is too narrow for the ADE's fixed agent gutter, so the agent name is
 * printed once, above the first line of each run of its output.
 */
export default function TerminalLines({ lines }: { lines: TerminalLine[] }) {
  return (
    <View>
      {lines.map((l, i) => {
        const a = AGENT[l.agent];
        const first = i === 0 || lines[i - 1].agent !== l.agent;
        return (
          <View key={i}>
            {first && <Mono style={[s.agent, { color: a.color }, i > 0 && { marginTop: 12 }]}>{a.label}</Mono>}
            <Body l={l} />
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  agent: { fontSize: 10.5, letterSpacing: 0.4, marginBottom: 2 },
  body: { fontSize: 12, lineHeight: 20, color: C.fg },
});
