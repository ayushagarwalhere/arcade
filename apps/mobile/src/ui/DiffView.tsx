import { ScrollView, StyleSheet, View } from "react-native";
import { FileDiff, FilePlus } from "lucide-react-native";
import type { DiffLine, RemediationFile } from "@/core/types";
import { Empty, Mono, T } from "./atoms";
import { C, F, alpha, white } from "./theme";

const LINE_BG: Partial<Record<DiffLine["kind"], string>> = { add: alpha(C.emerald500, 0.1), del: alpha(C.red500, 0.1) };
const LINE_FG: Record<DiffLine["kind"], string> = { hunk: alpha(C.violet300, 0.8), add: C.emerald100, del: C.red200, context: white(0.8) };
const SIGN: Partial<Record<DiffLine["kind"], string>> = { add: "+", del: "−" };

export function DiffFile({ file }: { file: RemediationFile }) {
  const added = file.status === "A";
  return (
    <View style={s.file}>
      <View style={s.fileHead}>
        {added ? <FilePlus size={15} color={C.emerald400} /> : <FileDiff size={15} color={C.amber300} />}
        <Mono style={s.path} numberOfLines={1} ellipsizeMode="head">
          {file.path}
        </Mono>
        <T style={[s.count, { color: C.emerald400 }]}>+{file.additions}</T>
        <T style={[s.count, { color: C.red400 }]}>−{file.deletions}</T>
      </View>
      {/* Code never wraps: long lines scroll sideways, as they do in the ADE. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={s.lines}>
          {file.diff.map((l, i) => (
            <View key={i} style={[s.line, { backgroundColor: LINE_BG[l.kind] }]}>
              <Mono style={s.no}>{l.oldNo ?? ""}</Mono>
              <Mono style={s.no}>{l.newNo ?? ""}</Mono>
              <Mono style={[s.sign, { color: l.kind === "add" ? C.emerald400 : l.kind === "del" ? C.red400 : white(0.2) }]}>{SIGN[l.kind] ?? " "}</Mono>
              <Mono style={[s.code, { color: LINE_FG[l.kind] }]}>{l.text}</Mono>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

export default function DiffView({ files, commit, summary }: { files: RemediationFile[]; commit?: string; summary?: string }) {
  if (!files.length) return <Empty text="No changes yet. A diff appears after the fix is approved." />;
  const add = files.reduce((n, f) => n + f.additions, 0);
  const del = files.reduce((n, f) => n + f.deletions, 0);
  return (
    <View style={{ gap: 12 }}>
      {(commit || summary) && (
        <View style={s.summary}>
          {summary && <T style={s.summaryText}>{summary}</T>}
          <View style={s.summaryMeta}>
            {commit && <Mono style={s.commit}>{commit}</Mono>}
            <T style={s.totals}>
              {files.length} files · <T style={[s.totals, { color: C.emerald400 }]}>+{add}</T> <T style={[s.totals, { color: C.red400 }]}>−{del}</T>
            </T>
          </View>
        </View>
      )}
      {files.map((f) => (
        <DiffFile key={f.path} file={f} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  file: { borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.base, overflow: "hidden" },
  fileHead: { flexDirection: "row", alignItems: "center", gap: 8, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: white(0.02), paddingHorizontal: 12, paddingVertical: 10 },
  path: { flex: 1, fontSize: 12, color: white(0.85) },
  count: { fontSize: 11, fontFamily: F.medium },
  lines: { paddingVertical: 4, minWidth: "100%" },
  line: { flexDirection: "row" },
  no: { width: 30, paddingRight: 6, textAlign: "right", fontSize: 11.5, lineHeight: 21, color: white(0.25) },
  sign: { width: 16, textAlign: "center", fontSize: 12, lineHeight: 21 },
  code: { paddingRight: 16, fontSize: 12, lineHeight: 21 },
  summary: { gap: 8, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.base, paddingHorizontal: 14, paddingVertical: 12 },
  summaryText: { fontSize: 13.5, lineHeight: 20, color: white(0.8) },
  summaryMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  commit: { borderRadius: 4, backgroundColor: white(0.06), paddingHorizontal: 8, paddingVertical: 2, fontSize: 11, color: white(0.7), overflow: "hidden" },
  totals: { fontSize: 11.5, color: white(0.45) },
});
