import { join } from "node:path";
import {
  loadSnapshot,
  resolveActive,
  type AssetRecord,
  type AssetRegistrySnapshot,
  type ContractField
} from "../../agent-factory-core/src/assetRegistry.ts";
import type { CatalogPrefillEntry, CatalogPrefillPayload, JsonSchema, MockSpec } from "../src/types/mockSpec";

const registrySourceFile = "catalog/asset-registry.json";

type McpStdioTool = AssetRecord & {
  asset_type: "tool";
  binding: { kind: "mcp"; server_ref: string; tool_name: string };
  connection: { transport: "stdio" };
};

export async function loadCatalogPrefill(repoRoot: string): Promise<CatalogPrefillPayload> {
  const snapshot = loadSnapshot(join(repoRoot, registrySourceFile));
  return {
    entries: latestPublishedTools(snapshot).filter(isPrefillCandidate).map(toPrefillEntry),
    loaded_at: new Date().toISOString(),
    source_file: registrySourceFile
  };
}

function latestPublishedTools(snapshot: AssetRegistrySnapshot): AssetRecord[] {
  const assetIds = new Set(
    snapshot.assets
      .filter((asset) => asset.asset_type === "tool" && asset.status === "published")
      .map((asset) => asset.asset_id)
  );
  return [...assetIds].sort().map((assetId) => resolveActive(snapshot, assetId));
}

function isPrefillCandidate(asset: AssetRecord): asset is McpStdioTool {
  return (
    asset.asset_type === "tool" &&
    asset.binding?.kind === "mcp" &&
    asset.connection?.transport === "stdio" &&
    (asset.contract_status === "mock_ready" || hasRuntimeMock(asset))
  );
}

function hasRuntimeMock(asset: AssetRecord): boolean {
  return Object.keys(asset.runtime_mock).length > 0;
}

function toPrefillEntry(tool: McpStdioTool): CatalogPrefillEntry {
  const inputs = tool.inputs.map(toFieldRecord);
  const outputs = tool.outputs.map(toFieldRecord);
  const riskSignals = [...tool.risk_signals];
  const runtimeMock = hasRuntimeMock(tool) ? structuredClone(tool.runtime_mock) : {};
  const description = tool.notes || tool.responsibility || `${tool.name} synthetic MCP Tool`;
  const prefill: MockSpec = {
    mock_id: sanitizeMockId(tool.asset_id),
    server_name: tool.binding.server_ref,
    protocol: "mcp_stdio",
    description,
    source: {
      prefill_from_catalog: true,
      catalog_asset_id: tool.asset_id,
      catalog_asset_version: tool.version,
      catalog_entry_name: tool.name,
      catalog_file: registrySourceFile
    },
    tools: [
      {
        name: tool.binding.tool_name,
        title: tool.name,
        description,
        inputSchema: fieldsToSchema(tool.inputs, "input"),
        outputSchema: fieldsToSchema(tool.outputs, "output"),
        successResponse: runtimeMock,
        errorScenarios: [],
        latencyMs: 0,
        riskSignals,
        auditRequired: riskSignals.includes("audit_required")
      }
    ],
    guardrails: {
      synthetic_only: true,
      no_private_data: true,
      no_private_endpoint: true,
      no_credentials: true,
      no_production_business_logic: true
    }
  };
  return {
    asset_id: tool.asset_id,
    version: tool.version,
    name: tool.name,
    asset_type: "tool",
    capability_tags: [...tool.capability_tags],
    owner: tool.owner,
    binding: structuredClone(tool.binding),
    connection: structuredClone(tool.connection),
    contract_status: tool.contract_status,
    inputs,
    outputs,
    risk_signals: riskSignals,
    has_runtime_mock: hasRuntimeMock(tool),
    notes: tool.notes,
    prefill
  };
}

function fieldsToSchema(fields: readonly ContractField[], mode: "input" | "output"): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const required: string[] = [];
  for (const field of fields) {
    properties[field.name] = fieldToJsonSchema(field.type);
    if (mode === "output" || field.required) required.push(field.name);
  }
  return { type: "object", properties, required, additionalProperties: mode === "output" };
}

function fieldToJsonSchema(type: string): JsonSchema {
  const normalized = type.trim().toLowerCase();
  const arrayMatch = normalized.match(/^array<(.+)>$/);
  if (arrayMatch) return { type: "array", items: fieldToJsonSchema(arrayMatch[1]) };
  if (normalized === "text" || normalized === "string") return { type: "string" };
  if (["number", "float", "double"].includes(normalized)) return { type: "number" };
  if (normalized === "integer" || normalized === "int") return { type: "integer" };
  if (normalized === "boolean" || normalized === "bool") return { type: "boolean" };
  if (normalized === "object" || normalized === "record") return { type: "object", additionalProperties: true };
  if (normalized === "array") return { type: "array", items: { type: "string" } };
  return { type: "string", description: `Registry field type: ${type}` };
}

function toFieldRecord(field: ContractField): Record<string, unknown> {
  return structuredClone(field) as unknown as Record<string, unknown>;
}

function sanitizeMockId(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  const result = sanitized.slice(0, 80);
  return result.length >= 3 ? result : "mock-lab-spec";
}
