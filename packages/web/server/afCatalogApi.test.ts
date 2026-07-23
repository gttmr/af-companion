import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import { ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

import { createAfCatalogMiddleware } from "./afCatalogApi.ts";

await withTempRepo(async (repoRoot) => {
  await writeCatalogs(repoRoot);
  const catalog = await invoke(repoRoot, "GET", "/");
  assert.equal(catalog.status, 200);
  assert.deepEqual(catalog.body, {
    agents: { agents: [] },
    workflows: { workflows: [] },
    tools: { tools: [] },
  });

  const writeAttempt = await invoke(repoRoot, "POST", "/publish");
  assert.equal(writeAttempt.status, 404, "unknown paths fail before method handling");

  const rootWriteAttempt = await invoke(repoRoot, "POST", "/");
  assert.equal(rootWriteAttempt.status, 405);
  assert.equal(rootWriteAttempt.body.code, "catalog_read_only");
});

await withTempRepo(async (repoRoot) => {
  await writeFile(join(repoRoot, "catalog", "agents.yaml"), "agents: []\n", "utf8");
  await writeFile(join(repoRoot, "catalog", "workflows.yaml"), "workflows: []\n", "utf8");
  const missing = await invoke(repoRoot, "GET", "/");
  assert.equal(missing.status, 500);
  assert.equal(missing.body.code, "catalog_read_failed");
});

async function withTempRepo(run: (repoRoot: string) => Promise<void>): Promise<void> {
  const repoRoot = await mkdtemp(join(tmpdir(), "af-catalog-readonly-"));
  try {
    await mkdir(join(repoRoot, "catalog"), { recursive: true });
    await run(repoRoot);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
}

async function writeCatalogs(repoRoot: string): Promise<void> {
  await Promise.all([
    writeFile(join(repoRoot, "catalog", "agents.yaml"), "agents: []\n", "utf8"),
    writeFile(join(repoRoot, "catalog", "workflows.yaml"), "workflows: []\n", "utf8"),
    writeFile(join(repoRoot, "catalog", "tools.yaml"), "tools: []\n", "utf8"),
  ]);
}

async function invoke(repoRoot: string, method: string, url: string) {
  const request = Readable.from([]) as IncomingMessage;
  request.method = method;
  request.url = url;
  const chunks: string[] = [];
  const response = new ServerResponse(request);
  response.setHeader = function setHeader() { return this; };
  response.end = function end(chunk?: string | Uint8Array) {
    if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk.toString());
    return this;
  };
  await createAfCatalogMiddleware(repoRoot)(request, response, (error) => {
    throw error instanceof Error ? error : new Error("unexpected middleware next()");
  });
  return {
    status: response.statusCode,
    body: chunks.length ? JSON.parse(chunks.join("")) as Record<string, unknown> : {},
  };
}
