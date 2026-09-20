import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type TextProps, type ViewStyle } from "react-native";
import {
  BadgeCheck,
  Boxes,
  CreditCard,
  Database,
  FileKey,
  Globe,
  KeyRound,
  Map as MapIcon,
  Server,
  ShieldAlert,
  ShieldCheck,
  Swords,
  User,
  Wrench,
  type LucideIcon,
} from "lucide-react-native";
import type { AgentKind, AgentStatus, FindingStatus, Severity, SurfaceNode } from "@/core/types";
import { C, F, alpha, white } from "./theme";

/* ------------------------------------------------------------------ colors */

export const SEVERITY: Record<Severity, { label: string; dot: string; text: string }> = {
  critical: { label: "Critical", dot: C.red500, text: C.red300 },
  high: { label: "High", dot: C.orange500, text: C.orange300 },
  medium: { label: "Medium", dot: C.amber400, text: C.amber200 },
  low: { label: "Low", dot: C.slate400, text: C.slate300 },
};

export type Tone = "neutral" | "red" | "green" | "amber" | "violet" | "orange";

export const FINDING_STATUS: Record<FindingStatus, { label: string; tone: Tone }> = {
  reproduced: { label: "Reproduced", tone: "red" },
  analyzing: { label: "Analyzing", tone: "violet" },
  "awaiting-approval": { label: "Awaiting approval", tone: "amber" },
  remediating: { label: "Remediating", tone: "violet" },
  verifying: { label: "Verifying", tone: "violet" },
  verified: { label: "Verified", tone: "green" },
  "verification-failed": { label: "Verification failed", tone: "red" },
};

const TONES: Record<Tone, { bg: string; text: string; ring: string }> = {
  neutral: { bg: white(0.06), text: white(0.65), ring: white(0.1) },
  red: { bg: alpha(C.red500, 0.12), text: C.red300, ring: alpha(C.red500, 0.25) },
  green: { bg: alpha(C.emerald500, 0.12), text: C.emerald300, ring: alpha(C.emerald500, 0.25) },
  amber: { bg: alpha(C.amber400, 0.12), text: C.amber200, ring: alpha(C.amber400, 0.25) },
  violet: { bg: alpha(C.violet500, 0.14), text: C.violet300, ring: alpha(C.violet500, 0.25) },
  orange: { bg: alpha(C.orange500, 0.12), text: C.orange300, ring: alpha(C.orange500, 0.25) },
};

export const toneText = (tone: Tone) => (tone === "neutral" ? C.white : TONES[tone].text);

/** Icon chip colours for a surface node's risk. */
export const RISK = {
  safe: { bg: white(0.06), fg: white(0.55), border: C.line, label: "Safe", tone: "green" },
  attention: { bg: alpha(C.amber400, 0.12), fg: C.amber200, border: alpha(C.amber400, 0.4), label: "Needs attention", tone: "amber" },
  vulnerable: { bg: alpha(C.red500, 0.15), fg: C.red300, border: alpha(C.red500, 0.6), label: "Vulnerable", tone: "red" },
} satisfies Record<SurfaceNode["risk"], { bg: string; fg: string; border: string; label: string; tone: Tone }>;

/* ------------------------------------------------------------------- icons */

export const AGENT_ICON: Record<AgentKind, LucideIcon> = {
  mapper: MapIcon,
  attacker: Swords,
  defender: ShieldCheck,
  remediator: Wrench,
  verifier: BadgeCheck,
};

export const SURFACE_ICON: Record<SurfaceNode["kind"], LucideIcon> = {
  user: User,
  browser: Globe,
  api: Server,
  auth: KeyRound,
  service: Boxes,
  database: Database,
  thirdparty: CreditCard,
  admin: ShieldAlert,
  secrets: FileKey,
};

/* -------------------------------------------------------------------- text */

/** Body text in Inter. Every Text in the app goes through this or Mono so the fonts stay consistent. */
export function T({ style, ...rest }: TextProps) {
  return <Text {...rest} style={[s.t, style]} />;
}

export function Mono({ style, ...rest }: TextProps) {
  return <Text {...rest} style={[s.mono, style]} />;
}

/* --------------------------------------------------------------- components */

