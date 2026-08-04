export type CompanionAssetType = "agent" | "workflow" | "tool";

export interface CompanionAppManifest {
  schema_version: 1;
  application_id: string;
  display_name: string;
  created_at: string;
}

export interface CompanionAppSummary extends CompanionAppManifest {
  active: boolean;
}

export interface CompanionAppsSnapshot {
  applications_root: string;
  active_application_id: string | null;
  apps: CompanionAppSummary[];
}

export interface CompanionAssetBinding {
  asset_id: string;
  asset_type: CompanionAssetType;
  version: number;
  contract_hash: string;
  bound_at: string;
}

export interface CompanionAssetBindingsDocument {
  schema_version: 1;
  assets_revision: string;
  bindings: CompanionAssetBinding[];
}

export interface CompanionAssetCard {
  asset_id: string;
  asset_type: CompanionAssetType;
  version: number;
  status: "published" | "deprecated";
  name: string;
  responsibility: string;
  capability_tags: string[];
  contract_hash: string;
}

export interface CompanionAssetSearchResult {
  registry_revision: string;
  results: CompanionAssetCard[];
}

export interface CompanionAppAssetSnapshot extends CompanionAssetBindingsDocument {
  registry_revision: string;
  bindings: Array<CompanionAssetBinding & {
    name: string;
    responsibility: string;
    registry_status: "published" | "deprecated" | "missing" | "contract_changed";
  }>;
}

export interface CreateCompanionAppRequest {
  application_id: string;
  display_name: string;
}

export interface ActivateCompanionAppRequest {
  application_id: string;
}

export interface BindCompanionAssetRequest {
  asset_id: string;
  version: number;
  registry_revision: string;
  base_assets_revision: string;
}
