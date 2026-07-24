export const COMPANION_SESSION_CONTRACT_VERSION = 2 as const;

export const COMPANION_ENROLLMENT_ENV = "AF_COMPANION_ENROLLMENT" as const;
export const COMPANION_STATE_RELATIVE_DIR = ".agent-factory/codex-bridge/v2" as const;
export const COMPANION_LEASE_RELATIVE_DIR = `${COMPANION_STATE_RELATIVE_DIR}/leases` as const;

export const COMPANION_ENROLLMENT_CAPSULE_START = "[AF_COMPANION_ENROLLMENT_V2]" as const;
export const COMPANION_ENROLLMENT_CAPSULE_END = "[/AF_COMPANION_ENROLLMENT_V2]" as const;
export const COMPANION_HANDOFF_CAPSULE_START = "[AF_COMPANION_HANDOFF_V2]" as const;
export const COMPANION_HANDOFF_CAPSULE_END = "[/AF_COMPANION_HANDOFF_V2]" as const;

export type WorkspaceEligibility = "factory" | "registered_application" | "unregistered";
export type SessionParticipation =
  | "unmanaged"
  | "pending_activation"
  | "companion_active"
  | "revoked"
  | "expired";
export type CompanionSessionParticipation = Exclude<SessionParticipation, "unmanaged" | "pending_activation">;
export type WorkAttachment = "unattached" | "plan" | "materialization";
export type CompanionSessionRole = Exclude<WorkAttachment, "unattached">;
export type ActivationOrigin =
  | "af_cli_launch"
  | "af_vscode_launch"
  | "plan_handoff_capsule"
  | "explicit_join_capsule"
  | "manual_attach_confirmed";
export type CompanionHookMode = "side_effect_gated" | "strict_profile";
export type CompanionSessionStatus = "active" | "stale";
export type EnrollmentTicketStatus = "pending" | "claimed" | "expired" | "revoked";
export type HandoffTransportCapability =
  | "preserved"
  | "preserved_with_normalization"
  | "stripped"
  | "client_dependent"
  | "unverified";
export type PlanHandoffStatus =
  | "ready"
  | "waiting_for_fresh_session"
  | "claimed"
  | "expired"
  | "superseded"
  | "failed"
  | "canceled";
export type DecisionInputMode = "structured" | "conversational";

export interface CompanionScope {
  workspace_id: string;
  application_id: string;
  work_id: string;
  role: CompanionSessionRole;
}

export interface SessionEnrollmentTicket {
  ticket_id: string;
  workspace_eligibility: Exclude<WorkspaceEligibility, "unregistered">;
  workspace_id: string;
  application_id: string;
  work_id: string;
  requested_role: CompanionSessionRole;
  activation_origin: Exclude<ActivationOrigin, "plan_handoff_capsule">;
  canonical_cwd_digest: string;
  issued_at: string;
  expires_at: string;
  status: EnrollmentTicketStatus;
  claimed_by_session_id: string | null;
  claimed_at: string | null;
}

/** Internal local-state record. Secrets are represented only by digests. */
export interface SessionEnrollmentTicketRecord extends SessionEnrollmentTicket {
  nonce_digest: string;
  claim_token_digest: string;
}

export interface EnrollmentLaunchReceipt {
  ticket: SessionEnrollmentTicket;
  activation_capsule: string;
  command: string[];
}

/** One per enrolled session, stored only under the ignored local v2 lease directory. */
export interface CompanionSessionLease {
  schema_version: typeof COMPANION_SESSION_CONTRACT_VERSION;
  lease_id: string;
  lease_token: string;
  bridge_instance_id: string;
  session_id: string;
  canonical_cwd_digest: string;
  workspace_id: string;
  application_id: string;
  work_id: string;
  role: CompanionSessionRole;
  activation_origin: ActivationOrigin;
  issued_at: string;
  expires_at: string;
}

export interface LeaseHookProof {
  kind: "lease";
  lease_id: string;
  lease_token: string;
}

export interface ActivationHookProof {
  kind: "activation";
  activation_capsule: string;
}

export type CompanionHookProof = LeaseHookProof | ActivationHookProof;

