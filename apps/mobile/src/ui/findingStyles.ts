import { StyleSheet } from "react-native";
import { C, F, alpha, white } from "./theme";

/** Shared by the sample finding screen and the live one, so both read as the same page. */
export const findingStyles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.editor },
  header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4 },
  badges: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  title: { marginTop: 10, fontFamily: F.semibold, fontSize: 21, lineHeight: 27, letterSpacing: -0.4, color: C.white },
  target: { marginTop: 4, fontSize: 12, color: C.muted },
  cwe: { marginTop: 2, fontSize: 11.5, color: C.faint },
  content: { padding: 16, paddingBottom: 32, gap: 14 },

  lead: { fontSize: 14.5, lineHeight: 23, color: white(0.78) },
  para: { fontSize: 13.5, lineHeight: 22, color: white(0.55) },
  subhead: { fontFamily: F.semibold, fontSize: 12.5, color: white(0.6) },

  facts: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  fact: { flexGrow: 1, flexBasis: "45%", borderRadius: 6, borderWidth: 1, borderColor: C.line, backgroundColor: C.raised, paddingHorizontal: 12, paddingVertical: 9 },
  factKey: { fontSize: 10, letterSpacing: 0.6, textTransform: "uppercase", color: white(0.35) },
  factValue: { marginTop: 3, fontSize: 13, color: white(0.8) },

  path: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  pathStep: { flexDirection: "row", alignItems: "center", gap: 6 },
  pathNode: { borderRadius: 5, borderWidth: 1, borderColor: "transparent", backgroundColor: white(0.05), paddingHorizontal: 10, paddingVertical: 6, fontSize: 12.5, color: white(0.7), overflow: "hidden" },
  pathNodeHot: { borderColor: alpha(C.red500, 0.25), backgroundColor: alpha(C.red500, 0.12), color: C.red200 },

  box: { gap: 6, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.raised, paddingHorizontal: 14, paddingVertical: 12 },
  boxGood: { borderColor: alpha(C.emerald500, 0.25), backgroundColor: alpha(C.emerald500, 0.05) },
  boxLabel: { fontFamily: F.semibold, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: white(0.4) },
  boxText: { fontSize: 13.5, lineHeight: 21, color: white(0.72) },
  mitigationTitle: { fontFamily: F.medium, fontSize: 14, lineHeight: 20, color: white(0.9) },
  mitigationDetail: { fontSize: 12.5, lineHeight: 19, color: white(0.55) },

  panel: { borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.base, overflow: "hidden" },
  panelHead: { borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: white(0.02), paddingHorizontal: 12, paddingVertical: 9, fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: white(0.4) },
  panelHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: white(0.02), paddingHorizontal: 12, paddingVertical: 9 },
  panelHeadText: { fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase", color: white(0.4) },
  panelBody: { padding: 12 },
  code: { fontSize: 12, lineHeight: 20 },
  step: { flexDirection: "row", gap: 10 },
  stepNo: { width: 20, height: 20, borderRadius: 10, backgroundColor: white(0.06), textAlign: "center", lineHeight: 20, fontSize: 11, color: white(0.6), overflow: "hidden" },
  stepText: { flex: 1, fontSize: 13.5, lineHeight: 20, color: white(0.7) },
  artifact: { fontSize: 11, lineHeight: 17, color: white(0.35) },

  codeLine: { flexDirection: "row" },
  lineNo: { width: 38, paddingRight: 10, textAlign: "right", fontSize: 12, lineHeight: 22, color: white(0.25) },
  lineText: { paddingRight: 16, fontSize: 12, lineHeight: 22, color: white(0.8) },

  test: { flexDirection: "row", gap: 8, paddingTop: 4 },
  testName: { fontSize: 13, lineHeight: 19, color: white(0.8) },
  testMeta: { fontSize: 11, color: white(0.35) },

  verdict: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 8, borderWidth: 1, borderColor: alpha(C.emerald500, 0.25), backgroundColor: alpha(C.emerald500, 0.06), paddingHorizontal: 14, paddingVertical: 14 },
  verdictTitle: { fontFamily: F.semibold, fontSize: 16, color: C.emerald300 },
  verdictText: { marginTop: 2, fontSize: 12.5, lineHeight: 19, color: white(0.55) },
  beforeAfter: { flexDirection: "row", alignItems: "center", gap: 12 },
  before: { fontSize: 15, color: C.red300, textDecorationLine: "line-through" },
  after: { fontFamily: F.monoBold, fontSize: 15, color: C.emerald300 },
});
