import { readdir, readFile, realpath, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

import type { AfWorkItemManifest, AfWorkSkillState } from "../src/analyzer/afWorkItem";
import { parseTargetAnalysisResult } from "../src/analyzer/targetAnalysisResult";
import { validateTargetAnalysisResult } from "../src/analyzer/targetContract";
import type { GraphEdge, GraphIR, GraphNode, GraphRegion } from "../src/analyzer/types";
import {
  ArtifactConflictError,
  ArtifactRootStore,
  ArtifactValidationError,
  REQ_ID_PATTERN,
} from "./artifactRootStore";
import { CompanionApiError, enqueueGraphChangeContext } from "./codexCompanionApi";
import { ifMatchHeader, isRecord, readJsonBody, sendJson } from "./httpApi";
import type { WorkspaceProjection } from "./workspaceProjection";

type MiddlewareNext = (error?: unknown) => void;
const MAX_FILE_BYTES = 1 * 1_024 * 1_024;
const MAX_FILE_COUNT = 2_000;
const GRAPH_ARTIFACT = "analysis-result.json";

export interface WorkItemFileEntry {
  path: string;
  bytes: number;
  modified_at: string;
  kind: "artifact" | "source" | "evidence" | "configuration" | "other";
}

export function createWorkItemMiddleware(repoRoot: string, projection?: WorkspaceProjection) {
  const store = new ArtifactRootStore({ repoRoot });

  return async function workItemMiddleware(
    request: IncomingMessage,
    response: ServerResponse,
    next: MiddlewareNext,
  ): Promise<void> {
    try {
      assertLoopback(request);
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
      const segments = url.pathname.split("/").filter(Boolean).map(decodeSegment);
      if (segments.length === 0) {
        if (request.method !== "GET") return methodNotAllowed(response);
        sendJson(response, 200, await store.listRoots());
        return;
      }

      const [workId, resource] = segments;
      if (!REQ_ID_PATTERN.test(workId)) {
        throw new ArtifactValidationError(400, "work_id 형식이 올바르지 않습니다.");
      }

      if (!resource) {
        if (request.method !== "GET") return methodNotAllowed(response);
        const result = await store.readWorkItem(workId);
        response.setHeader("ETag", result.etag);
        sendJson(response, 200, result.manifest);
        return;
      }

      if (resource === "files") {
        if (request.method !== "GET") return methodNotAllowed(response);
        sendJson(response, 200, { files: await listWorkItemFiles(store, workId) });
        return;
      }

      if (resource === "file") {
        if (request.method !== "GET") return methodNotAllowed(response);
        const path = url.searchParams.get("path");
        if (!path) throw new ArtifactValidationError(400, "path query가 필요합니다.");
        const file = await readWorkItemFile(store, workId, path);
        response.setHeader("ETag", file.etag);
        sendJson(response, 200, file);
        return;
      }

      if (resource === "graph") {
        if (request.method === "GET") {
          const artifact = await store.readArtifact(workId, GRAPH_ARTIFACT);
          const analysis = parseTargetAnalysisResult(JSON.parse(artifact.content));
          response.setHeader("ETag", artifact.etag);
          sendJson(response, 200, {
            graph: analysis.graph,
            asset_candidates: analysis.assetCandidates,
            etag: artifact.etag,
          });
          return;
        }
        if (request.method === "PUT") {
          assertSameOrigin(request);
          const expectedEtag = ifMatchHeader(request.headers["if-match"]);
          if (!expectedEtag) {
            throw new WorkItemApiError(428, "if_match_required", "Graph 저장에는 최신 ETag가 필요합니다.");
          }
          const result = await saveGraph({
            repoRoot,
            store,
            projection,
            workId,
            expectedEtag,
            body: await readJsonBody(request, {
              maxBytes: MAX_FILE_BYTES,
              sizeLimitMessage: "Graph 저장 요청은 1 MiB를 넘을 수 없습니다.",
            }),
          });
          response.setHeader("ETag", result.etag);
          sendJson(response, result.delivery_error ? 202 : 200, result);
          return;
        }
        return methodNotAllowed(response);
      }

      sendJson(response, 404, { error: "알 수 없는 Work Item API 경로입니다.", code: "not_found" });
    } catch (error) {
      handleError(error, response, next);
    }
  };
}

function assertLoopback(request: IncomingMessage): void {
  const address = request.socket.remoteAddress;
  if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") {
    throw new WorkItemApiError(403, "loopback_required", "Work Item API는 loopback 요청만 허용합니다.");
  }
}

