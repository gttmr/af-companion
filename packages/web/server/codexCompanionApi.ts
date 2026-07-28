import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, isAbsolute, join, relative, sep } from "node:path";

import { parseTargetAnalysisResult } from "../src/analyzer/targetAnalysisResult";
import type { AssetCandidate, GraphIR } from "../src/analyzer/types";
import { buildSelectionBundleV1, renderSelectionBundlePreview } from "../src/companion/selectionBundle";
import { COMPANION_SESSION_CONTRACT_VERSION, COMPANION_STATE_RELATIVE_DIR } from "../src/companion/sessionContract";
import type {
  CodexBridgeSnapshotV2,
  CodexCompanionSnapshotV2,
  CodexEditorCapabilities,
  ScopedContextDelivery,
  SelectionBundleV1,
  VscodeLaunchReceipt,
} from "../src/companion/types";
import { ArtifactRootStore, ArtifactValidationError, REQ_ID_PATTERN } from "./artifactRootStore";
import { isRecord, readJsonBody, sendJson } from "./httpApi";
import {
  CONTINUE_CONFIRMATION,
  ATTACH_HANDOFF_CONFIRMATION,
  CANCEL_HANDOFF_CONFIRMATION,
  CodexBridgeValidationError,
  MAX_HANDOFF_REQUEST_BODY_BYTES,
  PLAN_HANDOFF_TARGET,
  RESET_CONFIRMATION,
  REVOKE_CONFIRMATION,
  readRepositorySourceRevision,
  validateAttachSessionInput,
  validateCreateDeliveryInput,
  validateCreateEnrollmentInput,
  validateCreatePlanHandoffInput,
  validateSessionAliasInput,
} from "./codexBridgeStore";
import { ApplicationRegistryError, ApplicationRegistryStore } from "./applicationRegistryStore";
import {
  VscodeWorkspaceLauncher,
  VscodeWorkspaceLauncherError,
  type VscodeSessionWorkspaceInput,
} from "./vscodeWorkspaceLauncher";

const ENDPOINT_RELATIVE_PATH = `${COMPANION_STATE_RELATIVE_DIR}/endpoint.json`;
const BODY_LIMIT = 32 * 1_024;
const BROKER_TIMEOUT_MS = 1_000;
const SELECTION_TTL_MS = 15 * 60 * 1_000;
const MAX_SELECTED_NODE_IDS = 20;
const MAX_USER_INTENT_CHARS = 4_000;
const HANDOFF_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

type MiddlewareNext = (error?: unknown) => void;

interface BridgeEndpoint { url: string; token: string }
interface QueueRequest {
  requirement_id: string;
  node_ids: string[];
  target_session_id: string;
  user_intent: string | null;
  expected_graph_etag: string;
}

export interface CodexCompanionWorkspaceController {
  canonicalRoot(): Promise<string>;
  probe(): Promise<CodexEditorCapabilities>;
  launch(): Promise<VscodeLaunchReceipt>;
  launchSessionWorkspace(input: VscodeSessionWorkspaceInput): Promise<VscodeLaunchReceipt>;
}

export interface CodexCompanionMiddlewareOptions {
  applicationsRoot?: string;
  workspaceController?: CodexCompanionWorkspaceController;
}

export class CompanionApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  constructor(statusCode: number, code: string, message: string) {
    super(message); this.name = "CompanionApiError"; this.statusCode = statusCode; this.code = code;
  }
}

export interface GraphChangeContextInput {
  workId: string;
  graph: GraphIR;
  assetCandidates: readonly AssetCandidate[];
  changedNodeIds: readonly string[];
  targetSessionId: string;
  graphEtag: string;
}

