import type { IncomingMessage, ServerResponse } from "node:http";
import { AppWorkspaceError, type ActiveAppWorkspaceController } from "@agent-factory/companion-graph-control-server";
import { VscodeLaunchError, VscodeProjectLauncher, type VscodeLauncher } from "./vscode-launcher.js";

export const VSCODE_LAUNCH_PATH = "/api/companion/editor/launch-vscode";
const BODY_LIMIT = 4 * 1_024;

export function createCompanionWebRequestHandler(input: { projectRoot?: string; getProjectRoot?: () => string; vscodeLauncher?: VscodeLauncher; appController?: ActiveAppWorkspaceController }) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? "/", "http://companion.local");
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
    throw new WebRouteError(403, "same_origin_required", "VS Code 실행은 Companion 화면의 same-origin 요청만 허용합니다.");
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

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.length;
    if (size > BODY_LIMIT) throw new WebRouteError(413, "payload_too_large", "VS Code 실행 요청이 너무 큽니다.");
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new WebRouteError(422, "invalid_json", "JSON body를 읽을 수 없습니다."); }
}

function object(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new WebRouteError(422, "invalid_request", "JSON object가 필요합니다."); return value as Record<string, unknown>; }
function text(value: unknown, field: string): string { if (typeof value !== "string") throw new WebRouteError(422, "invalid_request", `${field} 문자열이 필요합니다.`); return value; }
function integer(value: unknown, field: string): number { if (!Number.isInteger(value) || Number(value) < 1) throw new WebRouteError(422, "invalid_request", `${field} 양의 정수가 필요합니다.`); return Number(value); }

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(body));
}

class WebRouteError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); }
}