function assertSameOrigin(request: IncomingMessage): void {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (typeof origin !== "string" || typeof host !== "string") {
    throw new WorkItemApiError(403, "same_origin_required", "Graph 저장은 same-origin 요청만 허용합니다.");
  }
  let parsed: URL;
  try { parsed = new URL(origin); } catch {
    throw new WorkItemApiError(403, "same_origin_required", "Graph 저장은 same-origin 요청만 허용합니다.");
  }
  if (parsed.host.toLowerCase() !== host.toLowerCase()
    || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname.toLowerCase())) {
    throw new WorkItemApiError(403, "same_origin_required", "Graph 저장은 same-origin 요청만 허용합니다.");
  }
}

async function saveGraph(input: {
  repoRoot: string;
  store: ArtifactRootStore;
  projection?: WorkspaceProjection;
  workId: string;
  expectedEtag: string;
  body: unknown;
}) {
  const body = input.body;
  if (!isRecord(body)) throw new WorkItemApiError(400, "invalid_graph_request", "Graph 저장 JSON 객체가 필요합니다.");
  const keys = Object.keys(body);
  if (keys.some((key) => key !== "graph" && key !== "target_session_id") || !keys.includes("graph")) {
    throw new WorkItemApiError(400, "invalid_graph_request", "graph와 target_session_id만 보낼 수 있습니다.");
  }
  if (typeof body.target_session_id !== "string" || !body.target_session_id.trim()) {
    throw new WorkItemApiError(400, "target_session_required", "Graph 변경을 받을 활성 Codex session을 선택하세요.");
  }
  const targetSessionId = body.target_session_id.trim();
  let previousGraph!: GraphIR;
  let nextGraph!: GraphIR;
  let nextEtag = "";
  let candidates: ReturnType<typeof parseTargetAnalysisResult>["assetCandidates"] = [];

  await input.store.withCanonicalWriteLock(input.workId, async () => {
    const [artifact, workItem] = await Promise.all([
      input.store.readArtifact(input.workId, GRAPH_ARTIFACT),
      input.store.readWorkItem(input.workId),
    ]);
    if (artifact.etag !== input.expectedEtag) {
      throw new ArtifactConflictError(input.expectedEtag, artifact.etag);
    }
    if (workItem.manifest.review_gates.discovery.status !== "approved") {
      throw new WorkItemApiError(409, "discovery_review_required", "Graph 편집 전 Discover 결과가 승인되어야 합니다.");
    }
    const analysis = parseTargetAnalysisResult(JSON.parse(artifact.content));
    previousGraph = analysis.graph;
    nextGraph = body.graph as GraphIR;
    const nextAnalysis = { ...analysis, graph: nextGraph };
    const errors = validateTargetAnalysisResult(nextAnalysis);
    if (errors.length) {
      throw new WorkItemApiError(422, "invalid_graph", `Graph IR 검증 실패: ${errors.join(" ")}`);
    }
    const serializedAnalysis = `${JSON.stringify(nextAnalysis, null, 2)}\n`;
    const serializedGraph = `${JSON.stringify(nextGraph, null, 2)}\n`;
    const analysisWrite = await input.store.writeArtifact(input.workId, GRAPH_ARTIFACT, serializedAnalysis, artifact.etag);
    await input.store.writeArtifact(input.workId, "graph-ir.json", serializedGraph, null);
    nextEtag = analysisWrite.etag;
    candidates = analysis.assetCandidates;
    const nextWorkItem = invalidateAfterGraphChange(workItem.manifest, artifact.etag, nextEtag, new Date());
    await input.store.writeWorkItem(input.workId, nextWorkItem, workItem.etag);
  });

  let delivery = null;
  let deliveryError: { code: string; message: string } | null = null;
  try {
    delivery = await enqueueGraphChangeContext(input.repoRoot, {
      workId: input.workId,
      graph: nextGraph,
      assetCandidates: candidates,
      changedNodeIds: changedGraphNodeIds(previousGraph, nextGraph),
      targetSessionId,
      graphEtag: nextEtag,
    });
  } catch (error) {
    deliveryError = {
      code: error instanceof CompanionApiError ? error.code : "delivery_failed",
      message: error instanceof Error ? error.message : "Codex session에 Graph 변경을 전달하지 못했습니다.",
    };
  }
  input.projection?.record("artifact", "graph saved", `artifacts/af/${input.workId}/analysis-result.json`, "graph_saved");
  return {
    ok: true as const,
    etag: nextEtag,
    graph: nextGraph,
    delivery,
    delivery_error: deliveryError,
  };
}

