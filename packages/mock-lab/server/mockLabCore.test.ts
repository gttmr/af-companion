import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AssetRegistryError,
  computeContractHash,
  type AssetRecord,
  type AssetRegistryDocument
} from "../../agent-factory-core/src/assetRegistry.ts";
import { loadCatalogPrefill } from "./catalogPrefillLoader.ts";
import { MockDraftRegistry, buildDraftSpecPrompt, createDraftId, readDraftDetail } from "./mockDraftRunner.ts";
import { MockProcessRegistry } from "./mockProcessRegistry.ts";
import { MockSpecStore } from "./mockSpecStore.ts";
import { validateMockSpec, validateValueAgainstSchema } from "./schemaValidation.ts";

const testRoot = await mkdtemp(join(tmpdir(), "af-mock-lab-"));
const repoRoot = join(testRoot, "repo");
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const seedRegistry = JSON.parse(
  await readFile(join(repositoryRoot, "catalog", "asset-registry.json"), "utf8")
) as AssetRegistryDocument;
const seedTools = seedRegistry.assets.filter((asset) => asset.asset_type === "tool");
const latestToolV1 = seedTools[0];
const latestToolV2 = updatedRecord(latestToolV1, {
  version: 2,
  name: "문서 OCR Tool v2",
  responsibility: "Returns deterministic synthetic OCR output for adapter tests.",
  binding: { kind: "mcp", server_ref: "synthetic-ocr", tool_name: "target_ocr_v2" },
  connection: { transport: "stdio" },
  inputs: [{ name: "document_uri", type: "string", required: true }],
  outputs: [
    { name: "ocr_text", type: "text", required: true },
    { name: "confidence", type: "number", required: true }
  ],
  risk_signals: ["audit_required"],
  runtime_mock: { ocr_text: "[SYNTHETIC] Registry OCR text", confidence: 0.95 },
  notes: "Registry-backed synthetic OCR"
});
const runtimeOnlyTool = updatedRecord(seedTools[1], { contract_status: "review_pending" });
const noMockTool = updatedRecord(seedTools[2], { contract_status: "review_pending", runtime_mock: {} });
const functionTool = updatedRecord(seedTools[3], {
  binding: { kind: "function" },
  connection: { transport: "in_process" }
});
const httpTool = updatedRecord(seedTools[4], { connection: { transport: "http" } });
const reviewedTool = updatedRecord(seedTools[5], {
  status: "reviewed",
  lifecycle: {
    created_by: "mock-lab-test",
    review_decision: {
      decision_id: "decision:mock-lab-review",
      selected_by: "user",
      rationale: "Keeps a non-published Tool in the filtering fixture."
    }
  }
});
const a2aAgent = updatedRecord(
  seedRegistry.assets.find((asset) => asset.asset_type === "agent")!,
  {
    binding: { kind: "a2a", contract_ref: "catalog/contracts/a2a/synthetic-agent.json" },
    connection: { transport: "http" }
  }
);
const workflow = updatedRecord(
  seedRegistry.assets.find((asset) => asset.asset_type === "workflow")!,
  { depends_on: [] }
);
const registryDocument: AssetRegistryDocument = {
  schema_version: 1,
  assets: [
    latestToolV1,
    latestToolV2,
    runtimeOnlyTool,
    noMockTool,
    functionTool,
    httpTool,
    reviewedTool,
    a2aAgent,
    workflow
  ]
};
await mkdir(join(repoRoot, "catalog"), { recursive: true });
await writeFile(
  join(repoRoot, "catalog", "asset-registry.json"),
  JSON.stringify(registryDocument),
  "utf8"
);
await writeFile(join(repoRoot, "catalog", "tools.yaml"), "this is intentionally ignored: [", "utf8");

const catalog = await loadCatalogPrefill(repoRoot);
assert.equal(catalog.entries.length, 2);
assert.equal(catalog.source_file, "catalog/asset-registry.json");
assert.deepEqual(
  catalog.entries.map((entry) => entry.asset_id),
  [latestToolV2.asset_id, runtimeOnlyTool.asset_id]
);
assert.equal(catalog.entries[0].asset_id, latestToolV2.asset_id);
assert.equal(catalog.entries[0].version, 2);
assert.equal(catalog.entries[0].name, "문서 OCR Tool v2");
assert.equal(catalog.entries[0].asset_type, "tool");
assert.equal(catalog.entries[0].binding.kind, "mcp");
assert.equal(catalog.entries[0].has_runtime_mock, true);
assert.equal(catalog.entries[0].prefill.server_name, "synthetic-ocr");
assert.equal(catalog.entries[0].prefill.tools[0].name, "target_ocr_v2");
assert.equal(catalog.entries[0].prefill.source?.catalog_file, "catalog/asset-registry.json");
assert.equal(catalog.entries[0].prefill.source?.catalog_asset_id, latestToolV2.asset_id);
assert.equal(catalog.entries[0].prefill.source?.catalog_asset_version, 2);
assert.deepEqual(catalog.entries[0].prefill.tools[0].inputSchema.required, ["document_uri"]);
assert.deepEqual(catalog.entries[0].prefill.tools[0].successResponse, {
  ocr_text: "[SYNTHETIC] Registry OCR text",
  confidence: 0.95
});
assert.deepEqual(catalog.entries[0].prefill.guardrails, {
  synthetic_only: true,
  no_private_data: true,
  no_private_endpoint: true,
  no_credentials: true,
  no_production_business_logic: true
});
assert.equal(catalog.entries[1].contract_status, "review_pending");
assert.equal(catalog.entries[1].has_runtime_mock, true);
assert.equal(catalog.entries.some((entry) => entry.asset_id === noMockTool.asset_id), false);
assert.equal(catalog.entries.some((entry) => entry.asset_id === functionTool.asset_id), false);
assert.equal(catalog.entries.some((entry) => entry.asset_id === httpTool.asset_id), false);
assert.equal(catalog.entries.some((entry) => entry.asset_id === reviewedTool.asset_id), false);
assert.equal(catalog.entries.some((entry) => entry.asset_id === a2aAgent.asset_id), false);
assert.equal(catalog.entries.some((entry) => entry.asset_id === workflow.asset_id), false);

