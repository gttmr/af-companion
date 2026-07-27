import { execFile } from "node:child_process";
import { lstat, mkdir, readdir, readFile, realpath, stat } from "node:fs/promises";
import type { Dirent } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import type {
  AfCompositionCycle,
  AfInvalidation,
  AfRevisionRef,
  AfWorkItemManifest,
  AfWorkSkillId,
  AfWorkSkillState,
} from "../src/analyzer/afWorkItem";
import { parseTargetAnalysisResult } from "../src/analyzer/targetAnalysisResult";
import { validateTargetAnalysisResult } from "../src/analyzer/targetContract";
import type { GraphEdge, GraphIR, GraphNode, GraphRegion } from "../src/analyzer/types";
import {
  ArtifactConflictError,
  ArtifactRootStore,
  ArtifactValidationError,
  REQ_ID_PATTERN,
} from "./artifactRootStore";
import {
  ApplicationRegistryError,
  ApplicationRegistryStore,
  type ApplicationRegistrySnapshot,
} from "./applicationRegistryStore";
import { CompanionApiError, enqueueGraphChangeContext } from "./codexCompanionApi";
import { ifMatchHeader, isRecord, readJsonBody, sendJson } from "./httpApi";
import type { WorkspaceProjection } from "./workspaceProjection";
import { createWorkItemRevision } from "./workItemRevision";

type MiddlewareNext = (error?: unknown) => void;
const MAX_FILE_BYTES = 1 * 1_024 * 1_024;
const MAX_FILE_COUNT = 2_000;
const MAX_BOOTSTRAP_BODY_BYTES = 4 * 1_024;
const GRAPH_ARTIFACT = "analysis-result.json";
const WORK_ITEM_CREATE_CONFIRMATION = "CREATE_WORK_ITEM";
const execFileAsync = promisify(execFile);

export type BootstrapCommandRunner = (
  executable: string,
  args: readonly string[],
  options: { cwd: string },
) => Promise<void>;

export interface WorkItemMiddlewareOptions {
  applicationsRoot?: string;
  commandRunner?: BootstrapCommandRunner;
}

export interface WorkItemFileEntry {
  path: string;
  bytes: number;
  modified_at: string;
  kind: "artifact" | "source" | "evidence" | "configuration" | "other";
}

export function createWorkItemMiddleware(
  repoRoot: string,
  projection?: WorkspaceProjection,
  options: WorkItemMiddlewareOptions = {},
) {
  const store = new ArtifactRootStore({ repoRoot });
  const applicationRegistry = new ApplicationRegistryStore({
    repoRoot,
    applicationsRoot: options.applicationsRoot,
  });
  const commandRunner = options.commandRunner ?? runBootstrapCommand;

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
        if (request.method === "GET") {
          sendJson(response, 200, await store.listRoots());
          return;
        }
        if (request.method === "POST") {
          requireNoQuery(url);
          assertSameOrigin(request);
          assertJsonContentType(request);
          const result = await bootstrapWorkItem({
            repoRoot,
            store,
            applicationRegistry,
            commandRunner,
            body: await readBootstrapJsonBody(request),
          });
          if (projection) {
            await projection.includeWorkItemRoot(result.work_id);
            projection.record("artifact", "work item created", `${result.artifact_root}/af-work-item.json`, "filesystem");
          }
          sendJson(response, 201, result);
          return;
        }
        return methodNotAllowed(response);
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
    throw new WorkItemApiError(403, "same_origin_required", "Work Item 변경은 same-origin 요청만 허용합니다.");
  }
  let parsed: URL;
  try { parsed = new URL(origin); } catch {
    throw new WorkItemApiError(403, "same_origin_required", "Work Item 변경은 same-origin 요청만 허용합니다.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)
    || parsed.host.toLowerCase() !== host.toLowerCase()
    || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname.toLowerCase())
    || parsed.username !== ""
    || parsed.password !== ""
    || parsed.pathname !== "/"
    || parsed.search !== ""
    || parsed.hash !== "") {
    throw new WorkItemApiError(403, "same_origin_required", "Work Item 변경은 same-origin 요청만 허용합니다.");
  }
  const fetchSite = request.headers["sec-fetch-site"];
  if (typeof fetchSite === "string" && fetchSite !== "same-origin") {
    throw new WorkItemApiError(403, "same_origin_required", "Cross-site Work Item 변경은 허용하지 않습니다.");
  }
}