export async function enqueueGraphChangeContext(repoRoot: string, input: GraphChangeContextInput): Promise<ScopedContextDelivery> {
  if (!REQ_ID_PATTERN.test(input.workId)) throw new CompanionApiError(400, "invalid_work_id", "work_id 형식이 올바르지 않습니다.");
  if (!input.targetSessionId.trim()) throw new CompanionApiError(400, "target_session_required", "Graph 변경을 받을 Codex session을 명시해야 합니다.");
  const nodeIds = [...new Set(input.changedNodeIds)].slice(0, MAX_SELECTED_NODE_IDS);
  if (nodeIds.length === 0) nodeIds.push(...input.graph.nodes.slice(0, MAX_SELECTED_NODE_IDS).map((node) => node.id));
  if (nodeIds.length === 0) throw new CompanionApiError(422, "graph_context_empty", "Graph 변경 context에 포함할 Node가 없습니다.");
  const now = new Date();
  const revision = await readSourceRevision(repoRoot);
  const bundle = buildSelectionBundleV1({
    graph: input.graph, assetCandidates: input.assetCandidates, selectedNodeIds: nodeIds,
    source: { workspaceId: await workspaceId(repoRoot), artifactRootId: `artifacts/af/${input.workId}`, graphEtag: input.graphEtag, gitHead: revision.head, dirtyHash: revision.dirtyHash },
    userIntent: "graph_change: Workbench에서 Graph IR가 수정되었습니다. 저장된 최신 Graph와 관련 source를 검토하세요.",
    now, expiresAt: new Date(now.getTime() + SELECTION_TTL_MS),
  });
  return queueScopedDelivery(repoRoot, input.targetSessionId, input.workId, bundle);
}

