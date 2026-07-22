import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, isAbsolute, join, relative, sep } from "node:path";
import { promisify } from "node:util";

import { parseTargetAnalysisResult } from "../src/analyzer/targetAnalysisResult";
import {
  buildSelectionBundleV1,
  renderSelectionBundlePreview,
} from "../src/companion/selectionBundle";
import {
  CODEX_BRIDGE_SCHEMA_VERSION,
  type CodexBridgeSnapshot,
  type CodexCompanionSnapshot,
  type CodexEditorCapabilities,
  type CodexSession,
  type ContextDelivery,
  type VscodeLaunchReceipt,
} from "../src/companion/types";
import {
  ArtifactRootStore,
  ArtifactValidationError,
  REQ_ID_PATTERN,
} from "./artifactRootStore";
import { isRecord, readJsonBody, sendJson } from "./httpApi";
import {
  VscodeWorkspaceLauncher,
  VscodeWorkspaceLauncherError,
} from "./vscodeWorkspaceLauncher";

const execFileAsync = promisify(execFile);
const ENDPOINT_RELATIVE_PATH = ".agent-factory/codex-bridge/v1/endpoint.json";
const QUEUE_BODY_LIMIT_BYTES = 32 * 1_024;
const BROKER_TIMEOUT_MS = 1_000;
const SELECTION_TTL_MS = 15 * 60 * 1_000;
const MAX_SELECTED_NODE_IDS = 20;
const MAX_USER_INTENT_CHARS = 4_000;
const LOCAL_WORKBENCH_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]"]);

type MiddlewareNext = (error?: unknown) => void;

interface BridgeEndpoint {
  url: string;
  token: string;
}

interface QueueRequest {
  requirement_id: string;
  node_ids: string[];
  target_session_id: string;
  user_intent: string | null;
  expected_graph_etag: string;
}

interface SessionPreferencesRequest {
  alias?: string | null;
  default_target?: boolean;
}

export interface CodexCompanionWorkspaceController {
  canonicalRoot(): Promise<string>;
  probe(): Promise<CodexEditorCapabilities>;
  launch(): Promise<VscodeLaunchReceipt>;
}

export interface CodexCompanionMiddlewareOptions {
  workspaceController?: CodexCompanionWorkspaceController;
}