export function invalidateAfterGraphChange(
  manifest: AfWorkItemManifest,
  inputRevision: string,
  outputRevision: string,
  now: Date,
): AfWorkItemManifest {
  const at = now.toISOString();
  const reset = (): AfWorkSkillState => ({
    status: "not_started",
    input_revision: null,
    output_revision: null,
    output_refs: [],
    blocker_refs: [],
    output_roots: [],
    started_at: null,
    updated_at: at,
    completed_at: null,
  });
  const compose = manifest.skills["af-compose-solution"];
  return {
    ...manifest,
    active_skill: "af-compose-solution",
    skills: {
      ...manifest.skills,
      "af-compose-solution": {
        status: "waiting_for_review",
        input_revision: inputRevision,
        output_revision: outputRevision,
        output_refs: ["analysis-result.json", "graph-ir.json"],
        blocker_refs: [],
        output_roots: [],
        started_at: compose.started_at ?? at,
        updated_at: at,
        completed_at: null,
      },
      "af-scaffold-runtime": reset(),
      "af-verify-runtime": reset(),
    },
    review_gates: {
      ...manifest.review_gates,
      composition: {
        status: "pending",
        artifact_etag: null,
        decided_at: null,
        session_id: null,
        turn_id: null,
      },
    },
    verification: { outcome: null, revision: null, report_ref: null },
  };
}

export function changedGraphNodeIds(previous: GraphIR, next: GraphIR): string[] {
  const changed = new Set<string>();
  const previousNodes = new Map(previous.nodes.map((node) => [node.id, node]));
  const nextNodes = new Map(next.nodes.map((node) => [node.id, node]));
  for (const id of new Set([...previousNodes.keys(), ...nextNodes.keys()])) {
    if (stableJson(previousNodes.get(id)) !== stableJson(nextNodes.get(id))) changed.add(id);
  }
  const previousEdges = new Map(previous.edges.map((edge) => [edge.id, edge]));
  const nextEdges = new Map(next.edges.map((edge) => [edge.id, edge]));
  for (const id of new Set([...previousEdges.keys(), ...nextEdges.keys()])) {
    const before = previousEdges.get(id);
    const after = nextEdges.get(id);
    if (stableJson(before) !== stableJson(after)) {
      addEdgeNodes(changed, before);
      addEdgeNodes(changed, after);
    }
  }
  const previousRegions = new Map(previous.regions.map((region) => [region.id, region]));
  const nextRegions = new Map(next.regions.map((region) => [region.id, region]));
  for (const id of new Set([...previousRegions.keys(), ...nextRegions.keys()])) {
    const before = previousRegions.get(id);
    const after = nextRegions.get(id);
    if (stableJson(before) !== stableJson(after)) {
      addRegionNodes(changed, before);
      addRegionNodes(changed, after);
    }
  }
  if (previous.graph_id !== next.graph_id || previous.workflow_ref !== next.workflow_ref) {
    next.nodes.forEach((node) => changed.add(node.id));
  }
  return [...changed].filter((id) => nextNodes.has(id)).slice(0, 20);
}

async function listWorkItemFiles(store: ArtifactRootStore, workId: string): Promise<WorkItemFileEntry[]> {
  await store.readWorkItem(workId);
  const root = store.resolveRootDir(workId);
  const files: WorkItemFileEntry[] = [];
  await walk(root, "", files);
  return files.sort((left, right) => left.path.localeCompare(right.path));

  async function walk(directory: string, prefix: string, output: WorkItemFileEntry[]): Promise<void> {
    if (output.length >= MAX_FILE_COUNT) return;
    let entries: Dirent[];
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (output.length >= MAX_FILE_COUNT) break;
      if ([".git", ".venv", "node_modules", "__pycache__", ".pytest_cache", ".adk"].includes(entry.name)) continue;
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) await walk(absolutePath, relativePath, output);
      else if (entry.isFile()) {
        const info = await stat(absolutePath);
        output.push({
          path: relativePath,
          bytes: info.size,
          modified_at: info.mtime.toISOString(),
          kind: fileKind(relativePath),
        });
      }
    }
  }
}

