import { createReadStream } from "node:fs";
import { randomBytes } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, isAbsolute, normalize, relative, resolve, sep } from "node:path";
import type { ApplyGraphOperationsResponse, GraphWorkspaceSnapshot } from "@agent-factory/companion-contracts";
import { GraphOperationError, GraphValidationError, type GraphEditOperation, type GraphPresentation, type GraphSelection } from "@agent-factory/companion-graph-domain";
import { writeAtomicJson } from "./atomic-files.js";
import { AppWorkspaceError } from "./app-workspaces.js";
import { GraphStaleError, InvalidExternalSourceError, type WorkspaceEvent } from "./workspace.js";

export const CONTROL_API_ROOT = "/api/companion/v2";
export const DEFAULT_CAPABILITY_PATH = ".agent-factory/companion-capability.json";
const BODY_LIMIT = 1024 * 1024;

export interface GraphControlServer {
  listen(port: number, host?: string): Promise<{ origin: string; port: number }>;
  close(): Promise<void>;
}

export type AdditionalRequestHandler = (request: IncomingMessage, response: ServerResponse) => boolean | Promise<boolean>;

export interface ControlCapability { origin: string; token: string }

export interface GraphWorkspaceController {
  readonly projectRoot: string;
  initialize(): Promise<void>;
  close(): Promise<void>;
  subscribe(listener: (event: WorkspaceEvent) => void): () => void;
  snapshot(): Promise<GraphWorkspaceSnapshot>;
  updateSelection(selection: GraphSelection | null): Promise<GraphWorkspaceSnapshot>;
  updateDraft(baseRevision: string, operations: GraphEditOperation[]): Promise<GraphWorkspaceSnapshot>;
  apply(baseRevision: string, operations: GraphEditOperation[], source: "web" | "mcp"): Promise<ApplyGraphOperationsResponse>;
  updatePresentation(presentation: GraphPresentation): Promise<GraphWorkspaceSnapshot>;
  setControlCapability?(capability: ControlCapability): Promise<void>;
}

export function createGraphControlServer(input: { workspace: GraphWorkspaceController; staticRoot?: string; capabilityPath?: string; additionalRequestHandler?: AdditionalRequestHandler }): GraphControlServer {
  const token = randomBytes(32).toString("hex"); const clients = new Set<ServerResponse>();
  const unsubscribe = input.workspace.subscribe((event) => broadcast(clients, event));
  const server = createServer((request, response) => void route(request, response, input.workspace, token, clients, input.staticRoot, input.additionalRequestHandler).catch((error) => writeError(response, error)));
  return {
    async listen(port, host = "127.0.0.1") {
      if (!isLoopbackHost(host)) throw new Error("Graph Control Server must bind to loopback");
      await input.workspace.initialize();
      await new Promise<void>((resolvePromise, reject) => { server.once("error", reject); server.listen(port, host, () => { server.off("error", reject); resolvePromise(); }); });
      const address = server.address() as AddressInfo; const origin = `http://${host}:${address.port}`;
      if (input.workspace.setControlCapability) await input.workspace.setControlCapability({ origin, token });
      else await writeAtomicJson(input.workspace.projectRoot, input.capabilityPath ?? DEFAULT_CAPABILITY_PATH, { schema_version: 1, status: "active", origin, token }, 0o600);
      return { origin, port: address.port };
    },
    async close() {
      unsubscribe(); for (const client of clients) client.end(); clients.clear(); await input.workspace.close();
      if (!server.listening) return;
      await new Promise<void>((resolvePromise, reject) => server.close((error) => error ? reject(error) : resolvePromise()));
    },
  };
}

async function route(request: IncomingMessage, response: ServerResponse, workspace: GraphWorkspaceController, token: string, clients: Set<ServerResponse>, staticRoot?: string, additionalRequestHandler?: AdditionalRequestHandler): Promise<void> {
  const url = new URL(request.url ?? "/", "http://companion.local");
  if (request.method === "GET" && url.pathname === `${CONTROL_API_ROOT}/workspace`) { writeJson(response, 200, await workspace.snapshot()); return; }
  if (request.method === "GET" && url.pathname === `${CONTROL_API_ROOT}/events`) {
    response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive", "X-Accel-Buffering": "no" }); response.write(": companion events\n\n"); clients.add(response); request.once("close", () => clients.delete(response)); return;
  }
  if (request.method === "GET" && url.pathname === `${CONTROL_API_ROOT}/health`) { writeJson(response, 200, { status: "ok" }); return; }
  if (request.method === "PUT" && url.pathname === `${CONTROL_API_ROOT}/selection`) { authorizeMcp(request, token); const body = record(await readJson(request)); writeJson(response, 200, await workspace.updateSelection((body.selection ?? null) as never)); return; }
  if (request.method === "PUT" && url.pathname === `${CONTROL_API_ROOT}/draft`) { authorizeMcp(request, token); const body = record(await readJson(request)); writeJson(response, 200, await workspace.updateDraft(string(body.base_graph_revision, "base_graph_revision"), operations(body.operations))); return; }
  if (request.method === "POST" && url.pathname === `${CONTROL_API_ROOT}/graph/operations`) { authorizeMcp(request, token); const body = record(await readJson(request)); const source = request.headers["x-companion-client"] === "mcp" ? "mcp" : "web"; writeJson(response, 200, await workspace.apply(string(body.base_graph_revision, "base_graph_revision"), operations(body.operations), source)); return; }
  if (request.method === "PUT" && url.pathname === `${CONTROL_API_ROOT}/presentation`) { authorizeMcp(request, token); const body = record(await readJson(request)); writeJson(response, 200, await workspace.updatePresentation(body.presentation as never)); return; }
  if (additionalRequestHandler && await additionalRequestHandler(request, response)) return;
  if ((request.method === "GET" || request.method === "HEAD") && staticRoot && await serveStatic(response, url.pathname, staticRoot, request.method === "HEAD")) return;
  writeJson(response, 404, { error: "not_found", message: "요청한 경로를 찾을 수 없습니다." });
}

