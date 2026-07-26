import { randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, mkdir, open, readFile, realpath, rm, type FileHandle } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { isAbsolute, join, relative, sep } from "node:path";

import { COMPANION_SESSION_CONTRACT_VERSION } from "../src/companion/sessionContract.ts";
import {
  CodexBridgeStore,
  CODEX_BRIDGE_STATE_RELATIVE_DIR,
  CodexBridgeValidationError,
  MAX_HANDOFF_REQUEST_BODY_BYTES,
  type CodexBridgeEndpoint,
  type CodexBridgeStoreOptions,
  validateAttachHandoffInput,
  validateAttachSessionInput,
  validateCancelHandoffInput,
  validateCodexHookInput,
  validateContinueHandoffInput,
  validateCreateDeliveryInput,
  validateCreateEnrollmentInput,
  validateCreatePlanHandoffInput,
  validateResetStateInput,
  validateRevokeSessionInput,
  validateSessionAliasInput,
} from "./codexBridgeStore.ts";

export const CODEX_BRIDGE_HOST = "127.0.0.1";
export const DEFAULT_CODEX_BRIDGE_PORT = 8898;
export const MAX_CODEX_BRIDGE_BODY_BYTES = MAX_HANDOFF_REQUEST_BODY_BYTES;
const CODEX_BRIDGE_LOCK_FILE = "broker.lock";

export interface StartCodexBridgeServerOptions extends CodexBridgeStoreOptions {
  repoRoot: string;
  port?: number;
}

export interface RunningCodexBridgeServer {
  server: Server;
  store: CodexBridgeStore;
  endpoint: CodexBridgeEndpoint;
  close: () => Promise<void>;
}

interface BridgeLock {
  handle: FileHandle;
  nonce: string;
  path: string;
}

class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function json(response: ServerResponse, statusCode: number, body: unknown): void {
  const serialized = JSON.stringify(body);
  response.statusCode = statusCode;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("content-length", Buffer.byteLength(serialized));
  response.end(serialized);
}

function empty(response: ServerResponse, statusCode = 204): void {
  response.statusCode = statusCode;
  response.end();
}

function isLoopbackPeer(address: string | undefined): boolean {
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function hasBearerToken(request: IncomingMessage, token: string): boolean {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(authorization.slice("Bearer ".length), "utf8");
  const expected = Buffer.from(token, "utf8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function isJsonContentType(request: IncomingMessage): boolean {
  const contentType = request.headers["content-type"];
  return typeof contentType === "string" && /^application\/json(?:\s*;|$)/i.test(contentType);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  if (!isJsonContentType(request)) {
    throw new HttpError(415, "json_content_type_required", "POST requests require application/json");
  }
  const contentLength = request.headers["content-length"];
  if (contentLength !== undefined) {
    const parsedLength = Number(contentLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new HttpError(400, "invalid_content_length", "Invalid Content-Length header");
    }
    if (parsedLength > MAX_CODEX_BRIDGE_BODY_BYTES) {
      throw new HttpError(413, "body_too_large", `Request body exceeds ${MAX_CODEX_BRIDGE_BODY_BYTES / 1_024} KiB`);
    }
  }

  const chunks: Buffer[] = [];
  let bytes = 0;
  let tooLarge = false;
  for await (const rawChunk of request) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
    bytes += chunk.byteLength;
    if (bytes > MAX_CODEX_BRIDGE_BODY_BYTES) {
      tooLarge = true;
    } else if (!tooLarge) {
      chunks.push(chunk);
    }
  }
  if (tooLarge) throw new HttpError(413, "body_too_large", `Request body exceeds ${MAX_CODEX_BRIDGE_BODY_BYTES / 1_024} KiB`);
  if (bytes === 0) throw new HttpError(400, "empty_body", "Request body must contain one JSON object");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must contain valid JSON");
  }
}

function normalizePort(port: number | undefined): number {
  const value = port ?? DEFAULT_CODEX_BRIDGE_PORT;
  if (!Number.isSafeInteger(value) || value < 0 || value > 65_535) {
    throw new Error("Codex Bridge port must be an integer from 0 to 65535");
  }
  return value;
}

