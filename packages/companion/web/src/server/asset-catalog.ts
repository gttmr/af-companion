import { pathToFileURL } from "node:url";
import type { AssetCatalog } from "@agent-factory/companion-graph-control-server";
import type { CompanionAssetCard } from "@agent-factory/companion-contracts";

interface CoreAssetRecord extends CompanionAssetCard {}
interface CoreSearchResult { card: CompanionAssetCard }
interface CoreService {
  loadSnapshot(): { registry_revision: string };
  search(query: { text?: string; asset_type?: "agent" | "workflow" | "tool" }): { registry_revision: string; results: CoreSearchResult[] };
  resolveExact(assetId: string, version: number): CoreAssetRecord;
}

interface CoreModule {
  AssetRegistryService: new (registryPath: string) => CoreService;
}

export async function createReadOnlyAssetCatalog(registryPath: string, coreModulePath: string): Promise<AssetCatalog> {
  const core = await import(pathToFileURL(coreModulePath).href) as CoreModule;
  const service = new core.AssetRegistryService(registryPath);
  return {
    snapshotRevision: () => service.loadSnapshot().registry_revision,
    search(input) {
      const result = service.search(input);
      return { registry_revision: result.registry_revision, results: result.results.map(({ card }) => normalize(card)) };
    },
    resolveExact(assetId, version) { return normalize(service.resolveExact(assetId, version)); },
  };
}

function normalize(record: CoreAssetRecord): CompanionAssetCard {
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