export interface CompanionSession {
  session_id: string;
  participation: CompanionSessionParticipation;
  workspace_eligibility: Exclude<WorkspaceEligibility, "unregistered">;
  activation_origin: ActivationOrigin;
  hook_mode: CompanionHookMode;
  workspace_id: string;
  application_id: string;
  work_id: string;
  role: CompanionSessionRole;
  cwd: string;
  canonical_cwd_digest: string;
  model: string;
  permission_mode: string;
  source: string;
  started_at: string;
  last_seen_at: string;
  last_event: "session_start" | "prompt_submit" | "tool_start" | "tool_end" | "turn_stop";
  last_turn_id: string | null;
  status: CompanionSessionStatus;
  alias: string | null;
  lease_id: string;
  lease_expires_at: string;
  revoked_at: string | null;
  revoke_reason: string | null;
  decision_input_mode: DecisionInputMode | null;
}

export interface CompanionDeliveryScope {
  workspace_id: string;
  application_id: string;
  work_id: string;
  allowed_roles: CompanionSessionRole[];
}

export interface PlanHandoff {
  handoff_id: string;
  workspace_id: string;
  application_id: string;
  work_id: string;
  from_session_id: string;
  from_turn_id: string;
  discovery_revision: string;
  decision_revision: string;
  plan_body_hash: string;
  capsule_digest: string | null;
  target_skill: "af-discover-assets.materialize";
  transport_capability: HandoffTransportCapability;
  status: PlanHandoffStatus;
  created_at: string;
  expires_at: string;
  claimed_by_session_id: string | null;
  claimed_by_turn_id: string | null;
  claimed_at: string | null;
  failure_code: string | null;
}

export interface CompanionDiagnostics {
  ignored_hook_invocations: number;
  invalid_activation_attempts: number;
  expired_tickets: number;
}

export interface DeliveryEligibility {
  allowed: boolean;
  reason:
    | "eligible"
    | "participation_inactive"
    | "session_stale"
    | "lease_expired"
    | "workspace_mismatch"
    | "application_mismatch"
    | "work_mismatch"
    | "role_not_allowed";
}

/**
 * Delivery is an intersection of participation, lease freshness, and exact scope.
 * Callers must still validate the current bundle revision before queueing.
 */
export function deliveryEligibility(
  session: CompanionSession,
  scope: CompanionDeliveryScope,
  now: Date,
): DeliveryEligibility {
  if (session.participation !== "companion_active") {
    return { allowed: false, reason: "participation_inactive" };
  }
  if (session.status !== "active") return { allowed: false, reason: "session_stale" };
  if (Date.parse(session.lease_expires_at) <= now.getTime()) {
    return { allowed: false, reason: "lease_expired" };
  }
  if (session.workspace_id !== scope.workspace_id) {
    return { allowed: false, reason: "workspace_mismatch" };
  }
  if (session.application_id !== scope.application_id) {
    return { allowed: false, reason: "application_mismatch" };
  }
  if (session.work_id !== scope.work_id) return { allowed: false, reason: "work_mismatch" };
  if (!scope.allowed_roles.includes(session.role)) {
    return { allowed: false, reason: "role_not_allowed" };
  }
  return { allowed: true, reason: "eligible" };
}

/**
 * Defines the bytes hashed as the Plan body. Capsules are separate metadata and
 * are rejected here so a caller cannot accidentally bind a claim token into the hash.
 */
export function canonicalizePlanBody(value: string): string {
  const normalized = value.replace(/\r\n?/g, "\n");
  if (
    normalized.includes(COMPANION_HANDOFF_CAPSULE_START)
    || normalized.includes(COMPANION_HANDOFF_CAPSULE_END)
    || normalized.includes(COMPANION_ENROLLMENT_CAPSULE_START)
    || normalized.includes(COMPANION_ENROLLMENT_CAPSULE_END)
  ) {
    throw new Error("Plan body must not contain a Companion activation capsule");
  }
  const lines = normalized.split("\n");
  while (lines[0] === "") lines.shift();
  while (lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0) throw new Error("Plan body must not be empty");
  return `${lines.join("\n")}\n`;
}
