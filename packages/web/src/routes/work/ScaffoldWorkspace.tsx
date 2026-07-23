import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import type { WorkItemFileEntry } from "../../workspace/api";
import type { AfRevisionRef } from "../../analyzer/afWorkItem";
import {
  useEditorActions,
  useWorkItem,
  useWorkItemFile,
  useWorkItemFiles,
  useWorkspaceSnapshot,
} from "../../workspace/useWorkspaceProjection";
import { ReviewGateLine, ScreenState, SkillScreenHeader } from "./SkillScreenHeader";

type ScaffoldView = "source" | "handoff" | "changes";

export default function ScaffoldWorkspace() {
  const { workId } = useParams<{ workId: string }>();
  const manifestQuery = useWorkItem(workId);
  const filesQuery = useWorkItemFiles(workId);
  const workspace = useWorkspaceSnapshot();
  const editor = useEditorActions();
  const [view, setView] = useState<ScaffoldView>("source");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const manifest = manifestQuery.data?.data ?? null;
  const files = filesQuery.data ?? [];
  const sourceFiles = useMemo(() => files.filter(isRuntimeSource), [files]);
  const handoffFiles = useMemo(() => files.filter((file) => /(?:implementation-handoff\.md|scaffold-plan\.json|README\.md)$/.test(file.path)), [files]);
  const visibleFiles = view === "handoff" ? handoffFiles : sourceFiles;
  const selectedFile = useWorkItemFile(workId, selectedPath);
  const artifactPrefix = workId ? `artifacts/af/${workId}/` : "";
  const relevantChanges = (workspace.data?.changes ?? []).filter((change) =>
    change.path.startsWith(artifactPrefix) || manifest?.skills["af-scaffold-runtime"].output_roots.some((root) => change.path.startsWith(`${root}/`)),
  );

  useEffect(() => {
    if (view === "changes") return;
    if (!visibleFiles.some((file) => file.path === selectedPath)) setSelectedPath(visibleFiles[0]?.path ?? null);
  }, [selectedPath, view, visibleFiles]);

  if (!workId) return null;
  const compositionReady = manifest?.review_gates.composition.status === "approved";
  return (
    <div className="skill-screen scaffold-screen">
      <SkillScreenHeader workId={workId} skillId="af-scaffold-runtime" manifest={manifest} />
      <ReviewGateLine manifest={manifest} gate="composition" />
      {!compositionReady ? <ScreenState tone="warning" title="Scaffold gate가 닫혀 있습니다" detail="외부 Codex에서 Composition을 승인하기 전에는 Runtime Handoff를 생성할 수 없습니다." /> : null}

      <section className="scaffold-summary-strip">
        <Metric label="Source files" value={sourceFiles.length} />
        <Metric label="Output roots" value={manifest?.skills["af-scaffold-runtime"].output_roots.length ?? 0} />
        <Metric label="Workspace changes" value={relevantChanges.length} />
        <Metric label="Output revision" value={shortRevision(manifest?.skills["af-scaffold-runtime"].output_revision)} mono />
      </section>

      <div className="scaffold-view-tabs" role="tablist">
        <ViewTab id="source" active={view} onChange={setView}>Runtime source</ViewTab>
        <ViewTab id="handoff" active={view} onChange={setView}>Handoff</ViewTab>
        <ViewTab id="changes" active={view} onChange={setView} count={relevantChanges.length}>Git changes</ViewTab>
      </div>

      {filesQuery.isLoading ? <ScreenState title="Runtime output을 읽는 중" detail="외부 Codex가 생성한 artifact tree를 투영하고 있습니다." /> : null}
      {filesQuery.error ? <ScreenState tone="error" title="Artifact tree를 읽을 수 없음" detail={(filesQuery.error as Error).message} /> : null}

      {view !== "changes" ? (
        <section className="source-browser">
          <aside className="source-tree">
            <div className="source-tree-head"><span>{view === "source" ? "Generated tree" : "Handoff files"}</span><strong>{visibleFiles.length}</strong></div>
            {visibleFiles.length ? <ul>{visibleFiles.map((file) => (
              <li key={file.path}>
                <button type="button" className={selectedPath === file.path ? "is-selected" : ""} onClick={() => setSelectedPath(file.path)}>
                  <FileGlyph kind={file.kind} /><span>{file.path}</span><small>{formatBytes(file.bytes)}</small>
                </button>
              </li>
            ))}</ul> : <ScreenState title="표시할 output 없음" detail="af-scaffold-runtime이 source 또는 handoff를 기록하면 자동으로 나타납니다." />}
          </aside>
          <div className="source-preview">
            <div className="source-preview-head">
              <div><span>Read-only preview</span><strong>{selectedPath ?? "파일 선택 없음"}</strong></div>
              {selectedPath ? <div>
                <button type="button" onClick={() => void editor.openFile(`${artifactPrefix}${selectedPath}`)}>VS Code에서 열기 ↗</button>
                {relevantChanges.some((change) => change.path === `${artifactPrefix}${selectedPath}`) ? (
                  <button type="button" onClick={() => void editor.openDiff(`${artifactPrefix}${selectedPath}`)}>Diff ↗</button>
                ) : null}
              </div> : null}
            </div>
            {selectedFile.isLoading ? <p className="preview-message">파일을 읽는 중…</p> : selectedFile.error ? (
              <p className="preview-message is-error">{(selectedFile.error as Error).message}</p>
            ) : selectedFile.data ? <pre><code>{selectedFile.data.content}</code></pre> : <ScreenState title="파일을 선택하세요" detail="Companion은 source를 수정하지 않습니다. 편집은 VS Code에서 수행하세요." />}
          </div>
        </section>
      ) : (
        <section className="scaffold-change-table">
          <div className="section-title-line"><div><span>Git projection</span><h2>Scaffold-related changes</h2></div><p>Web은 diff를 읽기만 하며 staging·commit을 수행하지 않습니다.</p></div>
          {relevantChanges.length ? <table><thead><tr><th>Status</th><th>Path</th><th>Area</th><th /></tr></thead><tbody>
            {relevantChanges.map((change) => <tr key={change.path}>
              <td><span className={`change-code is-${change.status}`}>{change.status}</span></td>
              <td><code>{change.path}</code></td><td>{change.area}</td>
              <td><button type="button" onClick={() => void editor.openDiff(change.path)}>VS Code Diff ↗</button></td>
            </tr>)}
          </tbody></table> : <ScreenState title="관련 Git 변경 없음" detail="현재 Work Item output root에 uncommitted change가 없습니다." />}
        </section>
      )}
      {editor.error ? <p className="inline-error">{editor.error}</p> : null}
    </div>
  );
}

function isRuntimeSource(file: WorkItemFileEntry): boolean {
  return file.kind === "source" || file.path.startsWith("runtime-stub/") || file.path.startsWith("generated/");
}

function Metric({ label, value, mono = false }: { label: string; value: string | number; mono?: boolean }) {
  return <div><span>{label}</span><strong className={mono ? "is-mono" : ""}>{value}</strong></div>;
}

function ViewTab({ id, active, onChange, count, children }: {
  id: ScaffoldView; active: ScaffoldView; onChange: (value: ScaffoldView) => void; count?: number; children: string;
}) {
  return <button type="button" role="tab" aria-selected={active === id} onClick={() => onChange(id)}>{children}{count !== undefined ? <em>{count}</em> : null}</button>;
}

function FileGlyph({ kind }: { kind: WorkItemFileEntry["kind"] }) {
  return <i className={`file-glyph is-${kind}`}>{kind === "source" ? "<>" : kind === "evidence" ? "✓" : "·"}</i>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${bytes} B`;
  return `${(bytes / 1_024).toFixed(bytes > 10 * 1_024 ? 0 : 1)} KB`;
}

function shortRevision(value: AfRevisionRef | null | undefined): string {
  return value ? value.digest.slice(0, 12) : "—";
}
