import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { parseTargetAnalysisResult } from "../../analyzer/targetAnalysisResult";
import type { AfWorkItemManifest } from "../../analyzer/afWorkItem";
import type { AnalysisResult, AssetCandidate } from "../../analyzer/types";
import type { CodexCompanionSnapshotV2 } from "../../companion/types";
import { useCodexSessions, type MaterializationLaunchAuthority } from "../../state/useCodexSessions";
import { useEditorActions, useWorkItem, useWorkItemFile } from "../../workspace/useWorkspaceProjection";
import { ReviewGateLine, ScreenState, SkillScreenHeader } from "./SkillScreenHeader";

export default function DiscoverWorkspace() {
  const { workId } = useParams<{ workId: string }>();
  const manifestQuery = useWorkItem(workId);
  const analysisQuery = useWorkItemFile(workId, "analysis-result.json");
  const editor = useEditorActions();
  const codex = useCodexSessions();
  const [handoffLaunchMessage, setHandoffLaunchMessage] = useState<string | null>(null);
  const parsed = useMemo(() => parseAnalysis(analysisQuery.data?.content), [analysisQuery.data?.content]);
  if (!workId) return null;
  const manifest = manifestQuery.data?.data ?? null;

  return (
    <div className="skill-screen discover-screen">
      <SkillScreenHeader workId={workId} skillId="af-discover-assets" manifest={manifest}>
        <button type="button" className="skill-inline-action" onClick={() => void editor.openFile(`artifacts/af/${workId}/analysis-result.json`)}>
          analysis-result.json <span>↗</span>
        </button>
      </SkillScreenHeader>
      <ReviewGateLine manifest={manifest} gate="discovery" />

      {analysisQuery.isLoading ? <ScreenState title="Discovery 산출물을 읽는 중" detail="외부 Codex가 기록한 analysis-result.json을 투영하고 있습니다." /> : null}
      {analysisQuery.error ? <ScreenState tone="warning" title="Discovery 산출물 없음" detail={(analysisQuery.error as Error).message} /> : null}
      {parsed.error ? <ScreenState tone="error" title="Target Contract 검증 실패" detail={parsed.error} /> : null}
      {manifest ? <DiscoveryLifecycle
        workId={workId}
        manifest={manifest}
        snapshot={codex.snapshot}
        launchPending={codex.vscodeSessionPending}
        launchError={codex.vscodeSessionError}
        launchMessage={handoffLaunchMessage}
        onLaunchHandoff={async (authority) => {
          setHandoffLaunchMessage(null);
          try {
            await codex.launchMaterializationSession(workId, authority);
            setHandoffLaunchMessage("VS Code에서 fresh Materialization session을 열었습니다. trusted Task가 Plan을 자동으로 이어갑니다.");
          } catch {
            // The mutation exposes the stable server message below the action.
          }
        }}
      /> : null}
      {parsed.analysis ? <DiscoveryContent analysis={parsed.analysis} /> : null}
    </div>
  );
}

