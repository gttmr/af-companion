import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import { parseTargetAnalysisResult } from "../../analyzer/targetAnalysisResult";
import type { AfWorkItemManifest } from "../../analyzer/afWorkItem";
import type { AnalysisResult, GraphIR } from "../../analyzer/types";
import { GraphCanvas } from "../../components/GraphCanvas";
import { useCodexSessions } from "../../state/useCodexSessions";
import { WorkspaceApiError } from "../../workspace/api";
import { useGraphProjection, useWorkItem, useWorkItemFile } from "../../workspace/useWorkspaceProjection";
import { ReviewGateLine, ScreenState, SkillScreenHeader } from "./SkillScreenHeader";

export default function ComposeWorkspace() {
  const { workId } = useParams<{ workId: string }>();
  const manifestQuery = useWorkItem(workId);
  const graphQuery = useGraphProjection(workId);
  const analysisQuery = useWorkItemFile(workId, "analysis-result.json");
  const codex = useCodexSessions();
  const [targetSessionId, setTargetSessionId] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "warning" | "error"; text: string } | null>(null);
  const analysis = useMemo(() => parseAnalysis(analysisQuery.data?.content), [analysisQuery.data?.content]);
  if (!workId) return null;
  const manifest = manifestQuery.data?.data ?? null;
  const graph = graphQuery.data?.data.graph ?? null;
  const activeSessions = codex.snapshot?.sessions.filter((session) => (
    session.participation === "companion_active"
    && session.status === "active"
    && session.work_id === workId
    && session.role === "materialization"
  )) ?? [];
  const discoveryReady = manifest?.review_gates.discovery.status === "approved";

  function saveGraph(next: GraphIR) {
    const etag = graphQuery.data?.etag;
    if (!targetSessionId) {
      setMessage({ tone: "warning", text: "저장 변경을 받을 활성 Codex session을 명시적으로 선택하세요. 자동 target은 사용하지 않습니다." });
      return;
    }
    if (!etag) {
      setMessage({ tone: "error", text: "Graph ETag가 없어 저장할 수 없습니다. 최신 projection을 다시 불러오세요." });
      return;
    }
    setMessage(null);
    graphQuery.save.mutate({ graph: next, etag, targetSessionId }, {
      onSuccess: (result) => {
        if (result.delivery_error) {
          setMessage({ tone: "warning", text: `Graph는 저장됐지만 Codex 전달은 실패했습니다: ${result.delivery_error.message}` });
        } else {
          setMessage({ tone: "ok", text: "Graph IR를 저장하고 선택한 Codex session의 다음 prompt에 graph_change를 예약했습니다." });
        }
      },
      onError: (error) => {
        const conflict = error instanceof WorkspaceApiError && error.code === "etag_conflict";
        setMessage({
          tone: "error",
          text: conflict
            ? "외부 Codex가 Graph를 먼저 변경했습니다. 현재 draft를 복사해 둔 뒤 최신 projection을 다시 불러오세요. 자동 병합하지 않았습니다."
            : error instanceof Error ? error.message : "Graph 저장에 실패했습니다.",
        });
      },
    });
  }

  return (
    <div className="skill-screen compose-screen">
      <SkillScreenHeader workId={workId} skillId="af-compose-solution" manifest={manifest}>
        <label className="codex-target-select">
          <span>Graph change target</span>
          <select value={targetSessionId} onChange={(event) => setTargetSessionId(event.currentTarget.value)}>
            <option value="">Codex session 선택…</option>
            {activeSessions.map((session) => (
              <option key={session.session_id} value={session.session_id}>
                {session.alias || compactId(session.session_id)} · {session.model}
              </option>
            ))}
          </select>
        </label>
      </SkillScreenHeader>
      {message ? <div className={`compose-message is-${message.tone}`}>{message.text}{message.tone === "error" ? <button type="button" onClick={() => void graphQuery.refetch()}>최신 Graph 불러오기</button> : null}</div> : null}

      {graphQuery.isLoading ? <ScreenState title="Graph IR을 읽는 중" detail="analysis-result.json의 canonical embedded Graph를 투영합니다." /> : null}
      {graphQuery.error ? <ScreenState tone="error" title="Graph IR을 열 수 없음" detail={(graphQuery.error as Error).message} /> : null}
      {graph ? (
        <section className="compose-graph-surface">
          <div className="graph-ownership-note">
            <span>Web edit boundary</span>
            <strong>Graph IR only</strong>
            <p>Asset, Binding, Runtime Contract와 source 변경은 외부 Codex에서 수행합니다. 저장은 전체 artifact를 재작성하지 않고 Graph field와 split projection만 갱신합니다.</p>
          </div>
          <GraphCanvas
            key={`${workId}-${graphQuery.data?.etag ?? "graph"}`}
            graphIR={graph}
            assetCandidates={graphQuery.data?.data.asset_candidates ?? []}
            editable={Boolean(discoveryReady)}
            saving={graphQuery.save.isPending}
            onSaveGraph={saveGraph}
          />
        </section>
      ) : null}

      <section className="composition-context" aria-labelledby="composition-context-title">
        <div className="section-title-line compact">
          <div><span>Resolved structure</span><h2 id="composition-context-title">Graph 해석과 readiness</h2></div>
          <p>Graph 아래에서 승인 상태, Root Executable, binding과 runtime seam을 확인합니다.</p>
        </div>
        <div className="compose-gates"><ReviewGateLine manifest={manifest} gate="discovery" /><ReviewGateLine manifest={manifest} gate="composition" /></div>
        {manifest ? <CompositionOutcomeStrip manifest={manifest} /> : null}
        {!discoveryReady ? <ScreenState tone="warning" title="Compose gate가 닫혀 있습니다" detail="외부 Codex에서 Discover 산출물을 검토하고 discovery review를 승인한 뒤 Graph를 편집할 수 있습니다." /> : null}
        {activeSessions.length === 0 ? <ScreenState tone="warning" title="활성 Companion session 없음" detail="Home에서 이 Work Item의 VS Code Plan session을 시작하세요. Materialization handoff는 별도 capsule-free launch 경로가 제공될 때 사용합니다." /> : null}
      </section>

      {analysis && manifest ? <CompositionRegisters analysis={analysis} manifest={manifest} /> : null}
    </div>
  );
}