async function readWorkItemFile(store: ArtifactRootStore, workId: string, path: string) {
  const absolutePath = await resolveContainedWorkItemFile(store, workId, path);
  const info = await stat(absolutePath);
  if (info.size > MAX_FILE_BYTES) throw new WorkItemApiError(413, "file_too_large", "1 MiB 이하의 텍스트 파일만 볼 수 있습니다.");
  const buffer = await readFile(absolutePath);
  if (buffer.includes(0)) throw new WorkItemApiError(415, "binary_file", "바이너리 파일은 화면에서 볼 수 없습니다.");
  const content = buffer.toString("utf8");
  const { computeEtag } = await import("./artifactRootStore");
  return { path, content, bytes: buffer.byteLength, etag: computeEtag(content) };
}

async function resolveContainedWorkItemFile(store: ArtifactRootStore, workId: string, path: string): Promise<string> {
  if (typeof path !== "string" || !path.trim() || isAbsolute(path) || path.includes("\0")) {
    throw new ArtifactValidationError(400, "work item 상대 경로가 필요합니다.");
  }
  const root = store.resolveRootDir(workId);
  const absolutePath = resolve(root, path);
  if (!isContained(root, absolutePath)) throw new ArtifactValidationError(403, "work item 밖의 경로는 읽을 수 없습니다.");
  const canonicalRoot = await realpath(root);
  const canonicalPath = await realpath(absolutePath).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
  if (!canonicalPath) throw new ArtifactValidationError(404, "파일을 찾을 수 없습니다.");
  if (!isContained(canonicalRoot, canonicalPath)) throw new ArtifactValidationError(403, "work item 밖의 경로는 읽을 수 없습니다.");
  const info = await stat(canonicalPath);
  if (!info.isFile()) throw new ArtifactValidationError(404, "파일을 찾을 수 없습니다.");
  return canonicalPath;
}

function isContained(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
}

function fileKind(path: string): WorkItemFileEntry["kind"] {
  if (["analysis-result.json", "asset-candidates.json", "graph-ir.json", "scaffold-plan.json", "af-work-item.json"].includes(path)) {
    return "artifact";
  }
  if (/validation|evidence|test-results|report/i.test(path)) return "evidence";
  if ([".py", ".ts", ".tsx", ".js", ".mjs", ".sh"].includes(extname(path))) return "source";
  if ([".json", ".yaml", ".yml", ".toml"].includes(extname(path))) return "configuration";
  return "other";
}

function addEdgeNodes(target: Set<string>, edge: GraphEdge | undefined): void {
  if (!edge) return;
  target.add(edge.from);
  target.add(edge.to);
}

function addRegionNodes(target: Set<string>, region: GraphRegion | undefined): void {
  if (!region) return;
  [...region.node_ids, ...region.entry_node_ids, ...region.exit_node_ids].forEach((id) => target.add(id));
}

function stableJson(value: GraphNode | GraphEdge | GraphRegion | undefined): string {
  return value === undefined ? "" : JSON.stringify(value);
}

function decodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new ArtifactValidationError(400, "경로 인코딩이 올바르지 않습니다.");
  }
}

function methodNotAllowed(response: ServerResponse): void {
  sendJson(response, 405, { error: "지원하지 않는 메서드입니다.", code: "method_not_allowed" });
}

class WorkItemApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "WorkItemApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

function handleError(error: unknown, response: ServerResponse, next: MiddlewareNext): void {
  if (error instanceof WorkItemApiError || error instanceof CompanionApiError) {
    sendJson(response, error.statusCode, { error: error.message, code: error.code });
    return;
  }
  if (error instanceof ArtifactConflictError) {
    sendJson(response, 409, {
      error: "Graph가 다른 곳에서 변경되었습니다. 최신 상태를 불러온 뒤 다시 편집하세요.",
      code: "etag_conflict",
      expected_etag: error.expectedEtag,
      actual_etag: error.actualEtag,
    });
    return;
  }
  if (error instanceof ArtifactValidationError) {
    sendJson(response, error.statusCode, { error: error.message, code: "artifact_error" });
    return;
  }
  if (error instanceof SyntaxError) {
    sendJson(response, 400, { error: "JSON 형식이 올바르지 않습니다.", code: "invalid_json" });
    return;
  }
  next(error);
}