export function createCodexCompanionMiddleware(repoRoot: string, options: CodexCompanionMiddlewareOptions = {}) {
  const artifactStore = new ArtifactRootStore({ repoRoot });
  const applicationRegistry = new ApplicationRegistryStore({
    repoRoot,
    applicationsRoot: options.applicationsRoot,
  });
  const workspaceController = options.workspaceController ?? new VscodeWorkspaceLauncher(repoRoot);
  return async function codexCompanionMiddleware(request: IncomingMessage, response: ServerResponse, next: MiddlewareNext): Promise<void> {
    try {
      if (!isLoopbackPeer(request.socket.remoteAddress)) throw new CompanionApiError(403, "loopback_required", "CLI Companion API는 loopback 요청만 허용합니다.");
      assertLocalHost(request);
      const path = pathname(request.url);
      if (request.method === "GET" && path === "/snapshot") {
        sendJson(response, 200, await companionSnapshot(repoRoot, workspaceController)); return;
      }
      if (request.method === "POST" && path === "/launch-vscode") {
        await mutationBody(request, (value) => { emptyObject(value); return value; });
        sendJson(response, 202, await workspaceController.launch()); return;
      }
      if (request.method === "POST" && path === "/vscode-sessions") {
        const input = await mutationBody(request, parseVscodeSessionRequest);
        await assertWorkItemExists(repoRoot, artifactStore, input.workId);
        const snapshot = await applicationRegistry.loadSnapshot();
        const registration = snapshot.applications.find((entry) => entry.work_id === input.workId);
        if (!registration) {
          throw new CompanionApiError(
            409,
            "application_registration_missing",
            "Work Item에 등록된 application workspace가 없습니다.",
          );
        }
        const bridge = await fetchSnapshot(repoRoot);
        if (input.mode === "materialization") {
          if (input.handoffId) {
            const handoff = bridge.handoffs.find((entry) => entry.handoff_id === input.handoffId);
            if (!handoff) throw new CompanionApiError(404, "handoff_not_found", "선택한 Plan Handoff를 찾을 수 없습니다.");
            if (handoff.workspace_id !== await workspaceId(repoRoot)
              || handoff.application_id !== registration.application_id
              || handoff.work_id !== registration.work_id
              || handoff.target_skill !== PLAN_HANDOFF_TARGET) {
              throw new CompanionApiError(409, "handoff_scope_mismatch", "Plan Handoff가 현재 application과 Work Item 범위에 속하지 않습니다.");
            }
            if (handoff.status !== "ready" && handoff.status !== "waiting_for_fresh_session") {
              throw new CompanionApiError(409, "handoff_not_ready", "Plan Handoff를 새 session에서 이어갈 수 없는 상태입니다.");
            }
            if (Date.parse(handoff.expires_at) <= Date.now()) {
              throw new CompanionApiError(409, "handoff_expired", "Plan Handoff가 만료됐습니다.");
            }
            const source = bridge.sessions.find((session) => session.session_id === handoff.from_session_id);
            if (!source
              || source.participation !== "companion_active"
              || source.status !== "active"
              || source.role !== "plan"
              || source.permission_mode !== "plan"
              || Date.parse(source.lease_expires_at) <= Date.now()) {
              throw new CompanionApiError(409, "source_inactive", "Plan Handoff의 source session이 더 이상 active 상태가 아닙니다.");
            }
          } else {
            const grant = bridge.materialization_grants.find((entry) => entry.grant_id === input.grantId);
            if (!grant) {
              throw new CompanionApiError(
                404,
                "materialization_grant_not_found",
                "선택한 Materialization Grant를 찾을 수 없습니다.",
              );
            }
            if (grant.workspace_id !== await workspaceId(repoRoot)
              || grant.application_id !== registration.application_id
              || grant.work_id !== registration.work_id
              || grant.target_skill !== PLAN_HANDOFF_TARGET) {
              throw new CompanionApiError(
                409,
                "materialization_grant_scope_mismatch",
                "Materialization Grant가 현재 application과 Work Item 범위에 속하지 않습니다.",
              );
            }
            if (grant.status !== "ready" && grant.status !== "waiting_for_fresh_session") {
              throw new CompanionApiError(
                409,
                "materialization_grant_not_ready",
                "Materialization Grant를 새 session에서 이어갈 수 없는 상태입니다.",
              );
            }
            if (Date.parse(grant.expires_at) <= Date.now()) {
              throw new CompanionApiError(
                409,
                "materialization_grant_expired",
                "Materialization Grant가 만료됐습니다.",
              );
            }
          }
        }
        const launchInput: VscodeSessionWorkspaceInput = input.mode === "materialization"
          ? input.handoffId
            ? {
              applicationId: registration.application_id,
              applicationRoot: registration.application_root,
              applicationsRoot: applicationRegistry.applicationsRoot,
              workId: registration.work_id,
              mode: "materialization",
              handoffId: input.handoffId,
            }
            : {
              applicationId: registration.application_id,
              applicationRoot: registration.application_root,
              applicationsRoot: applicationRegistry.applicationsRoot,
              workId: registration.work_id,
              mode: "materialization",
              grantId: input.grantId as string,
            }
          : {
          applicationId: registration.application_id,
          applicationRoot: registration.application_root,
          applicationsRoot: applicationRegistry.applicationsRoot,
          workId: registration.work_id,
          mode: "plan",
        };
        const receipt = await workspaceController.launchSessionWorkspace(launchInput);
        sendJson(response, 202, {
          ...receipt,
          application_id: registration.application_id,
          work_id: registration.work_id,
          role: input.mode,
        });
        return;
      }
      if (request.method === "POST" && path === "/enrollments") {
        const input = await mutationBody(request, validateCreateEnrollmentInput);
        await assertWorkItemExists(repoRoot, artifactStore, input.work_id);
        sendJson(response, 201, await brokerRequest(repoRoot, "/v1/enrollments", { method: "POST", body: input })); return;
      }
      if (request.method === "POST" && path === "/handoffs") {
        const input = await mutationBody(request, validateCreatePlanHandoffInput, MAX_HANDOFF_REQUEST_BODY_BYTES);
        await assertWorkItemExists(repoRoot, artifactStore, input.work_id);
        sendJson(response, 201, await brokerRequest(repoRoot, "/v1/handoffs", { method: "POST", body: input })); return;
      }
      const continueMatch = request.method === "POST" ? /^\/handoffs\/([^/]+)\/continue$/.exec(path) : null;
      if (continueMatch) {
        const id = decodeIdentifier(continueMatch[1], "handoff_id");
        await mutationBody(request, (value) => { emptyObject(value); return value; });
        sendJson(response, 200, await brokerRequest(repoRoot, `/v1/handoffs/${encodeURIComponent(id)}/continue`, { method: "POST", body: { confirmation: CONTINUE_CONFIRMATION } })); return;
      }
      const attachHandoffMatch = request.method === "POST" ? /^\/handoffs\/([^/]+)\/attach$/.exec(path) : null;
      if (attachHandoffMatch) {
        const id = decodeIdentifier(attachHandoffMatch[1], "handoff_id");
        const input = await mutationBody(request, (value) => {
          if (!isRecord(value) || Object.keys(value).length !== 1 || !("target_session_id" in value)) {
            throw new CompanionApiError(400, "target_session_required", "target_session_id 하나만 지정해야 합니다.");
          }
          return { target_session_id: requiredString(value.target_session_id, "target_session_id", 256) };
        });
        sendJson(response, 200, await brokerRequest(repoRoot, `/v1/handoffs/${encodeURIComponent(id)}/attach`, { method: "POST", body: { confirmation: ATTACH_HANDOFF_CONFIRMATION, target_session_id: input.target_session_id } })); return;
      }
      const cancelHandoffMatch = request.method === "POST" ? /^\/handoffs\/([^/]+)\/cancel$/.exec(path) : null;
      if (cancelHandoffMatch) {
        const id = decodeIdentifier(cancelHandoffMatch[1], "handoff_id");
        await mutationBody(request, (value) => { emptyObject(value); return value; });
        sendJson(response, 200, await brokerRequest(repoRoot, `/v1/handoffs/${encodeURIComponent(id)}/cancel`, { method: "POST", body: { confirmation: CANCEL_HANDOFF_CONFIRMATION } })); return;
      }
      if (request.method === "POST" && path === "/sessions/attach") {
        sendJson(response, 200, await brokerRequest(repoRoot, "/v1/sessions/attach", { method: "POST", body: await mutationBody(request, validateAttachSessionInput) })); return;
      }
      const revokeMatch = request.method === "POST" ? /^\/sessions\/([^/]+)\/revoke$/.exec(path) : null;
      if (revokeMatch) {
        const id = decodeIdentifier(revokeMatch[1], "session_id");
        await mutationBody(request, (value) => { emptyObject(value); return value; });
        sendJson(response, 200, await brokerRequest(repoRoot, `/v1/sessions/${encodeURIComponent(id)}/revoke`, { method: "POST", body: { confirmation: REVOKE_CONFIRMATION, reason: "revoked_from_companion_ui" } })); return;
      }
      const preferencesMatch = request.method === "POST" ? /^\/sessions\/([^/]+)\/preferences$/.exec(path) : null;
      if (preferencesMatch) {
        const id = decodeIdentifier(preferencesMatch[1], "session_id");
        sendJson(response, 200, await brokerRequest(repoRoot, `/v1/sessions/${encodeURIComponent(id)}/preferences`, { method: "POST", body: await mutationBody(request, validateSessionAliasInput) })); return;
      }
      if (request.method === "POST" && path === "/deliveries") {
        const input = await mutationBody(request, validateCreateDeliveryInput);
        await assertWorkItemExists(repoRoot, artifactStore, input.scope.work_id);
        sendJson(response, 201, await brokerRequest(repoRoot, "/v1/deliveries", { method: "POST", body: input })); return;
      }
      if (request.method === "POST" && path === "/queue") {
        const input = await mutationBody(request, parseQueueRequest);
        await assertWorkItemExists(repoRoot, artifactStore, input.requirement_id);
        await assertArtifactContained(repoRoot, artifactStore.resolveArtifactPath(input.requirement_id, "analysis-result.json", "read"));
        const artifact = await artifactStore.readArtifact(input.requirement_id, "analysis-result.json");
        if (artifact.etag !== input.expected_graph_etag) throw new CompanionApiError(409, "stale_selection", "Graph가 선택 이후 변경되었습니다. 최신 Projection에서 다시 선택해 주세요.");
        let analysis;
        try { analysis = parseTargetAnalysisResult(JSON.parse(artifact.content)); }
        catch (error) { throw new CompanionApiError(422, "invalid_analysis_artifact", `analysis-result.json을 읽을 수 없습니다: ${error instanceof Error ? error.message : "Target Contract v2 검증 실패"}`); }
        const now = new Date();
        const revision = await readSourceRevision(repoRoot);
        const bundle = buildSelectionBundleV1({
          graph: analysis.graph, assetCandidates: analysis.assetCandidates, selectedNodeIds: input.node_ids,
          source: { workspaceId: await workspaceId(repoRoot), artifactRootId: `artifacts/af/${input.requirement_id}`, graphEtag: artifact.etag, gitHead: revision.head, dirtyHash: revision.dirtyHash },
          userIntent: input.user_intent, now, expiresAt: new Date(now.getTime() + SELECTION_TTL_MS),
        });
        const delivery = await queueScopedDelivery(repoRoot, input.target_session_id, input.requirement_id, bundle);
        sendJson(response, 201, { delivery, bundle, preview: renderSelectionBundlePreview(bundle) }); return;
      }
      const cancelMatch = request.method === "POST" ? /^\/deliveries\/([^/]+)\/cancel$/.exec(path) : null;
      if (cancelMatch) {
        const id = decodeIdentifier(cancelMatch[1], "delivery_id");
        await mutationBody(request, (value) => { emptyObject(value); return value; });
        sendJson(response, 200, { delivery: await brokerRequest(repoRoot, `/v1/deliveries/${encodeURIComponent(id)}/cancel`, { method: "POST", body: {} }) }); return;
      }
      if (request.method === "POST" && path === "/state/reset") {
        await mutationBody(request, (value) => { emptyObject(value); return value; });
        await brokerRequest(repoRoot, "/v1/state/reset", { method: "POST", body: { confirmation: RESET_CONFIRMATION } });
        response.statusCode = 204; response.end(); return;
      }
      sendJson(response, 404, { error: "알 수 없는 CLI Companion 경로입니다.", code: "not_found" });
    } catch (error) { handleError(error, response, next); }
  };
}

