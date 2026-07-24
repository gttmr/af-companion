import { useQuery } from "@tanstack/react-query";

import {
  compareRegistryAssetVersions,
  fetchRegistrySummary,
  getRegistryAsset,
  getRegistryAssetUsage,
  listRegistryAssets,
  listRegistryAssetVersions,
  searchRegistryAssets,
  type AssetSearchQuery,
  type AssetType,
  type RegistryStatus,
} from "../registry/assetRegistryClient";

export const assetRegistryQueryKey = ["asset-registry"] as const;

export function useAssetRegistrySummary() {
  return useQuery({
    queryKey: [...assetRegistryQueryKey, "summary"],
    queryFn: fetchRegistrySummary,
  });
}

export function useAssetRegistryList(assetType: AssetType, statuses: RegistryStatus[]) {
  return useQuery({
    queryKey: [...assetRegistryQueryKey, "list", assetType, statuses.join(",")],
    queryFn: () => listRegistryAssets({ asset_type: assetType, statuses, all_versions: true, limit: 20 }),
  });
}

export function useAssetRegistryDetail(assetId: string | null, version: number | null) {
  return useQuery({
    queryKey: [...assetRegistryQueryKey, "detail", assetId, version],
    queryFn: () => getRegistryAsset(assetId!, version!, 1),
    enabled: assetId !== null && version !== null,
  });
}

export function useAssetRegistryVersions(assetId: string | null) {
  return useQuery({
    queryKey: [...assetRegistryQueryKey, "versions", assetId],
    queryFn: () => listRegistryAssetVersions(assetId!),
    enabled: assetId !== null,
  });
}

export function useAssetRegistryUsage(assetId: string | null, version: number | null) {
  return useQuery({
    queryKey: [...assetRegistryQueryKey, "usage", assetId, version],
    queryFn: () => getRegistryAssetUsage(assetId!, version!),
    enabled: assetId !== null && version !== null,
  });
}

export function useAssetRegistrySearch(query: AssetSearchQuery | null) {
  return useQuery({
    queryKey: [...assetRegistryQueryKey, "search", query],
    queryFn: () => searchRegistryAssets(query!),
    enabled: query !== null,
  });
}

export function useAssetRegistryComparison(assetId: string | null, from: number | null, to: number | null) {
  return useQuery({
    queryKey: [...assetRegistryQueryKey, "compare", assetId, from, to],
    queryFn: () => compareRegistryAssetVersions(assetId!, from!, to!),
    enabled: assetId !== null && from !== null && to !== null && from !== to,
  });
}