function CompositionOutcomeStrip({ manifest }: { manifest: AfWorkItemManifest }) {
  const requiredOpen = manifest.decisions.some((decision) => decision.required && decision.status === "open")
    || manifest.asset_decisions.some((decision) => decision.required && decision.status === "open");
  const currentRevisions = ["discovery", "graph", "root_executable", "runtime_contract", "composition"] as const;
  const readiness = !requiredOpen
    && manifest.review_gates.discovery.status === "approved"
    && Boolean(manifest.solution_control_strategy && manifest.root_executable)
    && currentRevisions.every((key) => manifest.revisions[key]);
  return (
    <section className="composition-outcome-strip">
      <div><span>Solution control</span><strong>{manifest.solution_control_strategy ?? "결정 필요"}</strong></div>
      <div><span>Root Executable</span>{manifest.root_executable ? <><strong>{manifest.root_executable.asset_type}</strong><code>{manifest.root_executable.asset_ref}@{manifest.root_executable.asset_version}</code></> : <strong>결정 필요</strong>}</div>
      <div><span>Registry snapshot</span><strong>{manifest.revisions.catalog_snapshot?.registry_revision?.slice(0, 12) ?? "unbound"}</strong></div>
      <div className={readiness ? "is-ready" : "is-blocked"}><span>Composition readiness</span><strong>{readiness ? "Ready for review" : "Not ready"}</strong><small>{requiredOpen ? "required decision open" : readiness ? "current revision set complete" : "gate, Root 또는 revision 확인 필요"}</small></div>
    </section>
  );
}