async function mutationBody<T>(request: IncomingMessage, validate: (value: unknown) => T, maxBytes = BODY_LIMIT): Promise<T> {
  assertSameOrigin(request); assertJson(request);
  return validate(await readJsonBody(request, { maxBytes, sizeLimitMessage: `Companion 요청은 ${Math.floor(maxBytes / 1_024)} KiB를 넘을 수 없습니다.` }));
}

type VscodeSessionRequest =
  | { workId: string; mode: "plan" }
  | { workId: string; mode: "materialization"; handoffId: string; grantId?: never }
  | { workId: string; mode: "materialization"; handoffId?: never; grantId: string };

function parseVscodeSessionRequest(value: unknown): VscodeSessionRequest {
  if (!isRecord(value) || !("work_id" in value) || !("mode" in value)) {
    throw new CompanionApiError(
      400,
      "invalid_vscode_session_request",
      "work_id, mode와 materialization의 handoff_id 또는 grant_id만 지정할 수 있습니다.",
    );
  }
  if (typeof value.work_id !== "string" || !REQ_ID_PATTERN.test(value.work_id)) {
    throw new CompanionApiError(400, "invalid_work_id", "work_id 형식이 올바르지 않습니다.");
  }
  if (value.mode === "plan") {
    if (Object.keys(value).length !== 2) {
      throw new CompanionApiError(400, "invalid_vscode_session_request", "Plan mode에는 work_id와 mode만 지정해야 합니다.");
    }
    return { workId: value.work_id, mode: "plan" };
  }
  if (value.mode === "materialization") {
    const hasHandoff = typeof value.handoff_id === "string";
    const hasGrant = typeof value.grant_id === "string";
    if (Object.keys(value).length !== 3 || hasHandoff === hasGrant) {
      throw new CompanionApiError(
        400,
        "invalid_materialization_authority",
        "Materialization mode에는 handoff_id 또는 grant_id 하나가 필요합니다.",
      );
    }
    if (hasHandoff && HANDOFF_ID_PATTERN.test(value.handoff_id as string)) {
      return { workId: value.work_id, mode: "materialization", handoffId: value.handoff_id as string };
    }
    if (hasGrant && HANDOFF_ID_PATTERN.test(value.grant_id as string)) {
      return { workId: value.work_id, mode: "materialization", grantId: value.grant_id as string };
    }
    throw new CompanionApiError(
      400,
      "invalid_materialization_authority",
      "Materialization authority 식별자가 올바르지 않습니다.",
    );
  }
  throw new CompanionApiError(400, "invalid_vscode_session_mode", "vscode session mode는 plan 또는 materialization이어야 합니다.");
}

