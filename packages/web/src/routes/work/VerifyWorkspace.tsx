import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

import type { AfVerificationOutcome, AfWorkItemManifest } from "../../analyzer/afWorkItem";
import type { WorkItemFileEntry } from "../../workspace/api";
import { useEditorActions, useWorkItem, useWorkItemFile, useWorkItemFiles } from "../../workspace/useWorkspaceProjection";
import { ReviewGateLine, ScreenState, SkillScreenHeader } from "./SkillScreenHeader";

type EvidenceState = "passed" | "failed" | "present" | "missing" | "unverified";

interface EvidenceLayer {
  level: number;
  title: string;
  scope: string;
  state: EvidenceState;
  detail: string;
  refs: string[];
}

export default function VerifyWorkspace() {
  const { workId } = useParams<{ workId: string }>();
  const manifestQuery = useWorkItem(workId);
  const filesQuery = useWorkItemFiles(workId);
  const editor = useEditorActions();
  const manifest = manifestQuery.data?.data ?? null;
  const files = filesQuery.data ?? [];
  const layers = useMemo(() => buildEvidenceLayers(manifest, files), [files, manifest]);
  const evidenceFiles = useMemo(() => files.filter((file) => file.kind === "evidence" || /validation-report\.md$/.test(file.path)), [files]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const selectedFile = useWorkItemFile(workId, selectedPath);

  useEffect(() => {
    if (!evidenceFiles.some((file) => file.path === selectedPath)) setSelectedPath(evidenceFiles[0]?.path ?? null);
  }, [evidenceFiles, selectedPath]);

  if (!workId) return null;
  const outcome = manifest?.verification.outcome ?? null;
  return (
    <div className="skill-screen verify-screen">
      <SkillScreenHeader workId={workId} skillId="af-verify-runtime" manifest={manifest}>
        <span className={`verification-outcome is-${outcome ?? "unverified"}`}>{outcome ?? "unverified"}</span>
      </SkillScreenHeader>
      <ReviewGateLine manifest={manifest} gate="composition" />

      <section className="verification-thesis">
        <div><span>Verification model</span><h2>한 번의 초록불이 아니라, 다섯 층의 현재 증거</h2></div>
        <p>Companion은 검증을 실행하지 않습니다. 외부 `af-verify-runtime`이 남긴 revision, command evidence, runtime 결과와 behavior 판정을 그대로 읽습니다.</p>
      </section>

      <section className="evidence-ladder">
        {layers.map((layer) => (
          <article key={layer.level} className={`evidence-layer is-${layer.state}`}>
            <span className="evidence-level">L{layer.level}</span>
            <div className="evidence-copy"><small>{layer.scope}</small><h3>{layer.title}</h3><p>{layer.detail}</p></div>
            <div className="evidence-refs">{layer.refs.slice(0, 4).map((ref) => <code key={ref}>{ref}</code>)}</div>
            <strong className="evidence-state"><i />{layer.state}</strong>
          </article>
        ))}
      </section>

      {filesQuery.isLoading ? <ScreenState title="Verification evidence를 읽는 중" detail="현재 Work Item의 report와 runtime output을 분류하고 있습니다." /> : null}
      {filesQuery.error ? <ScreenState tone="error" title="Evidence tree를 읽을 수 없음" detail={(filesQuery.error as Error).message} /> : null}

      <section className="verification-detail-grid">
        <aside className="evidence-file-list">
          <div className="section-title-line compact"><div><span>Evidence files</span><h2>Fresh output</h2></div><strong>{evidenceFiles.length}</strong></div>
          {evidenceFiles.length ? <ul>{evidenceFiles.map((file) => (
            <li key={file.path}><button type="button" className={selectedPath === file.path ? "is-selected" : ""} onClick={() => setSelectedPath(file.path)}><span>{file.path}</span><time>{new Date(file.modified_at).toLocaleString()}</time></button></li>
          ))}</ul> : <ScreenState title="Evidence 파일 없음" detail="af-verify-runtime이 fresh report를 기록하면 이 목록에 나타납니다." />}
          <div className="verification-blockers">
            <span>Blocker refs</span>
            {(manifest?.skills["af-verify-runtime"].blocker_refs.length ?? 0) ? manifest?.skills["af-verify-runtime"].blocker_refs.map((ref) => <code key={ref}>{ref}</code>) : <strong>none recorded</strong>}
          </div>
        </aside>
        <div className="evidence-preview">
          <div className="source-preview-head">
            <div><span>Evidence preview</span><strong>{selectedPath ?? "파일 선택 없음"}</strong></div>
            {selectedPath ? <button type="button" onClick={() => void editor.openFile(`artifacts/af/${workId}/${selectedPath}`)}>VS Code에서 열기 ↗</button> : null}
          </div>
          {selectedFile.isLoading ? <p className="preview-message">Evidence를 읽는 중…</p> : selectedFile.error ? <p className="preview-message is-error">{(selectedFile.error as Error).message}</p> : selectedFile.data ? <pre><code>{selectedFile.data.content}</code></pre> : <ScreenState title="Evidence를 선택하세요" detail="검증 결과는 읽기 전용이며 외부 Codex가 갱신합니다." />}
        </div>
      </section>
      {editor.error ? <p className="inline-error">{editor.error}</p> : null}
    </div>
  );
}

export function buildEvidenceLayers(manifest: AfWorkItemManifest | null, files: WorkItemFileEntry[]): EvidenceLayer[] {
  const paths = new Set(files.map((file) => file.path));
  const source = files.filter((file) => file.kind === "source");
  const runtimeEvidence = files.filter((file) =>
    file.kind === "evidence" && /(?:smoke|runtime|test-results|pytest|eval|events?)(?:[./_-]|$)/i.test(file.path),
  );
  const report = files.find((file) => /validation-report\.md$/.test(file.path));
  const outcome = manifest?.verification.outcome ?? null;
  return [
    {
      level: 1,
      title: "Contract integrity",
      scope: "schema + lifecycle",
      state: manifest && paths.has("analysis-result.json") ? "present" : "missing",
      detail: "Work Item state와 Target Contract artifact가 같은 lifecycle 경계를 가리키는지 확인합니다.",
      refs: [manifest ? "af-work-item.json" : "", paths.has("analysis-result.json") ? "analysis-result.json" : ""].filter(Boolean),
    },
    {
      level: 2,
      title: "Artifact coherence",
      scope: "graph + scaffold projections",
      state: paths.has("graph-ir.json") && paths.has("scaffold-plan.json") ? "present" : "missing",
      detail: "Graph, scaffold plan과 Runtime Handoff 입력이 같은 approved revision에 기반하는지 확인합니다.",
      refs: ["graph-ir.json", "scaffold-plan.json"].filter((path) => paths.has(path)),
    },
    {
      level: 3,
      title: "Generated source",
      scope: "static + build evidence",
      state: source.length ? "present" : "missing",
      detail: "생성된 ADK source와 정적 검증 결과가 실제 파일로 남아 있는지 확인합니다.",
      refs: source.slice(0, 4).map((file) => file.path),
    },
    {
      level: 4,
      title: "Runtime execution",
      scope: "smoke + integration",
      state: runtimeEvidence.length ? "present" : "unverified",
      detail: "현재 output revision을 실제로 실행한 smoke, event 또는 integration 증거를 요구합니다.",
      refs: runtimeEvidence.slice(0, 4).map((file) => file.path),
    },
    {
      level: 5,
      title: "Behavior outcome",
      scope: "success + negative scenario",
      state: evidenceState(outcome, Boolean(report)),
      detail: "성공 시나리오와 안전·실패 시나리오의 관찰 결과를 최종 판정과 연결합니다.",
      refs: [manifest?.verification.report_ref, report?.path].filter((value): value is string => Boolean(value)),
    },
  ];
}

function evidenceState(outcome: AfVerificationOutcome | null, hasReport: boolean): EvidenceState {
  if (outcome === "passed") return "passed";
  if (outcome === "failed") return "failed";
  if (outcome === "unverified") return "unverified";
  return hasReport ? "present" : "unverified";
}
