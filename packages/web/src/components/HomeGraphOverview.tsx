import { Link } from "react-router-dom";

import type { AfWorkItemManifest } from "../analyzer/afWorkItem";
import { GraphCanvas, type Selection } from "./GraphCanvas";
import { WorkspaceApiError } from "../workspace/api";
import type { WorkspaceProjectionSnapshot } from "../workspace/types";
import { useGraphProjection } from "../workspace/useWorkspaceProjection";

const previewSelection: Selection = { nodeId: null, edgeId: null };

export function HomeGraphOverview({
  workId,
  manifest,
  workspace,
}: {
  workId: string;
  manifest: AfWorkItemManifest | null;
  workspace: WorkspaceProjectionSnapshot | null;
}) {
  const graphQuery = useGraphProjection(workId);
  const graph = graphQuery.data?.data.graph ?? null;
  const root = manifest?.root_executable ?? null;
  const latestApplicationSource = [...(workspace?.activities ?? [])].reverse().find((activity) => (
    activity.work_id === workId && activity.kind === "application_source"
  ));
  const missingGraph = graphQuery.error instanceof WorkspaceApiError && graphQuery.error.status === 404;

  return (
    <section className="home-graph-overview" aria-labelledby="home-graph-title">
      <header className="home-graph-overview-header">
        <div>
          <span>Current application</span>
          <h2 id="home-graph-title">{workId}</h2>
          <p>Graph IR과 확정된 Root 구조를 읽기 전용으로 표시합니다.</p>
        </div>
        <Link className="home-graph-open" to={`/work/${encodeURIComponent(workId)}/compose`}>
          전체 Graph IR 열기 <span aria-hidden="true">↗</span>
        </Link>
      </header>

      {graphQuery.isLoading ? (
        <GraphOverviewState title="Graph IR을 읽는 중" detail="현재 Work Item의 canonical Graph projection을 불러오고 있습니다." />
      ) : graphQuery.error ? (
        <GraphOverviewState
          tone={missingGraph ? "muted" : "error"}
          title={missingGraph ? "Graph IR이 아직 없습니다" : "Graph IR을 열 수 없습니다"}
          detail={missingGraph ? "Compose 결과가 materialize되면 이 영역에 실행 구조가 표시됩니다." : (graphQuery.error as Error).message}
        />
      ) : graph ? (
        <div className="home-graph-overview-body">
          <div className="home-graph-preview" aria-label={`${workId} Graph IR 미리보기`}>
            <GraphCanvas
              graphIR={graph}
              assetCandidates={graphQuery.data?.data.asset_candidates ?? []}
              selection={previewSelection}
              variant="preview"
            />
          </div>
          <dl className="home-graph-outcomes" aria-label="확정된 application 구조">
            <GraphOutcome
              label={root?.asset_type === "agent" ? "Root Agent" : root?.asset_type === "workflow" ? "Root Workflow" : "Root Executable"}
              value={root ? `${root.asset_ref}@${root.asset_version}` : "not resolved"}
              detail={root?.asset_type ?? "materialization waiting"}
            />
            <GraphOutcome
              label="Solution control"
              value={manifest?.solution_control_strategy ?? "not resolved"}
              detail="reviewed composition result"
            />
            <GraphOutcome
              label="Graph revision"
              value={manifest?.revisions.graph?.digest.slice(0, 12) ?? "not recorded"}
              detail={`${graph.nodes.length} nodes · ${graph.edges.length} edges · ${graph.regions.length} regions`}
            />
            <GraphOutcome
              label="Application source"
              value={latestApplicationSource?.path ?? "change waiting"}
              detail={latestApplicationSource ? `${latestApplicationSource.action} · ${new Date(latestApplicationSource.at).toLocaleString()}` : "registered app activity waiting"}
            />
          </dl>
        </div>
      ) : null}
    </section>
  );
}

function GraphOutcome({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd title={value}>{value}</dd>
      <small>{detail}</small>
    </div>
  );
}

function GraphOverviewState({ title, detail, tone = "muted" }: {
  title: string;
  detail: string;
  tone?: "muted" | "error";
}) {
  return (
    <div className={`home-graph-state is-${tone}`}>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
