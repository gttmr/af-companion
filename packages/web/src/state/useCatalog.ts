import { useQuery } from "@tanstack/react-query";
import { parseCatalogIndexPayload, type CatalogIndex } from "../catalog/catalogIndex";

export type {
  CatalogCategory,
  CatalogEntryRaw,
  CatalogHubEntry,
  CatalogIO,
  CatalogIndex,
  TargetCatalogCategory
} from "../catalog/catalogIndex";

export function useCatalog() {
  return useQuery<CatalogIndex>({
    queryKey: ["af", "catalog-index"] as const,
    queryFn: async () => {
      const response = await fetch("/api/catalog");
      if (!response.ok) throw new Error(`Catalog 조회 실패 (${response.status})`);
      return parseCatalogIndexPayload(await response.json());
    },
    staleTime: 60_000
  });
}