function authorizeMcp(request: IncomingMessage, token: string): void { if (request.headers["x-companion-client"] === "mcp" && request.headers["x-companion-capability"] !== token) throw new HttpError(403, "capability_denied", "MCP capability가 유효하지 않습니다."); }
function operations(value: unknown): GraphEditOperation[] { if (!Array.isArray(value)) throw new HttpError(422, "invalid_operations", "operations 배열이 필요합니다."); return value as GraphEditOperation[]; }
function string(value: unknown, field: string): string { if (typeof value !== "string") throw new HttpError(422, "invalid_request", `${field} 문자열이 필요합니다.`); return value; }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(422, "invalid_request", "JSON object가 필요합니다."); return value as Record<string, unknown>; }

async function readJson(request: IncomingMessage): Promise<unknown> { const chunks: Buffer[] = []; let total = 0; for await (const chunk of request) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); total += value.length; if (total > BODY_LIMIT) throw new HttpError(413, "payload_too_large", "요청 본문이 너무 큽니다."); chunks.push(value); } try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new HttpError(422, "invalid_json", "JSON body를 읽을 수 없습니다."); } }
function broadcast(clients: Set<ServerResponse>, event: WorkspaceEvent): void { const bytes = `event: workspace\ndata: ${JSON.stringify(event)}\n\n`; for (const client of clients) client.write(bytes); }

async function serveStatic(response: ServerResponse, pathname: string, staticRoot: string, head: boolean): Promise<boolean> {
  let root: string; try { root = await realpath(resolve(staticRoot)); if (!(await stat(root)).isDirectory()) return false; } catch { return false; }
  const requested = pathname === "/" ? "index.html" : normalize(pathname).replace(/^[/\\]+/u, ""); let candidate = resolve(root, requested);
  if (!contained(root, candidate)) return false;
  let info = await stat(candidate).catch(() => null); if (!info && !extname(requested)) { candidate = resolve(root, "index.html"); info = await stat(candidate).catch(() => null); }
  if (!info?.isFile()) return false; const canonical = await realpath(candidate); if (!contained(root, canonical)) return false;
  response.statusCode = 200; response.setHeader("Content-Type", contentType(canonical)); response.setHeader("Cache-Control", canonical.endsWith("index.html") ? "no-store" : "public, max-age=31536000, immutable"); if (head) response.end(); else createReadStream(canonical).pipe(response); return true;
}
function contained(root: string, path: string): boolean { const rel = relative(root, path); return rel === "" || (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`)); }
function contentType(path: string): string { return path.endsWith(".html") ? "text/html; charset=utf-8" : path.endsWith(".js") ? "text/javascript; charset=utf-8" : path.endsWith(".css") ? "text/css; charset=utf-8" : "application/octet-stream"; }
function isLoopbackHost(host: string): boolean { return host === "127.0.0.1" || host === "localhost" || host === "::1"; }
function writeJson(response: ServerResponse, status: number, body: unknown): void { if (response.headersSent) return; response.statusCode = status; response.setHeader("Content-Type", "application/json; charset=utf-8"); response.setHeader("Cache-Control", "no-store"); response.end(JSON.stringify(body)); }
function writeError(response: ServerResponse, error: unknown): void {
  if (error instanceof GraphStaleError) { writeJson(response, 412, { error: "graph_stale", message: "Graph가 변경되었습니다. 최신 Graph를 다시 읽으세요.", current_graph_revision: error.currentRevision }); return; }
  if (error instanceof InvalidExternalSourceError) { writeJson(response, 409, { error: "invalid_external_source", message: error.message, source_health: error.health }); return; }
  if (error instanceof GraphValidationError) { writeJson(response, 422, { error: "graph_contract_violation", message: error.message, issues: error.issues }); return; }
  if (error instanceof GraphOperationError) { writeJson(response, 422, { error: error.code, message: error.message, path: error.path }); return; }
  if (error instanceof AppWorkspaceError) { writeJson(response, error.status, { error: error.code, message: error.message, ...error.details }); return; }
  if (error instanceof HttpError) { writeJson(response, error.status, { error: error.code, message: error.message }); return; }
  writeJson(response, 500, { error: "internal_error", message: error instanceof Error ? error.message : "요청 처리에 실패했습니다." });
}
class HttpError extends Error { constructor(readonly status: number, readonly code: string, message: string) { super(message); } }
