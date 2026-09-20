import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronRight, FileText, Folder } from "lucide-react-native";
import { baseName } from "@/core/fs";
import { listDir, useRepoData } from "@/github/repo-fs";
import { Empty, Mono } from "@/ui/atoms";
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

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.editor },
  path: { borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.base, paddingHorizontal: 16, paddingVertical: 9, fontSize: 11.5, color: C.muted },
  pad: { padding: 16 },
  row: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, paddingHorizontal: 16 },
  name: { flex: 1, fontSize: 13, color: C.fg },
});
