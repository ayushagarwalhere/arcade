import { StyleSheet } from "react-native";
import { C, F, alpha, white } from "./theme";

/** Shared by the three faces of Overview: nothing loaded, the sample run, a real assessment. */
export const overviewStyles = StyleSheet.create({
  kicker: { fontSize: 11.5, color: C.muted },
  title: { marginTop: 4, fontFamily: F.semibold, fontSize: 24, lineHeight: 30, letterSpacing: -0.6, color: C.white },
  lede: { marginTop: 6, fontSize: 14, lineHeight: 21, color: C.muted },

  control: { marginTop: 16, gap: 12 },
  controlButtons: { flexDirection: "row", gap: 10 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progressText: { width: 36, textAlign: "right", fontSize: 11.5, color: C.muted },
  track: { marginTop: 8, height: 3, borderRadius: 2, backgroundColor: white(0.08), overflow: "hidden" },
  trackFill: { height: 3, borderRadius: 2 },

  recent: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 9 },
  agent: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  agentDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  agentBody: { flex: 1, minWidth: 0 },
  agentStep: { fontFamily: F.medium, fontSize: 14, color: C.white },
  agentTask: { marginTop: 1, fontSize: 12.5, lineHeight: 18, color: C.muted },

  finding: { borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.base, overflow: "hidden", paddingVertical: 14, paddingLeft: 18, paddingRight: 14 },
  severityBar: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  findingHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  findingTitle: { marginTop: 10, fontFamily: F.semibold, fontSize: 16, lineHeight: 22, color: C.white },
  findingTarget: { marginTop: 3, fontSize: 11.5, color: C.faint },
  findingSummary: { marginTop: 8, fontSize: 13.5, lineHeight: 21, color: alpha(C.fg, 0.75) },
  verified: { marginTop: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  verifiedText: { fontSize: 12.5, color: C.emerald300 },
  findingOpen: { marginTop: 12, flexDirection: "row", alignItems: "center", gap: 2 },
  findingOpenText: { fontFamily: F.medium, fontSize: 13, color: C.fg },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { borderRadius: 5, borderWidth: 1, borderColor: C.line, paddingHorizontal: 7, paddingVertical: 3, fontSize: 11.5, color: alpha(C.fg, 0.8) },
  footnote: { marginTop: 14, fontSize: 12, lineHeight: 18, color: C.faint },
});
