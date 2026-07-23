import { Link } from "react-router-dom";

import { afWorkSkillIds, afWorkSkillLabels } from "../analyzer/afWorkItem";
import { useWorkspaceProjection } from "../workspace/useWorkspaceProjection";

export default function WorkspaceHome() {
  const workspace = useWorkspaceProjection();
  const snapshot = workspace.data;
  return (
    <div className="workspace-home">
      <section className="workspace-hero">
        <div>
          <span className="workspace-eyebrow">Agent Factory companion</span>
          <h1>Codex가 만들고,<br />Companion이 보여줍니다.</h1>
          <p>CLI와 VS Code extension이 실제 산출물과 source를 소유합니다. 이 화면은 네 Work Skill의 상태, Graph IR, 검증 증거와 Git 변화를 실시간으로 투영합니다.</p>
        </div>
        <div className="workspace-hero-meta">
          <div><span>Workspace</span><strong>{snapshot?.identity.display_name ?? "연결 중"}</strong></div>
          <div><span>Branch</span><strong>{snapshot?.identity.git_branch || "detached"}</strong></div>
          <div><span>Work items</span><strong>{snapshot?.work_items.length ?? 0}</strong></div>
          <div><span>Changes</span><strong>{snapshot?.changes.length ?? 0}</strong></div>
        </div>
      </section>

      <section className="work-map" aria-label="Work Skill lifecycle">
        {afWorkSkillIds.map((skillId, index) => (
          <div key={skillId} className="work-map-step">
            <span>{String(index + 1).padStart(2, "0")}</span>
            <div><strong>{afWorkSkillLabels[skillId].short}</strong><code>{skillId}</code><p>{afWorkSkillLabels[skillId].description}</p></div>
          </div>
        ))}
      </section>

      <section className="work-item-index">
        <div className="section-title-line">
          <div><span>Workspace projection</span><h2>Work items</h2></div>
          <p>새 Work Item과 lifecycle 변경은 외부 Codex에서 수행합니다.</p>
        </div>
        {workspace.isLoading ? <p className="table-message">Work Item을 읽는 중…</p> : workspace.error ? (
          <p className="table-message is-error">{(workspace.error as Error).message}</p>
        ) : !snapshot?.work_items.length ? (
          <div className="empty-workspace-guide">
            <strong>아직 `af-work-item.json`이 없습니다.</strong>
            <p>이 repository에서 Codex CLI 또는 VS Code extension을 열고 `af-workflow`로 시작하세요. Companion은 외부 작업이 만든 파일을 자동으로 감지합니다.</p>
            <code>Agent Factory로 새 작업을 시작하고 af-workflow로 현재 상태를 판단해줘.</code>
          </div>
        ) : (
          <div className="work-item-table-wrap">
            <table className="work-item-table">
              <thead><tr><th>Work item</th><th>Active skill</th><th>Discover</th><th>Compose</th><th>Scaffold</th><th>Verify</th><th>Updated</th></tr></thead>
              <tbody>
                {snapshot.work_items.map((item) => (
                  <tr key={item.work_id}>
                    <td><Link to={`/work/${encodeURIComponent(item.work_id)}/discover`}>{item.work_id}</Link><code>{item.artifact_root}</code></td>
                    <td>{item.active_skill ? afWorkSkillLabels[item.active_skill].short : "—"}</td>
                    {afWorkSkillIds.map((skillId) => <td key={skillId}><span className={`table-status is-${item.skills[skillId].status}`}>{item.skills[skillId].status}</span></td>)}
                    <td><time>{new Date(item.updated_at).toLocaleString()}</time></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