function assertJsonContentType(request: IncomingMessage): void {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new WorkItemApiError(415, "json_content_type_required", "application/json 요청만 허용합니다.");
  }
}

function requireNoQuery(url: URL): void {
  if ([...url.searchParams.keys()].length > 0) {
    throw new WorkItemApiError(400, "invalid_query", "Work Item 생성에는 query parameter를 사용할 수 없습니다.");
  }
}

interface BootstrapRequest {
  applicationName: string;
  reuseExisting: boolean;
}

interface BootstrapResult {
  work_id: string;
  artifact_root: string;
  application_id: string;
  application_root: string;
  created_application_dir: boolean;
}

async function bootstrapWorkItem(input: {
  repoRoot: string;
  store: ArtifactRootStore;
  applicationRegistry: ApplicationRegistryStore;
  commandRunner: BootstrapCommandRunner;
  body: unknown;
}): Promise<BootstrapResult> {
  const request = parseBootstrapRequest(input.body);
  const identifier = slugifyApplicationName(request.applicationName);

  return input.applicationRegistry.withLock(async () => {
    const snapshot = await input.applicationRegistry.loadSnapshot();
    const matchingRegistrations = snapshot.applications.filter((entry) => (
      entry.application_id === identifier || entry.work_id === identifier
    ));
    const exactRegistration = matchingRegistrations.find((entry) => (
      entry.application_id === identifier && entry.work_id === identifier
    )) ?? null;
    const manifestPath = input.store.resolveArtifactPath(identifier, "af-work-item.json", "read");
    const manifestExists = await pathExists(manifestPath);
    const identifierAlreadyExists = matchingRegistrations.length > 0
      || await pathExists(input.store.resolveRootDir(identifier));
    if ((!request.reuseExisting && identifierAlreadyExists)
      || matchingRegistrations.some((entry) => entry !== exactRegistration)) {
      const suggestion = await nextAvailableIdentifier(input.store, input.applicationRegistry, snapshot, identifier);
      throw new WorkItemApiError(409, "identifier_conflict", `이미 존재하는 Work Item 또는 Application ID입니다: ${identifier}`, {
        suggested_application_id: suggestion,
        suggested_work_id: suggestion,
      });
    }

    const applicationRoot = input.applicationRegistry.resolveApplicationRoot(identifier);
    if (exactRegistration && exactRegistration.application_root !== applicationRoot) {
      throw new WorkItemApiError(409, "application_registration_mismatch", "등록된 application 경로가 현재 applications root와 일치하지 않습니다.");
    }
    const applicationState = await inspectApplicationRoot(input.applicationRegistry.applicationsRoot, applicationRoot);
    if (applicationState.nonEmpty && !request.reuseExisting) {
      throw new WorkItemApiError(
        409,
        "application_directory_not_empty",
        "비어 있지 않은 application directory를 사용하려면 reuse_existing: true가 필요합니다.",
      );
    }

    if (request.reuseExisting && !manifestExists) {
      const artifactEntries = await readdir(input.store.resolveRootDir(identifier)).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw error;
      });
      if (artifactEntries.length > 0) {
        throw new WorkItemApiError(
          409,
          "work_item_recovery_unsafe",
          "다른 artifact가 남아 있어 빈 Work Item을 자동으로 다시 만들 수 없습니다.",
        );
      }
    }
    const workItem = manifestExists
      ? await input.store.readWorkItem(identifier).then(({ manifest }) => ({
        work_id: manifest.work_id,
        artifact_root: manifest.artifact_root,
      }))
      : await input.store.createWorkItem(identifier);
    await mkdir(applicationRoot, { recursive: true });
    await assertCanonicalContainment(input.applicationRegistry.applicationsRoot, applicationRoot);

    try {
      await input.commandRunner("git", ["init", "--", applicationRoot], { cwd: input.repoRoot });
    } catch {
      throw new WorkItemApiError(500, "git_init_failed", "application directory에서 git init을 완료하지 못했습니다.");
    }

    try {
      await input.commandRunner(process.execPath, [
        resolve(input.repoRoot, "scripts", "af.mjs"),
        "mcp",
        "export-context",
        identifier,
        "--application",
        identifier,
        "--application-root",
        applicationRoot,
        "--root",
        input.repoRoot,
      ], { cwd: input.repoRoot });
    } catch {
      throw new WorkItemApiError(500, "mcp_export_failed", "application MCP context를 내보내지 못했습니다.");
    }

    if (!exactRegistration) {
      await input.applicationRegistry.register({
        application_id: identifier,
        application_root: applicationRoot,
        work_id: identifier,
        created_at: new Date().toISOString(),
      });
    }
    return {
      ...workItem,
      application_id: identifier,
      application_root: applicationRoot,
      created_application_dir: !applicationState.exists,
    };
  });
}

