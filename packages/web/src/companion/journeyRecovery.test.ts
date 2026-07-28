import assert from "node:assert/strict";
import test from "node:test";

import type { CodexCompanionSnapshotV2 } from "./types.ts";
import {
  classifyJourneyRecovery,
  recoveryStateFromErrorCode,
  type JourneyRecoveryState,
} from "./journeyRecovery.ts";

const launchedAt = "2030-01-01T00:00:00.000Z";

test("maps stable API codes to every explicit recovery family", () => {
  const cases: Array<[string, JourneyRecoveryState]> = [
    ["bridge_unavailable", "bridge_down"],
    ["work_item_missing", "work_item_missing"],
    ["code_unavailable", "vscode_unavailable"],
    ["code_launch_failed", "vscode_launch_failed"],
    ["launch_cooldown", "launch_cooldown"],
    ["ticket_expired", "enrollment_expired"],
    ["invalid_activation", "activation_rejected"],
    ["canonical_handoff_stale", "stale_revision"],
    ["mcp_export_failed", "mcp_export_failed"],
  ];
  for (const [code, expected] of cases) assert.equal(recoveryStateFromErrorCode(code), expected);
  assert.equal(recoveryStateFromErrorCode("method_not_allowed"), null);
});

test("derives bridge, pending enrollment, missing prompt Hook, expiry, and ETag rejection from current observations", () => {
  const baseline = { ignored_hook_invocations: 2, invalid_activation_attempts: 3, expired_tickets: 4 };
  const observation = {
    errorCode: null,
    workId: "work-1",
    launchedAt,
    diagnosticBaseline: baseline,
    observedPendingTicket: true,
  };

  assert.equal(classifyJourneyRecovery({ ...observation, snapshot: snapshot({ bridgeAvailable: false }) }), "bridge_down");
  assert.equal(classifyJourneyRecovery({ ...observation, snapshot: snapshot({ pending: true, diagnostics: baseline }) }), "enrollment_unclaimed");
  assert.equal(classifyJourneyRecovery({ ...observation, snapshot: snapshot({ sessionWithoutPrompt: true, diagnostics: baseline }) }), "hook_not_observed");
  assert.equal(classifyJourneyRecovery({
    ...observation,
    snapshot: snapshot({ diagnostics: { ...baseline, expired_tickets: 5 } }),
  }), "enrollment_expired");
  assert.equal(classifyJourneyRecovery({
    ...observation,
    snapshot: snapshot({ diagnostics: { ...baseline, invalid_activation_attempts: 4 } }),
  }), "activation_rejected");
});

function snapshot(options: {
  bridgeAvailable?: boolean;
  pending?: boolean;
  sessionWithoutPrompt?: boolean;
  diagnostics?: CodexCompanionSnapshotV2["diagnostics"];
} = {}): CodexCompanionSnapshotV2 {
  return {
    schema_version: 2,
    bridge_instance_id: "bridge-1",
    capabilities: {
      bridge_available: options.bridgeAvailable ?? true,
      codex_version: "test",
      hook_side_effect_isolation: true,
      strict_no_hook_mode: "verified",
      session_enrollment: true,
      session_lease: true,
      next_prompt_context: true,
      session_end_event: "unsupported",
      delivery_ack: false,
      direct_turn_start: false,
      inflight_steer: false,
      fresh_session_handoff: true,
      materialization_bootstrap_grant: true,
      fresh_context_transport: "client_dependent",
      cli_environment_enrollment: "verified",
      vscode_environment_enrollment: "verified",
    },
    enrollment_tickets: options.pending ? [{
      ticket_id: "ticket-1",
      workspace_eligibility: "factory",
      workspace_id: "workspace-1",
      application_id: "app-1",
      work_id: "work-1",
      requested_role: "plan",
      activation_origin: "af_vscode_launch",
      canonical_cwd_digest: "a".repeat(64),
      issued_at: launchedAt,
      expires_at: "2030-01-01T00:05:00.000Z",
      status: "pending",
      claimed_by_session_id: null,
      claimed_at: null,
    }] : [],
    sessions: options.sessionWithoutPrompt ? [{
      session_id: "session-1",
      participation: "companion_active",
      workspace_eligibility: "factory",
      activation_origin: "af_vscode_launch",
      hook_mode: "side_effect_gated",
      workspace_id: "workspace-1",
      application_id: "app-1",
      work_id: "work-1",
      role: "plan",
      cwd: "/factory",
      canonical_cwd_digest: "a".repeat(64),
      model: "test",
      permission_mode: "default",
      source: "startup",
      started_at: launchedAt,
      last_seen_at: launchedAt,
      last_event: "session_start",
      last_turn_id: null,
      status: "active",
      alias: null,
      lease_id: "lease-1",
      lease_expires_at: "2030-01-01T08:00:00.000Z",
      revoked_at: null,
      revoke_reason: null,
      decision_input_mode: null,
    }] : [],
    deliveries: [],
    handoffs: [],
    materialization_grants: [],
    activities: [],
    diagnostics: options.diagnostics ?? { ignored_hook_invocations: 0, invalid_activation_attempts: 0, expired_tickets: 0 },
    workspace: { workspace_id: "workspace-1", canonical_path: "/factory", display_name: "factory" },
    editor: {
      code_available: true,
      code_version: "1.0.0",
      wsl_environment: true,
      codex_extension_installed: true,
      codex_extension_version: "1.0.0",
      launch_supported: true,
      probed_at: launchedAt,
    },
  };
}
