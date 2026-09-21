import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight, FileText, Folder, ScanSearch } from "lucide-react-native";
import { useAssess } from "@/assess/AssessmentProvider";
import { loadAssessment, storedAssessments, type StoredIndexEntry } from "@/assess/storage";
import { baseName } from "@/core/fs";
import { listDir, useRepoData } from "@/github/repo-fs";
import { Button, Empty, Mono, T } from "@/ui/atoms";
import { C } from "@/ui/theme";

/** One folder of a repository. Each folder is its own screen, so the back gesture walks up the tree. */
export default function RepoDir() {
  const { repo, dir = "" } = useLocalSearchParams<{ repo: string; dir?: string }>();
  const router = useRouter();
  const { data: entries, error, loading } = useRepoData(() => listDir(repo, dir), [repo, dir]);

  return (
    <View style={s.root}>
      <Stack.Screen options={{ title: dir ? baseName(dir) : repo.slice(repo.indexOf("/") + 1) }} />
      <Mono style={s.path} numberOfLines={1} ellipsizeMode="head">
        {dir ? `${repo}/${dir}` : repo}
      </Mono>

      {loading ? (
        <ActivityIndicator color={C.muted} style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={s.pad}>
          <Empty text={error} />
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.path}
          ListHeaderComponent={dir ? null : <AssessHeader repo={repo} />}
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={
            <View style={s.pad}>
              <Empty text="This folder is empty." />
            </View>
          }
          renderItem={({ item: e }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${e.kind === "dir" ? "Folder" : "File"} ${e.name}`}
              onPress={() => router.push(e.kind === "dir" ? { pathname: "/repo", params: { repo, dir: e.path } } : { pathname: "/file", params: { repo, path: e.path } })}
              style={({ pressed }) => [s.row, pressed && { backgroundColor: C.raised }]}
            >
              {e.kind === "dir" ? <Folder size={16} color={C.amber300} /> : <FileText size={16} color={C.muted} />}
              <Mono style={s.name} numberOfLines={1}>
                {e.name}
              </Mono>
              {e.kind === "dir" && <ChevronRight size={15} color={C.faint} />}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

/** At the top of a repository: run a static analysis of it, or reopen the last one kept on this device. */
function AssessHeader({ repo }: { repo: string }) {
  const router = useRouter();
  const { show, assessment } = useAssess();
  const [last, setLast] = useState<StoredIndexEntry | null>(null);
  useEffect(() => {
    let alive = true;
    storedAssessments().then((all) => alive && setLast(all.find((e) => e.repo === repo) ?? null));
    return () => {
      alive = false;
    };
  }, [repo, assessment]);

  const reopen = async () => {
    const stored = await loadAssessment(repo);
    if (!stored) return setLast(null);
    show(stored, false);
    router.dismissTo("/(tabs)/findings");
  };

  return (
    <View style={s.assess}>
      <Button kind="primary" icon={ScanSearch} label="Assess this repository" onPress={() => router.push({ pathname: "/assess", params: { repo } })} />
      {last ? (
        <Pressable accessibilityRole="button" onPress={reopen} style={({ pressed }) => [s.last, pressed && { opacity: 0.7 }]}>
          <T style={s.lastText}>
            Last assessed {new Date(last.finishedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {last.findings} finding{last.findings === 1 ? "" : "s"}
          </T>
          <T style={s.lastOpen}>Open</T>
        </Pressable>
      ) : (
        <T style={s.lastText}>Static analysis on this phone, read-only. Nothing is cloned or executed.</T>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  assess: { gap: 10, borderBottomWidth: 1, borderBottomColor: C.line, padding: 16 },
  last: { flexDirection: "row", alignItems: "center", gap: 10 },
  lastText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: C.muted },
  lastOpen: { fontSize: 13, color: C.white },
  root: { flex: 1, backgroundColor: C.editor },
  path: { borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.base, paddingHorizontal: 16, paddingVertical: 9, fontSize: 11.5, color: C.muted },
  pad: { padding: 16 },
  row: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, paddingHorizontal: 16 },
  name: { flex: 1, fontSize: 13, color: C.fg },
});