async function route(
  request: IncomingMessage,
  response: ServerResponse,
  store: CodexBridgeStore,
  endpoint: CodexBridgeEndpoint,
): Promise<void> {
  if (!isLoopbackPeer(request.socket.remoteAddress)) {
    throw new HttpError(403, "loopback_required", "Codex Bridge accepts loopback peers only");
  }
  if (!hasBearerToken(request, endpoint.token)) {
    response.setHeader("www-authenticate", "Bearer");
    throw new HttpError(401, "unauthorized", "A valid bearer token is required");
  }

  const url = new URL(request.url ?? "/", endpoint.url);
  const postBody = request.method === "POST" ? await readJsonBody(request) : undefined;
  if (request.method === "GET" && url.pathname === "/v1/health") {
    json(response, 200, {
      ok: true,
      schema_version: COMPANION_SESSION_CONTRACT_VERSION,
      bridge_instance_id: endpoint.bridge_instance_id,
      pid: endpoint.pid,
      started_at: endpoint.started_at,
    });
    return;
  }
  if (request.method === "GET" && url.pathname === "/v1/snapshot") {
    json(response, 200, await store.snapshot());
    return;
  }
  if (request.method === "POST" && url.pathname === "/v1/hooks") {
    const hookOutput = await store.handleHook(validateCodexHookInput(postBody));
    if (hookOutput === null) empty(response);
    else json(response, 200, hookOutput);
    return;
  }
  if (request.method === "POST" && url.pathname === "/v1/enrollments") {
    json(response, 201, await store.createEnrollment(validateCreateEnrollmentInput(postBody)));
    return;
  }
  if (request.method === "POST" && url.pathname === "/v1/deliveries") {
    json(response, 201, await store.createDelivery(validateCreateDeliveryInput(postBody)));
    return;
  }
  if (request.method === "POST" && url.pathname === "/v1/handoffs") {
    json(response, 201, await store.createPlanHandoff(validateCreatePlanHandoffInput(postBody)));
    return;
  }
  if (request.method === "POST" && url.pathname === "/v1/sessions/attach") {
    json(response, 200, await store.attachSession(validateAttachSessionInput(postBody)));
    return;
  }
  const continueMatch = request.method === "POST"
    ? /^\/v1\/handoffs\/([^/]+)\/continue$/.exec(url.pathname)
    : null;
  if (continueMatch) {
    const handoffId = decodePathIdentifier(continueMatch[1], "handoff_id");
    json(response, 200, await store.continueHandoff(handoffId, validateContinueHandoffInput(postBody)));
    return;
  }
  const attachHandoffMatch = request.method === "POST"
    ? /^\/v1\/handoffs\/([^/]+)\/attach$/.exec(url.pathname)
    : null;
  if (attachHandoffMatch) {
    const handoffId = decodePathIdentifier(attachHandoffMatch[1], "handoff_id");
    json(response, 200, await store.attachHandoff(handoffId, validateAttachHandoffInput(postBody)));
    return;
  }
  const cancelHandoffMatch = request.method === "POST"
    ? /^\/v1\/handoffs\/([^/]+)\/cancel$/.exec(url.pathname)
    : null;
  if (cancelHandoffMatch) {
    const handoffId = decodePathIdentifier(cancelHandoffMatch[1], "handoff_id");
    json(response, 200, await store.cancelHandoff(handoffId, validateCancelHandoffInput(postBody)));
    return;
  }
  const revokeMatch = request.method === "POST" ? /^\/v1\/sessions\/([^/]+)\/revoke$/.exec(url.pathname) : null;
  if (revokeMatch) {
    const sessionId = decodePathIdentifier(revokeMatch[1], "session_id");
    json(response, 200, await store.revokeSession(sessionId, validateRevokeSessionInput(postBody)));
    return;
  }
  const preferencesMatch = request.method === "POST" ? /^\/v1\/sessions\/([^/]+)\/preferences$/.exec(url.pathname) : null;
  if (preferencesMatch) {
    const sessionId = decodePathIdentifier(preferencesMatch[1], "session_id");
    json(response, 200, await store.updateSessionAlias(sessionId, validateSessionAliasInput(postBody)));
    return;
  }
  const cancelMatch = request.method === "POST" ? /^\/v1\/deliveries\/([^/]+)\/cancel$/.exec(url.pathname) : null;
  if (cancelMatch) {
    const deliveryId = decodePathIdentifier(cancelMatch[1], "delivery_id");
    json(response, 200, await store.cancelDelivery(deliveryId));
    return;
  }
  if (request.method === "POST" && url.pathname === "/v1/state/reset") {
    await store.resetState(validateResetStateInput(postBody));
    empty(response);
    return;
  }
  throw new HttpError(404, "not_found", "Route not found");
}

function decodePathIdentifier(value: string, field: "delivery_id" | "session_id" | "handoff_id"): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new HttpError(400, `invalid_${field}`, `Invalid ${field} encoding`);
  }
  if (!decoded || decoded.includes("/") || decoded.includes("\\")) {
    throw new HttpError(400, `invalid_${field}`, `Invalid ${field}`);
  }
  return decoded;
}

