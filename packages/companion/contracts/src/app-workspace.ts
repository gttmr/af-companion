export type CompanionAssetType = "agent" | "workflow" | "tool";
export type CompanionRegistryStatus = "draft" | "reviewed" | "published" | "deprecated";
export type CompanionRegistrySideEffect = "none" | "read_only" | "write" | "external_action";

export interface CompanionRegistryField {
  name: string;
  type: string;
  required: boolean;
  schema?: Record<string, unknown>;
}

export type CompanionRegistryBinding =
  | { kind: "function" | "built_in" | "unresolved" }
  | { kind: "mcp"; server_ref: string; tool_name: string }
  | { kind: "a2a"; contract_ref: string };

export interface CompanionRegistryConnection {
  transport: "in_process" | "stdio" | "http" | "unknown";
}

export interface CompanionRegistryWorkflowProfile {
  representation: "graph" | "dynamic" | "unresolved";
  coordination: "explicit" | "agent_delegation" | "mixed";
  template_ref: string | null;
}

export interface CompanionRegistryExposure {
  protocol: "a2a";
  contract_ref: string;
}

export interface CompanionRegistryAssetRef {
  asset_id: string;
  version: number;
}

export interface CompanionRegistryDecision {
  decision_id: string;
  selected_by: "user";
  rationale: string;
}

export interface CompanionRegistryPublishDecision extends CompanionRegistryDecision {
  owner_confirmed: true;
  domain_confirmed: true;
  reuse_confirmed: true;
}

export interface CompanionRegistryLifecycle {
  created_by: string;
  seed_publication?: { kind: "repository_seed"; source_ref: string; rationale: string };
  review_decision?: CompanionRegistryDecision;
  publish_decision?: CompanionRegistryPublishDecision;
  deprecation_decision?: CompanionRegistryDecision;
}

export interface CompanionRegistryContract {
  asset_id: string;
  asset_type: CompanionAssetType;
  name: string;
  responsibility: string;
  capability_tags: string[];
  inputs: CompanionRegistryField[];
  outputs: CompanionRegistryField[];
  side_effect_class: CompanionRegistrySideEffect;
  domain_scope: "domain_specific" | "cross_domain" | "domain_neutral";
  business_domains: string[];
  owner: string;
  reuse_status: "not_reviewed" | "reuse_existing" | "publish_candidate" | "project_only" | "excluded";
  binding: CompanionRegistryBinding | null;
  connection: CompanionRegistryConnection | null;
  workflow_profile: CompanionRegistryWorkflowProfile | null;
  exposure: CompanionRegistryExposure | null;
  runtime_requirements: string[];
  source_refs: string[];
  handbook_refs: string[];
  depends_on: CompanionRegistryAssetRef[];
  contract_status: string;
  risk_signals: string[];
  runtime_mock: Record<string, unknown>;
  composition: string[];
  notes: string;
}

export interface CompanionRegistryRecord extends CompanionRegistryContract {
  version: number;
  status: CompanionRegistryStatus;
  contract_hash: string;
  lifecycle: CompanionRegistryLifecycle;
}

export interface CompanionRegistryCard {
  asset_id: string;
  asset_type: CompanionAssetType;
  version: number;
  status: CompanionRegistryStatus;
  name: string;
  responsibility: string;
  capability_tags: string[];
  side_effect_class: CompanionRegistrySideEffect;
  contract_hash: string;
}

export interface CompanionRegistryListSnapshot {
  schema_version: 1;
  registry_revision: string;
  items: CompanionRegistryCard[];
}

export interface CompanionRegistryAssetSnapshot {
  registry_revision: string;
  asset: CompanionRegistryRecord;
}

export interface CompanionRegistryValidationResult {
  valid: true;
  contract_hash: string;
}

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
