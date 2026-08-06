import type { GraphEdge, GraphNode, GraphRegion, GraphSelection } from "@agent-factory/companion-graph-domain";
import type { CompanionAssetBinding, CompanionRegistryRecord, CompanionSourceProject } from "./app-workspace.js";

export type CompanionSourceReadinessStatus = "ready" | "scaffold_required" | "missing" | "unsupported";

export interface CompanionSourceProjectSnapshot extends CompanionSourceProject {
  canonical_root: string;
  readiness: {
    status: CompanionSourceReadinessStatus;
    reasons: string[];
    git_head: string;
  };
}

export interface CompanionSourceProjectsSnapshot {
  schema_version: 1;
  application_id: string;
  manifest_schema_version: 1 | 2;
  upgrade_required: boolean;
  source_projects: CompanionSourceProjectSnapshot[];
}

export interface CompanionSkillLock {
  skill_id: string;
  version: "1.2.1" | "2.0.0-adk2.4-session1";
  tree_digest: string;
}

export interface CompanionDevelopmentLock {
  schema_version: 1;
  profile_id: "session2-qwen3.6-27b-offline-target";
  skill_bundle: {
    bundle_id: "af-skills-vnext";
    version: "2.0.0-adk2.4-session1";
    digest: string;
  };
  required_skills: CompanionSkillLock[];
  runtime: {
    google_adk: "2.4.0";
    mcp: "1.28.1";
    a2a_sdk: "0.3.26";
    agents_cli: "1.2.1";
    dependency_source: "local_cache_only";
  };
  model: {
    acceptance: "self-hosted-27B Session 2 acceptance";
    provider: "self_hosted_qwen_vllm";
    model_id: "qwen3.6-27b-128k";
    input_context_tokens: 131_072;
    transport: {
      kind: "private_openai_compatible";
      endpoint_source: "ignored_local_configuration";
      endpoint_env: "AF_QWEN_BASE_URL";
      api_key_source: "ignored_local_configuration";
      api_key_env: "AF_QWEN_API_KEY";
    };
    fallback: false;
    required: true;
  };
  network: {
    acceptance_profile: "private_vllm_only";
    acceptance_internet_egress: "denied";
    cloud_deploy_publish_observability: "denied";
  };
  representative_integration: {
    authority: "session2_decision";
    session1_required_integration_artifact: "absent";
    experiment_ids: ["CP-001", "CP-002", "CP-003", "CP-004", "CP-005"];
    capability_groups: string[];
  };
  unsupported_guards: Array<{ capability_id: string; reason: string }>;
}

export type CompanionSkillReadinessStatus = "offline_ready" | "missing" | "disabled" | "version_mismatch" | "digest_mismatch";

export interface CompanionSkillReadiness {
  skill_id: string;
  status: CompanionSkillReadinessStatus;
  expected_version: string;
  expected_digest: string;
  observed_version: string | null;
  observed_digest: string | null;
}

export interface CompanionDevelopmentReadiness {
  schema_version: 1;
  status: "offline_ready" | "blocked";
  bundle_status: CompanionSkillReadinessStatus;
  skills: CompanionSkillReadiness[];
  model_status: "ready" | "unreachable" | "contract_mismatch";
  reasons: string[];
}

export type CompanionImplementationTarget =
  | { kind: "graph_element"; element: GraphSelection }
  | { kind: "asset"; asset_id: string; version: number; contract_hash: string };

export interface CompanionImplementationLocator {
  source_project_id: string;
  module: string;
  symbol: string | null;
  config: string | null;
  tests: string[];
}

export interface CompanionImplementationMappingEntry {
  mapping_id: string;
  target: CompanionImplementationTarget;
  source: CompanionImplementationLocator;
  graph_revision: string;
  asset_refs: Array<{ asset_id: string; version: number; contract_hash: string }>;
  git_base_commit: string;
  git_result_commit: string;
  updated_at: string;
}

export interface CompanionImplementationMappingDocument {
  schema_version: 1;
  mapping_revision: string;
  entries: CompanionImplementationMappingEntry[];
}

export interface CompanionImplementationMappingStatus extends CompanionImplementationMappingEntry {
  status: "current" | "missing" | "stale" | "conflict";
  reasons: string[];
}

export interface CompanionImplementationMappingSnapshot {
  schema_version: 1;
  mapping_revision: string;
  entries: CompanionImplementationMappingStatus[];
}

export interface PutCompanionImplementationMappingRequest {
  base_mapping_revision: string;
  mapping: CompanionImplementationMappingEntry;
}

export interface CompanionDevelopmentContextRequest {
  expected_application_id: string;
  expected_graph_revision: string;
  source_project_id: string;
  primary_intent: "implement_selected_element" | "verify_selected_element";
}

export interface CompanionBoundedGraphContext {
  selection: GraphSelection;
  selected: GraphNode | GraphEdge | GraphRegion;
  nodes: GraphNode[];
  edges: GraphEdge[];
  regions: GraphRegion[];
}

export interface CompanionDevelopmentAssetContext {
  binding: CompanionAssetBinding;
  contract: CompanionRegistryRecord;
}

export interface CompanionDevelopmentContextCapsule {
  schema_version: 1;
  capsule_id: string;
  application: { application_id: string; root: string };
  source_project: CompanionSourceProjectSnapshot;
  base_commit: string;
  graph_revision: string;
  graph_context: CompanionBoundedGraphContext;
  assets: CompanionDevelopmentAssetContext[];
  implementation_mapping: CompanionImplementationMappingStatus | null;
  primary_intent: "implement_selected_element" | "verify_selected_element";
  primary_skill: "$google-agents-cli-adk-code";
  required_skills: CompanionSkillLock[];
  write_roots: string[];
  forbidden_changes: string[];
  verification: string[];
  evidence: CompanionDevelopmentLock["representative_integration"];
  unsupported_guards: CompanionDevelopmentLock["unsupported_guards"];
  model: CompanionDevelopmentLock["model"];
  network: CompanionDevelopmentLock["network"];
  prompt: string;
}
