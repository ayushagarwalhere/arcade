import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Check, ScanSearch } from "lucide-react-native";
import { useAssess } from "@/assess/AssessmentProvider";
import { Notice } from "@/assess/LiveFinding";
import { AssessmentCancelled, assessRepo, describeRun, type AssessProgress, type Scope, type StoredAssessment } from "@/assess/assess";
import { repoWorkspace } from "@/assess/repo-workspace";
import { MAX_STORED_FINDINGS } from "@/assess/storage";
import { RULES } from "@/core/rules";
import type { Severity } from "@/core/types";
import { GithubAuthError, disconnectGithub, githubRateLimit, githubToken } from "@/github/github";
import { describeGithubError, isMemoryRepo, pinHead } from "@/github/repo-fs";
import Screen from "@/ui/Screen";
import { Button, Card, Mono, SEVERITY, SectionLabel, Stats, T } from "@/ui/atoms";
import { C, F, white } from "@/ui/theme";

const SCOPES: { scope: Scope; title: string; detail: string }[] = [
  { scope: "source", title: "Source code", detail: "Skips tests, fixtures, examples, docs and static assets, which mostly produce noise." },
  { scope: "all", title: "Everything", detail: "Every text file in the repository. Slower, more GitHub requests, more false alarms." },
];

/** What the repository looks like before anything is fetched: how many files each scope would read, and the API budget. */
interface Preview {
  commit: string | null;
  truncated: boolean;
  files: Record<Scope, number>;
  remaining: number | null;
  resetAt: Date | null;
}

type Stage = { at: "preview" } | { at: "running"; progress: AssessProgress } | { at: "done"; result: StoredAssessment } | { at: "error"; message: string };

const ORDER: Severity[] = ["critical", "high", "medium", "low"];

