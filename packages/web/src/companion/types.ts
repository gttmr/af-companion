import type { AssetType, GraphChannel, GraphControlKind, NodeKind } from "../analyzer/types";
import type {
  ActivationOrigin,
  CompanionDeliveryScope,
  CompanionDiagnostics,
  CompanionHookMode,
  CompanionSession,
  CompanionSessionRole,
  HandoffTransportCapability,
  PlanHandoff as ScopedPlanHandoff,
  SessionEnrollmentTicket,
} from "./sessionContract";

export type {
  ActivationOrigin,
  CompanionDeliveryScope,
  CompanionDiagnostics,
  CompanionHookMode,
  CompanionSession,
  CompanionSessionRole,
  HandoffTransportCapability,
  SessionEnrollmentTicket,
} from "./sessionContract";

export const SELECTION_BUNDLE_SCHEMA_VERSION = 1 as const;

export interface SelectionSourceRevision {
  head: string | null;
  dirty_hash: string | null;
  graph_etag: string;
}

export interface SelectedGraphNode {
  kind: "graph_node";
  id: string;
  label: string;
  node_kind: NodeKind;
  artifact_ref: string | null;
  source_refs: string[];
}

export interface SelectionConnectingEdge {
  id: string;
  from: string;
  to: string;
  control_kind: GraphControlKind;
  channel: GraphChannel | null;
}

export interface SelectionRelatedAsset {
  asset_id: string;
  asset_type: AssetType;
  owner: string;
  domain_scope: string;
  binding_kind: string | null;
}

export interface SelectionBundleV1 {
  schema_version: typeof SELECTION_BUNDLE_SCHEMA_VERSION;
  selection_id: string;
  workspace_id: string;
  artifact_root_id: string;
  graph_id: string;
  source_revision: SelectionSourceRevision;
  selected_objects: SelectedGraphNode[];
  derived_context: {
    connecting_edges: SelectionConnectingEdge[];
    related_assets: SelectionRelatedAsset[];
  };
  user_intent: {
    text: string | null;
  };
  created_at: string;
  expires_at: string;
}

export type CodexSessionLastEvent =
  | "session_start"
  | "prompt_submit"
  | "tool_start"
  | "tool_end"
  | "turn_stop";

export type CodexActivityEvent = CodexSessionLastEvent | "session_handoff";

export interface CodexActivity {
  activity_id: string;
  session_id: string;
  turn_id: string | null;
  event: CodexActivityEvent;
  tool_name: string | null;
  work_id: string | null;
  handoff_id: string | null;
  at: string;
}

export type DeliveryStatus = "queued" | "consumed" | "expired" | "canceled" | "failed";

export interface ContextDelivery {
  delivery_id: string;
  selection_id: string;
  target_session_id: string;
  delivery_mode: "next_prompt";
  consume_policy: "once";
  status: DeliveryStatus;
  created_at: string;
  delivered_at: string | null;
  consumed_at: string | null;
  consumed_turn_id: string | null;
  error: string | null;
  bundle: SelectionBundleV1;
}

export interface CodexWorkspaceDescriptor {
  workspace_id: string;
  canonical_path: string;
  display_name: string;
}

export interface CodexEditorCapabilities {
  code_available: boolean;
  code_version: string | null;
  wsl_environment: boolean;
  codex_extension_installed: boolean;
  codex_extension_version: string | null;
  launch_supported: boolean;
  probed_at: string;
}

export interface VscodeLaunchReceipt {
  status: "accepted";
  workspace_path: string;
  launched_at: string;
}

export interface ScopedContextDelivery extends ContextDelivery {
  scope: CompanionDeliveryScope;
}

export interface CompanionBridgeCapabilitiesV2 {
  bridge_available: boolean;
  codex_version: string | null;
  hook_side_effect_isolation: boolean;
  strict_no_hook_mode: "verified" | "unverified" | "unsupported";
  session_enrollment: boolean;
  session_lease: boolean;
  next_prompt_context: boolean;
  session_end_event: "supported" | "unsupported";
  delivery_ack: boolean;
  direct_turn_start: boolean;
  inflight_steer: boolean;
  fresh_session_handoff: boolean;
  fresh_context_transport: HandoffTransportCapability;
  cli_environment_enrollment: "verified" | "unverified" | "unsupported";
  vscode_environment_enrollment: "verified" | "unverified" | "unsupported";
}

export interface CodexBridgeSnapshotV2 {
  schema_version: 2;
  bridge_instance_id: string;
  capabilities: CompanionBridgeCapabilitiesV2;
  enrollment_tickets: SessionEnrollmentTicket[];
  sessions: CompanionSession[];
  deliveries: ScopedContextDelivery[];
  handoffs: ScopedPlanHandoff[];
  activities: CodexActivity[];
  diagnostics: CompanionDiagnostics;
}

export interface CodexCompanionSnapshotV2 extends CodexBridgeSnapshotV2 {
  workspace: CodexWorkspaceDescriptor;
  editor: CodexEditorCapabilities;
}

export interface EnrollmentRequest {
  application_id: string;
  work_id: string;
  requested_role: CompanionSessionRole;
  activation_origin: Exclude<ActivationOrigin, "plan_handoff_capsule">;
  hook_mode?: CompanionHookMode;
  expires_at?: string;
}

export interface EnrollmentReceipt {
  ticket: SessionEnrollmentTicket;
  activation_capsule: string;
  command: string[];
}

export interface HandoffContinueReceipt {
  handoff: ScopedPlanHandoff;
  activation_capsule: string;
  command: string[];
}