async function queueScopedDelivery(repoRoot: string, targetSessionId: string, workId: string, bundle: SelectionBundleV1): Promise<ScopedContextDelivery> {
  const snapshot = await fetchSnapshot(repoRoot);
  const session = snapshot.sessions.find((item) => item.session_id === targetSessionId);
  if (!session) throw new CompanionApiError(409, "inactive_session", "대상 session이 Companion에 등록되지 않았습니다.");
  if (session.work_id !== workId) throw new CompanionApiError(409, "work_mismatch", "대상 session의 현재 Work scope가 다릅니다.");
  return brokerRequest<ScopedContextDelivery>(repoRoot, "/v1/deliveries", {
    method: "POST",
    body: {
      target_session_id: targetSessionId, delivery_mode: "next_prompt", consume_policy: "once",
      scope: { workspace_id: session.workspace_id, application_id: session.application_id, work_id: session.work_id, allowed_roles: [session.role] },
      current_role: session.role, current_source_revision: bundle.source_revision, bundle,
    },
  });
}

async function fetchSnapshot(repoRoot: string): Promise<CodexBridgeSnapshotV2> {
  return brokerRequest(repoRoot, "/v1/snapshot", { method: "GET" });
}

async function companionSnapshot(repoRoot: string, controller: CodexCompanionWorkspaceController): Promise<CodexCompanionSnapshotV2> {
  const [bridge, canonicalRoot, editor] = await Promise.all([fetchSnapshot(repoRoot).catch(() => unavailableSnapshot()), controller.canonicalRoot(), controller.probe()]);
  return { ...bridge, workspace: { workspace_id: workspaceIdFromPath(canonicalRoot), canonical_path: canonicalRoot, display_name: basename(canonicalRoot) || canonicalRoot }, editor };
}