const missingCatalogRoot = join(testRoot, "missing-catalog");
await mkdir(missingCatalogRoot, { recursive: true });
await assert.rejects(
  () => loadCatalogPrefill(missingCatalogRoot),
  (error) => registryErrorCode(error) === "registry_not_found"
);

const malformedCatalogRoot = join(testRoot, "malformed-catalog");
await mkdir(join(malformedCatalogRoot, "catalog"), { recursive: true });
await writeFile(
  join(malformedCatalogRoot, "catalog", "asset-registry.json"),
  "{ not valid JSON",
  "utf8"
);
await assert.rejects(
  () => loadCatalogPrefill(malformedCatalogRoot),
  (error) => registryErrorCode(error) === "invalid_registry_json"
);

const duplicateCatalogRoot = join(testRoot, "duplicate-catalog");
await mkdir(join(duplicateCatalogRoot, "catalog"), { recursive: true });
await writeFile(
  join(duplicateCatalogRoot, "catalog", "asset-registry.json"),
  JSON.stringify({ schema_version: 1, assets: [latestToolV2, latestToolV2] }),
  "utf8"
);
await assert.rejects(
  () => loadCatalogPrefill(duplicateCatalogRoot),
  (error) => registryErrorCode(error) === "duplicate_asset_version"
);

const validSpec = catalog.entries[0].prefill;
const specValidation = validateMockSpec(validSpec);
assert.deepEqual(specValidation.errors, []);
assert.deepEqual(specValidation.warnings, []);
assert.equal(validateValueAgainstSchema({}, validSpec.tools[0].inputSchema).ok, false);
assert.equal(validateValueAgainstSchema(validSpec.tools[0].successResponse, validSpec.tools[0].outputSchema).ok, true);

const invalidSpec = {
  ...validSpec,
  guardrails: {
    ...validSpec.guardrails,
    no_credentials: false
  }
};
assert.match(
  validateMockSpec(invalidSpec)
    .errors.map((issue) => `${issue.path}: ${issue.message}`)
    .join("\n"),
  /no_credentials/
);
assert.match(
  validateMockSpec({
    ...validSpec,
    tools: [
      {
        ...validSpec.tools[0],
        errorScenarios: [{ name: "unsupported", response: { message: "bad shape" } }]
      }
    ]
  })
    .errors.map((issue) => `${issue.path}: ${issue.message}`)
    .join("\n"),
  /errorCode/
);

const store = new MockSpecStore({ repoRoot });
await assert.rejects(() => store.writeSpec("../escape", validSpec), /mock_id/);
await assert.rejects(
  () => store.readSpec("missing_saved_spec"),
  (error) => {
    assert.equal(error instanceof Error, true);
    assert.match((error as Error).message, /Mock spec is not saved/);
    assert.equal((error as { statusCode?: number }).statusCode, 404);
    return true;
  }
);
await store.writeSpec(validSpec.mock_id, validSpec);
const saved = await store.readSpec(validSpec.mock_id);
assert.equal(saved.server_name, "synthetic-ocr");
await store.writeSpec("delete_me_mock", {
  ...validSpec,
  mock_id: "delete_me_mock",
  server_name: "delete-me-mcp"
});
const deleteResult = await store.deleteMock("delete_me_mock");
assert.deepEqual(deleteResult, { ok: true, mock_id: "delete_me_mock" });
await assert.rejects(() => store.readSpec("delete_me_mock"), /Mock spec is not saved/);

