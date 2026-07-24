import type {
  AssetContractInput,
  AssetRecord,
  AssetSearchBundle,
  AssetSearchQuery,
  AssetType,
  L0AssetCard,
  L1AssetCard,
  PublishDecision,
  RegistryStatus,
  SideEffectClass,
  UsageResult,
  UserDecision,
  VersionComparison,
} from "../../../agent-factory-core/src/assetRegistry";

const apiRoot = "/api/asset-registry";

export type {
  AssetContractInput,
  AssetRecord,
  AssetSearchBundle,
  AssetSearchQuery,
  AssetType,
  L0AssetCard,
  L1AssetCard,
  PublishDecision,
  RegistryStatus,
  SideEffectClass,
  UsageResult,
  UserDecision,
  VersionComparison,
};

export interface RegistrySummary {
  schema_version: 1;
  registry_revision: string;
  counts: Record<AssetType, number>;
  items: L0AssetCard[];
}

export interface RegistryListResponse {
  registry_revision: string;
  items: L0AssetCard[];
}

export interface RegistryAssetResponse<TAsset extends L1AssetCard | AssetRecord> {
  registry_revision: string;
  asset: TAsset;
}

export interface RegistryMutationResponse {
  registry_revision: string;
  asset: AssetRecord;
}

export class RegistryApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "RegistryApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function fetchRegistrySummary(): Promise<RegistrySummary> {
  return registryRequest("/");
}

export function listRegistryAssets(input: {
  asset_type?: AssetType;
  statuses?: RegistryStatus[];
  all_versions?: boolean;
  limit?: number;
}): Promise<RegistryListResponse> {
  const query = new URLSearchParams();
  if (input.asset_type) query.set("asset_type", input.asset_type);
  if (input.statuses?.length) query.set("statuses", input.statuses.join(","));
  if (input.all_versions) query.set("all_versions", "true");
  if (input.limit) query.set("limit", String(input.limit));
  return registryRequest(`/assets${query.size ? `?${query}` : ""}`);
}

export function listRegistryAssetVersions(assetId: string): Promise<RegistryListResponse> {
  return registryRequest(`/assets/${encodeURIComponent(assetId)}/versions`);
}

export function getRegistryAsset(assetId: string, version: number, level: 1): Promise<RegistryAssetResponse<L1AssetCard>>;
export function getRegistryAsset(assetId: string, version: number, level: 2): Promise<RegistryAssetResponse<AssetRecord>>;
export function getRegistryAsset(assetId: string, version: number, level: 1 | 2): Promise<RegistryAssetResponse<L1AssetCard | AssetRecord>> {
  return registryRequest(`/assets/${encodeURIComponent(assetId)}/versions/${version}?level=${level}`);
}

export function compareRegistryAssetVersions(assetId: string, from: number, to: number): Promise<{
  registry_revision: string;
  comparison: VersionComparison;
}> {
  return registryRequest(`/assets/${encodeURIComponent(assetId)}/compare?from=${from}&to=${to}`);
}

export function getRegistryAssetUsage(assetId: string, version: number): Promise<{
  registry_revision: string;
  usage: UsageResult;
}> {
  return registryRequest(`/assets/${encodeURIComponent(assetId)}/versions/${version}/usage`);
}

export function searchRegistryAssets(query: AssetSearchQuery): Promise<AssetSearchBundle> {
  return registryRequest("/search", jsonRequest("POST", query));
}

export function validateRegistryContract(contract: AssetContractInput): Promise<{
  valid: true;
  contract_hash: string;
}> {
  return registryRequest("/validate", jsonRequest("POST", { contract }));
}

export function createRegistryDraft(
  contract: AssetContractInput,
  createdBy: string,
  expectedRevision: string,
): Promise<RegistryMutationResponse> {
  return registryRequest("/drafts", mutationRequest("POST", expectedRevision, { contract, created_by: createdBy }));
}

export function updateRegistryDraft(
  assetId: string,
  version: number,
  contract: AssetContractInput,
  expectedRevision: string,
): Promise<RegistryMutationResponse> {
  return registryRequest(
    `/drafts/${encodeURIComponent(assetId)}/versions/${version}`,
    mutationRequest("PUT", expectedRevision, { contract }),
  );
}

export function reviewRegistryDraft(
  assetId: string,
  version: number,
  decision: UserDecision,
  expectedRevision: string,
): Promise<RegistryMutationResponse> {
  return registryRequest(
    `/drafts/${encodeURIComponent(assetId)}/versions/${version}/review`,
    mutationRequest("POST", expectedRevision, { decision }),
  );
}

export function publishRegistryAsset(
  assetId: string,
  version: number,
  decision: PublishDecision,
  expectedRevision: string,
): Promise<RegistryMutationResponse> {
  return registryRequest(
    `/assets/${encodeURIComponent(assetId)}/versions/${version}/publish`,
    mutationRequest("POST", expectedRevision, { decision }),
  );
}

export function deprecateRegistryAsset(
  assetId: string,
  version: number,
  decision: UserDecision,
  expectedRevision: string,
): Promise<RegistryMutationResponse> {
  return registryRequest(
    `/assets/${encodeURIComponent(assetId)}/versions/${version}/deprecate`,
    mutationRequest("POST", expectedRevision, { decision }),
  );
}

function jsonRequest(method: "POST" | "PUT", body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function mutationRequest(method: "POST" | "PUT", expectedRevision: string, body: unknown): RequestInit {
  return {
    ...jsonRequest(method, body),
    headers: {
      "content-type": "application/json",
      "if-match": expectedRevision,
    },
  };
}

async function registryRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiRoot}${path === "/" ? "" : path}`, init);
  const payload = await response.json().catch(() => null) as unknown;
  if (!response.ok) {
    const record = isRecord(payload) ? payload : {};
    throw new RegistryApiError(
      response.status,
      typeof record.code === "string" ? record.code : "registry_request_failed",
      typeof record.error === "string" ? record.error : `Asset Registry 요청 실패 (${response.status})`,
      record.details,
    );
  }
  if (!isRecord(payload)) throw new RegistryApiError(502, "invalid_registry_response", "Asset Registry 응답이 JSON object가 아닙니다.");
  return payload as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
