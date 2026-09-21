import { useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Stack, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ArrowRight, CircleAlert, CircleDot, ExternalLink, FileSearch, GitPullRequest, Wrench } from "lucide-react-native";
import type { Finding } from "@/core/types";
import { useRun } from "@/run/RunProvider";
import ApprovalBanner from "@/ui/ApprovalBanner";
import { DiffFile } from "@/ui/DiffView";
import Segmented from "@/ui/Segmented";
import TimelineList from "@/ui/TimelineList";
import { Badge, Button, Empty, Mono, SeverityBadge, T } from "@/ui/atoms";
import { findingStyles as s } from "@/ui/findingStyles";
import { C, alpha, white } from "@/ui/theme";
import { parseGate, useAssess } from "./AssessmentProvider";
import { describeRun, shortSha } from "./assess";
import { fixPlanFor } from "./fix";
import { statusOf } from "./status";
import { useStatusContext } from "./useStatus";

const TABS = ["Overview", "Code", "Match", "Attack path", "Fix", "Timeline"] as const;
type Tab = (typeof TABS)[number];

const open = (url: string) => void WebBrowser.openBrowserAsync(url).catch(() => {});

/** One finding of a real assessment. Everything on it comes from the scan or from something the user approved. */
export default function LiveFinding({ id }: { id: string }) {
  const { assessment, findings } = useAssess();
  const { state } = useRun();
  const ctx = useStatusContext();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Overview");

  const finding = findings.find((f) => f.id === id);
  if (!finding || !assessment) {
    return (
      <View style={[s.root, { padding: 16 }]}>
        <Stack.Screen options={{ title: id }} />
        <Empty text={`${id} is not part of the assessment that is loaded now.`} />
      </View>
    );
  }

  const { meta } = assessment;
  const status = statusOf(finding, ctx);
  const flagged = finding.vulnerableCode.lines.find((l) => l.flagged);
  const isTop = findings[0]?.id === finding.id;
  const path = state.surface.exploitPath.map((nodeId) => state.surface.nodes.find((n) => n.id === nodeId)).filter((n) => !!n);
  const events = state.timeline.filter((ev) => ev.text.startsWith(`${finding.id}:`) || ev.text.includes(` ${finding.id}`));

  return (
    <View style={s.root}>
      <Stack.Screen options={{ title: finding.id }} />

      <View style={s.header}>
        <View style={s.badges}>
          <SeverityBadge severity={finding.severity} />
          <Badge tone={status.tone}>{status.label}</Badge>
        </View>
        <T style={s.title}>{finding.title}</T>
        <Mono style={s.target}>
          {finding.vulnerableCode.path}
          {flagged ? `:${flagged.no}` : ""}
        </Mono>
        <Mono style={s.cwe}>{finding.cwe}</Mono>
      </View>
      <Segmented options={TABS} value={tab} onChange={setTab} />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.content}>
        {tab === "Overview" && (
          <>
            <T style={s.lead}>{finding.summary}</T>
            {finding.description !== finding.summary && <T style={s.para}>{finding.description}</T>}
            <View style={s.facts}>
              <Fact k="Severity" v={finding.severity} capitalize />
              <Fact k="Found by" v={finding.agent} />
              <Fact k="Repository" v={`${meta.repo} @ ${shortSha(meta.commit)}`} mono />
              <Fact k="Found at" v={finding.createdAt} />
            </View>
            <T style={s.para}>{describeRun(meta)}. A match means the rule's pattern is in the source; nothing was run to confirm it can be reached.</T>
          </>
        )}

        {tab === "Code" &&
          (finding.vulnerableCode.lines.length ? (
            <>
              <View style={s.panel}>
                <Mono style={s.panelHead}>{finding.vulnerableCode.path}</Mono>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ paddingVertical: 6, minWidth: "100%" }}>
                    {finding.vulnerableCode.lines.map((l) => (
                      <View key={l.no} style={[s.codeLine, l.flagged && { backgroundColor: alpha(C.red500, 0.1) }]}>
                        <Mono style={s.lineNo}>{l.no}</Mono>
                        <Mono style={[s.lineText, l.flagged && { color: C.red200 }]}>{l.text.replace(/\r$/, "")}</Mono>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
              <Button
                icon={FileSearch}
                label={flagged ? `Open the file at line ${flagged.no}` : "Open the file"}
                onPress={() => router.push({ pathname: "/file", params: { repo: meta.repo, path: finding.vulnerableCode.path, ...(flagged ? { line: String(flagged.no) } : {}) } })}
              />
              <T style={s.para}>The file opens as it is on GitHub now. If it has changed since {shortSha(meta.commit)}, the line may have moved.</T>
            </>
          ) : (
            <Empty text="This finding has no code window." />
          ))}

        {tab === "Match" && (
          <>
            <View style={s.panel}>
              <T style={s.panelHead}>What matched</T>
              <View style={s.panelBody}>
                {finding.evidence.requestHeaders.map((h) => (
                  <Mono key={h} style={[s.code, { color: white(0.5) }]}>
                    {h}
                  </Mono>
                ))}
                <Mono style={[s.code, { color: white(0.5) }]}>at: {finding.evidence.target}</Mono>
                {finding.evidence.requestBody && <Mono style={[s.code, { marginTop: 8, color: white(0.75) }]}>{finding.evidence.requestBody}</Mono>}
              </View>
            </View>
            <View style={[s.panel, { borderColor: alpha(C.red500, 0.25) }]}>
              <T style={s.panelHead}>The flagged line</T>
              <View style={s.panelBody}>
                <Mono style={[s.code, { color: white(0.75) }]}>{finding.evidence.responseBody}</Mono>
              </View>
            </View>
            <View style={{ gap: 8 }}>
              <T style={s.subhead}>How this was found</T>
              {finding.evidence.steps.map((step, i) => (
                <View key={step} style={s.step}>
                  <Mono style={s.stepNo}>{i + 1}</Mono>
                  <T style={s.stepText}>{step}</T>
                </View>
              ))}
            </View>
          </>
        )}

        {tab === "Attack path" && (
          <>
            <T style={s.subhead}>How this class of weakness is attacked</T>
            <T style={s.lead}>{finding.attackNarrative || finding.summary}</T>
            {isTop && path.length > 1 && (
              <>
                <View style={s.path}>
                  {path.map((n, i) => (
                    <View key={n.id} style={s.pathStep}>
                      <T style={[s.pathNode, i === path.length - 1 && s.pathNodeHot]}>{n.label}</T>
                      {i < path.length - 1 && <ArrowRight size={14} color={white(0.3)} />}
                    </View>
                  ))}
                </View>
                <T style={s.para}>The layers a request would cross to reach this kind of code, from the mapper's model of the repository. It is a model, not a traced request.</T>
              </>
            )}
            <View style={{ gap: 8 }}>
              <T style={s.subhead}>Mitigations, from the rule</T>
              {finding.mitigations.map((m) => (
                <View key={m.title} style={[s.box, m.recommended && s.boxGood]}>
                  <T style={s.mitigationTitle}>{m.title}</T>
                  <View style={s.badges}>
                    {m.recommended && <Badge tone="green">Recommended</Badge>}
                    <Badge>{m.effort[0].toUpperCase() + m.effort.slice(1)} effort</Badge>
                  </View>
                  <T style={s.mitigationDetail}>{m.detail}</T>
                </View>
              ))}
            </View>
          </>
        )}

        {tab === "Fix" && <FixTab finding={finding} />}

        {tab === "Timeline" && <TimelineList events={events} empty="Nothing has happened to this finding yet." />}
      </ScrollView>

      <ApprovalBanner />
    </View>
  );
}