function parseBootstrapRequest(value: unknown): BootstrapRequest {
  if (!isRecord(value)) {
    throw new WorkItemApiError(400, "invalid_bootstrap_request", "Work Item 생성 JSON 객체가 필요합니다.");
  }
  const allowed = ["application_name", "application_root_confirmed", "confirmation", "reuse_existing"];
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new WorkItemApiError(400, "invalid_bootstrap_request", "Work Item 생성 필드가 contract와 일치하지 않습니다.", {
      unknown_fields: unknown,
    });
  }
  if (typeof value.application_name !== "string" || value.application_name.trim() === ""
    || value.application_name.length > 256 || /[\/\\\u0000-\u001f\u007f]/.test(value.application_name)) {
    throw new WorkItemApiError(
      400,
      "invalid_application_name",
      "application_name은 경로 문자나 제어 문자가 없는 256자 이하 이름이어야 합니다.",
    );
  }
  if (value.application_root_confirmed !== true) {
    throw new WorkItemApiError(
      400,
      "application_root_confirmation_required",
      "application_root_confirmed: true로 생성 경로를 확인해야 합니다.",
    );
  }
  if (value.confirmation !== WORK_ITEM_CREATE_CONFIRMATION) {
    throw new WorkItemApiError(
      400,
      "confirmation_required",
      `confirmation은 ${WORK_ITEM_CREATE_CONFIRMATION}이어야 합니다.`,
    );
  }
  if (value.reuse_existing !== undefined && typeof value.reuse_existing !== "boolean") {
    throw new WorkItemApiError(400, "invalid_bootstrap_request", "reuse_existing은 boolean이어야 합니다.");
  }
  return {
    applicationName: value.application_name.trim(),
    reuseExisting: value.reuse_existing === true,
  };
}

function slugifyApplicationName(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  if (!REQ_ID_PATTERN.test(slug)) {
    throw new WorkItemApiError(
      400,
      "invalid_application_name",
      "application_name에서 소문자 영숫자 기반 ID를 만들 수 없습니다.",
    );
  }
  return slug;
}

async function identifierExists(
  store: ArtifactRootStore,
  snapshot: ApplicationRegistrySnapshot,
  identifier: string,
): Promise<boolean> {
  if (snapshot.applications.some((entry) =>
    entry.application_id === identifier || entry.work_id === identifier)) return true;
  return pathExists(store.resolveRootDir(identifier));
}

