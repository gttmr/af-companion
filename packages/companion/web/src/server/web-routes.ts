import type { IncomingMessage, ServerResponse } from "node:http";
import { AppWorkspaceError, type ActiveAppWorkspaceController } from "@agent-factory/companion-graph-control-server";
import type {
  CompanionAssetType,
  CompanionRegistryDecision,
  CompanionRegistryPublishDecision,
  CompanionRegistryStatus,
} from "@agent-factory/companion-contracts";
import type { CompanionAssetRegistry } from "./asset-catalog.js";
import { VscodeLaunchError, VscodeProjectLauncher, type VscodeLauncher } from "./vscode-launcher.js";

export const VSCODE_LAUNCH_PATH = "/api/companion/editor/launch-vscode";
const BODY_LIMIT = 4 * 1_024;
const REGISTRY_BODY_LIMIT = 1_024 * 1_024;
const REGISTRY_PREFIX = "/api/companion/registry";

export function createCompanionWebRequestHandler(input: { projectRoot?: string; getProjectRoot?: () => string; vscodeLauncher?: VscodeLauncher; appController?: ActiveAppWorkspaceController; assetRegistry?: CompanionAssetRegistry }) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? "/", "http://companion.local");
    if (url.pathname === REGISTRY_PREFIX || url.pathname.startsWith(`${REGISTRY_PREFIX}/`)) {
      if (!input.assetRegistry) writeJson(response, 503, { error: "registry_unavailable", message: "Asset Registry 관리 surface를 사용할 수 없습니다." });
      else await handleRegistryRoute(request, response, url, input.assetRegistry);
      return true;
    }
    if (input.appController && url.pathname.startsWith("/api/companion/")) {
      const handled = await handleAppRoute(request, response, url, input.appController);
      if (handled) return true;
    }
    if (url.pathname !== VSCODE_LAUNCH_PATH) return false;
    try {
      if (request.method !== "POST") throw new WebRouteError(405, "method_not_allowed", "POST 요청만 허용됩니다.");
      enforceBrowserOrigin(request);
      await readEmptyJsonObject(request);
      const launcher = input.vscodeLauncher ?? new VscodeProjectLauncher(input.getProjectRoot?.() ?? input.projectRoot ?? "");
      writeJson(response, 202, await launcher.launch());
    } catch (error) {
      if (error instanceof VscodeLaunchError || error instanceof WebRouteError || error instanceof AppWorkspaceError) {
        writeJson(response, error.status, { error: error.code, message: error.message });
      } else {
        writeJson(response, 500, { error: "internal_error", message: "VS Code 실행 요청을 처리하지 못했습니다." });
      }
    }
    return true;
  };
}