function unavailableSnapshot(): CodexBridgeSnapshotV2 {
  return {
    schema_version: 2, bridge_instance_id: "unavailable",
    capabilities: {
      bridge_available: false, codex_version: null, hook_side_effect_isolation: true, strict_no_hook_mode: "unverified",
      session_enrollment: false, session_lease: false, next_prompt_context: false, session_end_event: "unsupported",
      delivery_ack: false, direct_turn_start: false, inflight_steer: false, fresh_session_handoff: false,
      materialization_bootstrap_grant: false,
      fresh_context_transport: "unverified", cli_environment_enrollment: "unverified", vscode_environment_enrollment: "unverified",
    },
    enrollment_tickets: [], sessions: [], deliveries: [], handoffs: [], materialization_grants: [], activities: [],
    diagnostics: { ignored_hook_invocations: 0, invalid_activation_attempts: 0, expired_tickets: 0 },
  };
}

async function brokerRequest<T>(repoRoot: string, path: string, request: { method: "GET" | "POST"; body?: unknown }): Promise<T> {
  let endpoint: BridgeEndpoint;
  try { endpoint = validateEndpoint(JSON.parse(await readFile(join(repoRoot, ENDPOINT_RELATIVE_PATH), "utf8"))); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new CompanionApiError(503, "bridge_unavailable", "Codex Bridge가 실행 중이지 않습니다.");
    throw new CompanionApiError(503, "invalid_bridge_endpoint", "Codex Bridge endpoint를 신뢰할 수 없습니다.");
  }
  let result: Response;
  try {
    result = await fetch(`${endpoint.url}${path}`, { method: request.method, headers: { authorization: `Bearer ${endpoint.token}`, ...(request.body === undefined ? {} : { "content-type": "application/json" }) }, body: request.body === undefined ? undefined : JSON.stringify(request.body), signal: AbortSignal.timeout(BROKER_TIMEOUT_MS) });
  } catch { throw new CompanionApiError(503, "bridge_unavailable", "Codex Bridge에 연결할 수 없습니다."); }
  const payload = await result.json().catch(() => null);
  if (!result.ok) {
    const brokerError = isRecord(payload) && isRecord(payload.error) ? payload.error : null;
    throw new CompanionApiError(result.status, brokerError && typeof brokerError.code === "string" ? brokerError.code : "bridge_request_failed", brokerError && typeof brokerError.message === "string" ? brokerError.message : "Codex Bridge 요청이 실패했습니다.");
  }
  return payload as T;
}