async function nextAvailableIdentifier(
  store: ArtifactRootStore,
  applicationRegistry: ApplicationRegistryStore,
  snapshot: ApplicationRegistrySnapshot,
  base: string,
): Promise<string> {
  for (let suffix = 2; suffix < 10_000; suffix += 1) {
    const suffixText = `-${suffix}`;
    const stem = base.slice(0, 64 - suffixText.length).replace(/-+$/g, "");
    const candidate = `${stem}${suffixText}`;
    if (await identifierExists(store, snapshot, candidate)) continue;
    if (await pathExists(applicationRegistry.resolveApplicationRoot(candidate))) continue;
    return candidate;
  }
  throw new WorkItemApiError(409, "identifier_conflict", "사용 가능한 ID suffix를 찾지 못했습니다.");
}

async function inspectApplicationRoot(
  applicationsRoot: string,
  applicationRoot: string,
): Promise<{ exists: boolean; nonEmpty: boolean }> {
  const rootInfo = await lstatOrNull(applicationsRoot);
  if (rootInfo && (rootInfo.isSymbolicLink() || !rootInfo.isDirectory())) {
    throw new WorkItemApiError(
      500,
      "invalid_applications_root",
      "AF_APPLICATIONS_ROOT는 symlink가 아닌 directory여야 합니다.",
    );
  }
  const applicationInfo = await lstatOrNull(applicationRoot);
  if (!applicationInfo) return { exists: false, nonEmpty: false };
  if (applicationInfo.isSymbolicLink() || !applicationInfo.isDirectory()) {
    throw new WorkItemApiError(
      409,
      "invalid_application_directory",
      "application root는 symlink가 아닌 directory여야 합니다.",
    );
  }
  if (rootInfo) await assertCanonicalContainment(applicationsRoot, applicationRoot);
  return { exists: true, nonEmpty: (await readdir(applicationRoot)).length > 0 };
}

async function assertCanonicalContainment(applicationsRoot: string, applicationRoot: string): Promise<void> {
  const [rootInfo, applicationInfo] = await Promise.all([
    lstat(applicationsRoot),
    lstat(applicationRoot),
  ]);
  if (rootInfo.isSymbolicLink() || !rootInfo.isDirectory()
    || applicationInfo.isSymbolicLink() || !applicationInfo.isDirectory()) {
    throw new WorkItemApiError(
      403,
      "application_path_escape",
      "application root와 AF_APPLICATIONS_ROOT는 symlink가 아닌 directory여야 합니다.",
    );
  }
  const [canonicalRoot, canonicalApplication] = await Promise.all([
    realpath(applicationsRoot),
    realpath(applicationRoot),
  ]);
  if (!isContained(canonicalRoot, canonicalApplication)) {
    throw new WorkItemApiError(
      403,
      "application_path_escape",
      "application root가 AF_APPLICATIONS_ROOT 밖을 가리킵니다.",
    );
  }
}

async function lstatOrNull(path: string) {
  try {
    return await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function pathExists(path: string): Promise<boolean> {
  return (await lstatOrNull(path)) !== null;
}

async function readBootstrapJsonBody(request: IncomingMessage): Promise<unknown> {
  const contentLength = request.headers["content-length"];
  if (contentLength !== undefined) {
    if (typeof contentLength !== "string" || !/^(0|[1-9][0-9]*)$/.test(contentLength)) {
      throw new WorkItemApiError(400, "invalid_content_length", "Content-Length가 올바르지 않습니다.");
    }
    const parsed = Number(contentLength);
    if (!Number.isSafeInteger(parsed)) {
      throw new WorkItemApiError(400, "invalid_content_length", "Content-Length가 너무 큽니다.");
    }
    if (parsed > MAX_BOOTSTRAP_BODY_BYTES) {
      throw new WorkItemApiError(413, "body_too_large", "Work Item 생성 요청은 4 KiB를 넘을 수 없습니다.");
    }
  }

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const rawChunk of request) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk as Uint8Array);
    size += chunk.byteLength;
    if (size <= MAX_BOOTSTRAP_BODY_BYTES) chunks.push(chunk);
  }
  if (size > MAX_BOOTSTRAP_BODY_BYTES) {
    throw new WorkItemApiError(413, "body_too_large", "Work Item 생성 요청은 4 KiB를 넘을 수 없습니다.");
  }
  if (size === 0) throw new WorkItemApiError(400, "invalid_json", "JSON 요청 본문이 필요합니다.");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new WorkItemApiError(400, "invalid_json", "JSON 형식이 올바르지 않습니다.");
  }
}