async function handleRegistryRoute(request: IncomingMessage, response: ServerResponse, url: URL, registry: CompanionAssetRegistry): Promise<void> {
  try {
    if (request.method === "GET" && url.pathname === `${REGISTRY_PREFIX}/assets`) {
      assertQueryKeys(url.searchParams, ["asset_type", "statuses", "all_versions", "limit"]);
      const assetType = optionalEnum(url.searchParams.get("asset_type"), ["agent", "workflow", "tool"] as const, "asset_type");
      const statuses = optionalList(url.searchParams.get("statuses"), ["draft", "reviewed", "published", "deprecated"] as const, "statuses");
      const allVersions = optionalBoolean(url.searchParams.get("all_versions"), "all_versions");
      const limit = optionalPositiveInteger(url.searchParams.get("limit"), "limit");
      writeJson(response, 200, registry.listRegistry({
        ...(assetType ? { asset_type: assetType as CompanionAssetType } : {}),
        ...(statuses ? { statuses: statuses as CompanionRegistryStatus[] } : {}),
        ...(allVersions === undefined ? {} : { all_versions: allVersions }),
        ...(limit === undefined ? {} : { limit }),
      }));
      return;
    }

    assertQueryKeys(url.searchParams, []);

    const detail = matchRegistryAsset(url.pathname, "assets", null);
    if (request.method === "GET" && detail) {
      writeJson(response, 200, registry.getRegistryAsset(detail.assetId, detail.version));
      return;
    }

    if (request.method === "POST" && url.pathname === `${REGISTRY_PREFIX}/validate`) {
      enforceBrowserOrigin(request);
      const body = exactObject(await readJson(request, REGISTRY_BODY_LIMIT), ["contract"]);
      writeJson(response, 200, registry.validateRegistryContract(body.contract));
      return;
    }

    if (request.method === "POST" && url.pathname === `${REGISTRY_PREFIX}/drafts`) {
      enforceBrowserOrigin(request);
      const body = exactObject(await readJson(request, REGISTRY_BODY_LIMIT), ["contract", "created_by"]);
      writeJson(response, 201, registry.createRegistryDraft(body.contract, text(body.created_by, "created_by"), expectedRevision(request)));
      return;
    }

    const draft = matchRegistryAsset(url.pathname, "drafts", null);
    if (request.method === "PUT" && draft) {
      enforceBrowserOrigin(request);
      const body = exactObject(await readJson(request, REGISTRY_BODY_LIMIT), ["contract"]);
      writeJson(response, 200, registry.updateRegistryDraft(draft.assetId, draft.version, body.contract, expectedRevision(request)));
      return;
    }

    const review = matchRegistryAsset(url.pathname, "drafts", "review");
    if (request.method === "POST" && review) {
      enforceBrowserOrigin(request);
      const body = exactObject(await readJson(request, REGISTRY_BODY_LIMIT), ["decision"]);
      writeJson(response, 200, registry.reviewRegistryDraft(review.assetId, review.version, registryDecision(body.decision), expectedRevision(request)));
      return;
    }

    const publish = matchRegistryAsset(url.pathname, "assets", "publish");
    if (request.method === "POST" && publish) {
      enforceBrowserOrigin(request);
      const body = exactObject(await readJson(request, REGISTRY_BODY_LIMIT), ["decision"]);
      writeJson(response, 200, registry.publishRegistryAsset(publish.assetId, publish.version, publishDecision(body.decision), expectedRevision(request)));
      return;
    }

    const deprecate = matchRegistryAsset(url.pathname, "assets", "deprecate");
    if (request.method === "POST" && deprecate) {
      enforceBrowserOrigin(request);
      const body = exactObject(await readJson(request, REGISTRY_BODY_LIMIT), ["decision"]);
      writeJson(response, 200, registry.deprecateRegistryAsset(deprecate.assetId, deprecate.version, registryDecision(body.decision), expectedRevision(request)));
      return;
    }

    throw new WebRouteError(405, "method_not_allowed", "이 Asset Registry API에서 요청 method 또는 path를 지원하지 않습니다.");
  } catch (error) {
    writeRouteError(response, error, "Asset Registry 요청을 처리하지 못했습니다.");
  }
}

