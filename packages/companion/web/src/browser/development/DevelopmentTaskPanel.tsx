import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CompanionDevelopmentContextCapsule, CompanionDevelopmentContextRequest, CompanionSourceProjectsSnapshot } from "@agent-factory/companion-contracts";
import type { GraphSelection } from "@agent-factory/companion-graph-domain";
import type { CompanionApi } from "../api/CompanionApi.js";

export function DevelopmentTaskPanel({ api, applicationId, graphRevision, selection }: {
  api: CompanionApi;
  applicationId: string;
  graphRevision: string;
  selection: GraphSelection;
}) {
  const [open, setOpen] = useState(false);
  const [sources, setSources] = useState<CompanionSourceProjectsSnapshot | null>(null);
  const [sourceProjectId, setSourceProjectId] = useState("");
  const [primaryIntent, setPrimaryIntent] = useState<CompanionDevelopmentContextRequest["primary_intent"]>("implement_selected_element");
  const [capsule, setCapsule] = useState<CompanionDevelopmentContextCapsule | null>(null);
  const [busy, setBusy] = useState<"loading" | "source" | "preview" | "copy" | "launch" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<"create" | "attach">("create");
  const [newSourceId, setNewSourceId] = useState("adk-runtime");
  const [newSourceRoot, setNewSourceRoot] = useState("src/adk-runtime");
  const [entrypoint, setEntrypoint] = useState("app/agent.py");

  useEffect(() => { setCapsule(null); setNotice(null); setFailed(false); }, [applicationId, graphRevision, selection.kind, selection.id]);
  useEffect(() => { if (open && !sources) void loadSources(); }, [open]);
  const request = useMemo<CompanionDevelopmentContextRequest | null>(() => sourceProjectId ? ({ expected_application_id: applicationId, expected_graph_revision: graphRevision, source_project_id: sourceProjectId, primary_intent: primaryIntent }) : null, [applicationId, graphRevision, primaryIntent, sourceProjectId]);

  async function loadSources() {
    setBusy("loading"); setNotice(null); setFailed(false);
    try {
      const next = await api.listSourceProjects();
      setSources(next);
      setSourceProjectId((current) => current && next.source_projects.some((project) => project.source_project_id === current) ? current : next.source_projects[0]?.source_project_id ?? "");
    } catch (error) { fail(error, "Source project를 불러오지 못했습니다."); }
    finally { setBusy(null); }
  }

  async function addSource(event: FormEvent) {
    event.preventDefault(); setBusy("source"); setNotice(null); setFailed(false);
    try {
      const next = await api.addSourceProject({ mode, source_project: { source_project_id: newSourceId, root: newSourceRoot, runtime: { framework: "google-adk", framework_version: "2.4.0", language: "python", package_manager: "uv", entrypoint } } });
      setSources(next); setSourceProjectId(newSourceId); setCapsule(null);
      setNotice(mode === "create" ? "Source root를 만들었습니다. ADK scaffold는 Codex task가 수행합니다." : "기존 Source root를 연결했습니다.");
    } catch (error) { fail(error, "Source project를 준비하지 못했습니다."); }
    finally { setBusy(null); }
  }

  async function preview() {
    if (!request) return;
    setBusy("preview"); setNotice(null); setFailed(false);
    try { setCapsule(await api.getDevelopmentContext(request)); setNotice("Read-only Context Capsule을 만들었습니다. 실행 전 범위를 확인하세요."); }
    catch (error) { setCapsule(null); fail(error, "Context Capsule을 만들지 못했습니다."); }
    finally { setBusy(null); }
  }

  async function copyPrompt() {
    if (!capsule) return;
    setBusy("copy"); setNotice(null); setFailed(false);
    try { await navigator.clipboard.writeText(capsule.prompt); setNotice("Exact task prompt를 clipboard에 복사했습니다."); }
    catch (error) { fail(error, "Clipboard에 prompt를 복사하지 못했습니다."); }
    finally { setBusy(null); }
  }

  async function launch() {
    if (!request || !capsule) return;
    setBusy("launch"); setNotice(null); setFailed(false);
    try {
      const receipt = await api.launchDevelopmentTask(request);
      setNotice(receipt.prompt_delivery === "manual_copy_required" ? "Source cwd에서 VS Code를 열었습니다. Launch receipt는 요청 상태이며, 복사한 prompt를 새 Codex chat에 전달해야 합니다." : "VS Code launch를 요청했습니다.");
    } catch (error) { fail(error, "Source cwd에서 VS Code를 열지 못했습니다."); }
    finally { setBusy(null); }
  }

  function fail(error: unknown, fallback: string) { setFailed(true); setNotice(error instanceof Error ? error.message : fallback); }

  return <section className={`development-task ${open ? "is-open" : ""}`} aria-labelledby="development-task-title">
    <button type="button" className="development-task-trigger" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
      <span><strong id="development-task-title">Codex 개발 작업 만들기</strong><small>선택 요소만 bounded context로 전달</small></span><span aria-hidden="true">{open ? "−" : "+"}</span>
    </button>
    {open ? <div className="development-task-body">
      <div className="development-scope"><span>Selection</span><code>{selection.kind}:{selection.id}</code><span>Graph</span><code>{graphRevision.slice(0, 12)}</code></div>
      {busy === "loading" ? <p className="development-empty">Source project를 확인하는 중…</p> : null}
      {sources?.source_projects.length ? <label className="field-label"><span>Source project</span><select value={sourceProjectId} onChange={(event) => { setSourceProjectId(event.target.value); setCapsule(null); }}>{sources.source_projects.map((project) => <option key={project.source_project_id} value={project.source_project_id}>{project.source_project_id} · {project.readiness.status}</option>)}</select></label> : null}
      {sources && !sources.source_projects.length ? <form className="source-project-form" onSubmit={(event) => void addSource(event)}>
        <header><strong>Source project 준비</strong><span>App 내부 경로만 허용</span></header>
        <label><span>Mode</span><select value={mode} onChange={(event) => setMode(event.target.value as "create" | "attach")}><option value="create">새 root 만들기</option><option value="attach">기존 root 연결</option></select></label>
        <label><span>Project ID</span><input required pattern="[a-z](?:[a-z0-9]|-){1,62}" value={newSourceId} onChange={(event) => setNewSourceId(event.target.value)} /></label>
        <label><span>App-relative root</span><input required value={newSourceRoot} onChange={(event) => setNewSourceRoot(event.target.value)} /></label>
        <label><span>Entrypoint</span><input required value={entrypoint} onChange={(event) => setEntrypoint(event.target.value)} /></label>
        <button type="submit" disabled={busy !== null}>{busy === "source" ? "준비 중…" : "Source project 준비"}</button>
      </form> : null}
      {sources?.source_projects.length ? <><label className="field-label"><span>Primary intent</span><select value={primaryIntent} onChange={(event) => { setPrimaryIntent(event.target.value as typeof primaryIntent); setCapsule(null); }}><option value="implement_selected_element">선택 요소 구현</option><option value="verify_selected_element">선택 요소 검증</option></select></label><button type="button" className="development-preview-action" disabled={!request || busy !== null} onClick={() => void preview()}>{busy === "preview" ? "Capsule 확인 중…" : "Context Capsule 검토"}</button></> : null}
      {capsule ? <div className="development-review">
        <header><div><span>Review capsule</span><strong>{capsule.primary_intent}</strong></div><code>{capsule.capsule_id.slice(0, 12)}</code></header>
        <dl><div><dt>Source</dt><dd><code>{capsule.source_project.root}</code></dd></div><div><dt>Primary Skill</dt><dd><code>{capsule.primary_skill}</code></dd></div><div><dt>Evidence</dt><dd>{capsule.evidence.experiment_ids.join(" · ")}</dd></div><div><dt>Offline acceptance</dt><dd>{capsule.model.model_id} · private vLLM required</dd></div><div><dt>Mapping</dt><dd>{capsule.implementation_mapping?.status ?? "missing"}</dd></div></dl>
        <details><summary>Exact prompt와 guard 확인</summary><pre>{capsule.prompt}</pre><ul>{capsule.forbidden_changes.map((item) => <li key={item}>{item}</li>)}</ul></details>
        <footer><button type="button" onClick={() => void copyPrompt()} disabled={busy !== null}>{busy === "copy" ? "복사 중…" : "Capsule 복사"}</button><button type="button" className="button-primary" onClick={() => void launch()} disabled={busy !== null}>{busy === "launch" ? "VS Code 여는 중…" : "Source cwd에서 VS Code 열기"}</button></footer>
      </div> : null}
      {notice ? <p className={`development-notice ${failed ? "is-failed" : ""}`} role="status" aria-live="polite">{notice}</p> : null}
    </div> : null}
  </section>;
}