async function runBootstrapCommand(
  executable: string,
  args: readonly string[],
  options: { cwd: string },
): Promise<void> {
  await execFileAsync(executable, [...args], {
    cwd: options.cwd,
    encoding: "utf8",
    maxBuffer: 1 * 1_024 * 1_024,
  });
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
    const nextWorkItem = invalidateAfterGraphChange(workItem.manifest, {
      previousAnalysis: artifact.content,
      previousGraph: `${JSON.stringify(previousGraph, null, 2)}\n`,
      nextAnalysis: serializedAnalysis,
      nextGraph: serializedGraph,
      now: new Date(),
    });
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
  input: {
    previousAnalysis: string;
    previousGraph: string;
    nextAnalysis: string;
    nextGraph: string;
    now: Date;
  },
): AfWorkItemManifest {
  const at = input.now.toISOString();
  const registryRevision = manifest.revisions.catalog_snapshot?.registry_revision ?? null;
  const previousCompositionRevision = manifest.revisions.composition ?? createWorkItemRevision([
    { ref: GRAPH_ARTIFACT, content: input.previousAnalysis },
    { ref: "graph-ir.json", content: input.previousGraph },
  ], registryRevision);
  const graphRevision = createWorkItemRevision([
    { ref: "graph-ir.json", content: input.nextGraph },
  ], registryRevision);
  const compositionRevision = createWorkItemRevision([
    { ref: GRAPH_ARTIFACT, content: input.nextAnalysis },
    { ref: "graph-ir.json", content: input.nextGraph },
  ], registryRevision);
  const compose = manifest.skills["af-compose-solution"];
  const staleSkill = (state: AfWorkSkillState): AfWorkSkillState => state.status === "not_started"
    ? state
    : { ...state, status: "stale", updated_at: at };
  const previousCycle = [...manifest.composition_cycles]
    .reverse()
    .find((cycle) => cycle.status !== "superseded") ?? null;
  const cycleId = nextStableId(
    `composition-${manifest.ledger_revision + 1}`,
    new Set(manifest.composition_cycles.map((cycle) => cycle.cycle_id)),
  );
  const nextCycle: AfCompositionCycle = {
    cycle_id: cycleId,
    status: "active",
    revision: compositionRevision,
    supersedes_cycle_id: previousCycle?.cycle_id ?? null,
    artifact_refs: [GRAPH_ARTIFACT, "graph-ir.json"],
    return_to_discover: null,
    started_at: at,
    completed_at: null,
  };
  const invalidations = graphInvalidations(manifest, graphRevision, previousCompositionRevision, at);
  const priorCompositionGate = manifest.review_gates.composition;
  const compositionGate = priorCompositionGate.status === "pending"
    ? priorCompositionGate
    : {
        ...priorCompositionGate,
        status: "stale" as const,
        stale_reasons: [...new Set([...priorCompositionGate.stale_reasons, "graph_revision_changed"])],
      };

  return {
    ...manifest,
    ledger_revision: manifest.ledger_revision + 1,
    focus_skill: "af-compose-solution",
    active_runs: manifest.active_runs.filter(
      (run) => run.skill_id !== "af-scaffold-runtime" && run.skill_id !== "af-verify-runtime",
    ),
    skills: {
      ...manifest.skills,
      "af-compose-solution": {
        status: "waiting_for_review",
        input_revision: manifest.revisions.discovery,
        output_revision: compositionRevision,
        output_refs: [GRAPH_ARTIFACT, "graph-ir.json"],
        blocker_refs: [],
        output_roots: [],
        started_at: compose.started_at ?? at,
        updated_at: at,
        completed_at: null,
      },
      "af-scaffold-runtime": staleSkill(manifest.skills["af-scaffold-runtime"]),
      "af-verify-runtime": staleSkill(manifest.skills["af-verify-runtime"]),
    },
    revisions: {
      ...manifest.revisions,
      graph: graphRevision,
      composition: compositionRevision,
    },
    composition_cycles: [
      ...manifest.composition_cycles.map((cycle) => cycle.status === "superseded"
        ? cycle
        : { ...cycle, status: "superseded" as const, completed_at: cycle.completed_at ?? at }),
      nextCycle,
    ],
    review_gates: {
      ...manifest.review_gates,
      composition: compositionGate,
    },
    artifact_refs: [...new Set([...manifest.artifact_refs, GRAPH_ARTIFACT, "graph-ir.json"])],
    invalidations: [...manifest.invalidations, ...invalidations],
    verification: manifest.verification.outcome === null
      ? manifest.verification
      : { ...manifest.verification, outcome: "stale" },
  };
}