async function handleAppRoute(request: IncomingMessage, response: ServerResponse, url: URL, controller: ActiveAppWorkspaceController): Promise<boolean> {
  const appAssetPrefix = "/api/companion/app-assets/";
  const known = ["/api/companion/apps", "/api/companion/apps/active", "/api/companion/assets", "/api/companion/app-assets"];
  if (!known.includes(url.pathname) && !url.pathname.startsWith(appAssetPrefix)) return false;
  try {
    if (request.method === "GET" && url.pathname === "/api/companion/apps") writeJson(response, 200, await controller.listApps());
    else if (request.method === "POST" && url.pathname === "/api/companion/apps") {
      enforceBrowserOrigin(request); const body = object(await readJson(request));
      writeJson(response, 201, await controller.createApp(text(body.application_id, "application_id"), text(body.display_name, "display_name")));
    } else if (request.method === "PUT" && url.pathname === "/api/companion/apps/active") {
      enforceBrowserOrigin(request); const body = object(await readJson(request));
      writeJson(response, 200, await controller.activateApp(text(body.application_id, "application_id")));
    } else if (request.method === "GET" && url.pathname === "/api/companion/assets") {
      const assetType = url.searchParams.get("asset_type");
      if (assetType && !["agent", "workflow", "tool"].includes(assetType)) throw new WebRouteError(422, "invalid_asset_type", "Asset type은 Agent, Workflow, Tool 중 하나여야 합니다.");
      writeJson(response, 200, controller.searchAssets(url.searchParams.get("q") ?? undefined, assetType as "agent" | "workflow" | "tool" | undefined));
    } else if (request.method === "GET" && url.pathname === "/api/companion/app-assets") writeJson(response, 200, controller.appAssets());
    else if (request.method === "POST" && url.pathname === "/api/companion/app-assets") {
      enforceBrowserOrigin(request); const body = object(await readJson(request));
      writeJson(response, 201, await controller.bindAsset({ asset_id: text(body.asset_id, "asset_id"), version: integer(body.version, "version"), registry_revision: text(body.registry_revision, "registry_revision"), base_assets_revision: text(body.base_assets_revision, "base_assets_revision") }));
    } else if (request.method === "DELETE" && url.pathname.startsWith(appAssetPrefix)) {
      enforceBrowserOrigin(request); const body = object(await readJson(request));
      writeJson(response, 200, await controller.unbindAsset(decodeURIComponent(url.pathname.slice(appAssetPrefix.length)), text(body.base_assets_revision, "base_assets_revision")));
    } else throw new WebRouteError(405, "method_not_allowed", "이 API에서 요청 method를 지원하지 않습니다.");
  } catch (error) {
    if (error instanceof AppWorkspaceError || error instanceof WebRouteError || (error instanceof Error && "status" in error && "code" in error)) {
      const typed = error as Error & { status: number; code: string };
      writeJson(response, typed.status, { error: typed.code, message: typed.message });
    } else writeJson(response, 500, { error: "internal_error", message: error instanceof Error ? error.message : "App 요청을 처리하지 못했습니다." });
  }
  return true;
}

function enforceBrowserOrigin(request: IncomingMessage): void {
  const site = request.headers["sec-fetch-site"];
  if (site && site !== "same-origin" && site !== "same-site") {
    throw new WebRouteError(403, "same_origin_required", "Companion 변경 요청은 same-origin 화면에서만 허용합니다.");
  }
  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    throw new WebRouteError(415, "json_required", "application/json 요청이 필요합니다.");
  }
}

async function readEmptyJsonObject(request: IncomingMessage): Promise<void> {
  const value = await readJson(request);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 0) {
    throw new WebRouteError(422, "invalid_request", "VS Code 실행 요청에는 추가 입력을 지정할 수 없습니다.");
  }
}

async function readJson(request: IncomingMessage, limit = BODY_LIMIT): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > limit) throw new WebRouteError(413, "payload_too_large", "JSON 요청이 허용 크기를 초과했습니다.");
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new WebRouteError(422, "invalid_json", "JSON body를 읽을 수 없습니다."); }
}

function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new WebRouteError(422, "invalid_request", "JSON object가 필요합니다."); return value as Record<string, unknown>; }
function exactObject(value: unknown, allowed: string[]): Record<string, unknown> { const record = object(value); const keys = Object.keys(record); const unknown = keys.filter((key) => !allowed.includes(key)); const missing = allowed.filter((key) => !(key in record)); if (unknown.length || missing.length) throw new WebRouteError(422, "invalid_request", `JSON field가 일치하지 않습니다.${unknown.length ? ` unknown: ${unknown.join(", ")}` : ""}${missing.length ? ` missing: ${missing.join(", ")}` : ""}`); return record; }
function text(value: unknown, field: string): string { if (typeof value !== "string") throw new WebRouteError(422, "invalid_request", `${field} 문자열이 필요합니다.`); return value; }
function integer(value: unknown, field: string): number { if (!Number.isInteger(value) || Number(value) < 1) throw new WebRouteError(422, "invalid_request", `${field} 양의 정수가 필요합니다.`); return Number(value); }

function expectedRevision(request: IncomingMessage): string {
  const value = request.headers["if-match"];
  if (typeof value !== "string" || !value.trim()) throw new WebRouteError(428, "registry_revision_required", "현재 Registry revision을 If-Match로 보내야 합니다.");
  return value.trim();
}