function validateEndpoint(value: unknown): BridgeEndpoint {
  if (!isRecord(value) || value.schema_version !== COMPANION_SESSION_CONTRACT_VERSION || typeof value.bridge_instance_id !== "string" || !value.bridge_instance_id.trim() || typeof value.token !== "string" || value.token.length < 32 || typeof value.url !== "string") throw new Error("invalid endpoint schema");
  const url = new URL(value.url);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) throw new Error("invalid endpoint URL");
  return { url: url.origin, token: value.token };
}

function parseQueueRequest(value: unknown): QueueRequest {
  if (!isRecord(value)) throw new CompanionApiError(400, "invalid_request", "요청 JSON 객체가 필요합니다.");
  const requirementId = requiredString(value.requirement_id, "requirement_id", 64);
  if (!REQ_ID_PATTERN.test(requirementId)) throw new CompanionApiError(400, "invalid_requirement_id", "requirement_id 형식이 올바르지 않습니다.");
  if (!Array.isArray(value.node_ids) || value.node_ids.length < 1 || value.node_ids.length > MAX_SELECTED_NODE_IDS) throw new CompanionApiError(400, "invalid_node_ids", "node_ids 범위가 올바르지 않습니다.");
  const nodeIds = value.node_ids.map((item, index) => requiredString(item, `node_ids[${index}]`, 1024));
  if (new Set(nodeIds).size !== nodeIds.length) throw new CompanionApiError(400, "duplicate_node_ids", "node_ids에 중복 값이 있습니다.");
  return {
    requirement_id: requirementId, node_ids: nodeIds, target_session_id: requiredString(value.target_session_id, "target_session_id", 256),
    user_intent: value.user_intent === null ? null : requiredString(value.user_intent, "user_intent", MAX_USER_INTENT_CHARS, true).trim() || null,
    expected_graph_etag: requiredString(value.expected_graph_etag, "expected_graph_etag", 256),
  };
}