export function Badge({ tone = "neutral", children, style }: { tone?: Tone; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = TONES[tone];
  return (
    <View style={[s.badge, { backgroundColor: t.bg, borderColor: t.ring }, style]}>
      <T style={[s.badgeText, { color: t.text }]}>{children}</T>
    </View>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const v = SEVERITY[severity];
  return (
    <View style={[s.badge, { backgroundColor: alpha(v.dot, 0.12), borderColor: alpha(v.dot, 0.3) }]}>
      <View style={[s.dot, { backgroundColor: v.dot }]} />
      <T style={[s.badgeText, { color: v.text, fontFamily: F.semibold }]}>{v.label}</T>
    </View>
  );
}

export function StatusBadge({ status }: { status: FindingStatus }) {
  const v = FINDING_STATUS[status];
  return <Badge tone={v.tone}>{v.label}</Badge>;
}

export function AgentDot({ status }: { status: AgentStatus }) {
  if (status === "running") return <ActivityIndicator size="small" color={C.amber400} style={s.spinner} />;
  const fill: Partial<Record<AgentStatus, string>> = {
    "awaiting-approval": C.violet400,
    done: C.emerald400,
    blocked: C.red400,
    queued: white(0.25),
  };
  const color = fill[status];
  return <View style={[s.agentDot, color ? { backgroundColor: color } : { borderWidth: 1, borderColor: white(0.25) }]} />;
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={s.sectionLabel}>
      <T style={s.sectionLabelText}>{children}</T>
      {right}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={s.empty}>
      <T style={s.emptyText}>{text}</T>
    </View>
  );
}

/** Key/value rows under a small heading — the ADE's "measured, not scored" stat lists. */
export function Stats({ title, rows }: { title: string; rows: [label: string, value: string | number, color?: string][] }) {
  return (
    <View>
      <SectionLabel>{title}</SectionLabel>
      <View style={s.statsBox}>
        {rows.map(([k, v, color], i) => (
          <View key={k} style={[s.statsRow, i > 0 && s.hairlineTop]}>
            <T style={s.statsKey}>{k}</T>
            <Mono style={{ color: color ?? C.white, fontSize: 12.5 }}>{v}</Mono>
          </View>
        ))}
      </View>
    </View>
  );
}

type ButtonKind = "primary" | "secondary" | "danger" | "ghost";

export function Button({
  label,
  onPress,
  kind = "secondary",
  icon: Icon,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: LucideIcon;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = kind === "primary" || kind === "danger" ? "#000000" : kind === "ghost" ? C.muted : C.fg;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.button, BUTTON[kind], pressed && { opacity: 0.75 }, disabled && { opacity: 0.4 }, style]}
    >
      {Icon && <Icon size={15} color={fg} />}
      <T style={[s.buttonText, { color: fg }]}>{label}</T>
    </Pressable>
  );
}

const BUTTON: Record<ButtonKind, ViewStyle> = {
  primary: { backgroundColor: C.fg },
  danger: { backgroundColor: C.red400 },
  secondary: { borderWidth: 1, borderColor: C.line, backgroundColor: C.raised },
  ghost: {},
};

const s = StyleSheet.create({
  t: { fontFamily: F.sans, color: C.fg, fontSize: 14, letterSpacing: -0.1 },
  mono: { fontFamily: F.mono, color: C.fg, fontSize: 12 },
  badge: { flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 6, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2.5 },
  badgeText: { fontFamily: F.medium, fontSize: 11 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  spinner: { width: 14, height: 14, transform: [{ scale: 0.7 }] },
  agentDot: { width: 10, height: 10, borderRadius: 5 },
  sectionLabel: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 8 },
  sectionLabelText: { fontFamily: F.semibold, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase", color: C.muted },
  card: { borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.base, overflow: "hidden" },
  empty: { borderRadius: 8, borderWidth: 1, borderStyle: "dashed", borderColor: C.line, backgroundColor: C.raised, padding: 28 },
  emptyText: { textAlign: "center", fontSize: 13, lineHeight: 20, color: white(0.5) },
  statsBox: { borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.base, paddingHorizontal: 14 },
  statsRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 16, paddingVertical: 10 },
  statsKey: { fontSize: 13.5, color: alpha(C.fg, 0.75) },
  hairlineTop: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  button: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 8, paddingHorizontal: 16 },
  buttonText: { fontFamily: F.medium, fontSize: 14 },
});
