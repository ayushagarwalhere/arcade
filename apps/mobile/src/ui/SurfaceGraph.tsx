import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, StyleSheet, View } from "react-native";
import Svg, { G, Path, Text as SvgText } from "react-native-svg";
import type { ArcadeState, SurfaceNode } from "@/core/types";
import { RISK, SURFACE_ICON, T } from "./atoms";
import { C, F, white } from "./theme";

// The web preview draws the exploit path with static dashes: Animated passes native-only props through to the DOM.
const AnimatedPath = Platform.OS === "web" ? null : Animated.createAnimatedComponent(Path);

/*
 * The ADE lays the graph out left-to-right on a 5 × 3 grid. A phone is tall,
 * not wide, so the same grid is transposed: a node's `col` becomes its level
 * down the screen and its `row` becomes one of three lanes across it.
 */
const PAD = 10;
const LANE_GAP = 16;
const NODE_H = 68;
const LEVEL_GAP = 48;
const LANES = 3;
const LEVELS = 5;
const HEIGHT = PAD * 2 + LEVELS * NODE_H + (LEVELS - 1) * LEVEL_GAP;

export default function SurfaceGraph({ state, selected, onSelect }: { state: ArcadeState; selected: string | null; onSelect: (id: string) => void }) {
  const { surface, revealedNodes } = state;
  const [width, setWidth] = useState(0);

  const dash = useRef(new Animated.Value(18)).current;
  useEffect(() => {
    if (!AnimatedPath) return;
    const loop = Animated.loop(Animated.timing(dash, { toValue: 0, duration: 700, easing: Easing.linear, useNativeDriver: false }));
    loop.start();
    return () => loop.stop();
  }, [dash]);

  const nodeW = (width - PAD * 2 - LANE_GAP * (LANES - 1)) / LANES;
  const left = (n: SurfaceNode) => PAD + n.row * (nodeW + LANE_GAP);
  const top = (n: SurfaceNode) => PAD + n.col * (NODE_H + LEVEL_GAP);

  const index = new Map(surface.nodes.map((n, i) => [n.id, i]));
  const byId = new Map(surface.nodes.map((n) => [n.id, n]));
  const isRevealed = (id: string) => (index.get(id) ?? 99) < revealedNodes;
  const pathReady = surface.exploitPath.every(isRevealed) && state.phase !== "idle" && state.phase !== "mapping";

  return (
    <View style={s.root} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <>
          <Svg width={width} height={HEIGHT} style={StyleSheet.absoluteFill}>
            {surface.edges.map((e, i) => {
              const from = byId.get(e.from)!;
              const to = byId.get(e.to)!;
              if (!isRevealed(e.from) || !isRevealed(e.to)) return null;
              const vuln = !!e.vulnerable && pathReady;
              const color = vuln ? C.red500 : white(0.22);

              let d: string, head: string, lx: number, ly: number;
              let anchor: "start" | "middle" = "middle";
              if (from.col === to.col) {
                // Same level: a short hop between neighbouring lanes.
                const dir = to.row > from.row ? 1 : -1;
                const x1 = left(from) + (dir > 0 ? nodeW : 0);
                const x2 = left(to) + (dir > 0 ? 0 : nodeW) - dir * 2;
                const y = top(from) + NODE_H / 2;
                d = `M ${x1} ${y} L ${x2} ${y}`;
                head = `M ${x2 - dir * 6} ${y - 4} L ${x2} ${y} L ${x2 - dir * 6} ${y + 4} Z`;
                lx = (x1 + x2) / 2;
                ly = top(from) - 7;
              } else {
                const x1 = left(from) + nodeW / 2;
                const y1 = top(from) + NODE_H;
                const x2 = left(to) + nodeW / 2;
                const y2 = top(to) - 2;
                const my = (y1 + y2) / 2;
                d = `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`;
                head = `M ${x2 - 4} ${y2 - 6} L ${x2} ${y2} L ${x2 + 4} ${y2 - 6} Z`;
                const straight = x1 === x2;
                anchor = straight ? "start" : "middle";
                lx = straight ? x1 + 8 : (x1 + x2) / 2;
                ly = straight ? my + 3 : my - 6;
              }

              return (
                <G key={i}>
                  {vuln && AnimatedPath ? (
                    <AnimatedPath d={d} fill="none" stroke={color} strokeWidth={2} strokeDasharray="5 4" strokeDashoffset={dash} />
                  ) : (
                    <Path d={d} fill="none" stroke={color} strokeWidth={vuln ? 2 : 1.25} strokeDasharray={vuln ? "5 4" : undefined} />
                  )}
                  <Path d={head} fill={color} />
                  {e.label && (
                    <SvgText x={lx} y={ly} textAnchor={anchor} fontSize={9.5} fontFamily={F.sans} fill={vuln ? C.red300 : white(0.4)}>
                      {e.label}
                    </SvgText>
                  )}
                </G>
              );
            })}
          </Svg>

          {surface.nodes.map((n, i) => {
            if (i >= revealedNodes) return null;
            const Icon = SURFACE_ICON[n.kind];
            const risk = RISK[n.risk];
            const active = selected === n.id;
            return (
              <FadeIn key={n.id} style={{ position: "absolute", left: left(n), top: top(n), width: nodeW, height: NODE_H }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${n.label}, ${risk.label}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => onSelect(n.id)}
                  style={[s.node, { borderColor: active ? white(0.6) : risk.border }, active && s.nodeActive]}
                >
                  <View style={s.nodeHead}>
                    <View style={[s.chip, { backgroundColor: risk.bg }]}>
                      <Icon size={13} color={risk.fg} />
                    </View>
                    <T style={s.kind} numberOfLines={1}>
                      {n.kind}
                    </T>
                  </View>
                  <T style={s.label} numberOfLines={2}>
                    {n.label}
                  </T>
                </Pressable>
              </FadeIn>
            );
          })}

          {revealedNodes === 0 && (
            <View style={s.idle}>
              <T style={s.idleText}>Run the security loop to map the attack surface.</T>
            </View>
          )}
        </>
      )}
    </View>
  );
}

function FadeIn({ children, style }: { children: React.ReactNode; style: object }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [v]);
  return <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [5, 0] }) }] }]}>{children}</Animated.View>;
}

const s = StyleSheet.create({
  root: { height: HEIGHT, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.base, overflow: "hidden" },
  node: { flex: 1, justifyContent: "center", gap: 4, borderRadius: 8, borderWidth: 1, backgroundColor: C.raised, paddingHorizontal: 8 },
  nodeActive: { backgroundColor: C.hover },
  nodeHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  chip: { width: 22, height: 22, borderRadius: 5, alignItems: "center", justifyContent: "center" },
  kind: { flex: 1, fontSize: 10, textTransform: "capitalize", color: white(0.4) },
  label: { fontFamily: F.medium, fontSize: 12, lineHeight: 15, color: C.white },
  idle: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", padding: 32 },
  idleText: { textAlign: "center", fontSize: 13.5, lineHeight: 20, color: white(0.4) },
});