class CompanionApiError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "CompanionApiError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export function createCodexCompanionMiddleware(
  repoRoot: string,
  options: CodexCompanionMiddlewareOptions = {},
) {
  const store = new ArtifactRootStore({ repoRoot });
  const workspaceController = options.workspaceController ?? new VscodeWorkspaceLauncher(repoRoot);

  return async function codexCompanionMiddleware(
    request: IncomingMessage,
    response: ServerResponse,
    next: MiddlewareNext,
  ): Promise<void> {
    try {
      if (!isLoopbackPeer(request.socket.remoteAddress)) {
        throw new CompanionApiError(403, "loopback_required", "CLI Companion API는 loopback 요청만 허용합니다.");
      }
      assertLocalWorkbenchHost(request);

      const pathname = parsePathname(request.url);
      if (request.method === "GET" && pathname === "/snapshot") {
        const snapshot = await companionSnapshot(repoRoot, workspaceController);
        sendJson(response, 200, snapshot);
        return;
      }

      const preferencesMatch = request.method === "POST"
        ? /^\/sessions\/([^/]+)\/preferences$/.exec(pathname)
        : null;
      if (preferencesMatch) {
        assertSameOrigin(request);
        assertJsonContentType(request);
        const sessionId = decodePathIdentifier(preferencesMatch[1], "session_id");
        const preferences = parseSessionPreferencesRequest(await readJsonBody(request, {
          maxBytes: QUEUE_BODY_LIMIT_BYTES,
          sizeLimitMessage: "Session preference 요청은 32 KiB를 넘을 수 없습니다.",
        }));
        const session = await brokerRequest<CodexSession>(
          repoRoot,
          `/v1/sessions/${encodeURIComponent(sessionId)}/preferences`,
          { method: "POST", body: preferences },
        );
        sendJson(response, 200, session);
        return;
      }

      if (request.method === "POST" && pathname === "/launch-vscode") {
        assertSameOrigin(request);
        assertJsonContentType(request);
        parseEmptyObject(await readJsonBody(request, {
          maxBytes: QUEUE_BODY_LIMIT_BYTES,
          sizeLimitMessage: "VS Code launch 요청은 32 KiB를 넘을 수 없습니다.",
        }));
        sendJson(response, 202, await workspaceController.launch());
        return;
      }

      if (request.method === "POST" && pathname === "/queue") {
        assertSameOrigin(request);
        assertJsonContentType(request);
        const input = parseQueueRequest(await readJsonBody(request, {
          maxBytes: QUEUE_BODY_LIMIT_BYTES,
          sizeLimitMessage: "CLI Context 요청은 32 KiB를 넘을 수 없습니다.",
        }));
        await assertArtifactReadContained(repoRoot, store.resolveArtifactPath(
          input.requirement_id,
          "analysis-result.json",
          "read",
        ));
        const artifact = await store.readArtifact(input.requirement_id, "analysis-result.json");
        if (artifact.etag !== input.expected_graph_etag) {
          throw new CompanionApiError(
            409,
            "stale_selection",
            "Graph가 선택 이후 변경되었습니다. 최신 Projection에서 다시 선택해 주세요.",
          );
        }

        let analysis;
        try {
          analysis = parseTargetAnalysisResult(JSON.parse(artifact.content));
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Target Contract v2 검증 실패";
          throw new CompanionApiError(422, "invalid_analysis_artifact", `analysis-result.json을 읽을 수 없습니다: ${detail}`);
        }

        const now = new Date();
        const sourceRevision = await readSourceRevision(repoRoot);
        let bundle: ReturnType<typeof buildSelectionBundleV1>;
        try {
          bundle = buildSelectionBundleV1({
            graph: analysis.graph,
            assetCandidates: analysis.assetCandidates,
            selectedNodeIds: input.node_ids,
            source: {
              workspaceId: await workspaceId(repoRoot),
              artifactRootId: `artifacts/af/${input.requirement_id}`,
              graphEtag: artifact.etag,
              gitHead: sourceRevision.head,
              dirtyHash: sourceRevision.dirtyHash,
            },
            userIntent: input.user_intent,
            now,
            expiresAt: new Date(now.getTime() + SELECTION_TTL_MS),
          });
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Selection Bundle 검증 실패";
          throw new CompanionApiError(422, "invalid_selection_bundle", detail);
        }
        const delivery = await brokerRequest<ContextDelivery>(repoRoot, "/v1/deliveries", {
          method: "POST",
          body: {
            target_session_id: input.target_session_id,
            delivery_mode: "next_prompt",
            consume_policy: "once",
            bundle,
          },
        });
        sendJson(response, 201, {
          delivery,
          bundle,
          preview: renderSelectionBundlePreview(bundle),
        });
        return;
      }

      const cancelMatch = request.method === "POST"
        ? /^\/deliveries\/([^/]+)\/cancel$/.exec(pathname)
        : null;
      if (cancelMatch) {
        assertSameOrigin(request);
        assertJsonContentType(request);
        await readJsonBody(request, {
          maxBytes: QUEUE_BODY_LIMIT_BYTES,
          sizeLimitMessage: "CLI Context 요청은 32 KiB를 넘을 수 없습니다.",
        });
        const deliveryId = decodeURIComponent(cancelMatch[1]);
        if (!deliveryId || deliveryId.includes("/") || deliveryId.includes("\\")) {
          throw new CompanionApiError(400, "invalid_delivery_id", "delivery_id 형식이 올바르지 않습니다.");
        }
        const delivery = await brokerRequest<ContextDelivery>(
          repoRoot,
          `/v1/deliveries/${encodeURIComponent(deliveryId)}/cancel`,
          { method: "POST", body: {} },
        );
        sendJson(response, 200, { delivery });
        return;
      }

      sendJson(response, 404, { error: "알 수 없는 CLI Companion 경로입니다.", code: "not_found" });
    } catch (error) {
      handleError(error, response, next);
    }
  };
}