function DiscoveryLifecycle({
  workId,
  manifest,
  snapshot,
  launchPending,
  launchError,
  launchMessage,
  onLaunchHandoff,
}: {
  workId: string;
  manifest: AfWorkItemManifest;
  snapshot: CodexCompanionSnapshotV2 | null;
  launchPending: boolean;
  launchError: string | null;
  launchMessage: string | null;
  onLaunchHandoff: (authority: MaterializationLaunchAuthority) => Promise<void>;
}) {
  const sessions = snapshot?.sessions.filter((session) => (
    session.participation === "companion_active"
    && session.status === "active"
    && session.work_id === workId
  )) ?? [];
  const planSessions = sessions.filter((session) => session.role === "plan");
  const materializationSessions = sessions.filter((session) => session.role === "materialization");
  const bridgeHandoffs = snapshot?.handoffs.filter((handoff) => handoff.work_id === workId) ?? [];
  const bootstrapGrants = snapshot?.materialization_grants.filter((grant) => grant.work_id === workId) ?? [];
  const bridgeAuthorities = [
    ...bridgeHandoffs.map((value) => ({ kind: "handoff" as const, value })),
    ...bootstrapGrants.map((value) => ({ kind: "grant" as const, value })),
  ].sort((left, right) => Date.parse(left.value.created_at) - Date.parse(right.value.created_at));
  const latestBridgeAuthority = bridgeAuthorities[bridgeAuthorities.length - 1] ?? null;
  const latestLedgerHandoff = manifest.session_handoffs[manifest.session_handoffs.length - 1] ?? null;
  const latestCycle = manifest.discovery_cycles[manifest.discovery_cycles.length - 1] ?? null;
  const launchableAuthority = latestBridgeAuthority
    && ["ready", "waiting_for_fresh_session"].includes(latestBridgeAuthority.value.status)
    && Date.parse(latestBridgeAuthority.value.expires_at) > Date.now()
    ? latestBridgeAuthority
    : null;
  const authorityStatus = latestBridgeAuthority?.value.status ?? latestLedgerHandoff?.status ?? "none";
  const authorityCapability = launchableAuthority?.kind === "grant"
    ? snapshot?.capabilities.materialization_bootstrap_grant
    : snapshot?.capabilities.fresh_session_handoff;
  return (
    <section className="discovery-lifecycle-register">
      <div className="section-title-line"><div><span>Plan → Materialization</span><h2>Discovery cycle과 Session Handoff</h2></div><p>Work Item이 primary identity이며 Session은 명시적으로 붙는 실행 actor입니다.</p></div>
      <div className="lifecycle-metrics">
        <LifecycleMetric label="Control strategy" value={manifest.solution_control_strategy ?? "결정 필요"} tone={manifest.solution_control_strategy ? "ok" : "warning"} />
        <LifecycleMetric label="Root executable" value={manifest.root_executable ? `${manifest.root_executable.asset_type} · ${manifest.root_executable.asset_ref}@${manifest.root_executable.asset_version}` : "결정 필요"} tone={manifest.root_executable ? "ok" : "warning"} />
        <LifecycleMetric label="Discovery cycle" value={latestCycle ? `${latestCycle.cycle_id} · ${latestCycle.status}` : "not started"} tone={latestCycle?.status === "complete" ? "ok" : "neutral"} />
        <LifecycleMetric label="Plan authority" value={authorityStatus} tone={["claimed", "finalized"].includes(authorityStatus) ? "ok" : "warning"} />
      </div>
      <div className="session-role-register">
        <SessionRole title="Plan Session" sessions={planSessions} empty="Plan Mode session이 아직 Work Item에 연결되지 않았습니다." />
        <SessionRole title="Materialization Session" sessions={materializationSessions} empty="Fresh handoff claim 또는 exact-scope Companion Join이 필요합니다." />
        <div className="handoff-summary">
          <span>Latest Plan authority</span>
          {latestBridgeAuthority ? <><strong>{latestBridgeAuthority.kind === "grant" ? `Bootstrap Grant · ${latestBridgeAuthority.value.status}` : `Canonical Handoff · ${latestBridgeAuthority.value.status}`}</strong><code>{latestBridgeAuthority.kind === "grant" ? latestBridgeAuthority.value.grant_id : latestBridgeAuthority.value.handoff_id}</code><small>{latestBridgeAuthority.value.claimed_by_session_id ? `claimed by ${compactId(latestBridgeAuthority.value.claimed_by_session_id)}` : `expires ${new Date(latestBridgeAuthority.value.expires_at).toLocaleString()}`}</small></> : latestLedgerHandoff ? <><strong>{latestLedgerHandoff.status}</strong><code>{latestLedgerHandoff.handoff_id}</code><small>ledger revision {latestLedgerHandoff.discovery_revision.digest.slice(0, 10)}</small></> : <p>Plan authority가 준비되면 fresh-session 상태를 표시합니다.</p>}
          {launchableAuthority ? <button
            type="button"
            className="primary handoff-launch-action"
            disabled={launchPending || !authorityCapability}
            onClick={() => void onLaunchHandoff({
              kind: launchableAuthority.kind,
              id: launchableAuthority.kind === "grant"
                ? launchableAuthority.value.grant_id
                : launchableAuthority.value.handoff_id,
            })}
          >{launchPending ? "Workspace 여는 중…" : "새 Materialization Session 열기"}<span aria-hidden="true">↗</span></button> : null}
          {launchMessage ? <p className="handoff-launch-message" role="status">{launchMessage}</p> : null}
          {launchError ? <p className="handoff-launch-message is-error" role="alert">{launchError}</p> : null}
        </div>
      </div>
    </section>
  );
}

