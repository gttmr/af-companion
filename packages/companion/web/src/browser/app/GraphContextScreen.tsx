import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { CompanionAppAssetSnapshot, CompanionAppsSnapshot } from "@agent-factory/companion-contracts";
import type { GraphEditOperation, GraphPresentation, GraphSelection } from "@agent-factory/companion-graph-domain";
import { CompanionApiError, createHttpCompanionApi, type CompanionApi, type WorkspaceEvent } from "../api/CompanionApi.js";
import { AssetRegistryScreen } from "../assets/AssetRegistryScreen.js";
import { ContextPublicationStrip } from "../context/ContextPublicationStrip.js";
import { AssetLibrary } from "../graph/AssetLibrary.js";
import { CreationPanel } from "../graph/CreationPanel.js";
import { ElementInspector } from "../graph/ElementInspector.js";
import { GraphCanvas } from "../graph/GraphCanvas.js";
import { graphEditorReducer, initialGraphEditorState, pendingOperations } from "../graph/editorState.js";
import { AppWorkspaceBar } from "./AppWorkspaceBar.js";

const defaultApi = createHttpCompanionApi();

export function GraphContextScreen({ api: providedApi }: { api?: CompanionApi }) {
  const api = providedApi ?? defaultApi;
  const [state, dispatch] = useReducer(graphEditorReducer, initialGraphEditorState);
  const [apps, setApps] = useState<CompanionAppsSnapshot | null>(null);
  const [surface, setSurface] = useState<"graph" | "assets">("graph");
  const [appAssets, setAppAssets] = useState<CompanionAppAssetSnapshot | null>(null);
  const [appBusy, setAppBusy] = useState(false);
  const [appNotice, setAppNotice] = useState<string | null>(null);
  const [presentation, setPresentation] = useState<GraphPresentation | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [highlights, setHighlights] = useState({ nodes: new Set<string>(), edges: new Set<string>(), regions: new Set<string>() });
  const [editorLaunch, setEditorLaunch] = useState<{ pending: boolean; message: string | null; failed: boolean }>({ pending: false, message: null, failed: false });
  const initializedPresentation = useRef(false);
  const operations = useMemo(() => pendingOperations(state), [state.history]);

  const loadWorkspace = useCallback(async (notice?: string) => {
    const [workspace, assets] = await Promise.all([api.loadWorkspace(), api.listAppAssets()]);
    dispatch({ type: "loaded", workspace, ...(notice ? { notice } : {}) });
    setPresentation(workspace.presentation); setAppAssets(assets); initializedPresentation.current = true;
  }, [api]);

  const bootstrap = useCallback(async (notice?: string) => {
    try {
      const nextApps = await api.listApps(); setApps(nextApps);
      if (nextApps.active_application_id) await loadWorkspace(notice);
      else { setAppAssets(null); setPresentation(null); }
    } catch (error) { setAppNotice(message(error, "App 목록을 불러오지 못했습니다.")); }
  }, [api, loadWorkspace]);

  useEffect(() => { void bootstrap(); }, [bootstrap]);
  useEffect(() => api.subscribe((event) => {
    if (event.reason === "app_switched") { void bootstrap("App workspace를 전환했습니다."); return; }
    if (!["graph_mcp", "graph_external", "source_invalid", "source_recovered"].includes(event.reason)) return;
    const notice = eventNotice(event);
    setHighlights({ nodes: new Set(event.changed_nodes), edges: new Set(event.changed_edges), regions: new Set(event.changed_regions) });
    window.setTimeout(() => setHighlights({ nodes: new Set(), edges: new Set(), regions: new Set() }), 1800);
    void loadWorkspace(notice).catch((error) => dispatch({ type: "loadFailed", message: message(error, "Workspace를 갱신하지 못했습니다.") }));
  }), [api, bootstrap, loadWorkspace]);

  useEffect(() => {
    if (!state.workspace) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPublishing(true);
      try { const workspace = await api.updateDraft({ base_graph_revision: state.workspace!.graph_revision, operations }, controller.signal); if (!controller.signal.aborted) dispatch({ type: "workspaceSynced", workspace }); }
      catch (error) { if (!controller.signal.aborted) dispatch(apiErrorAction(error, "저장 전 변경을 공유하지 못했습니다.")); }
      finally { if (!controller.signal.aborted) setPublishing(false); }
    }, 220);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, operations, state.workspace?.graph_revision]);

  useEffect(() => {
    if (!state.workspace || !presentation || !initializedPresentation.current) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => { const canonical = presentationForGraph(presentation, state.workspace!.graph.nodes.map((node) => node.id)); void api.updatePresentation({ presentation: canonical }, controller.signal).catch((error) => { if (!controller.signal.aborted) dispatch(apiErrorAction(error, "Layout을 저장하지 못했습니다.")); }); }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [api, presentation, state.workspace?.graph_revision]);

  async function activateApp(applicationId: string) {
    setAppBusy(true); setAppNotice(null);
    try { setApps(await api.activateApp(applicationId)); await loadWorkspace("App workspace를 전환했습니다."); setEditorLaunch({ pending: false, message: null, failed: false }); }
    catch (error) { setAppNotice(message(error, "App을 전환하지 못했습니다.")); }
    finally { setAppBusy(false); }
  }
  async function createApp(applicationId: string, displayName: string) {
    setAppBusy(true); setAppNotice(null);
    try { setApps(await api.createApp({ application_id: applicationId, display_name: displayName })); await loadWorkspace("새 App workspace를 만들었습니다."); }
    catch (error) { setAppNotice(message(error, "App을 만들지 못했습니다.")); throw error; }
    finally { setAppBusy(false); }
  }
  async function select(selection: GraphSelection | null) { dispatch({ type: "select", selection }); try { dispatch({ type: "workspaceSynced", workspace: await api.updateSelection({ selection }) }); } catch (error) { dispatch(apiErrorAction(error, "선택을 공유하지 못했습니다.")); } }
  function stage(batch: GraphEditOperation[]) { dispatch({ type: "stage", operations: batch }); if (!presentation) return; const added = batch.filter((entry): entry is Extract<GraphEditOperation, { op: "add"; target: "node" }> => entry.op === "add" && entry.target === "node"); if (added.length) setPresentation({ ...presentation, positions: { ...presentation.positions, ...Object.fromEntries(added.map((entry, index) => [entry.value.id, { x: 90 + ((Object.keys(presentation.positions).length + index) % 4) * 240, y: 90 + Math.floor((Object.keys(presentation.positions).length + index) / 4) * 160, pinned: false }])) } }); }
  async function save() { if (!state.workspace || !operations.length) return; dispatch({ type: "saving" }); try { const desired = presentation; const response = await api.applyGraph(state.workspace.graph_revision, operations); const workspace = desired ? await api.updatePresentation({ presentation: presentationForGraph(desired, response.workspace.graph.nodes.map((node) => node.id)) }) : response.workspace; dispatch({ type: "loaded", workspace, notice: response.outcome === "NO_CHANGE" ? "변경 결과가 같아 저장할 내용이 없습니다." : "Graph 저장됨" }); setPresentation(workspace.presentation); } catch (error) { dispatch(apiErrorAction(error, "Graph 저장에 실패했습니다.")); } }
  function remove(selection: GraphSelection) { if (!state.draftGraph) return; const graph = state.draftGraph; const batch: GraphEditOperation[] = []; if (selection.kind === "node") { const edges = graph.edges.filter((edge) => edge.from === selection.id || edge.to === selection.id); const regions = graph.regions.filter((region) => region.node_ids.includes(selection.id)); if ((edges.length || regions.length) && !window.confirm(`연결 Edge ${edges.length}개와 Region 참조 ${regions.length}개를 같은 transaction에서 함께 정리합니다. 계속할까요?`)) return; edges.forEach((edge) => batch.push({ op: "remove", target: "edge", id: edge.id })); regions.forEach((region) => { const value = { ...region, node_ids: region.node_ids.filter((id) => id !== selection.id), entry_node_ids: region.entry_node_ids.filter((id) => id !== selection.id), exit_node_ids: region.exit_node_ids.filter((id) => id !== selection.id) }; batch.push(value.node_ids.length ? { op: "replace", target: "region", id: region.id, value } : { op: "remove", target: "region", id: region.id }); }); batch.push({ op: "remove", target: "node", id: selection.id }); } else if (selection.kind === "region") { graph.regions.filter((region) => region.parent_region_id === selection.id).forEach((region) => batch.push({ op: "replace", target: "region", id: region.id, value: { ...region, parent_region_id: null } })); batch.push({ op: "remove", target: "region", id: selection.id }); } else batch.push({ op: "remove", target: "edge", id: selection.id }); stage(batch); void select(null); }
  function autoLayout() { if (!presentation || !state.draftGraph) return; setPresentation({ positions: Object.fromEntries(state.draftGraph.nodes.map((node, index) => [node.id, { x: 70 + (index % 4) * 250, y: 95 + Math.floor(index / 4) * 170, pinned: false }])), viewport: { x: 0, y: 0, zoom: 1 } }); }
  function fitSelection() { if (state.selection?.kind !== "node") return; document.querySelector<HTMLElement>(`[data-node-id="${CSS.escape(state.selection.id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" }); }
  async function launchVscode() { setEditorLaunch({ pending: true, message: null, failed: false }); try { const receipt = await api.launchVscode(); setEditorLaunch({ pending: false, failed: false, message: receipt.codex_extension_installed ? "VS Code 열기 요청됨" : "VS Code 열림 · Codex extension을 확인하세요" }); } catch (error) { setEditorLaunch({ pending: false, failed: true, message: message(error, "VS Code를 열지 못했습니다.") }); } }

  if (!apps) return <main className="loading-state">App workspace를 확인하는 중…</main>;
  const shellHeader = <><header className="workspace-header"><div className="workspace-heading"><p className="product-mark">Agent Factory · Companion</p><h1>{surface === "graph" ? "App Graph workspace" : "Asset Registry"}</h1><p>{surface === "graph" ? `${apps.active_application_id ?? "Active App 없음"} · Work Item과 독립된 Graph 협업` : "Repository-global lifecycle · App binding과 분리된 canonical authority"}</p></div><nav className="workspace-surface-nav" aria-label="Companion workspace"><button type="button" aria-current={surface === "graph" ? "page" : undefined} onClick={() => setSurface("graph")}>Graph</button><button type="button" aria-current={surface === "assets" ? "page" : undefined} onClick={() => setSurface("assets")}>Assets</button></nav>{surface === "graph" ? <div className="header-actions"><div className={`editor-launch ${editorLaunch.failed ? "is-failed" : ""}`}><button type="button" className="button-secondary vscode-launch-action" disabled={!apps.active_application_id || editorLaunch.pending} onClick={() => void launchVscode()}>{editorLaunch.pending ? "VS Code 여는 중…" : "VS Code에서 열기 ↗"}</button><span role="status" aria-live="polite">{editorLaunch.message}</span></div><ConnectionHelp /><button type="button" className="icon-action" onClick={() => dispatch({ type: "undo" })} disabled={!state.history.length}>Undo</button><button type="button" className="icon-action" onClick={() => dispatch({ type: "redo" })} disabled={!state.redo.length}>Redo</button><button className="button-primary" type="button" disabled={!operations.length || state.workspace?.source_health.status === "invalid" || state.phase === "saving"} onClick={() => void save()}>{state.phase === "saving" ? "저장 중…" : "Graph 저장"}</button></div> : <div className="header-scope-note"><span>Shared Registry core</span><code>revision-checked lifecycle</code></div>}</header><AppWorkspaceBar apps={apps} busy={appBusy} notice={appNotice} allowCreate={surface === "graph"} onActivate={activateApp} onCreate={createApp} /></>;
  if (surface === "assets") return <main className="workbench-shell">{shellHeader}<AssetRegistryScreen api={api} /></main>;
  if (!apps.active_application_id) return <main className="workbench-shell">{shellHeader}<section className="empty-app-state"><p className="eyebrow">Managed App Root</p><h2>첫 App workspace를 만드세요.</h2><p>Git, Companion manifest, 최소 Input → Output Graph, Codex MCP 설정만 생성합니다. ADK source scaffold와 Work Item은 만들지 않습니다.</p></section></main>;
  if (!state.workspace || !state.draftGraph || !presentation || !appAssets) return <main className="workbench-shell">{shellHeader}<section className="loading-state"><strong>Active App workspace를 여는 중…</strong><span>{state.notice}</span><button type="button" onClick={() => void loadWorkspace()}>다시 시도</button></section></main>;
  return <main className="workbench-shell">{shellHeader}<ContextPublicationStrip workspace={state.workspace} pending={publishing} /><nav className="canvas-toolbar" aria-label="Graph layout controls"><button type="button" onClick={autoLayout}>자동 Layout</button><button type="button" onClick={autoLayout}>Layout 초기화</button><button type="button" onClick={fitSelection} disabled={state.selection?.kind !== "node"}>선택에 맞춤</button><span>Graph identity와 workflow_ref는 읽기 전용입니다.</span></nav><AssetLibrary api={api} graph={state.draftGraph} appAssets={appAssets} onAssetsChange={setAppAssets} onStage={stage} /><CreationPanel graph={state.draftGraph} onStage={stage} /><div className="workspace-grid"><GraphCanvas graph={state.draftGraph} presentation={presentation} selection={state.selection} changed={highlights} onSelectionChange={(selection) => void select(selection)} onPositionChange={(nodeId, x, y) => setPresentation((current) => current ? { ...current, positions: { ...current.positions, [nodeId]: { x, y, pinned: true } } } : current)} /><ElementInspector graph={state.draftGraph} selection={state.selection} assetBindings={appAssets.bindings} errors={state.fieldErrors} onStage={stage} onDelete={remove} /></div><footer className="workspace-footer"><span>{state.workspace.source_health.status === "valid" ? "Graph validation · 통과" : "Graph write · 차단"}</span><span className="notice-copy" role="status" aria-live="polite">{state.notice}</span>{state.phase === "conflict" ? <button type="button" className="text-action" onClick={() => void loadWorkspace("최신 Graph를 다시 읽었습니다.")}>최신 Graph 불러오기</button> : null}</footer></main>;
}

function apiErrorAction(error: unknown, fallback: string) { const details = error instanceof CompanionApiError ? error.details : undefined; const issues = Array.isArray(details?.issues) ? details.issues.filter((entry): entry is { path: string; message: string } => Boolean(entry) && typeof entry === "object" && "path" in entry && "message" in entry).map((entry) => ({ path: String(entry.path), message: String(entry.message) })) : []; return { type: "saveFailed" as const, message: message(error, fallback), conflict: error instanceof CompanionApiError && error.status === 412, fieldErrors: issues }; }
function message(error: unknown, fallback: string): string { return error instanceof Error ? error.message : fallback; }
function eventNotice(event: WorkspaceEvent): string { const discarded = event.discarded_draft_count ? ` 저장 전 변경 ${event.discarded_draft_count}개가 대체되었습니다.` : ""; const selection = event.selection_cleared ? " 삭제된 선택을 해제했습니다." : ""; if (event.reason === "graph_mcp") return `Codex 변경 반영됨.${discarded}${selection}`; if (event.reason === "graph_external") return `외부 파일 변경 반영됨.${discarded}${selection}`; if (event.reason === "source_invalid") return "Context 검증 실패 · Graph write가 차단되었습니다."; return "Graph source가 복구되었습니다."; }
function ConnectionHelp() { return <details className="connection-details"><summary className="button-secondary">Codex 사용 안내</summary><div className="connection-popover"><strong>Active App의 외부 Codex Graph Tool</strong><p>먼저 현재 App을 VS Code에서 여세요. project-local MCP 설정은 그 App root에만 적용됩니다.</p><p>Codex extension에서 새 chat을 시작하고 `companion_get_graph_workspace`를 호출합니다. Graph 변경은 get → apply 순서이며 write Tool은 승인을 요청합니다.</p><p>VS Code 실행 receipt는 Codex thread 연결이나 lifecycle authority를 의미하지 않습니다.</p></div></details>; }
export function presentationForGraph(presentation: GraphPresentation, nodeIds: string[]): GraphPresentation { return { positions: Object.fromEntries(nodeIds.map((id, index) => [id, presentation.positions[id] ?? { x: 90 + (index % 4) * 240, y: 90 + Math.floor(index / 4) * 160, pinned: false }])), viewport: presentation.viewport }; }
