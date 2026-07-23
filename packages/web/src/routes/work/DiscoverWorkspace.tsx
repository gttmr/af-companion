import { useMemo } from "react";
import { useParams } from "react-router-dom";

import { parseTargetAnalysisResult } from "../../analyzer/targetAnalysisResult";
import type { AnalysisResult, AssetCandidate } from "../../analyzer/types";
import { useEditorActions, useWorkItem, useWorkItemFile } from "../../workspace/useWorkspaceProjection";
import { ReviewGateLine, ScreenState, SkillScreenHeader } from "./SkillScreenHeader";

export default function DiscoverWorkspace() {
  const { workId } = useParams<{ workId: string }>();
  const manifestQuery = useWorkItem(workId);
  const analysisQuery = useWorkItemFile(workId, "analysis-result.json");
  const editor = useEditorActions();
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
      {parsed.analysis ? <DiscoveryContent analysis={parsed.analysis} /> : null}
    </div>
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