const draftRegistry = new MockDraftRegistry({
  repoRoot,
  store,
  timeoutMs: 5000,
  draftRunner: {
    async run() {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {
        command: "fake codex sdk draft",
        outputText:
          "```json\n" +
          JSON.stringify(
            {
              mock_id: validSpec.mock_id,
              server_name: "drafted-ocr-mcp",
              protocol: "mcp_stdio",
              description: "Drafted OCR spec",
              tools: [
                {
                  name: "drafted_ocr_tool",
                  description: "Drafted synthetic OCR tool.",
                  inputSchema: {
                    type: "object",
                    properties: { document_uri: { type: "string" } },
                    required: ["document_uri"],
                    additionalProperties: false
                  },
                  outputSchema: {
                    type: "object",
                    properties: { ocr_text: { type: "string" } },
                    required: ["ocr_text"],
                    additionalProperties: false
                  },
                  successResponse: { ocr_text: "[SYNTHETIC] drafted OCR text" },
                  errorScenarios: [],
                  latencyMs: 0,
                  riskSignals: [],
                  auditRequired: true
                }
              ],
              guardrails: {
                synthetic_only: true,
                no_private_data: true,
                no_private_endpoint: true,
                no_credentials: true,
                no_production_business_logic: true
              }
            },
            null,
            2
          ) +
          "\n```",
        stdout: "{\"event\":\"fake-draft-complete\"}\n"
      };
    }
  }
});
const startedDraft = await draftRegistry.start({
  mockId: validSpec.mock_id,
  prompt: "Draft a synthetic OCR MCP mock spec.",
  model: "gpt-5.5"
});
assert.equal(startedDraft.status, "running");
assert.equal(startedDraft.pid, null);
const runningDrafts = await store.listDrafts(validSpec.mock_id);
assert.equal(runningDrafts[0].status, "running");
await waitFor(async () => {
  const detail = await readDraftDetail(store, validSpec.mock_id, startedDraft.draft_id);
  assert.equal(detail.summary.status, "completed");
  assert.equal(detail.summary.validation.ok, true);
  assert.equal(detail.draft_spec?.server_name, "drafted-ocr-mcp");
});

const invalidDraftRegistry = new MockDraftRegistry({
  repoRoot,
  store,
  timeoutMs: 5000,
  draftRunner: {
    async run() {
      return {
        command: "fake invalid sdk draft",
        outputText: JSON.stringify({ mock_id: "bad" })
      };
    }
  }
});
const invalidDraft = await invalidDraftRegistry.start({
  mockId: validSpec.mock_id,
  prompt: "Return an invalid mock spec.",
  model: "gpt-5.5"
});
await waitFor(async () => {
  const detail = await readDraftDetail(store, validSpec.mock_id, invalidDraft.draft_id);
  assert.equal(detail.summary.status, "failed");
  assert.equal(detail.summary.validation.ok, false);
  assert.equal(detail.draft_spec, null);
});

const registry = new MockProcessRegistry({ repoRoot, store });
const status = await registry.start(validSpec.mock_id);
assert.equal(status.status, "running");
assert.match(status.command ?? "", /saved mock spec runtime/);
await assert.rejects(() => registry.start(validSpec.mock_id), /already running/);
const listed = await registry.sendJsonRpc(validSpec.mock_id, "tools/list", {});
assert.equal(listed.result.tools[0].name, validSpec.tools[0].name);
const called = await registry.sendJsonRpc(validSpec.mock_id, "tools/call", {
  name: validSpec.tools[0].name,
  arguments: { document_uri: "synthetic://document/1" }
});
assert.deepEqual(called.result.structuredContent, validSpec.tools[0].successResponse);
assert.match(called.result.content[0].text, /agent-factory-mock-lab/);
const invalidCall = await registry.sendJsonRpc(validSpec.mock_id, "tools/call", {
  name: validSpec.tools[0].name,
  arguments: {}
});
assert.equal(invalidCall.error?.code, -32602);
assert.match(invalidCall.error?.message ?? "", /input schema validation failed/);
const auditLog = await readFile(join(repoRoot, "artifacts/mock-lab", validSpec.mock_id, "audit-log.jsonl"), "utf8");
assert.match(auditLog, /tools\/call/);
const stopped = await registry.stop(validSpec.mock_id);
assert.equal(stopped.status, "stopped");

const generatedDraftId = createDraftId(new Date("2026-05-29T01:02:03Z"), "abcdef");
assert.equal(generatedDraftId, "20260529T010203Z-draft-abcdef");
const prompt = buildDraftSpecPrompt({
  mockId: "document_ocr_tool",
  userPrompt: "Create an OCR mock spec."
});
assert.match(prompt, /Return only one valid MockSpec JSON object/);
assert.match(prompt, /Required server_name: document_ocr_tool-mcp/);
assert.match(prompt, /catalog_asset_version: null/);
assert.match(prompt, /errorCode/);
assert.match(prompt, /when must be a JSON object/);
assert.match(prompt, /Create an OCR mock spec/);
assert.doesNotMatch(prompt, /Generate a local MCP stdio mock server from the approved Mock Lab spec/);

await rm(testRoot, { recursive: true, force: true });

function updatedRecord(record: AssetRecord, updates: Partial<AssetRecord>): AssetRecord {
  const next = { ...structuredClone(record), ...structuredClone(updates) } as AssetRecord;
  next.contract_hash = computeContractHash(next);
  return next;
}

function registryErrorCode(error: unknown): string | undefined {
  return error instanceof AssetRegistryError ? error.code : undefined;
}

async function waitFor(assertion: () => Promise<void>, timeoutMs = 3000): Promise<void> {
  const startedAt = Date.now();
  let lastError: unknown;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      await assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("waitFor timed out");
}
