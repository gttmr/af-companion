import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizePlanBody,
  COMPANION_HANDOFF_CAPSULE_END,
  COMPANION_HANDOFF_CAPSULE_START,
  deliveryEligibility,
  type CompanionSession,
} from "./sessionContract.ts";

const NOW = new Date("2026-07-24T05:00:00.000Z");

function companionSession(overrides: Partial<CompanionSession> = {}): CompanionSession {
  return {
    session_id: "session-1",
    participation: "companion_active",
    workspace_eligibility: "factory",
    activation_origin: "af_cli_launch",
    hook_mode: "side_effect_gated",
    workspace_id: "workspace-1",
    application_id: "application-1",
    work_id: "work-1",
    role: "materialization",
    cwd: "/workspace/application-1",
    canonical_cwd_digest: "a".repeat(64),
    model: "gpt-5.6",
    permission_mode: "default",
    source: "startup",
    started_at: "2026-07-24T04:00:00.000Z",
    last_seen_at: "2026-07-24T04:59:00.000Z",
    last_event: "prompt_submit",
    last_turn_id: "turn-1",
    status: "active",
    alias: null,
    lease_id: "lease-1",
    lease_expires_at: "2026-07-24T05:30:00.000Z",
    revoked_at: null,
    revoke_reason: null,
    decision_input_mode: null,
    ...overrides,
  };
}

const scope = {
  workspace_id: "workspace-1",
  application_id: "application-1",
  work_id: "work-1",
  allowed_roles: ["materialization"] as const,
};

test("delivery requires an active enrolled session with an exact fresh scope", () => {
  assert.deepEqual(deliveryEligibility(companionSession(), { ...scope, allowed_roles: [...scope.allowed_roles] }, NOW), {
    allowed: true,
    reason: "eligible",
  });

  const rejected: Array<[Partial<CompanionSession>, string]> = [
    [{ participation: "revoked" }, "participation_inactive"],
    [{ status: "stale" }, "session_stale"],
    [{ lease_expires_at: NOW.toISOString() }, "lease_expired"],
    [{ workspace_id: "workspace-2" }, "workspace_mismatch"],
    [{ application_id: "application-2" }, "application_mismatch"],
    [{ work_id: "work-2" }, "work_mismatch"],
    [{ role: "plan" }, "role_not_allowed"],
  ];
  for (const [overrides, reason] of rejected) {
    assert.deepEqual(
      deliveryEligibility(companionSession(overrides), { ...scope, allowed_roles: [...scope.allowed_roles] }, NOW),
      { allowed: false, reason },
    );
  }
});

test("canonical Plan body normalizes newlines but rejects embedded activation metadata", () => {
  assert.equal(canonicalizePlanBody("\r\n# Plan\r\n\r\n1. Implement\r\n\r\n"), "# Plan\n\n1. Implement\n");
  assert.throws(() => canonicalizePlanBody("\n\n"), /must not be empty/);
  assert.throws(
    () => canonicalizePlanBody(`# Plan\n${COMPANION_HANDOFF_CAPSULE_START}\nsecret\n${COMPANION_HANDOFF_CAPSULE_END}`),
    /must not contain a Companion activation capsule/,
  );
});
