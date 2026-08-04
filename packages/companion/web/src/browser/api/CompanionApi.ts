import type {
  ApplyGraphOperationsResponse, BindCompanionAssetRequest, CompanionAppAssetSnapshot,
  CompanionAppsSnapshot, CompanionAssetSearchResult, CreateCompanionAppRequest,
  DraftUpdateRequest, GraphWorkspaceSnapshot, PresentationUpdateRequest, SelectionUpdateRequest,
} from "@agent-factory/companion-contracts";
import type { GraphEditOperation } from "@agent-factory/companion-graph-domain";

export interface WorkspaceEvent {
  type: "workspace_invalidated";
  reason: "selection" | "draft" | "graph_web" | "graph_mcp" | "graph_external" | "presentation" | "source_invalid" | "source_recovered" | "app_switched";
  document_revision: string;
  graph_revision: string;
  discarded_draft_count: number;
  selection_cleared: boolean;
  changed_nodes: string[];
  changed_edges: string[];
  changed_regions: string[];
}

export interface VscodeLaunchReceipt {
  status: "accepted";
  workspace_path: string;
  launched_at: string;
  codex_extension_installed: boolean;
  codex_extension_version: string | null;
}

export class CompanionApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: Record<string, unknown>) { super(message); this.name = "CompanionApiError"; }
}

export interface CompanionApi {
  listApps(signal?: AbortSignal): Promise<CompanionAppsSnapshot>;
  createApp(request: CreateCompanionAppRequest, signal?: AbortSignal): Promise<CompanionAppsSnapshot>;
  activateApp(applicationId: string, signal?: AbortSignal): Promise<CompanionAppsSnapshot>;
  searchAssets(query: { q?: string; asset_type?: "agent" | "workflow" | "tool" }, signal?: AbortSignal): Promise<CompanionAssetSearchResult>;
  listAppAssets(signal?: AbortSignal): Promise<CompanionAppAssetSnapshot>;
  bindAsset(request: BindCompanionAssetRequest, signal?: AbortSignal): Promise<CompanionAppAssetSnapshot>;
  unbindAsset(assetId: string, baseAssetsRevision: string, signal?: AbortSignal): Promise<CompanionAppAssetSnapshot>;
  loadWorkspace(signal?: AbortSignal): Promise<GraphWorkspaceSnapshot>;
  updateSelection(request: SelectionUpdateRequest, signal?: AbortSignal): Promise<GraphWorkspaceSnapshot>;
  updateDraft(request: DraftUpdateRequest, signal?: AbortSignal): Promise<GraphWorkspaceSnapshot>;
  applyGraph(baseGraphRevision: string, operations: GraphEditOperation[], signal?: AbortSignal): Promise<ApplyGraphOperationsResponse>;
  updatePresentation(request: PresentationUpdateRequest, signal?: AbortSignal): Promise<GraphWorkspaceSnapshot>;
  launchVscode(signal?: AbortSignal): Promise<VscodeLaunchReceipt>;
  subscribe(listener: (event: WorkspaceEvent) => void): () => void;
}

export function createHttpCompanionApi(baseUrl = "/api/companion/v2"): CompanionApi {
  return {
    listApps: (signal) => requestJson("/api/companion/apps", { signal }),
    createApp: (body, signal) => requestJson("/api/companion/apps", { method: "POST", body: JSON.stringify(body), signal }),
    activateApp: (application_id, signal) => requestJson("/api/companion/apps/active", { method: "PUT", body: JSON.stringify({ application_id }), signal }),
    searchAssets: (query, signal) => { const params = new URLSearchParams(); if (query.q) params.set("q", query.q); if (query.asset_type) params.set("asset_type", query.asset_type); return requestJson(`/api/companion/assets?${params}`, { signal }); },
    listAppAssets: (signal) => requestJson("/api/companion/app-assets", { signal }),
    bindAsset: (body, signal) => requestJson("/api/companion/app-assets", { method: "POST", body: JSON.stringify(body), signal }),
    unbindAsset: (assetId, base_assets_revision, signal) => requestJson(`/api/companion/app-assets/${encodeURIComponent(assetId)}`, { method: "DELETE", body: JSON.stringify({ base_assets_revision }), signal }),
    loadWorkspace: (signal) => requestJson(`${baseUrl}/workspace`, { signal }),
    updateSelection: (body, signal) => requestJson(`${baseUrl}/selection`, { method: "PUT", body: JSON.stringify(body), signal }),
    updateDraft: (body, signal) => requestJson(`${baseUrl}/draft`, { method: "PUT", body: JSON.stringify(body), signal }),
    applyGraph: (base_graph_revision, operations, signal) => requestJson(`${baseUrl}/graph/operations`, { method: "POST", body: JSON.stringify({ base_graph_revision, operations }), signal }),
    updatePresentation: (body, signal) => requestJson(`${baseUrl}/presentation`, { method: "PUT", body: JSON.stringify(body), signal }),
    launchVscode: (signal) => requestJson("/api/companion/editor/launch-vscode", { method: "POST", body: "{}", signal }),
    subscribe(listener) {
      const events = new EventSource(`${baseUrl}/events`);
      events.addEventListener("workspace", (event) => listener(JSON.parse((event as MessageEvent).data) as WorkspaceEvent));
      return () => events.close();
    },
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json() as T | Record<string, unknown>;
  if (!response.ok) { const error = body as Record<string, unknown>; throw new CompanionApiError(response.status, typeof error.error === "string" ? error.error : "request_failed", typeof error.message === "string" ? error.message : "요청을 완료하지 못했습니다.", error); }
  return body as T;
}
