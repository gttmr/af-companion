import type { GraphWorkspaceSnapshot } from "@agent-factory/companion-contracts";

export function ContextPublicationStrip({ workspace, pending }: { workspace: GraphWorkspaceSnapshot; pending: boolean }) {
  const valid = workspace.source_health.status === "valid";
  return <section className={`context-strip${valid ? "" : " is-failed"}`} aria-live="polite"><div><span className="status-dot" /><strong>{pending ? "Context 갱신 중" : valid ? "Context 사용 가능" : "Context 검증 실패"}</strong><span>{workspace.source_health.status === "valid" ? "Graph · selection · draft 최신 snapshot" : workspace.source_health.message}</span></div><div><span>Graph {workspace.graph_revision.slice(0, 8)}</span><span>Context {workspace.document_revision.slice(0, 8)}</span><span>authority · none</span></div></section>;
}
