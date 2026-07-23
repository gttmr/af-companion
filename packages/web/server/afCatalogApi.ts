import { readFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join, resolve } from "node:path";
import { load as parseYaml } from "js-yaml";

import { parseCatalogIndexPayload } from "../src/catalog/catalogIndex";
import { sendJson } from "./httpApi";

type MiddlewareNext = (error?: unknown) => void;

/** Read-only Catalog projection. Catalog publication belongs to the external Work Skill. */
export function createAfCatalogMiddleware(repoRoot: string) {
  const catalogDir = resolve(repoRoot, "catalog");
  return async function afCatalogMiddleware(
    request: IncomingMessage,
    response: ServerResponse,
    next: MiddlewareNext,
  ): Promise<void> {
    try {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname.replace(/\/$/, "") || "/";
      if (pathname !== "/") {
        sendJson(response, 404, { error: "알 수 없는 Catalog 경로입니다.", code: "not_found" });
        return;
      }
      if (request.method !== "GET") {
        sendJson(response, 405, {
          error: "Catalog는 Workbench에서 읽기 전용입니다. af-verify-runtime 결과를 외부 Codex에서 반영하세요.",
          code: "catalog_read_only",
        });
        return;
      }
      const [agents, workflows, tools] = await Promise.all([
        readYaml(join(catalogDir, "agents.yaml")),
        readYaml(join(catalogDir, "workflows.yaml")),
        readYaml(join(catalogDir, "tools.yaml")),
      ]);
      const payload = { agents, workflows, tools };
      parseCatalogIndexPayload(payload);
      sendJson(response, 200, payload);
    } catch (error) {
      if (error instanceof Error) {
        console.error("[af-catalog] read failed:", error);
        sendJson(response, 500, { error: error.message, code: "catalog_read_failed" });
        return;
      }
      next(error);
    }
  };
}

async function readYaml(path: string): Promise<unknown> {
  return parseYaml(await readFile(path, "utf8"));
}
