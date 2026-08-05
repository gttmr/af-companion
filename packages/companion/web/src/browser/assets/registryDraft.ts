import type {
  CompanionAssetType,
  CompanionRegistryContract,
  CompanionRegistryRecord,
} from "@agent-factory/companion-contracts";

export function createRegistryDraftContract(assetType: CompanionAssetType): CompanionRegistryContract {
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

export function contractFromRegistryRecord(record: CompanionRegistryRecord): CompanionRegistryContract {
  const { version: _version, status: _status, contract_hash: _contractHash, lifecycle: _lifecycle, ...contract } = record;
  return structuredClone(contract);
}

export function parseRegistryContract(source: string): CompanionRegistryContract {
  let value: unknown;
  try { value = JSON.parse(source); }
  catch (error) { throw new Error(`Contract JSON 파싱 실패: ${error instanceof Error ? error.message : String(error)}`); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Contract는 JSON object여야 합니다.");
  return value as CompanionRegistryContract;
}

export function serializeRegistryContract(contract: CompanionRegistryContract): string {
  return `${JSON.stringify(contract, null, 2)}\n`;
}

function titleCase(value: string): string { return value[0]!.toUpperCase() + value.slice(1); }