function DiscoveryContent({ analysis }: { analysis: AnalysisResult }) {
  const missing = [
    ...analysis.evidence.missing_information.map((value) => ({ owner: "requirement", value })),
    ...analysis.assetCandidates.flatMap((candidate) => candidate.missing_information.map((value) => ({ owner: candidate.asset_id, value }))),
  ];
  return (
    <>
      <section className="discovery-overview">
        <div className="requirement-brief">
          <span className="section-kicker">Normalized requirement</span>
          <h2>{analysis.normalizedRequirement.title}</h2>
          <p>{analysis.normalizedRequirement.business_goal}</p>
          <dl>
            <div><dt>Domain</dt><dd>{analysis.normalizedRequirement.domain}</dd></div>
            <div><dt>Requester</dt><dd>{analysis.normalizedRequirement.requester.team} · {analysis.normalizedRequirement.requester.role}</dd></div>
            <div><dt>Status</dt><dd>{analysis.normalizedRequirement.status}</dd></div>
            <div><dt>Risk signals</dt><dd>{analysis.evidence.risk_signals.join(", ") || "none"}</dd></div>
          </dl>
        </div>
        <div className="evidence-ledger">
          <div className="section-title-line compact"><div><span>Evidence</span><h2>관찰된 요구</h2></div><strong>{analysis.evidence.input_data.length + analysis.evidence.output_data.length} facts</strong></div>
          <EvidenceRow label="Input" values={analysis.evidence.input_data} />
          <EvidenceRow label="Output" values={analysis.evidence.output_data} />
          <EvidenceRow label="Systems" values={analysis.evidence.systems_mentioned} />
          <EvidenceRow label="Decisions" values={analysis.evidence.decisions_implied} />
          <EvidenceRow label="Assumptions" values={analysis.evidence.assumptions} />
        </div>
      </section>

      <section className="candidate-register">
        <div className="section-title-line"><div><span>Candidate register</span><h2>Agent · Workflow · Tool</h2></div><p>{analysis.assetCandidates.length} candidates · top-level category는 세 종류뿐입니다.</p></div>
        <table>
          <thead><tr><th>Candidate</th><th>Type</th><th>Binding / profile</th><th>Owner</th><th>Risk</th><th>Review</th></tr></thead>
          <tbody>{analysis.assetCandidates.map((candidate) => <CandidateRow key={candidate.asset_id} candidate={candidate} />)}</tbody>
        </table>
      </section>

      <section className="discovery-bottom-grid">
        <div className="dependency-register">
          <div className="section-title-line compact"><div><span>Dependencies</span><h2>연결 단서</h2></div></div>
          <ul>
            {analysis.assetCandidates.map((candidate) => (
              <li key={candidate.asset_id}>
                <code>{candidate.asset_id}</code>
                <strong>{bindingLabel(candidate)}</strong>
                <span>{candidate.connection?.transport ?? "no transport"}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="missing-register">
          <div className="section-title-line compact"><div><span>Open questions</span><h2>Missing Information</h2></div><strong>{missing.length}</strong></div>
          {missing.length ? <ol>{missing.map((entry, index) => <li key={`${entry.owner}-${index}`}><code>{entry.owner}</code><span>{entry.value}</span></li>)}</ol> : <ScreenState title="열린 질문 없음" detail="현재 Discovery artifact에 미해결 정보가 없습니다." />}
        </div>
      </section>
    </>
  );
}

function LifecycleMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "ok" | "warning" }) {
  return <div className={`lifecycle-metric is-${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function SessionRole({ title, sessions, empty }: { title: string; sessions: CodexCompanionSnapshotV2["sessions"]; empty: string }) {
  return <div className="session-role"><span>{title}</span>{sessions.length ? sessions.map((session) => <div key={session.session_id}><strong>{session.alias || compactId(session.session_id)}</strong><code>{compactId(session.session_id)}</code><small>{session.status} · {session.last_event} · {new Date(session.last_seen_at).toLocaleString()}</small></div>) : <p>{empty}</p>}</div>;
}

function CandidateRow({ candidate }: { candidate: AssetCandidate }) {
  return (
    <tr>
      <td><strong>{candidate.name}</strong><code>{candidate.asset_id}</code><small>{candidate.rationale}</small></td>
      <td><span className={`asset-type-label is-${candidate.asset_type}`}>{candidate.asset_type}</span></td>
      <td><strong>{bindingLabel(candidate)}</strong><small>{candidate.workflow_profile?.coordination ?? candidate.connection?.transport ?? "—"}</small></td>
      <td>{candidate.owner}<small>{candidate.domain_scope}</small></td>
      <td><span className={`risk-label is-${candidate.risk_level}`}>{candidate.risk_level}</span></td>
      <td><span className={`candidate-status is-${candidate.status}`}>{candidate.status}</span></td>
    </tr>
  );
}

function EvidenceRow({ label, values }: { label: string; values: string[] }) {
  return <div className="evidence-row"><strong>{label}</strong><span>{values.length ? values.join(" · ") : "—"}</span></div>;
}

function bindingLabel(candidate: AssetCandidate): string {
  if (candidate.binding?.kind === "mcp") return `MCP · ${candidate.binding.server_ref}/${candidate.binding.tool_name}`;
  if (candidate.binding?.kind === "a2a") return `A2A · ${candidate.binding.contract_ref}`;
  if (candidate.binding) return candidate.binding.kind;
  if (candidate.workflow_profile) return `${candidate.workflow_profile.representation} · ${candidate.workflow_profile.coordination}`;
  return "unbound";
}

function parseAnalysis(content: string | undefined): { analysis: AnalysisResult | null; error: string | null } {
  if (!content) return { analysis: null, error: null };
  try {
    return { analysis: parseTargetAnalysisResult(JSON.parse(content)), error: null };
  } catch (error) {
    return { analysis: null, error: error instanceof Error ? error.message : "analysis-result.json을 읽지 못했습니다." };
  }
}

function compactId(value: string): string {
  return value.length > 20 ? `${value.slice(0, 9)}…${value.slice(-7)}` : value;
}
