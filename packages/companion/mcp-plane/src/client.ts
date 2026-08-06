import { constants } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { ApplyGraphOperationsRequest, ApplyGraphOperationsResponse, GraphWorkspaceSnapshot } from "@agent-factory/companion-contracts";

export const DEFAULT_CAPABILITY_PATH = ".agent-factory/companion-capability.json";

export class GraphControlClientError extends Error {
  constructor(readonly code: string, message: string, readonly status?: number, readonly details?: Record<string, unknown>) { super(message); this.name = "GraphControlClientError"; }
}

export interface GraphControlClient {
  getWorkspace(): Promise<GraphWorkspaceSnapshot>;
  applyChanges(request: ApplyGraphOperationsRequest): Promise<ApplyGraphOperationsResponse>;
}

export function createGraphControlClient(input: { projectRoot: string; capabilityPath?: string; fetchImpl?: typeof fetch }): GraphControlClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const capability = await readCapability(input.projectRoot, input.capabilityPath ?? DEFAULT_CAPABILITY_PATH);
    const response = await fetchImpl(`${capability.origin}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "X-Companion-Client": "mcp", "X-Companion-Capability": capability.token, ...init?.headers },
      signal: init?.signal ?? AbortSignal.timeout(10_000),
    });
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new GraphControlClientError(typeof body.error === "string" ? body.error : "control_request_failed", typeof body.message === "string" ? body.message : "Graph Control request failed", response.status, body);
    return body as T;
  }
  return {
    getWorkspace: () => request("/api/companion/v2/workspace"),
    applyChanges: (body) => request("/api/companion/v2/graph/operations", { method: "POST", body: JSON.stringify({ ...body, source: "mcp" }) }),
  };
}

async function readCapability(projectRootInput: string, relativePath: string): Promise<{ origin: string; token: string }> {
  const projectRoot = await realpath(projectRootInput); const path = resolveContained(projectRoot, relativePath); await assertNoSymlinks(projectRoot, path);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.nlink !== 1 || (info.mode & 0o077) !== 0 || info.size > 8192) throw new GraphControlClientError("invalid_capability_file", "Capability must be a small mode-0600 regular file");
    const value = JSON.parse(await handle.readFile("utf8")) as unknown;
    if (!record(value) || value.schema_version !== 1) throw new GraphControlClientError("invalid_capability_file", "Capability contract is invalid");
    if (value.status === "inactive") throw new GraphControlClientError("app_inactive", "이 App은 현재 Companion에서 active 상태가 아닙니다. App을 다시 선택한 뒤 새 Codex session을 시작하세요.");
    if (value.status !== undefined && value.status !== "active") throw new GraphControlClientError("invalid_capability_file", "Capability status is invalid");
    if (typeof value.origin !== "string" || typeof value.token !== "string" || !/^[a-f0-9]{64}$/u.test(value.token)) throw new GraphControlClientError("invalid_capability_file", "Capability contract is invalid");
    const origin = new URL(value.origin);
    if (origin.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) || origin.username || origin.password || origin.pathname !== "/") throw new GraphControlClientError("invalid_control_origin", "Control origin must be loopback HTTP");
    return { origin: origin.origin, token: value.token };
  } catch (error) {
    if (error instanceof GraphControlClientError) throw error;
    throw new GraphControlClientError("capability_unavailable", error instanceof Error ? error.message : "Capability unavailable");
  } finally { await handle.close(); }
}

async function assertNoSymlinks(root: string, target: string): Promise<void> { let cursor = root; for (const part of relative(root, target).split(sep).filter(Boolean)) { cursor = resolve(cursor, part); if ((await lstat(cursor)).isSymbolicLink()) throw new GraphControlClientError("symlink_not_allowed", "Capability path cannot contain symlinks"); } }
function resolveContained(root: string, path: string): string { if (!path || isAbsolute(path) || path.includes("\\") || path.split("/").some((part) => part === "..")) throw new GraphControlClientError("invalid_capability_path", "Capability path must be project-relative"); const target = resolve(root, path); const relation = relative(root, target); if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new GraphControlClientError("capability_outside_project", "Capability must stay inside project"); return target; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