async function fetchBridgeSnapshot(repoRoot: string): Promise<CodexBridgeSnapshot> {
  return brokerRequest<CodexBridgeSnapshot>(repoRoot, "/v1/snapshot", { method: "GET" });
}

async function companionSnapshot(
  repoRoot: string,
  workspaceController: CodexCompanionWorkspaceController,
): Promise<CodexCompanionSnapshot> {
  const [bridge, canonicalRoot, editor] = await Promise.all([
    fetchBridgeSnapshot(repoRoot).catch(() => unavailableSnapshot()),
    workspaceController.canonicalRoot(),
    workspaceController.probe(),
  ]);
  return {
    ...bridge,
    workspace: {
      workspace_id: workspaceIdFromCanonicalPath(canonicalRoot),
      canonical_path: canonicalRoot,
      display_name: basename(canonicalRoot) || canonicalRoot,
    },
    editor,
  };
}

function unavailableSnapshot(): CodexBridgeSnapshot {
  return {
    schema_version: CODEX_BRIDGE_SCHEMA_VERSION,
    capabilities: {
      bridge_available: false,
      codex_version: null,
      session_registration: false,
      next_prompt_context: false,
      session_end_event: "unsupported",
      delivery_ack: false,
      mcp_context_pull: false,
      direct_turn_start: false,
      inflight_steer: false,
    },
    sessions: [],
    deliveries: [],
  };
}

