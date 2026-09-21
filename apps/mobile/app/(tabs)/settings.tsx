import { useEffect, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { ChevronRight, FlaskConical, FolderGit2, GitBranch, Laptop, LogOut, Trash2 } from "lucide-react-native";
import { useAssess } from "@/assess/AssessmentProvider";
import { shortSha } from "@/assess/assess";
import { forgetAssessment, storedAssessments, type StoredIndexEntry } from "@/assess/storage";
import { disconnectGithub, useGithub } from "@/github/github";
import { useRun } from "@/run/RunProvider";
import Screen from "@/ui/Screen";
import { Button, Card, Mono, SectionLabel, Stats, T } from "@/ui/atoms";
import { C, F, white } from "@/ui/theme";

export default function SettingsScreen() {
  const run = useRun();
  const router = useRouter();
  const gh = useGithub();
  const { mode, assessment, startSample, leaveSample } = useAssess();
  const { environment } = run.state;

  const [stored, setStored] = useState<StoredIndexEntry[]>([]);
  useEffect(() => {
    let alive = true;
    storedAssessments().then((all) => alive && setStored(all));
    return () => {
      alive = false;
    };
  }, [assessment]);

  const forget = async (repo: string) => {
    await forgetAssessment(repo);
    setStored(await storedAssessments());
  };

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
            <Row icon={<FolderGit2 size={17} color={C.fg} />} title="Browse and assess repositories" onPress={() => router.push("/repos")} />
            <Row icon={<LogOut size={17} color={C.muted} />} title="Disconnect" onPress={() => void disconnectGithub()} chevron={false} />
          </Card>
        ) : (
          <Card style={{ padding: 14, gap: 12 }}>
            <T style={s.help}>
              Connect GitHub to browse and assess your repositories from your phone. They're read straight from the GitHub API — nothing is cloned. Arcade writes to GitHub only when you approve it: a fix goes to a new branch and a pull request, never to your default branch.
            </T>
            <Button kind="primary" icon={GitBranch} label="Connect GitHub" onPress={() => router.push("/github")} disabled={gh.status === "loading"} />
          </Card>
        )}
        <T style={s.footnote}>The token is kept in the device keychain (the browser preview uses local storage) and is only ever sent to api.github.com.</T>
      </View>

      <View>
        <SectionLabel>Coding agents</SectionLabel>
        <Card style={{ padding: 14, flexDirection: "row", gap: 12 }}>
          <Laptop size={18} color={C.muted} style={{ marginTop: 2 }} />
          <T style={[s.help, { flex: 1 }]}>
            Coding agents run on the desktop. The Arcade desktop app hands findings to the agents installed on that computer; the phone does not run or connect to them. Here, Arcade analyses a repository with its built-in static rules and applies only the rules' own one-line rewrites — and you review and approve.
          </T>
        </Card>
      </View>

      {mode === "live" && assessment && (
        <Stats
          title="This analysis"
          rows={[
            ["Method", "static analysis"],
            ["Repository", assessment.meta.repo],
            ["Commit", shortSha(assessment.meta.commit)],
            ["Scope", assessment.meta.scope === "source" ? "source files" : "all files"],
            ["Ran on", "this phone"],
            ["Network", "api.github.com"],
            ["Code executed", "none"],
            ["Sandbox", "none — nothing is run"],
          ]}
        />
      )}

      {mode === "sample" && (
        <View>
          <Stats
            title="Sample environment (scripted)"
            rows={[
              ["Sandbox", environment.sandboxId],
              ["Host", environment.host],
              ["Network", environment.network],
            ]}
          />
          <T style={s.footnote}>These values belong to the scripted sample run. No sandbox exists on the phone.</T>
        </View>
      )}

      {stored.length > 0 && (
        <View>
          <SectionLabel>Stored on this device</SectionLabel>
          <Card>
            {stored.map((e, i) => (
              <View key={e.repo} style={[s.row, i > 0 && s.divider]}>
                <View style={{ flex: 1 }}>
                  <Mono style={{ fontSize: 13, color: C.white }}>{e.repo}</Mono>
                  <T style={s.rowSub}>
                    {new Date(e.finishedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {e.findings} finding{e.findings === 1 ? "" : "s"}
                  </T>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel={`Forget the assessment of ${e.repo}`} onPress={() => void forget(e.repo)} hitSlop={10}>
                  <Trash2 size={17} color={C.muted} />
                </Pressable>
              </View>
            ))}
          </Card>
          <T style={s.footnote}>The last assessment of each repository: its findings with a few lines of code around each, and any pull request or issue you opened. Whole files are never stored.</T>
        </View>
      )}

      <View>
        <SectionLabel>Sample run</SectionLabel>
        <Card>
          <Pressable accessibilityRole="button" onPress={mode === "sample" ? leaveSample : startSample} style={({ pressed }) => [s.row, pressed && { backgroundColor: C.raised }]}>
            <FlaskConical size={17} color={C.fg} />
            <View style={{ flex: 1 }}>
              <T style={s.rowTitle}>{mode === "sample" ? "Leave the sample run" : "Open the sample run"}</T>
              <T style={s.rowSub}>A scripted demo with made-up data. Not your code.</T>
            </View>
            <ChevronRight size={16} color={C.faint} />
          </Pressable>
        </Card>
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