/** The fix, as far as it has really got: not started, prepared in memory, committed — or not possible from here. */
function FixTab({ finding }: { finding: Finding }) {
  const { assessment, fixes, issues, outcomes, requestFix, requestShip, requestIssue } = useAssess();
  const { state } = useRun();
  const router = useRouter();
  const [asking, setAsking] = useState(false);

  const repo = assessment!.meta.repo;
  const plan = fixPlanFor(finding);
  const fix = fixes[finding.id];
  const issue = issues[finding.id];
  const outcome = outcomes[finding.id];
  const pendingGate = state.approvals.find((a) => a.status === "pending" && parseGate(a.id)?.findingId === finding.id);

  const review = (approvalId: string | null | undefined) => approvalId && router.push({ pathname: "/approval", params: { id: approvalId } });
  const askIssue = async () => {
    setAsking(true);
    review(await requestIssue(finding.id));
    setAsking(false);
  };

  const issueButton = (label: string) =>
    outcome?.kind === "issue" ? null : (
      <>
        <Button icon={CircleDot} label={asking || issue?.stage === "checking" ? "Checking the repository…" : issue?.stage === "filing" ? "Opening the issue…" : label} onPress={askIssue} disabled={asking || issue?.stage === "checking" || issue?.stage === "filing" || !!pendingGate} />
        {issue?.stage === "failed" && <Notice tone="red" text={`No issue was opened. ${issue.error}`} />}
      </>
    );

  if (outcome?.kind === "pull-request") {
    return (
      <>
        <View style={s.verdict}>
          <GitPullRequest size={24} color={C.emerald400} />
          <View style={{ flex: 1 }}>
            <T style={s.verdictTitle}>{outcome.existing ? `Pull request #${outcome.number} was already open` : `Pull request #${outcome.number} opened`}</T>
            <T style={s.verdictText}>
              {outcome.existing ? "A pull request for this exact fix already existed, so nothing new was committed." : `The fix is committed on ${outcome.branch}.`} The default branch was not changed — review and merge on GitHub.
            </T>
          </View>
        </View>
        <View style={s.facts}>
          <Fact k="Branch" v={outcome.branch} mono />
          <Fact k="Commit" v={shortSha(outcome.sha)} mono />
        </View>
        <Button kind="primary" icon={ExternalLink} label={`Open pull request #${outcome.number}`} onPress={() => open(outcome.url)} />
        <Button icon={ExternalLink} label={`View commit ${shortSha(outcome.sha)}`} onPress={() => open(outcome.commitUrl)} />
        {fix && "fix" in fix && <DiffFile file={fix.fix.file} />}
        <T style={s.para}>The only check this change has had is the static rule re-run over the patched file. No tests were run.</T>
      </>
    );
  }

  if (plan.kind === "none") {
    return (
      <>
        {outcome?.kind === "issue" && <IssueOpened number={outcome.number} url={outcome.url} />}
        <View style={s.box}>
          <T style={s.boxLabel}>No automatic fix</T>
          <T style={s.boxText}>{plan.reason}</T>
        </View>
        {finding.remediation.rootCause ? (
          <View style={s.box}>
            <T style={s.boxLabel}>Root cause</T>
            <T style={s.boxText}>{finding.remediation.rootCause}</T>
          </View>
        ) : null}
        {issueButton("Open an issue on GitHub")}
        {pendingGate && <Button kind="primary" label="Review and confirm" onPress={() => review(pendingGate.id)} />}
      </>
    );
  }

  return (
    <>
      {outcome?.kind === "issue" && <IssueOpened number={outcome.number} url={outcome.url} />}
      {finding.remediation.rootCause ? (
        <View style={s.box}>
          <T style={s.boxLabel}>Root cause</T>
          <T style={s.boxText}>{finding.remediation.rootCause}</T>
        </View>
      ) : null}

      {(!fix || fix.stage === "blocked") && (
        <>
          <View style={s.box}>
            <T style={s.boxLabel}>Automatic rewrite available</T>
            <T style={s.boxText}>
              {plan.edit.note}. Arcade reads {finding.vulnerableCode.path} as it is on GitHub now, rewrites line {plan.line} in memory and re-runs the rule on the result. You see the diff before anything is written to {repo}.
            </T>
          </View>
          {plan.caveat && <Notice tone="amber" text={plan.caveat} />}
          {fix?.stage === "blocked" && <Notice tone="red" text={`No fix was prepared. ${fix.reason}`} />}
          {pendingGate ? (
            <Button kind="primary" label="Review the approval" onPress={() => review(pendingGate.id)} />
          ) : (
            <Button kind="primary" icon={Wrench} label={fix?.stage === "blocked" ? "Try again" : "Prepare the fix"} onPress={() => review(requestFix(finding.id))} />
          )}
          {fix?.stage === "blocked" && issueButton("Open an issue instead")}
        </>
      )}

      {fix?.stage === "preparing" && <Working text={`Reading ${finding.vulnerableCode.path} and rewriting line ${plan.line}…`} />}

      {fix && "fix" in fix && (
        <>
          <DiffFile file={fix.fix.file} />
          <View style={[s.box, s.boxGood]}>
            <T style={s.boxLabel}>Re-check</T>
            <T style={s.boxText}>{fix.fix.verdict.summary} That is the only check: no tests were run and nothing was executed.</T>
          </View>
          {fix.fix.caveat && <Notice tone="amber" text={fix.fix.caveat} />}

          {fix.stage === "shipping" ? (
            <Working text={`Committing to ${fix.fix.branch} in ${repo} and opening the pull request…`} />
          ) : fix.stage === "ready" && fix.canPush === false ? (
            <>
              <Notice tone="amber" text={`Nothing has been written. Your GitHub token can read ${repo} but not push to it, so Arcade cannot create the branch for this fix. Connect a token with the repo scope from an account with write access — or open an issue instead.`} />
              {issueButton("Open an issue instead")}
            </>
          ) : (
            <>
              {fix.stage === "ship-failed" && <Notice tone="red" text={`Nothing was committed. ${fix.error}`} />}
              <T style={s.para}>Nothing has been written yet. The change exists only on this phone until you confirm the commit.</T>
              <Button
                kind="primary"
                icon={GitPullRequest}
                label={fix.stage === "ship-failed" ? "Review and try again" : "Review commit & pull request"}
                onPress={() => review(pendingGate?.id ?? requestShip(finding.id))}
              />
            </>
          )}
        </>
      )}
    </>
  );
}

