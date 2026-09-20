import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Redirect, useRouter } from "expo-router";
import { ChevronRight, Lock, Search } from "lucide-react-native";
import { useGithub, useGithubRepos } from "@/github/github";
import { Empty, Mono, T } from "@/ui/atoms";
import { C, F, white } from "@/ui/theme";

export default function Repos() {
  const gh = useGithub();
  const router = useRouter();
  const { repos, error, loading } = useGithubRepos();
  const [query, setQuery] = useState("");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? repos?.filter((r) => r.fullName.toLowerCase().includes(q)) : repos;
  }, [repos, query]);

  if (gh.status === "disconnected") return <Redirect href="/(tabs)/settings" />;

  return (
    <View style={s.root}>
      <View style={s.search}>
        <Search size={16} color={C.faint} />
        <TextInput
          accessibilityLabel="Filter repositories"
          value={query}
          onChangeText={setQuery}
          placeholder="Filter repositories"
          placeholderTextColor={C.faint}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          style={s.input}
        />
      </View>

      {loading ? (
        <ActivityIndicator color={C.muted} style={{ marginTop: 40 }} />
      ) : error ? (
        <View style={s.pad}>
          <Empty text={error} />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(r) => String(r.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 24 }}
          ListEmptyComponent={
            <View style={s.pad}>
              <Empty text={query ? `No repository matches “${query}”.` : "No repositories on this account yet."} />
            </View>
          }
          renderItem={({ item: r }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: "/repo", params: { repo: r.fullName } })}
              style={({ pressed }) => [s.row, pressed && { backgroundColor: C.raised }]}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={s.nameRow}>
                  <Mono style={s.name} numberOfLines={1}>
                    {r.fullName}
                  </Mono>
                  {r.private && <Lock size={12} color={C.faint} />}
                </View>
                {r.description && (
                  <T style={s.description} numberOfLines={2}>
                    {r.description}
                  </T>
                )}
              </View>
              <ChevronRight size={16} color={C.faint} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.editor },
  search: { margin: 16, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.base, paddingHorizontal: 12 },
  input: { flex: 1, minHeight: 42, fontFamily: F.sans, fontSize: 14, color: C.white },
  pad: { padding: 16 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line, paddingHorizontal: 16, paddingVertical: 13 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { flexShrink: 1, fontSize: 13, color: C.white },
  description: { marginTop: 3, fontSize: 12.5, lineHeight: 18, color: white(0.5) },
});
