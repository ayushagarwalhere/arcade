import { Pressable, View } from "react-native";
import { useRouter } from "expo-router";
import { Check, ChevronRight, FlaskConical, FolderGit2, Lock, ScanSearch } from "lucide-react-native";
import type { AgentKind, Finding } from "@/core/types";
import { useRun } from "@/run/RunProvider";
import Screen from "@/ui/Screen";
import { AGENT_ICON, AgentDot, Badge, Button, Card, Mono, SEVERITY, SectionLabel, SeverityBadge, Stats, T } from "@/ui/atoms";
import { overviewStyles as s } from "@/ui/overviewStyles";
import { C } from "@/ui/theme";
import { useAssess } from "./AssessmentProvider";
import { Notice } from "./LiveFinding";
import { shortSha } from "./assess";
import { fixPlanFor } from "./fix";
import { statusOf } from "./status";
import { MAX_STORED_FINDINGS } from "./storage";
import { useStatusContext } from "./useStatus";

const STEPS: AgentKind[] = ["mapper", "attacker", "defender", "remediator", "verifier"];

/** Overview of a real assessment. Every figure is a count from the static analysis or from something the user approved. */
export default function LiveOverview() {
  const run = useRun();
  const router = useRouter();
  const ctx = useStatusContext();
  const { assessment, findings, outcomes, startSample } = useAssess();
  if (!assessment) return null;
  const { meta, project } = assessment;
  const { state } = run;

  const top: Finding | undefined = findings[0];
  const count = (sev: Finding["severity"]) => findings.filter((f) => f.severity === sev).length;
  const rewritable = findings.filter((f) => fixPlanFor(f).kind === "rewrite").length;
  const pulls = Object.values(outcomes).filter((o) => o.kind === "pull-request").length;
  const filed = Object.values(outcomes).filter((o) => o.kind === "issue").length;
  const pending = state.approvals.filter((a) => a.status === "pending").length;

  return (
    <Screen>
      <View>
        <Mono style={s.kicker}>
          {meta.repo} @ {shortSha(meta.commit)} · {meta.scope === "source" ? "source files" : "all files"}
        </Mono>
        <T style={s.title}>{run.pendingApproval ? "Awaiting your approval" : meta.totalFindings ? `${meta.totalFindings} finding${meta.totalFindings === 1 ? "" : "s"}` : "No rule matched"}</T>
        <T style={s.lede}>{project.description}</T>
        <View style={s.control}>
          <View style={s.controlButtons}>
            {run.pendingApproval ? (
              <Button kind="primary" icon={Lock} label="Review approval" onPress={() => router.push("/approval")} style={{ flex: 1 }} />
            ) : (
              <Button kind="primary" icon={ScanSearch} label="Assess again" onPress={() => router.push({ pathname: "/assess", params: { repo: meta.repo } })} style={{ flex: 1 }} />
            )}
            <Button icon={FolderGit2} label="Files" onPress={() => router.push({ pathname: "/repo", params: { repo: meta.repo } })} />
          </View>
        </View>
      </View>

      {meta.source === "fixture" && <Notice tone="amber" text="This is the built-in development fixture, not a GitHub repository. The analysis is real; commits and issues are refused because there is nowhere to send them." />}
      {meta.treeTruncated && <Notice tone="amber" text="GitHub truncated the file listing for this repository, so its deepest folders were not analysed." />}
      {meta.scanTruncated && <Notice tone="amber" text="The scan stopped at its cap on matches; files after that point were not analysed." />}
      {meta.unreadable > 0 && <Notice tone="amber" text={`${meta.unreadable} file${meta.unreadable === 1 ? "" : "s"} could not be read from GitHub and ${meta.unreadable === 1 ? "was" : "were"} not analysed.`} />}
      {findings.length < meta.totalFindings && <Notice tone="amber" text={`Showing the ${findings.length} strongest of ${meta.totalFindings} findings — a stored assessment keeps at most ${MAX_STORED_FINDINGS}. Assess again to see them all.`} />}

      <View>
        <SectionLabel>What ran</SectionLabel>
        <Card>
          {STEPS.map((kind, i) => {
            const a = state.agents[kind];
            const Icon = AGENT_ICON[kind];
            const iconColor = a.status === "done" ? C.emerald400 : a.status === "running" ? C.amber200 : C.faint;
            return (
              <View key={kind} style={[s.agent, i > 0 && s.agentDivider, a.status === "running" && { backgroundColor: C.raised }]}>
                <Icon size={17} color={iconColor} />
                <View style={s.agentBody}>
                  <T style={[s.agentStep, a.status === "idle" && { color: C.muted }]}>{a.name}</T>
                  <T style={s.agentTask} numberOfLines={3}>
                    {a.task}
                  </T>
                </View>
                {a.status === "done" ? <Check size={15} color={C.emerald400} /> : <AgentDot status={a.status} />}
              </View>
            );
          })}
        </Card>
      </View>

      {top && (
        <View>
          <SectionLabel>Strongest finding</SectionLabel>
          <Pressable accessibilityRole="button" onPress={() => router.push(`/finding/${top.id}`)} style={({ pressed }) => [s.finding, pressed && { backgroundColor: C.raised }]}>
            <View style={[s.severityBar, { backgroundColor: SEVERITY[top.severity].dot }]} />
            <View style={s.findingHead}>
              <Mono style={{ color: C.muted }}>{top.id}</Mono>
              <SeverityBadge severity={top.severity} />
              <Badge tone={statusOf(top, ctx).tone}>{statusOf(top, ctx).label}</Badge>
            </View>
            <T style={s.findingTitle}>{top.title}</T>
            <Mono style={s.findingTarget}>
              {top.vulnerableCode.path}:{top.vulnerableCode.lines.find((l) => l.flagged)?.no ?? "?"}
            </Mono>
            <T style={s.findingSummary}>{top.summary}</T>
            <View style={s.findingOpen}>
              <T style={s.findingOpenText}>Open finding</T>
              <ChevronRight size={14} color={C.fg} />
            </View>
          </Pressable>
        </View>
      )}

      <Stats
        title="Findings"
        rows={[
          ["Total", meta.totalFindings],
          ["Critical", count("critical"), count("critical") ? C.red300 : undefined],
          ["High", count("high"), count("high") ? C.orange300 : undefined],
          ["With an automatic rewrite", rewritable],
          ["Pull requests opened", pulls, pulls ? C.emerald300 : undefined],
          ["Issues opened", filed],
          ["Awaiting your approval", pending, pending ? C.violet300 : undefined],
        ]}
      />

      <Stats
        title="Analysis"
        rows={[
          ["Method", "static rules"],
          ["Files analysed", `${meta.filesAnalysed} of ${meta.filesIndexed}`],
          ["Rules", meta.rules],
          ["Code executed", "none"],
          ["Finished", new Date(meta.finishedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })],
        ]}
      />

      <Stats
        title="Surface, estimated from paths and matches"
        rows={[
          ["Route-like files", project.endpoints],
          ["Files with authorization findings", project.authBoundaries],
          ["Files with outbound-call findings", project.integrations],
          ["Authorization findings", project.privilegedOps, project.privilegedOps ? C.amber200 : undefined],
        ]}
      />

      <View>
        <SectionLabel>Stack</SectionLabel>
        <View style={s.chips}>
          {project.technologies.map((t) => (
            <Mono key={t} style={s.chip}>
              {t}
            </Mono>
          ))}
        </View>
        <T style={s.footnote}>Every number here is a count from the static analysis. A match is a lead for a reviewer, not proof of an exploit.</T>
        <Button kind="ghost" icon={FlaskConical} label="Open the sample run (scripted demo)" onPress={startSample} style={{ marginTop: 6 }} />
      </View>
    </Screen>
  );
}
