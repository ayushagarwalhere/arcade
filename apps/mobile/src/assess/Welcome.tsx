import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { ChevronRight, FlaskConical, FolderGit2, GitBranch, ScanSearch } from "lucide-react-native";
import { useGithub } from "@/github/github";
import Screen from "@/ui/Screen";
import { Button, Card, Mono, SectionLabel, T } from "@/ui/atoms";
import { overviewStyles as s } from "@/ui/overviewStyles";
import { C } from "@/ui/theme";
import { useAssess } from "./AssessmentProvider";
import { mountDevFixture } from "./dev";
import { loadAssessment, storedAssessments, type StoredIndexEntry } from "./storage";

/** Overview with nothing loaded: how to assess a repository, what was assessed before, and the clearly-labelled sample. */
export default function Welcome() {
  const router = useRouter();
  const gh = useGithub();
  const { startSample, show } = useAssess();
  const [recent, setRecent] = useState<StoredIndexEntry[]>([]);
  useEffect(() => {
    let alive = true;
    storedAssessments().then((all) => alive && setRecent(all));
    return () => {
      alive = false;
    };
  }, []);

  const reopen = async (repo: string) => {
    const stored = await loadAssessment(repo);
    if (stored) show(stored, false);
  };

  return (
    <Screen>
      <View>
        <T style={s.title}>Assess a repository</T>
        <T style={s.lede}>
          Arcade reads a GitHub repository through the API and checks it against its static rules, here on the phone. You read the findings, and approve any fix before it becomes a pull request. Nothing is cloned and nothing is executed.
        </T>
        <View style={s.control}>
          {gh.status === "connected" ? (
            <Button kind="primary" icon={FolderGit2} label="Choose a repository" onPress={() => router.push("/repos")} />
          ) : (
            <Button kind="primary" icon={GitBranch} label="Connect GitHub" onPress={() => router.push("/github")} disabled={gh.status === "loading"} />
          )}
          {__DEV__ && (
            <Button
              icon={ScanSearch}
              label="Assess the built-in fixture (dev build only)"
              onPress={() => {
                const repo = mountDevFixture();
                if (repo) router.push({ pathname: "/assess", params: { repo } });
              }}
            />
          )}
        </View>
      </View>

      {recent.length > 0 && (
        <View>
          <SectionLabel>Assessed on this device</SectionLabel>
          <Card>
            {recent.map((r, i) => (
              <Pressable key={r.repo} accessibilityRole="button" onPress={() => void reopen(r.repo)} style={({ pressed }) => [s.recent, i > 0 && s.agentDivider, pressed && { backgroundColor: C.raised }]}>
                <View style={{ flex: 1 }}>
                  <Mono style={{ fontSize: 13, color: C.white }}>{r.repo}</Mono>
                  <T style={s.agentTask}>
                    {new Date(r.finishedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} · {r.findings} finding{r.findings === 1 ? "" : "s"}
                  </T>
                </View>
                <ChevronRight size={15} color={C.faint} />
              </Pressable>
            ))}
          </Card>
        </View>
      )}

      <View>
        <SectionLabel>Sample run</SectionLabel>
        <Card style={{ padding: 14, gap: 12 }}>
          <T style={s.agentTask}>
            A scripted walkthrough of the full desktop loop — map, attack in a sandbox, fix, verify — with made-up data. It shows how the approval gates work. It is not an analysis of your code, and nothing in it really runs.
          </T>
          <Button icon={FlaskConical} label="Open the sample run" onPress={startSample} />
        </Card>
      </View>
    </Screen>
  );
}