function IssueOpened({ number, url }: { number: number; url: string }) {
  return (
    <>
      <View style={[s.verdict, { borderColor: C.line, backgroundColor: C.raised }]}>
        <CircleDot size={24} color={C.fg} />
        <View style={{ flex: 1 }}>
          <T style={[s.verdictTitle, { color: C.white }]}>Issue #{number} opened</T>
          <T style={s.verdictText}>The finding is written up on GitHub. The code itself has not been changed.</T>
        </View>
      </View>
      <Button icon={ExternalLink} label={`Open issue #${number}`} onPress={() => open(url)} />
    </>
  );
}

function Working({ text }: { text: string }) {
  return (
    <View style={[s.box, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
      <ActivityIndicator color={C.muted} />
      <T style={[s.boxText, { flex: 1 }]}>{text}</T>
    </View>
  );
}

/** Also used by the approval sheet, which shows the same warnings. */
export function Notice({ tone, text }: { tone: "amber" | "red"; text: string }) {
  const color = tone === "red" ? C.red500 : C.amber400;
  return (
    <View style={[s.box, { flexDirection: "row", gap: 10, borderColor: alpha(color, 0.3), backgroundColor: alpha(color, 0.07) }]}>
      <CircleAlert size={16} color={tone === "red" ? C.red300 : C.amber200} style={{ marginTop: 2 }} />
      <T style={[s.boxText, { flex: 1, color: tone === "red" ? C.red200 : C.amber200 }]}>{text}</T>
    </View>
  );
}

function Fact({ k, v, mono, capitalize }: { k: string; v: string; mono?: boolean; capitalize?: boolean }) {
  return (
    <View style={s.fact}>
      <T style={s.factKey}>{k}</T>
      {mono ? <Mono style={s.factValue}>{v}</Mono> : <T style={[s.factValue, capitalize && { textTransform: "capitalize" }]}>{v}</T>}
    </View>
  );
}

