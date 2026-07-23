import type {
  AssetContractInput,
  AssetRecord,
  AssetType,
} from "../../../agent-factory-core/src/assetRegistry";

const contractKeys = [
  "asset_id",
  "asset_type",
  "name",
  "responsibility",
  "capability_tags",
  "inputs",
  "outputs",
  "side_effect_class",
  "domain_scope",
  "business_domains",
  "owner",
  "reuse_status",
  "binding",
  "connection",
  "workflow_profile",
  "exposure",
  "runtime_requirements",
  "source_refs",
  "handbook_refs",
  "depends_on",
  "contract_status",
  "risk_signals",
  "runtime_mock",
  "composition",
  "notes",
] as const satisfies readonly (keyof AssetContractInput)[];

export function createRegistryDraftContract(assetType: AssetType): AssetContractInput {
  return {
    asset_id: `${assetType}.new-asset`,
    asset_type: assetType,
    name: `New ${titleCase(assetType)}`,
    responsibility: "Describe the single responsibility this asset owns.",
    capability_tags: [],
    inputs: [],
    outputs: [],
    side_effect_class: "none",
    domain_scope: "domain_neutral",
    business_domains: [],
    owner: "owner-required",
    reuse_status: "not_reviewed",
    binding: assetType === "tool" ? { kind: "unresolved" } : null,
    connection: assetType === "tool" ? { transport: "unknown" } : null,
    workflow_profile: assetType === "workflow"
      ? { representation: "unresolved", coordination: "explicit", template_ref: null }
      : null,
    exposure: null,
    runtime_requirements: [],
    source_refs: [],
    handbook_refs: [],
    depends_on: [],
    contract_status: "draft_contract",
    risk_signals: [],
    runtime_mock: {},
    composition: [],
    notes: "Replace this note with reviewed contract context.",
  };
}

export function contractFromRegistryRecord(record: AssetRecord): AssetContractInput {
  return Object.fromEntries(
    contractKeys.map((key) => [key, structuredClone(record[key])]),
  ) as unknown as AssetContractInput;
}

export function parseRegistryContractEditor(source: string): AssetContractInput {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Contract JSON 파싱 실패: ${detail}`);
  }
  if (!isRecord(parsed)) throw new Error("Contract는 JSON object여야 합니다.");
  const actual = Object.keys(parsed).sort();
  const expected = [...contractKeys].sort();
  const unknown = actual.filter((key) => !expected.includes(key as keyof AssetContractInput));
  const missing = expected.filter((key) => !(key in parsed));
  if (unknown.length) throw new Error(`Contract에 지원하지 않는 필드가 있습니다: ${unknown.join(", ")}`);
  if (missing.length) throw new Error(`Contract 필수 필드가 없습니다: ${missing.join(", ")}`);
  return parsed as unknown as AssetContractInput;
}

export function serializeRegistryContract(contract: AssetContractInput): string {
  return `${JSON.stringify(contract, null, 2)}\n`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function titleCase(value: string): string {
  return value[0].toUpperCase() + value.slice(1);
}