function CompositionRegisters({ analysis, manifest }: { analysis: AnalysisResult; manifest: AfWorkItemManifest }) {
  const activeReturns = manifest.composition_cycles
    .filter((cycle) => cycle.return_to_discover)
    .map((cycle) => ({ cycleId: cycle.cycle_id, value: cycle.return_to_discover! }));
  const latestReturn = activeReturns[activeReturns.length - 1] ?? null;
  const activeInvalidations = manifest.invalidations.filter((invalidation) => invalidation.status === "active");
  return (
    <>
      <section className="composition-registers">
        <div className="binding-register">
        <div className="section-title-line compact"><div><span>Bindings</span><h2>Invocation & protocol</h2></div><strong>{analysis.assetCandidates.length}</strong></div>
        <table><thead><tr><th>Asset</th><th>Exact ref / disposition</th><th>Binding</th><th>Invocation control</th></tr></thead>
          <tbody>{analysis.assetCandidates.map((asset) => (
            <tr key={asset.asset_id}>
              <td><strong>{asset.name}</strong><code>{asset.asset_id}</code></td>
              <td>{assetDecisionLabel(manifest, asset.asset_id)}</td>
              <td>{asset.binding?.kind ?? "—"}</td>
              <td>{invocationControl(asset.asset_type)}</td>
            </tr>
          ))}</tbody>
        </table>
        </div>
        <div className="runtime-contract-register">
        <div className="section-title-line compact"><div><span>Runtime contracts</span><h2>Execution seams</h2></div><strong>{analysis.runtimeContracts.length}</strong></div>
        {analysis.runtimeContracts.length ? <ul>{analysis.runtimeContracts.map((contract) => (
          <li key={contract.contract_id}>
            <div><strong>{contract.title}</strong><code>{contract.contract_id}</code></div>
            <span>{contract.contract_kind}</span>
            <em className={`is-${contract.contract_status}`}>{contract.contract_status}</em>
          </li>
        ))}</ul> : <ScreenState title="Runtime Contract 없음" detail="현재 composition은 별도 runtime seam을 요구하지 않습니다." />}
        </div>
      </section>
      <section className="composition-reentry-register">
        <div className="section-title-line"><div><span>Re-entry</span><h2>Return to Discover & invalidation</h2></div><p>Compose는 부족한 capability를 임의로 보완하지 않고 새 Discovery Cycle로 돌려보냅니다.</p></div>
        <div className="composition-reentry-grid">
          <div>
            <span>Latest Return-to-Discover</span>
            {latestReturn ? <><strong>{latestReturn.value.missing_capability}</strong><code>{latestReturn.value.return_id} · {latestReturn.cycleId}</code><p>{latestReturn.value.required_contract_delta}</p><small>Graph impact: {latestReturn.value.graph_impact}</small><ul>{latestReturn.value.recommended_search_criteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul></> : <p>현재 composition cycle에는 Return-to-Discover 요청이 없습니다.</p>}
          </div>
          <div>
            <span>Active invalidations</span>
            {activeInvalidations.length ? <ul>{activeInvalidations.map((invalidation) => <li key={invalidation.invalidation_id}><strong>{invalidation.source_skill} → {invalidation.target_skill}</strong><p>{invalidation.reason}</p><code>{invalidation.affected_refs.join(", ")}</code></li>)}</ul> : <p>현재 revision을 무효화하는 active record가 없습니다.</p>}
          </div>
        </div>
      </section>
    </>
  );
}

function assetDecisionLabel(manifest: AfWorkItemManifest, assetId: string) {
  const decision = manifest.asset_decisions.find((candidate) => candidate.asset_ref === assetId && candidate.status === "resolved");
  if (!decision) return <span className="decision-status is-open">unresolved</span>;
  return <><strong>{decision.asset_ref}{decision.asset_version ? `@${decision.asset_version}` : ""}</strong><small>{decision.selected_disposition} · {decision.match_grade}</small></>;
}

function invocationControl(assetType: string): string {
  if (assetType === "tool") return "Workflow or Agent (Graph ref 기준)";
  if (assetType === "workflow") return "Workflow";
  return "Agent";
}

function compactId(value: string): string {
  return value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-7)}` : value;
}

function parseAnalysis(content: string | undefined): AnalysisResult | null {
  if (!content) return null;
  try { return parseTargetAnalysisResult(JSON.parse(content)); } catch { return null; }
}