function graphInvalidations(
  manifest: AfWorkItemManifest,
  triggeringRevision: AfRevisionRef,
  previousCompositionRevision: AfRevisionRef,
  at: string,
): AfInvalidation[] {
  const existing = new Set(manifest.invalidations.map((entry) => entry.invalidation_id));
  const targets: Array<{ skill: AfWorkSkillId; revision: AfRevisionRef | null; refs: string[] }> = [
    {
      skill: "af-compose-solution",
      revision: previousCompositionRevision,
      refs: manifest.skills["af-compose-solution"].output_refs,
    },
    {
      skill: "af-scaffold-runtime",
      revision: manifest.revisions.scaffold ?? manifest.skills["af-scaffold-runtime"].output_revision,
      refs: manifest.skills["af-scaffold-runtime"].output_refs,
    },
    {
      skill: "af-verify-runtime",
      revision: manifest.revisions.verification ?? manifest.verification.revision,
      refs: manifest.verification.evidence_refs,
    },
  ];
  return targets.flatMap(({ skill, revision, refs }) => {
    if (revision === null) return [];
    return [{
      invalidation_id: nextStableId(
        `invalidation-${manifest.ledger_revision + 1}-${skill}`,
        existing,
      ),
      source_skill: "af-compose-solution",
      target_skill: skill,
      triggering_revision: triggeringRevision,
      invalidated_revision: revision,
      reason: "Workbench Graph IR changed after the recorded revision.",
      affected_refs: refs.length ? refs : revision.subjects.map((subject) => subject.ref),
      status: "active",
      created_at: at,
      resolved_at: null,
    } satisfies AfInvalidation];
  });
}

function nextStableId(base: string, existing: Set<string>): string {
  let candidate = base;
  let suffix = 2;
  while (existing.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  existing.add(candidate);
  return candidate;
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
  readonly details: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "WorkItemApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function handleError(error: unknown, response: ServerResponse, next: MiddlewareNext): void {
  if (error instanceof WorkItemApiError) {
    sendJson(response, error.statusCode, { error: error.message, code: error.code, ...error.details });
    return;
  }
  if (error instanceof CompanionApiError) {
    sendJson(response, error.statusCode, { error: error.message, code: error.code });
    return;
  }
  if (error instanceof ApplicationRegistryError) {
    const conflict = error.code === "application_id_conflict" || error.code === "work_id_conflict";
    sendJson(response, conflict ? 409 : 500, { error: error.message, code: error.code });
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
