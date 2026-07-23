import type { AfWorkItemManifest } from "../analyzer/afWorkItem";
import type { AssetCandidate, GraphIR } from "../analyzer/types";
import type { ContextDelivery } from "../companion/types";
import type {
  EditorOpenReceipt,
  WorkspaceDiff,
  WorkspaceProjectionSnapshot,
} from "./types";

export interface EtagResult<T> {
  data: T;
  etag: string | null;
}

export interface WorkItemFileEntry {
  path: string;
  bytes: number;
  modified_at: string;
  kind: "artifact" | "source" | "evidence" | "configuration" | "other";
}

export interface WorkItemTextFile {
  path: string;
  content: string;
  bytes: number;
  etag: string;
}

export interface GraphProjection {
  graph: GraphIR;
  asset_candidates: AssetCandidate[];
  etag: string;
}

export interface GraphSaveResult {
  ok: true;
  etag: string;
  graph: GraphIR;
  delivery: ContextDelivery | null;
  delivery_error: { code: string; message: string } | null;
}

export class WorkspaceApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "WorkspaceApiError";
  }
}

export async function fetchWorkspaceSnapshot(): Promise<WorkspaceProjectionSnapshot> {
  return requestJson("/api/workspace/snapshot");
}

export async function fetchWorkItem(workId: string): Promise<EtagResult<AfWorkItemManifest>> {
  const response = await fetch(`/api/work-items/${encodeURIComponent(workId)}`);
  const data = await responseJson<AfWorkItemManifest>(response, "Work Item을 읽지 못했습니다.");
  return { data, etag: response.headers.get("etag") };
}

export async function fetchWorkItemFiles(workId: string): Promise<WorkItemFileEntry[]> {
  const result = await requestJson<{ files: WorkItemFileEntry[] }>(`/api/work-items/${encodeURIComponent(workId)}/files`);
  return result.files;
}

export async function fetchWorkItemFile(workId: string, path: string): Promise<WorkItemTextFile> {
  return requestJson(`/api/work-items/${encodeURIComponent(workId)}/file?path=${encodeURIComponent(path)}`);
}

export async function fetchGraphProjection(workId: string): Promise<EtagResult<GraphProjection>> {
  const response = await fetch(`/api/work-items/${encodeURIComponent(workId)}/graph`);
  const data = await responseJson<GraphProjection>(response, "Graph IR을 읽지 못했습니다.");
  return { data, etag: response.headers.get("etag") ?? data.etag };
}

export async function saveGraphProjection(
  workId: string,
  graph: GraphIR,
  etag: string,
  targetSessionId: string,
): Promise<GraphSaveResult> {
  const response = await fetch(`/api/work-items/${encodeURIComponent(workId)}/graph`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "If-Match": etag },
    body: JSON.stringify({ graph, target_session_id: targetSessionId }),
  });
  return responseJson(response, "Graph IR 저장에 실패했습니다.");
}

export async function fetchWorkspaceDiff(path: string): Promise<WorkspaceDiff> {
  return requestJson(`/api/workspace/diff?path=${encodeURIComponent(path)}`);
}

export async function openInEditor(input: {
  mode: "file" | "diff";
  path: string;
  line?: number;
}): Promise<EditorOpenReceipt> {
  return requestJson("/api/workspace/editor/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  return responseJson(await fetch(url, init), "Workspace 요청에 실패했습니다.");
}

async function responseJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof payload?.error === "string" ? payload.error : fallback;
    const code = typeof payload?.code === "string" ? payload.code : "request_failed";
    throw new WorkspaceApiError(response.status, code, message, payload);
  }
  return payload as T;
}