async function brokerRequest<T>(
  repoRoot: string,
  pathname: string,
  request: { method: "GET" | "POST"; body?: unknown },
): Promise<T> {
  let endpoint: BridgeEndpoint;
  try {
    endpoint = validateEndpoint(JSON.parse(await readFile(join(repoRoot, ENDPOINT_RELATIVE_PATH), "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new CompanionApiError(503, "bridge_unavailable", "Codex Bridge가 실행 중이지 않습니다.");
    }
    throw new CompanionApiError(503, "invalid_bridge_endpoint", "Codex Bridge endpoint를 신뢰할 수 없습니다.");
  }

  let result: Response;
  try {
    result = await fetch(`${endpoint.url}${pathname}`, {
      method: request.method,
      headers: {
        authorization: `Bearer ${endpoint.token}`,
        ...(request.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: AbortSignal.timeout(BROKER_TIMEOUT_MS),
    });
  } catch {
    throw new CompanionApiError(503, "bridge_unavailable", "Codex Bridge에 연결할 수 없습니다.");
  }

  const payload = await result.json().catch(() => null);
  if (!result.ok) {
    const brokerError = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
    const message = brokerError && typeof brokerError.message === "string"
      ? brokerError.message
      : "Codex Bridge 요청이 실패했습니다.";
    const code = brokerError && typeof brokerError.code === "string" ? brokerError.code : "bridge_request_failed";
    throw new CompanionApiError(result.status, code, message);
  }
  return payload as T;
}

function validateEndpoint(value: unknown): BridgeEndpoint {
  if (!isRecord(value) || value.schema_version !== CODEX_BRIDGE_SCHEMA_VERSION) {
    throw new Error("invalid endpoint schema");
  }
  if (typeof value.token !== "string" || value.token.length < 32 || typeof value.url !== "string") {
    throw new Error("invalid endpoint credentials");
  }
  const url = new URL(value.url);
  if (
    url.protocol !== "http:"
    || url.hostname !== "127.0.0.1"
    || !url.port
    || url.username
    || url.password
    || url.search
    || url.hash
    || (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("endpoint must be an unadorned loopback URL");
  }
  return { url: url.origin, token: value.token };
}

function parseQueueRequest(value: unknown): QueueRequest {
  if (!isRecord(value)) throw new CompanionApiError(400, "invalid_request", "요청 JSON 객체가 필요합니다.");
  const requirementId = requiredString(value.requirement_id, "requirement_id", 64);
  if (!REQ_ID_PATTERN.test(requirementId)) {
    throw new CompanionApiError(400, "invalid_requirement_id", "requirement_id 형식이 올바르지 않습니다.");
  }
  if (!Array.isArray(value.node_ids) || value.node_ids.length === 0 || value.node_ids.length > MAX_SELECTED_NODE_IDS) {
    throw new CompanionApiError(400, "invalid_node_ids", `node_ids는 1개 이상 ${MAX_SELECTED_NODE_IDS}개 이하여야 합니다.`);
  }
  const nodeIds = value.node_ids.map((nodeId, index) => requiredString(nodeId, `node_ids[${index}]`, 1_024));
  if (new Set(nodeIds).size !== nodeIds.length) {
    throw new CompanionApiError(400, "duplicate_node_ids", "node_ids에 중복 값이 있습니다.");
  }
  const userIntent = value.user_intent === null
    ? null
    : requiredString(value.user_intent, "user_intent", MAX_USER_INTENT_CHARS, true).trim() || null;
  return {
    requirement_id: requirementId,
    node_ids: nodeIds,
    target_session_id: requiredString(value.target_session_id, "target_session_id", 256),
    user_intent: userIntent,
    expected_graph_etag: requiredString(value.expected_graph_etag, "expected_graph_etag", 256),
  };
}

function parseSessionPreferencesRequest(value: unknown): SessionPreferencesRequest {
  if (!isRecord(value)) throw new CompanionApiError(400, "invalid_request", "요청 JSON 객체가 필요합니다.");
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.some((key) => key !== "alias" && key !== "default_target")) {
    throw new CompanionApiError(400, "invalid_preferences", "alias 또는 default_target이 필요합니다.");
  }
  const normalized: SessionPreferencesRequest = {};
  if (Object.prototype.hasOwnProperty.call(value, "alias")) {
    if (value.alias === null) {
      normalized.alias = null;
    } else if (typeof value.alias === "string") {
      const alias = value.alias.trim();
      if (alias.length > 80) throw new CompanionApiError(400, "invalid_alias", "alias는 80자 이하여야 합니다.");
      normalized.alias = alias || null;
    } else {
      throw new CompanionApiError(400, "invalid_alias", "alias는 문자열 또는 null이어야 합니다.");
    }
  }
  if (Object.prototype.hasOwnProperty.call(value, "default_target")) {
    if (typeof value.default_target !== "boolean") {
      throw new CompanionApiError(400, "invalid_default_target", "default_target은 boolean이어야 합니다.");
    }
    normalized.default_target = value.default_target;
  }
  return normalized;
}

function parseEmptyObject(value: unknown): void {
  if (!isRecord(value) || Object.keys(value).length !== 0) {
    throw new CompanionApiError(400, "empty_object_required", "빈 JSON 객체만 허용합니다.");
  }
}

function decodePathIdentifier(value: string, field: "delivery_id" | "session_id"): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new CompanionApiError(400, `invalid_${field}`, `${field} 형식이 올바르지 않습니다.`);
  }
  if (!decoded || decoded.includes("/") || decoded.includes("\\")) {
    throw new CompanionApiError(400, `invalid_${field}`, `${field} 형식이 올바르지 않습니다.`);
  }
  return decoded;
}

function requiredString(value: unknown, field: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new CompanionApiError(400, "invalid_request", `${field}는 문자열이어야 합니다.`);
  }
  if (value.length > maxLength) {
    throw new CompanionApiError(400, "invalid_request", `${field}가 너무 깁니다.`);
  }
  return value.trim();
}

function parsePathname(rawUrl: string | undefined): string {
  try {
    return new URL(rawUrl ?? "/", "http://127.0.0.1").pathname.replace(/\/$/, "") || "/";
  } catch {
    throw new CompanionApiError(400, "invalid_path", "요청 경로를 해석할 수 없습니다.");
  }
}

function assertJsonContentType(request: IncomingMessage): void {
  const contentType = request.headers["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw new CompanionApiError(415, "json_content_type_required", "application/json 요청만 허용합니다.");
  }
}

function assertSameOrigin(request: IncomingMessage): void {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (typeof origin !== "string" || typeof host !== "string") {
    throw new CompanionApiError(403, "same_origin_required", "동일 Origin 요청만 허용합니다.");
  }
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new CompanionApiError(403, "same_origin_required", "동일 Origin 요청만 허용합니다.");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    || parsed.host.toLowerCase() !== host.toLowerCase()
    || !LOCAL_WORKBENCH_HOSTNAMES.has(parsed.hostname.toLowerCase())
  ) {
    throw new CompanionApiError(403, "same_origin_required", "동일 Origin 요청만 허용합니다.");
  }
  const fetchSite = request.headers["sec-fetch-site"];
  if (typeof fetchSite === "string" && fetchSite !== "same-origin") {
    throw new CompanionApiError(403, "same_origin_required", "Cross-site 요청은 허용하지 않습니다.");
  }
}