/** Assess one repository: pick a scope, watch the real progress, cancel at any point. */
export default function AssessScreen() {
  const { repo } = useLocalSearchParams<{ repo: string }>();
  const router = useRouter();
  const { show } = useAssess();
  const [scope, setScope] = useState<Scope>("source");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [stage, setStage] = useState<Stage>({ at: "preview" });
  const cancelled = useRef(false);
  useEffect(() => () => void (cancelled.current = true), []);

  const fail = (e: unknown) => {
    if (e instanceof GithubAuthError) void disconnectGithub();
    setStage({ at: "error", message: describeGithubError(e, "Couldn't read this repository from GitHub. Check your connection and try again.") });
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const tree = await pinHead(repo);
        const ws = repoWorkspace(repo);
        const [source, all] = [await ws.candidates("source"), await ws.candidates("all")];
        let budget: { remaining: number; resetAt: Date } | null = null;
        if (!isMemoryRepo(repo)) {
          const token = await githubToken();
          budget = token ? await githubRateLimit(token).catch(() => null) : null;
        }
        if (alive) setPreview({ commit: tree.commit, truncated: tree.truncated, files: { source: source.length, all: all.length }, remaining: budget?.remaining ?? null, resetAt: budget?.resetAt ?? null });
      } catch (e) {
        if (alive) fail(e);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repo]);

  const start = async () => {
    cancelled.current = false;
    setStage({ at: "running", progress: { stage: "listing", filesRead: 0, totalFiles: preview?.files[scope] ?? 0, findings: 0 } });
    try {
      const result = await assessRepo(repo, scope, (progress) => !cancelled.current && setStage({ at: "running", progress }), () => cancelled.current);
      show(result, true);
      setStage({ at: "done", result });
    } catch (e) {
      if (e instanceof AssessmentCancelled) setStage({ at: "preview" });
      else fail(e);
    }
  };

  const needed = preview?.files[scope] ?? 0;
  const overBudget = preview?.remaining != null && needed + 20 > preview.remaining;

  return (
    <Screen>
      <Stack.Screen options={{ title: "Assess repository" }} />
      <View>
        <Mono style={s.kicker}>
          {repo}
          {preview?.commit ? ` @ ${preview.commit.slice(0, 7)}` : ""}
        </Mono>
        <T style={s.title}>{stage.at === "done" ? "Static analysis finished" : stage.at === "running" ? "Analysing…" : "Static analysis"}</T>
        {stage.at === "preview" && (
          <T style={s.lede}>
            Arcade reads the repository through the GitHub API and checks it against {RULES.length} static rules, here on the phone. It only reads: nothing is executed, and nothing is written to GitHub.
          </T>
        )}
      </View>

      {stage.at === "error" && (
        <>
          <Notice tone="red" text={`The assessment did not finish, so there is no result. ${stage.message}`} />
          <Button label="Back" onPress={() => router.back()} />
        </>
      )}

      {stage.at === "preview" &&
        (preview ? (
          <>
            <View>
              <SectionLabel>What to analyse</SectionLabel>
              <Card>
                {SCOPES.map((o, i) => {
                  const on = o.scope === scope;
                  return (
                    <Pressable key={o.scope} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => setScope(o.scope)} style={({ pressed }) => [s.option, i > 0 && s.divider, pressed && { backgroundColor: C.raised }]}>
                      <View style={[s.radio, on && { borderColor: C.fg }]}>{on && <View style={s.radioDot} />}</View>
                      <View style={{ flex: 1 }}>
                        <T style={s.optionTitle}>
                          {o.title} <T style={s.optionCount}>· {preview.files[o.scope]} files</T>
                        </T>
                        <T style={s.optionDetail}>{o.detail}</T>
                      </View>
                    </Pressable>
                  );
                })}
              </Card>
            </View>

            {preview.remaining != null && (
              <T style={s.note}>
                About {needed} GitHub API requests, one per file. {preview.remaining.toLocaleString()} left this hour.
              </T>
            )}
            {preview.truncated && <Notice tone="amber" text="This repository is too large for GitHub to list in one call, so the deepest folders are missing from the listing and will not be analysed." />}
            {overBudget && (
              <Notice
                tone="amber"
                text={`This would need about ${needed} requests and only ${preview.remaining} are left before GitHub's hourly limit${preview.resetAt ? ` resets at ${preview.resetAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}. Pick the smaller scope or wait — a run that hits the limit is thrown away.`}
              />
            )}
            <Button kind="primary" icon={ScanSearch} label={needed ? "Start static analysis" : "Nothing to analyse in this scope"} onPress={start} disabled={!needed || overBudget} />
          </>
        ) : (
          <View style={s.loading}>
            <ActivityIndicator color={C.muted} />
            <T style={s.note}>Listing the repository…</T>
          </View>
        ))}

      {stage.at === "running" && <Running progress={stage.progress} onCancel={() => void (cancelled.current = true)} />}

      {stage.at === "done" && <Done result={stage.result} onOpen={() => router.dismissTo("/(tabs)/findings")} />}
    </Screen>
  );
}

function Running({ progress, onCancel }: { progress: AssessProgress; onCancel: () => void }) {
  const [stopping, setStopping] = useState(false);
  const share = progress.totalFiles ? Math.min(1, progress.filesRead / progress.totalFiles) : 0;
  const label = progress.stage === "listing" ? "Listing the repository" : progress.stage === "scanning" ? "Reading files and matching rules" : "Explaining the matches";
  return (
    <>
      <View>
        <View style={s.track}>
          <View style={[s.trackFill, { width: `${Math.round(share * 100)}%` }]} />
        </View>
        <T style={[s.note, { marginTop: 10 }]}>{stopping ? "Stopping…" : label}</T>
        {progress.current && !stopping && (
          <Mono style={s.current} numberOfLines={1} ellipsizeMode="head">
            {progress.current}
          </Mono>
        )}
      </View>
      <Stats
        title="So far"
        rows={[
          ["Files read", `${progress.filesRead} of ${progress.totalFiles}`],
          ["Matches", progress.findings, progress.findings ? C.red300 : undefined],
        ]}
      />
      <Button
        label={stopping ? "Stopping…" : "Cancel"}
        disabled={stopping}
        onPress={() => {
          setStopping(true);
          onCancel();
        }}
      />
      <T style={s.note}>Cancelling throws the partial result away: an unfinished scan is not shown as a result.</T>
    </>
  );
}

function Done({ result, onOpen }: { result: StoredAssessment; onOpen: () => void }) {
  const { meta, findings } = result;
  const counts = ORDER.map((sev) => [sev, findings.filter((f) => f.severity === sev).length] as const).filter(([, n]) => n > 0);
  return (
    <>
      <Card style={{ padding: 14, gap: 10 }}>
        <View style={s.doneHead}>
          <Check size={18} color={C.emerald400} />
          <T style={s.doneTitle}>{meta.totalFindings ? `${meta.totalFindings} finding${meta.totalFindings === 1 ? "" : "s"}` : "No rule matched"}</T>
        </View>
        {counts.length > 0 && (
          <View style={s.counts}>
            {counts.map(([sev, n]) => (
              <View key={sev} style={s.count}>
                <View style={[s.countDot, { backgroundColor: SEVERITY[sev].dot }]} />
                <T style={s.countText}>
                  {n} {SEVERITY[sev].label.toLowerCase()}
                </T>
              </View>
            ))}
          </View>
        )}
        <T style={s.optionDetail}>
          {describeRun(meta)}: {meta.filesAnalysed} of {meta.filesIndexed} files checked against {meta.rules} rules.{" "}
          {meta.totalFindings ? "Each finding is a pattern match for a reviewer to judge — nothing was executed." : "That does not show the repository is secure, only that none of the current rules fired."}
        </T>
      </Card>
      {meta.unreadable > 0 && <Notice tone="amber" text={`${meta.unreadable} file${meta.unreadable === 1 ? "" : "s"} could not be read from GitHub and ${meta.unreadable === 1 ? "was" : "were"} not analysed.`} />}
      {meta.scanTruncated && <Notice tone="amber" text="The scan stopped at its cap on matches, so files after that point were not analysed. Fix what was found and assess again." />}
      {meta.totalFindings > MAX_STORED_FINDINGS && <Notice tone="amber" text={`All ${meta.totalFindings} findings are shown now. Only the ${MAX_STORED_FINDINGS} strongest are kept on the device for next time.`} />}
      <Button kind="primary" label={meta.totalFindings ? "View findings" : "Done"} onPress={onOpen} />
    </>
  );
}

const s = StyleSheet.create({
  kicker: { fontSize: 11.5, color: C.muted },
  title: { marginTop: 4, fontFamily: F.semibold, fontSize: 24, lineHeight: 30, letterSpacing: -0.6, color: C.white },
  lede: { marginTop: 6, fontSize: 14, lineHeight: 21, color: C.muted },
  note: { fontSize: 12.5, lineHeight: 19, color: C.muted },
  loading: { flexDirection: "row", alignItems: "center", gap: 10 },

  option: { flexDirection: "row", gap: 12, paddingHorizontal: 14, paddingVertical: 13 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line },
  radio: { marginTop: 2, width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: C.faint, alignItems: "center", justifyContent: "center" },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.fg },
  optionTitle: { fontFamily: F.medium, fontSize: 14.5, color: C.white },
  optionCount: { fontFamily: F.sans, fontSize: 13, color: C.muted },
  optionDetail: { marginTop: 2, fontSize: 12.5, lineHeight: 19, color: C.muted },

  track: { height: 4, borderRadius: 2, backgroundColor: white(0.08), overflow: "hidden" },
  trackFill: { height: 4, borderRadius: 2, backgroundColor: C.fg },
  current: { marginTop: 4, fontSize: 11, color: C.faint },

  doneHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  doneTitle: { fontFamily: F.semibold, fontSize: 17, color: C.white },
  counts: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  count: { flexDirection: "row", alignItems: "center", gap: 6 },
  countDot: { width: 7, height: 7, borderRadius: 4 },
  countText: { fontSize: 12.5, color: C.muted },
});