function matchRegistryAsset(pathname: string, collection: "assets" | "drafts", action: "review" | "publish" | "deprecate" | null): { assetId: string; version: number } | null {
  const suffix = action ? `/${action}` : "";
  const match = pathname.match(new RegExp(`^${REGISTRY_PREFIX}/${collection}/([^/]+)/versions/([1-9][0-9]*)${suffix}$`, "u"));
  return match?.[1] && match[2] ? { assetId: decodePathSegment(match[1]), version: Number(match[2]) } : null;
}

function decodePathSegment(value: string): string {
  try { return decodeURIComponent(value); }
  catch { throw new WebRouteError(400, "invalid_asset_ref", "Asset ID path encoding이 유효하지 않습니다."); }
}

function registryDecision(value: unknown): CompanionRegistryDecision {
  const decision = exactObject(value, ["decision_id", "selected_by", "rationale"]);
  if (decision.selected_by !== "user") throw new WebRouteError(422, "invalid_decision", "selected_by는 user여야 합니다.");
  return { decision_id: text(decision.decision_id, "decision_id"), selected_by: "user", rationale: text(decision.rationale, "rationale") };
}

function publishDecision(value: unknown): CompanionRegistryPublishDecision {
  const decision = exactObject(value, ["decision_id", "selected_by", "rationale", "owner_confirmed", "domain_confirmed", "reuse_confirmed"]);
  if (decision.selected_by !== "user" || decision.owner_confirmed !== true || decision.domain_confirmed !== true || decision.reuse_confirmed !== true) throw new WebRouteError(422, "invalid_publish_decision", "Publish에는 user Decision과 Owner, Domain, Reuse 확인이 모두 필요합니다.");
  return { decision_id: text(decision.decision_id, "decision_id"), selected_by: "user", rationale: text(decision.rationale, "rationale"), owner_confirmed: true, domain_confirmed: true, reuse_confirmed: true };
}

function optionalEnum<T extends string>(value: string | null, allowed: readonly T[], field: string): T | undefined { if (value === null || value === "") return undefined; if (!allowed.includes(value as T)) throw new WebRouteError(422, `invalid_${field}`, `${field} 값이 유효하지 않습니다.`); return value as T; }
function optionalList<T extends string>(value: string | null, allowed: readonly T[], field: string): T[] | undefined { if (value === null || value === "") return undefined; const values = value.split(","); if (!values.length || values.some((entry) => !allowed.includes(entry as T)) || new Set(values).size !== values.length) throw new WebRouteError(422, `invalid_${field}`, `${field} 목록이 유효하지 않습니다.`); return values as T[]; }
function optionalBoolean(value: string | null, field: string): boolean | undefined { if (value === null || value === "") return undefined; if (!['true', 'false'].includes(value)) throw new WebRouteError(422, `invalid_${field}`, `${field} 값은 true 또는 false여야 합니다.`); return value === "true"; }
function optionalPositiveInteger(value: string | null, field: string): number | undefined { if (value === null || value === "") return undefined; const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < 1) throw new WebRouteError(422, `invalid_${field}`, `${field} 값은 양의 정수여야 합니다.`); return parsed; }

function assertQueryKeys(searchParams: URLSearchParams, allowed: readonly string[]): void {
  const keys = [...new Set(searchParams.keys())];
  const unknown = keys.filter((key) => !allowed.includes(key));
  const repeated = keys.filter((key) => searchParams.getAll(key).length !== 1);
  if (unknown.length || repeated.length) {
    throw new WebRouteError(422, "invalid_query", `Query field가 유효하지 않습니다.${unknown.length ? ` unknown: ${unknown.join(", ")}` : ""}${repeated.length ? ` repeated: ${repeated.join(", ")}` : ""}`);
  }
}

function writeRouteError(response: ServerResponse, error: unknown, fallback: string): void {
  if (error instanceof WebRouteError || error instanceof AppWorkspaceError || (error instanceof Error && "status" in error && "code" in error)) {
    const typed = error as Error & { status: number; code: string; details?: unknown };
    writeJson(response, typed.status, { error: typed.code, message: typed.message, ...(typed.details === undefined ? {} : { details: typed.details }) });
  } else writeJson(response, 500, { error: "internal_error", message: error instanceof Error ? error.message : fallback });
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

class WebRouteError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
