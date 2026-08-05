import { pathToFileURL } from "node:url";
import type { AssetCatalog } from "@agent-factory/companion-graph-control-server";
import type {
  CompanionAssetCard,
  CompanionAssetType,
  CompanionRegistryAssetRef,
  CompanionRegistryAssetSnapshot,
  CompanionRegistryCard,
  CompanionRegistryContract,
  CompanionRegistryDecision,
  CompanionRegistryListSnapshot,
  CompanionRegistryPublishDecision,
  CompanionRegistryRecord,
  CompanionRegistryStatus,
  CompanionRegistryValidationResult,
} from "@agent-factory/companion-contracts";

interface CoreSearchResult { card: CompanionAssetCard }
interface CoreSnapshot {
  schema_version: 1;
  registry_revision: string;
  assets: readonly CompanionRegistryRecord[];
}
interface CoreService {
  loadSnapshot(): CoreSnapshot;
  search(query: { text?: string; asset_type?: CompanionAssetType }): { registry_revision: string; results: CoreSearchResult[] };
  resolveExact(assetId: string, version: number): CompanionRegistryRecord;
  createDraft(contract: CompanionRegistryContract, expectedRevision: string, createdBy: string): CoreSnapshot;
  updateDraft(ref: CompanionRegistryAssetRef, contract: CompanionRegistryContract, expectedRevision: string): CoreSnapshot;
  markReviewed(ref: CompanionRegistryAssetRef, decision: CompanionRegistryDecision, expectedRevision: string): CoreSnapshot;
  publish(ref: CompanionRegistryAssetRef, decision: CompanionRegistryPublishDecision, expectedRevision: string): CoreSnapshot;
  deprecate(ref: CompanionRegistryAssetRef, decision: CompanionRegistryDecision, expectedRevision: string): CoreSnapshot;
}

interface CoreModule {
  AssetRegistryService: new (registryPath: string) => CoreService;
  computeContractHash(contract: CompanionRegistryContract): string;
  list(snapshot: CoreSnapshot, options: RegistryListOptions): CompanionRegistryCard[];
  resolveExact(snapshot: CoreSnapshot, assetId: string, version: number): CompanionRegistryRecord;
  validateAssetContract(value: unknown): CompanionRegistryContract;
}

export interface RegistryListOptions {
  asset_type?: CompanionAssetType;
  statuses?: CompanionRegistryStatus[];
  all_versions?: boolean;
  limit?: number;
}

export interface CompanionAssetRegistry {
  listRegistry(options?: RegistryListOptions): CompanionRegistryListSnapshot;
  getRegistryAsset(assetId: string, version: number): CompanionRegistryAssetSnapshot;
  validateRegistryContract(contract: unknown): CompanionRegistryValidationResult;
  createRegistryDraft(contract: unknown, createdBy: string, expectedRevision: string): CompanionRegistryAssetSnapshot;
  updateRegistryDraft(assetId: string, version: number, contract: unknown, expectedRevision: string): CompanionRegistryAssetSnapshot;
  reviewRegistryDraft(assetId: string, version: number, decision: CompanionRegistryDecision, expectedRevision: string): CompanionRegistryAssetSnapshot;
  publishRegistryAsset(assetId: string, version: number, decision: CompanionRegistryPublishDecision, expectedRevision: string): CompanionRegistryAssetSnapshot;
  deprecateRegistryAsset(assetId: string, version: number, decision: CompanionRegistryDecision, expectedRevision: string): CompanionRegistryAssetSnapshot;
}

export type AssetRegistryGateway = AssetCatalog & CompanionAssetRegistry;

export async function createAssetRegistryGateway(registryPath: string, coreModulePath: string): Promise<AssetRegistryGateway> {
  const core = await import(pathToFileURL(coreModulePath).href) as CoreModule;
  const service = new core.AssetRegistryService(registryPath);
  const mutation = (snapshot: CoreSnapshot, assetId: string, version?: number): CompanionRegistryAssetSnapshot => {
    const candidates = snapshot.assets.filter((asset) => asset.asset_id === assetId);
    const selectedVersion = version ?? Math.max(...candidates.map((asset) => asset.version));
    return { registry_revision: snapshot.registry_revision, asset: structuredClone(core.resolveExact(snapshot, assetId, selectedVersion)) };
  };
  return {
    snapshotRevision: () => service.loadSnapshot().registry_revision,
    search(input) {
      const result = service.search(input);
      return { registry_revision: result.registry_revision, results: result.results.map(({ card }) => normalizeConsumable(card)) };
    },
    resolveExact(assetId, version) { return normalizeConsumable(service.resolveExact(assetId, version)); },
    listRegistry(options = {}) {
      const snapshot = service.loadSnapshot();
      return { schema_version: 1, registry_revision: snapshot.registry_revision, items: structuredClone(core.list(snapshot, options)) };
    },
    getRegistryAsset(assetId, version) {
      const snapshot = service.loadSnapshot();
      return mutation(snapshot, assetId, version);
    },
    validateRegistryContract(contract) {
      const validated = core.validateAssetContract(contract);
      return { valid: true, contract_hash: core.computeContractHash(validated) };
    },
    createRegistryDraft(contract, createdBy, expectedRevision) {
      const validated = core.validateAssetContract(contract);
      return mutation(service.createDraft(validated, expectedRevision, createdBy), validated.asset_id);
    },
    updateRegistryDraft(assetId, version, contract, expectedRevision) {
      const validated = core.validateAssetContract(contract);
      return mutation(service.updateDraft({ asset_id: assetId, version }, validated, expectedRevision), assetId, version);
    },
    reviewRegistryDraft(assetId, version, decision, expectedRevision) {
      return mutation(service.markReviewed({ asset_id: assetId, version }, decision, expectedRevision), assetId, version);
    },
    publishRegistryAsset(assetId, version, decision, expectedRevision) {
      return mutation(service.publish({ asset_id: assetId, version }, decision, expectedRevision), assetId, version);
    },
    deprecateRegistryAsset(assetId, version, decision, expectedRevision) {
      return mutation(service.deprecate({ asset_id: assetId, version }, decision, expectedRevision), assetId, version);
    },
  };
}

export async function createReadOnlyAssetCatalog(registryPath: string, coreModulePath: string): Promise<AssetCatalog> {
  return createAssetRegistryGateway(registryPath, coreModulePath);
}

function normalizeConsumable(record: CompanionAssetCard | CompanionRegistryRecord): CompanionAssetCard {
  if (record.status !== "published" && record.status !== "deprecated") throw new Error(`Asset is not consumable: ${record.asset_id}@${record.version}`);
  return {
    asset_id: record.asset_id,
    asset_type: record.asset_type,
    version: record.version,
    status: record.status,
    name: record.name,
    responsibility: record.responsibility,
    capability_tags: [...record.capability_tags],
    contract_hash: record.contract_hash,
  };
}
