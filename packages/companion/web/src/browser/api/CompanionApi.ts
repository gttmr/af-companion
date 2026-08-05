import type {
  ApplyGraphOperationsResponse, BindCompanionAssetRequest, CompanionAppAssetSnapshot,
  CompanionAppsSnapshot, CompanionAssetSearchResult, CompanionAssetType,
  CompanionRegistryAssetSnapshot, CompanionRegistryContract, CompanionRegistryDecision,
  CompanionRegistryListSnapshot, CompanionRegistryPublishDecision, CompanionRegistryStatus,
  CompanionRegistryValidationResult, CreateCompanionAppRequest,
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
  listRegistryAssets(query: { asset_type?: CompanionAssetType; statuses?: CompanionRegistryStatus[]; all_versions?: boolean }, signal?: AbortSignal): Promise<CompanionRegistryListSnapshot>;
  getRegistryAsset(assetId: string, version: number, signal?: AbortSignal): Promise<CompanionRegistryAssetSnapshot>;
  validateRegistryContract(contract: CompanionRegistryContract, signal?: AbortSignal): Promise<CompanionRegistryValidationResult>;
  createRegistryDraft(contract: CompanionRegistryContract, createdBy: string, expectedRevision: string, signal?: AbortSignal): Promise<CompanionRegistryAssetSnapshot>;
  updateRegistryDraft(assetId: string, version: number, contract: CompanionRegistryContract, expectedRevision: string, signal?: AbortSignal): Promise<CompanionRegistryAssetSnapshot>;
  reviewRegistryDraft(assetId: string, version: number, decision: CompanionRegistryDecision, expectedRevision: string, signal?: AbortSignal): Promise<CompanionRegistryAssetSnapshot>;
  publishRegistryAsset(assetId: string, version: number, decision: CompanionRegistryPublishDecision, expectedRevision: string, signal?: AbortSignal): Promise<CompanionRegistryAssetSnapshot>;
  deprecateRegistryAsset(assetId: string, version: number, decision: CompanionRegistryDecision, expectedRevision: string, signal?: AbortSignal): Promise<CompanionRegistryAssetSnapshot>;
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
    listRegistryAssets: (query, signal) => { const params = new URLSearchParams(); if (query.asset_type) params.set("asset_type", query.asset_type); if (query.statuses?.length) params.set("statuses", query.statuses.join(",")); if (query.all_versions !== undefined) params.set("all_versions", String(query.all_versions)); return requestJson(`/api/companion/registry/assets?${params}`, { signal }); },
    getRegistryAsset: (assetId, version, signal) => requestJson(`/api/companion/registry/assets/${encodeURIComponent(assetId)}/versions/${version}`, { signal }),
    validateRegistryContract: (contract, signal) => requestJson("/api/companion/registry/validate", { method: "POST", body: JSON.stringify({ contract }), signal }),
    createRegistryDraft: (contract, created_by, revision, signal) => registryMutation("/api/companion/registry/drafts", "POST", revision, { contract, created_by }, signal),
    updateRegistryDraft: (assetId, version, contract, revision, signal) => registryMutation(`/api/companion/registry/drafts/${encodeURIComponent(assetId)}/versions/${version}`, "PUT", revision, { contract }, signal),
    reviewRegistryDraft: (assetId, version, decision, revision, signal) => registryMutation(`/api/companion/registry/drafts/${encodeURIComponent(assetId)}/versions/${version}/review`, "POST", revision, { decision }, signal),
    publishRegistryAsset: (assetId, version, decision, revision, signal) => registryMutation(`/api/companion/registry/assets/${encodeURIComponent(assetId)}/versions/${version}/publish`, "POST", revision, { decision }, signal),
    deprecateRegistryAsset: (assetId, version, decision, revision, signal) => registryMutation(`/api/companion/registry/assets/${encodeURIComponent(assetId)}/versions/${version}/deprecate`, "POST", revision, { decision }, signal),
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

function registryMutation<T>(url: string, method: "POST" | "PUT", revision: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return requestJson(url, { method, headers: { "If-Match": revision }, body: JSON.stringify(body), signal });
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const body = await response.json() as T | Record<string, unknown>;
  if (!response.ok) { const error = body as Record<string, unknown>; throw new CompanionApiError(response.status, typeof error.error === "string" ? error.error : "request_failed", typeof error.message === "string" ? error.message : "요청을 완료하지 못했습니다.", error); }
  return body as T;
}