function assertLocalWorkbenchHost(request: IncomingMessage): void {
  const host = request.headers.host;
  if (typeof host !== "string") {
    throw new CompanionApiError(403, "local_workbench_host_required", "Local Workbench Host만 허용합니다.");
  }
  let parsed: URL;
  try {
    parsed = new URL(`http://${host}`);
  } catch {
    throw new CompanionApiError(403, "local_workbench_host_required", "Local Workbench Host만 허용합니다.");
  }
  if (
    !LOCAL_WORKBENCH_HOSTNAMES.has(parsed.hostname.toLowerCase())
    || parsed.username
    || parsed.password
    || parsed.pathname !== "/"
    || parsed.search
    || parsed.hash
  ) {
    throw new CompanionApiError(403, "local_workbench_host_required", "Local Workbench Host만 허용합니다.");
  }
}

function isLoopbackPeer(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

async function workspaceId(repoRoot: string): Promise<string> {
  const canonicalRoot = await realpath(repoRoot);
  return workspaceIdFromCanonicalPath(canonicalRoot);
}

function workspaceIdFromCanonicalPath(canonicalRoot: string): string {
  return `workspace_v1_${createHash("sha256").update(canonicalRoot).digest("hex").slice(0, 16)}`;
}

async function assertArtifactReadContained(repoRoot: string, artifactPath: string): Promise<void> {
  const canonicalRoot = await realpath(repoRoot);
  const canonicalArtifact = await realpath(artifactPath).catch((error) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  });
  if (canonicalArtifact === null) return;
  const pathFromRoot = relative(canonicalRoot, canonicalArtifact);
  const contained = pathFromRoot === ""
    || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
  if (!contained) {
    throw new CompanionApiError(403, "artifact_path_outside_workspace", "Artifact 경로가 등록된 Worktree 밖을 가리킵니다.");
  }
}

async function readSourceRevision(repoRoot: string): Promise<{ head: string | null; dirtyHash: string | null }> {
  const head = await git(repoRoot, ["rev-parse", "HEAD"]).catch(() => null);
  const status = await git(repoRoot, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
  if (!status) return { head, dirtyHash: null };
  const diff = head
    ? await git(repoRoot, ["diff", "--no-ext-diff", "--binary", "HEAD", "--"]).catch(() => "")
    : "";
  return {
    head,
    dirtyHash: createHash("sha256").update(status).update("\0").update(diff).digest("hex"),
  };
}

async function git(repoRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 16 * 1_024 * 1_024,
  });
  return stdout.trim();
}

function handleError(error: unknown, response: ServerResponse, next: MiddlewareNext): void {
  if (error instanceof CompanionApiError) {
    sendJson(response, error.statusCode, { error: error.message, code: error.code });
    return;
  }
  if (error instanceof ArtifactValidationError) {
    sendJson(response, error.statusCode, { error: error.message, code: "artifact_error" });
    return;
  }
  if (error instanceof VscodeWorkspaceLauncherError) {
    sendJson(response, error.statusCode, { error: error.message, code: error.code });
    return;
  }
  if (error instanceof SyntaxError) {
    sendJson(response, 400, { error: "요청 JSON을 해석하지 못했습니다.", code: "invalid_json" });
    return;
  }
  if (error instanceof Error) {
    console.error("[codex-companion] 실패:", error);
    sendJson(response, 500, { error: "CLI Companion 요청 처리에 실패했습니다.", code: "internal_error" });
    return;
  }
  next(error);
}
