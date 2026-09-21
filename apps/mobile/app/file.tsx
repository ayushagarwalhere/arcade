import { useMemo } from "react";
import { ActivityIndicator, FlatList, ScrollView, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { baseName, formatBytes, languageOf } from "@/core/fs";
import { highlight, type Token } from "@/core/highlight";
import { readFile, useRepoData } from "@/github/repo-fs";
import { Empty, Mono } from "@/ui/atoms";
import { C, SYNTAX, alpha, white } from "@/ui/theme";

const LINE_HEIGHT = 20;

/** Read-only source view with the ADE's highlighter. Lines never wrap; the whole file pans sideways. */
export default function FileScreen() {
  // `line` comes from a finding: the viewer opens there and marks it.
  const { repo, path, line } = useLocalSearchParams<{ repo: string; path: string; line?: string }>();
  const flagged = Number(line) > 0 ? Number(line) : 0;
  const { data: file, error, loading } = useRepoData(() => readFile(repo, path), [repo, path]);

  const lines = useMemo(() => (file?.kind === "text" ? highlight(file.text, path) : []), [file, path]);
  const gutter = String(lines.length).length * 8 + 22;

  return (
    <View style={s.root}>
      <Stack.Screen options={{ title: baseName(path) }} />
      <Mono style={s.meta} numberOfLines={1} ellipsizeMode="head">
        {path}
        {flagged ? `:${flagged}` : ""}
        {file ?` · ${languageOf(path)} · ${formatBytes(file.size)}` : ""}
      </Mono>

      {loading ? (
        <ActivityIndicator color={C.muted} style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={s.pad}>
          <Empty text={error} />
        </View>
      ) : file?.kind !== "text" ? (
        <View style={s.pad}>
          <Empty text={file?.kind === "too-large" ? `This file is ${formatBytes(file.size)} — too large to show here.` : "This is a binary file, so there is nothing to show as text."} />
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: "100%" }}>
          <FlatList
            data={lines}
            keyExtractor={(_, i) => String(i)}
            initialNumToRender={60}
            windowSize={9}
            initialScrollIndex={flagged && flagged <= lines.length ? Math.max(0, flagged - 8) : undefined}
            getItemLayout={(_, i) => ({ length: LINE_HEIGHT, offset: LINE_HEIGHT * i + 8, index: i })}
            contentContainerStyle={{ paddingVertical: 8 }}
            renderItem={({ item, index }) => <Line tokens={item} no={index + 1} gutter={gutter} flagged={index + 1 === flagged} />}
          />
        </ScrollView>
      )}
    </View>
  );
}

function Line({ tokens, no, gutter, flagged }: { tokens: Token[]; no: number; gutter: number; flagged: boolean }) {
  return (
    <View style={[s.line, flagged && s.flagged]}>
      <Mono style={[s.no, { width: gutter }, flagged && { color: C.red300 }]}>{no}</Mono>
      <Mono style={s.code}>
        {tokens.map((t, i) => (
          <Mono key={i} style={{ fontSize: 12, color: SYNTAX[t.t] }}>
            {t.s}
          </Mono>
        ))}
      </Mono>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.editor },
  meta: { borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.base, paddingHorizontal: 16, paddingVertical: 9, fontSize: 11.5, color: C.muted },
  pad: { padding: 16 },
  line: { height: LINE_HEIGHT, flexDirection: "row" },
  flagged: { backgroundColor: alpha(C.red500, 0.14) },
  no: { paddingRight: 12, textAlign: "right", fontSize: 12, lineHeight: LINE_HEIGHT, color: white(0.25) },
  code: { paddingRight: 16, fontSize: 12, lineHeight: LINE_HEIGHT, color: SYNTAX.plain },
});
