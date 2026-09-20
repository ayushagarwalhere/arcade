import { Image, Pressable, StyleSheet, Switch, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { ChevronRight, FolderGit2, GitBranch, LogOut, TriangleAlert } from "lucide-react-native";
import { disconnectGithub, useGithub } from "@/github/github";
import { useRun } from "@/run/RunProvider";
import Screen from "@/ui/Screen";
import { Button, Card, SectionLabel, Stats, T } from "@/ui/atoms";
import { C, F, white } from "@/ui/theme";

export default function SettingsScreen() {
  const run = useRun();
  const router = useRouter();
  const gh = useGithub();
  const { environment, providers } = run.state;
  const resetPending = run.state.approvals.some((a) => a.id === "reset-sandbox" && a.status === "pending");

  return (
    <Screen>
      <View>
        <SectionLabel>GitHub</SectionLabel>
        {gh.status === "connected" ? (
          <Card>
            <View style={s.account}>
              <Image source={{ uri: gh.user.avatarUrl }} style={s.avatar} accessibilityIgnoresInvertColors />
              <View style={{ flex: 1 }}>
                <T style={s.rowTitle}>{gh.user.name ?? gh.user.login}</T>
                <T style={s.rowSub}>@{gh.user.login}</T>
              </View>
            </View>
            <Row icon={<FolderGit2 size={17} color={C.fg} />} title="Browse repositories" onPress={() => router.push("/repos")} />
            <Row icon={<LogOut size={17} color={C.muted} />} title="Disconnect" onPress={() => void disconnectGithub()} chevron={false} />
          </Card>
        ) : (
          <Card style={{ padding: 14, gap: 12 }}>
            <T style={s.help}>Connect GitHub to browse your repositories from your phone. They're read straight from the GitHub API — nothing is cloned.</T>
            <Button kind="primary" icon={GitBranch} label="Connect GitHub" onPress={() => router.push("/github")} disabled={gh.status === "loading"} />
          </Card>
        )}
      </View>

      <View>
        <SectionLabel>Coding agents</SectionLabel>
        <Card>
          {providers.map((p, i) => (
            <View key={p.id} style={[s.row, i > 0 && s.divider]}>
              <View style={{ flex: 1 }}>
                <T style={s.rowTitle}>{p.name}</T>
                <T style={s.rowSub}>{p.connected ? "Connected" : "Not connected"}</T>
              </View>
              <Switch
                accessibilityLabel={`${p.name} connected`}
                value={p.connected}
                onValueChange={(v) => run.setProvider(p.id, v)}
                trackColor={{ false: C.line, true: C.emerald500 }}
                thumbColor={C.white}
              />
            </View>
          ))}
        </Card>
        <T style={s.footnote}>Bring your own agent: Arcade drives whichever coding agents are connected.</T>
      </View>

      <View>
        <Stats
          title="Target environment"
          rows={[
            ["Sandbox", environment.sandboxId],
            ["Host", environment.host],
            ["Network", environment.network],
            ["Isolated", environment.isolated ? "yes" : "no", environment.isolated ? C.emerald300 : C.red300],
            ["Disposable", environment.disposable ? "yes" : "no", environment.disposable ? C.emerald300 : C.red300],
          ]}
        />
        <Button
          kind="secondary"
          icon={TriangleAlert}
          label={resetPending ? "Reset is waiting for your approval" : "Request a sandbox reset"}
          onPress={run.requestDestructive}
          disabled={resetPending}
          style={{ marginTop: 12 }}
        />
        <T style={s.footnote}>Arcade never resets an environment on its own. Destructive actions always stop for you first.</T>
      </View>

      <T style={s.version}>Arcade for mobile · v{Constants.expoConfig?.version ?? "0.1.0"}</T>
    </Screen>
  );
}

function Row({ icon, title, onPress, chevron = true }: { icon: React.ReactNode; title: string; onPress: () => void; chevron?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [s.row, s.divider, pressed && { backgroundColor: C.raised }]}>
      {icon}
      <T style={[s.rowTitle, { flex: 1 }]}>{title}</T>
      {chevron && <ChevronRight size={16} color={C.faint} />}
    </Pressable>
  );
}

const s = StyleSheet.create({
  account: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.raised },
  row: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  rowTitle: { fontFamily: F.medium, fontSize: 14.5, color: C.white },
  rowSub: { marginTop: 1, fontSize: 12.5, color: C.muted },
  help: { fontSize: 13.5, lineHeight: 21, color: white(0.65) },
  footnote: { marginTop: 10, fontSize: 12, lineHeight: 18, color: C.faint },
  version: { textAlign: "center", fontSize: 12, color: C.faint },
});