function requiredString(value: unknown, field: string, max: number, empty = false): string {
  if (typeof value !== "string" || (!empty && !value.trim()) || value.length > max) throw new CompanionApiError(400, "invalid_request", `${field}가 올바르지 않습니다.`);
  return value.trim();
}
function emptyObject(value: unknown): void { if (!isRecord(value) || Object.keys(value).length) throw new CompanionApiError(400, "empty_object_required", "빈 JSON 객체만 허용합니다."); }
function decodeIdentifier(value: string, field: string): string {
  let decoded: string; try { decoded = decodeURIComponent(value); } catch { throw new CompanionApiError(400, `invalid_${field}`, `${field} 형식이 올바르지 않습니다.`); }
  if (!decoded || decoded.includes("/") || decoded.includes("\\")) throw new CompanionApiError(400, `invalid_${field}`, `${field} 형식이 올바르지 않습니다.`);
  return decoded;
}
function pathname(raw: string | undefined): string { try { return new URL(raw ?? "/", "http://127.0.0.1").pathname.replace(/\/$/, "") || "/"; } catch { throw new CompanionApiError(400, "invalid_path", "요청 경로를 해석할 수 없습니다."); } }
function assertJson(request: IncomingMessage): void { if (typeof request.headers["content-type"] !== "string" || !/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"])) throw new CompanionApiError(415, "json_content_type_required", "application/json 요청만 허용합니다."); }
function assertSameOrigin(request: IncomingMessage): void {
  const origin = request.headers.origin, host = request.headers.host;
  if (typeof origin !== "string" || typeof host !== "string") throw new CompanionApiError(403, "same_origin_required", "동일 Origin 요청만 허용합니다.");
  let parsed: URL; try { parsed = new URL(origin); } catch { throw new CompanionApiError(403, "same_origin_required", "동일 Origin 요청만 허용합니다."); }
  if (!LOCAL_HOSTS.has(parsed.hostname.toLowerCase()) || parsed.host.toLowerCase() !== host.toLowerCase() || (request.headers["sec-fetch-site"] && request.headers["sec-fetch-site"] !== "same-origin")) throw new CompanionApiError(403, "same_origin_required", "동일 Origin 요청만 허용합니다.");
}
function assertLocalHost(request: IncomingMessage): void {
  const host = request.headers.host; if (typeof host !== "string") throw new CompanionApiError(403, "local_workbench_host_required", "Local Workbench Host만 허용합니다.");
  let parsed: URL; try { parsed = new URL(`http://${host}`); } catch { throw new CompanionApiError(403, "local_workbench_host_required", "Local Workbench Host만 허용합니다."); }
  if (!LOCAL_HOSTS.has(parsed.hostname.toLowerCase()) || parsed.username || parsed.password || parsed.pathname !== "/") throw new CompanionApiError(403, "local_workbench_host_required", "Local Workbench Host만 허용합니다.");
}
function isLoopbackPeer(address: string | undefined): boolean { return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1"; }
async function workspaceId(root: string): Promise<string> { return workspaceIdFromPath(await realpath(root)); }
function workspaceIdFromPath(root: string): string { return `workspace_v1_${createHash("sha256").update(root).digest("hex").slice(0, 16)}`; }
async function assertArtifactContained(root: string, path: string): Promise<void> {
  const canonicalRoot = await realpath(root); const canonical = await realpath(path).catch((error) => (error as NodeJS.ErrnoException).code === "ENOENT" ? null : Promise.reject(error));
  if (canonical) { const fromRoot = relative(canonicalRoot, canonical); if (!(fromRoot === "" || (!fromRoot.startsWith(`..${sep}`) && fromRoot !== ".." && !isAbsolute(fromRoot)))) throw new CompanionApiError(403, "artifact_path_outside_workspace", "Artifact 경로가 등록된 Worktree 밖을 가리킵니다."); }
}
async function assertWorkItemExists(root: string, store: ArtifactRootStore, workId: string): Promise<void> {
  const path = store.resolveArtifactPath(workId, "af-work-item.json", "read");
  await assertArtifactContained(root, path);
  try {
    await store.readWorkItem(workId);
  } catch (error) {
    if (error instanceof ArtifactValidationError && error.statusCode === 404) {
      throw new CompanionApiError(404, "work_item_missing", "선택한 Work Item을 찾을 수 없습니다.");
    }
    throw error;
  }
}
async function readSourceRevision(root: string): Promise<{ head: string | null; dirtyHash: string | null }> {
  return readRepositorySourceRevision(root);
}
function handleError(error: unknown, response: ServerResponse, next: MiddlewareNext): void {
  if (error instanceof CompanionApiError || error instanceof CodexBridgeValidationError) { sendJson(response, error.statusCode, { error: error.message, code: error.code }); return; }
  if (error instanceof ArtifactValidationError) { sendJson(response, error.statusCode, { error: error.message, code: "artifact_error" }); return; }
  if (error instanceof ApplicationRegistryError) { sendJson(response, 500, { error: error.message, code: error.code }); return; }
  if (error instanceof VscodeWorkspaceLauncherError) { sendJson(response, error.statusCode, { error: error.message, code: error.code }); return; }
  if (error instanceof SyntaxError) { sendJson(response, 400, { error: "요청 JSON을 해석하지 못했습니다.", code: "invalid_json" }); return; }
  if (error instanceof Error) { console.error("[codex-companion] 실패:", error); sendJson(response, 500, { error: "CLI Companion 요청 처리에 실패했습니다.", code: "internal_error" }); return; }
  next(error);
}
