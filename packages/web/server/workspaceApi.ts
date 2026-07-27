import type { IncomingMessage, ServerResponse } from "node:http";

import { isRecord, readJsonBody, sendJson } from "./httpApi";
import { VscodeWorkspaceLauncher, VscodeWorkspaceLauncherError } from "./vscodeWorkspaceLauncher";
import { WorkspaceProjection, WorkspaceProjectionError } from "./workspaceProjection";

type MiddlewareNext = (error?: unknown) => void;

export interface WorkspaceApi {
  middleware: (request: IncomingMessage, response: ServerResponse, next: MiddlewareNext) => Promise<void>;
  projection: WorkspaceProjection;
  close: () => Promise<void>;
}

export function createWorkspaceApi(repoRoot: string): WorkspaceApi {
  const projection = new WorkspaceProjection(repoRoot);
  const editor = new VscodeWorkspaceLauncher(repoRoot);

  const middleware = async (request: IncomingMessage, response: ServerResponse, next: MiddlewareNext): Promise<void> => {
    try {
      assertLoopback(request);
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

      if (request.method === "GET" && url.pathname === "/identity") {
        sendJson(response, 200, await projection.identity());
        return;
      }
      if (request.method === "GET" && url.pathname === "/snapshot") {
        sendJson(response, 200, await projection.snapshot());
        return;
      }
      if (request.method === "GET" && url.pathname === "/changes") {
        sendJson(response, 200, { changes: await projection.changes() });
        return;
      }
      if (request.method === "GET" && url.pathname === "/diff") {
        const path = url.searchParams.get("path");
        if (!path) throw new WorkspaceProjectionError(400, "path_required", "path query가 필요합니다.");
        sendJson(response, 200, await projection.diff(path));
        return;
      }
      if (request.method === "GET" && url.pathname === "/events") {
        await streamEvents(request, response, projection, url.searchParams.get("work_id"));
        return;
      }
      if (request.method === "POST" && url.pathname === "/editor/open") {
        assertSameOrigin(request);
        const body = await readJsonBody(request, {
          maxBytes: 16 * 1_024,
          sizeLimitMessage: "Editor open 요청은 16 KiB를 넘을 수 없습니다.",
        });
        if (!isRecord(body) || (body.mode !== "file" && body.mode !== "diff") || typeof body.path !== "string") {
          throw new WorkspaceProjectionError(400, "invalid_editor_request", "mode와 path가 필요합니다.");
        }
        await projection.assertWorkspacePath(body.path, { mustExist: body.mode === "file" });
        if (body.mode === "file") {
          const line = body.line === undefined ? undefined : Number(body.line);
          sendJson(response, 202, await editor.openFile(body.path, line));
        } else {
          sendJson(response, 202, await editor.openDiff(body.path));
        }
        return;
      }

      sendJson(response, 404, { error: "알 수 없는 Workspace API 경로입니다.", code: "not_found" });
    } catch (error) {
      handleError(error, response, next);
    }
  };

  return { middleware, projection, close: () => projection.stop() };
}

async function streamEvents(
  request: IncomingMessage,
  response: ServerResponse,
  projection: WorkspaceProjection,
  workId: string | null,
): Promise<void> {
  await projection.start();
  const releaseApplicationWatch = workId ? await projection.watchApplication(workId) : null;
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  try {
    response.statusCode = 200;
    response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    response.setHeader("Cache-Control", "no-cache, no-transform");
    response.setHeader("Connection", "keep-alive");
    response.setHeader("X-Accel-Buffering", "no");
    response.flushHeaders?.();

    const identity = await projection.identity();
    const connected = {
      sequence: 0,
      reason: "connected" as const,
      activity: null,
      at: new Date().toISOString(),
      workspace_id: identity.workspace_id,
    };
    response.write(`event: workspace\ndata: ${JSON.stringify(connected)}\n\n`);
    unsubscribe = projection.subscribe((event) => {
      response.write(`id: ${event.sequence}\nevent: workspace\ndata: ${JSON.stringify(event)}\n\n`);
    });
    heartbeat = setInterval(() => response.write(": keepalive\n\n"), 15_000);
    await new Promise<void>((resolveClose) => {
      const close = () => resolveClose();
      request.once("close", close);
      response.once("close", close);
    });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
    unsubscribe?.();
    await releaseApplicationWatch?.();
    if (!response.writableEnded) response.end();
  }
}

function assertLoopback(request: IncomingMessage): void {
  const address = request.socket.remoteAddress;
  if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") {
    throw new WorkspaceProjectionError(403, "loopback_required", "Workspace API는 loopback 요청만 허용합니다.");
  }
}

function assertSameOrigin(request: IncomingMessage): void {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (typeof origin !== "string" || typeof host !== "string") {
    throw new WorkspaceProjectionError(403, "same_origin_required", "Editor open은 same-origin 요청만 허용합니다.");
  }
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new WorkspaceProjectionError(403, "same_origin_required", "유효한 same-origin 요청이 필요합니다.");
  }
  if (parsed.host.toLowerCase() !== host.toLowerCase()
    || !["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname.toLowerCase())) {
    throw new WorkspaceProjectionError(403, "same_origin_required", "same-origin 요청만 허용합니다.");
  }
}

function handleError(error: unknown, response: ServerResponse, next: MiddlewareNext): void {
  if (response.headersSent) {
    response.end();
    return;
  }
  if (error instanceof WorkspaceProjectionError || error instanceof VscodeWorkspaceLauncherError) {
    sendJson(response, error.statusCode, { error: error.message, code: error.code });
    return;
  }
  if (error instanceof SyntaxError) {
    sendJson(response, 400, { error: "JSON 형식이 올바르지 않습니다.", code: "invalid_json" });
    return;
  }
  next(error);
}