function errorResponse(response: ServerResponse, error: unknown): void {
  if (response.headersSent) {
    response.end();
    return;
  }
  if (error instanceof CodexBridgeValidationError) {
    json(response, error.statusCode, { error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof HttpError) {
    json(response, error.statusCode, { error: { code: error.code, message: error.message } });
    return;
  }
  json(response, 500, { error: { code: "internal_error", message: "Internal Codex Bridge error" } });
}

export async function startCodexBridgeServer(options: StartCodexBridgeServerOptions): Promise<RunningCodexBridgeServer> {
  const canonicalRoot = await realpath(options.repoRoot);
  const stateDir = join(canonicalRoot, CODEX_BRIDGE_STATE_RELATIVE_DIR);
  await mkdir(stateDir, { recursive: true, mode: 0o700 });
  const canonicalStateDir = await realpath(stateDir);
  if (!isContainedPath(canonicalRoot, canonicalStateDir)) {
    throw new Error("Codex Bridge state directory must remain inside the repository");
  }
  await chmod(stateDir, 0o700);
  const lock = await acquireBridgeLock(stateDir);
  let store: CodexBridgeStore;
  try {
    store = await CodexBridgeStore.open(canonicalRoot, options);
  } catch (error) {
    await releaseBridgeLock(lock);
    throw error;
  }
  const token = randomBytes(32).toString("base64url");
  const startedAt = (options.now?.() ?? new Date()).toISOString();
  let endpoint!: CodexBridgeEndpoint;
  const server = createServer((request, response) => {
    void route(request, response, store, endpoint).catch((error) => errorResponse(response, error));
  });

  try {
    await new Promise<void>((resolveListen, rejectListen) => {
      const onError = (error: Error) => {
        server.off("listening", onListening);
        rejectListen(error);
      };
      const onListening = () => {
        server.off("error", onError);
        resolveListen();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(normalizePort(options.port), CODEX_BRIDGE_HOST);
    });
  } catch (error) {
    await releaseBridgeLock(lock);
    throw error;
  }

  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    await releaseBridgeLock(lock);
    throw new Error("Codex Bridge did not receive a TCP listen address");
  }
  endpoint = {
    schema_version: COMPANION_SESSION_CONTRACT_VERSION,
    url: `http://${CODEX_BRIDGE_HOST}:${address.port}`,
    token,
    pid: process.pid,
    started_at: startedAt,
    bridge_instance_id: store.bridgeInstanceId,
  };
  try {
    await store.writeEndpoint(endpoint);
  } catch (error) {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    await releaseBridgeLock(lock);
    throw error;
  }

  let closePromise: Promise<void> | undefined;
  return {
    server,
    store,
    endpoint,
    close: () => {
      closePromise ??= (async () => {
        await new Promise<void>((resolveClose, rejectClose) => {
          server.close((error) => error ? rejectClose(error) : resolveClose());
        });
        try {
          await store.removeEndpointIfOwned(token);
        } finally {
          await releaseBridgeLock(lock);
        }
      })();
      return closePromise;
    },
  };
}

async function acquireBridgeLock(stateDir: string): Promise<BridgeLock> {
  const path = join(stateDir, CODEX_BRIDGE_LOCK_FILE);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const nonce = randomBytes(24).toString("base64url");
    try {
      const handle = await open(path, "wx", 0o600);
      try {
        await handle.writeFile(`${JSON.stringify({ pid: process.pid, nonce })}\n`, "utf8");
        await handle.sync();
        return { handle, nonce, path };
      } catch (error) {
        await handle.close().catch(() => undefined);
        await rm(path, { force: true }).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const observed = await readFile(path, "utf8").catch(() => null);
      const pid = lockOwnerPid(observed);
      if (pid !== null && processIsAlive(pid)) {
        throw new Error(`Codex Bridge is already running for this workspace (pid ${pid})`);
      }
      const current = await readFile(path, "utf8").catch(() => null);
      if (observed === null || current !== observed) continue;
      await rm(path, { force: true });
    }
  }
  throw new Error("Codex Bridge lock changed while startup was recovering; retry startup");
}

async function releaseBridgeLock(lock: BridgeLock): Promise<void> {
  await lock.handle.close().catch(() => undefined);
  const current = await readFile(lock.path, "utf8").catch(() => null);
  if (current && current.includes(`\"nonce\":\"${lock.nonce}\"`)) {
    await rm(lock.path, { force: true });
  }
}

function lockOwnerPid(value: string | null): number | null {
  if (value === null) return null;
  try {
    const parsed = JSON.parse(value) as { pid?: unknown };
    return Number.isSafeInteger(parsed.pid) && Number(parsed.pid) > 0 ? Number(parsed.pid) : null;
  } catch {
    return null;
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}

function isContainedPath(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === ""
    || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
}
