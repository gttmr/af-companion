import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseAfWorkItemManifest, serializeAfWorkItemManifest } from "../src/analyzer/afWorkItem.ts";
import type { CompanionHookProof } from "../src/companion/sessionContract.ts";
import type { SelectionBundleV1 } from "../src/companion/types.ts";
import {
  TEST_DECISION_REVISION,
  TEST_DISCOVERY_REVISION,
  TEST_HANDOFF_ID,
  TEST_MARKER_DIGEST,
  TEST_PLAN_BODY,
  TEST_PLAN_HASH,
  TEST_SOURCE_REVISION,
  writeCompanionWorkItems,
} from "./companionTestFixtures.ts";
import {
  ATTACH_CONFIRMATION,
  CONTINUE_CONFIRMATION,
  CodexBridgeStore,
  REVOKE_CONFIRMATION,
  validateAttachSessionInput,
  validateCodexHookInput,
  validateContinueHandoffInput,
  validateCreateDeliveryInput,
  validateCreateEnrollmentInput,
  validateCreateMaterializationGrantInput,
  validateCreatePlanHandoffInput,
  validateRevokeSessionInput,
} from "./codexBridgeStore.ts";

const DISCOVERY = TEST_DISCOVERY_REVISION;
const DECISIONS = TEST_DECISION_REVISION;
const PLAN = TEST_PLAN_HASH;

function planHandoffRequest(store: CodexBridgeStore, overrides: Record<string, unknown> = {}) {
  return validateCreatePlanHandoffInput({
    handoff_id: TEST_HANDOFF_ID,
    marker_digest: TEST_MARKER_DIGEST,
    workspace_id: store.workspaceId,
    application_id: "app-1",
    work_id: "work-plan",
    from_session_id: "plan-session",
    from_turn_id: "plan-turn",
    discovery_revision: DISCOVERY,
    decision_revision: DECISIONS,
    plan_body_hash: PLAN,
    plan_body: TEST_PLAN_BODY,
    transport_capability: "client_dependent",
    expires_at: "2030-01-01T00:10:00.000Z",
    ...overrides,
  });
}

function materializationGrantRequest(overrides: Record<string, unknown> = {}) {
  return validateCreateMaterializationGrantInput({
    work_id: "work-1",
    from_session_id: "bootstrap-plan-session",
    from_turn_id: "bootstrap-plan-turn",
    plan_body_hash: PLAN,
    plan_body: TEST_PLAN_BODY,
    expires_at: "2030-01-01T00:10:00.000Z",
    ...overrides,
  });
}

async function fixture(t: test.TestContext, options: { sessionTtlMs?: number } = {}) {
  const root = await mkdtemp(join(tmpdir(), "af-bridge-v2-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeCompanionWorkItems(root);
  let nowMs = Date.parse("2030-01-01T00:00:00.000Z");
  let currentSourceRevision = structuredClone(TEST_SOURCE_REVISION);
  const now = () => new Date(nowMs);
  return {
    root,
    now,
    advance(ms: number) { nowMs += ms; },
    setCurrentSourceRevision(revision: typeof TEST_SOURCE_REVISION) { currentSourceRevision = structuredClone(revision); },
    store: await CodexBridgeStore.open(root, {
      now,
      sessionTtlMs: options.sessionTtlMs,
      enrollmentTtlMs: 1_000,
      leaseTtlMs: 2 * 60 * 60 * 1_000,
      readCurrentSourceRevision: async () => structuredClone(currentSourceRevision),
    }),
  };
}

function hook(
  event: "SessionStart" | "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "Stop",
  sessionId: string,
  cwd: string,
  proof?: CompanionHookProof,
  options: { turn?: string; permission?: string; agentId?: string } = {},
) {
  return validateCodexHookInput({
    session_id: sessionId,
    transcript_path: "/private/transcript.jsonl",
    cwd,
    hook_event_name: event,
    model: "gpt-5.6",
    permission_mode: options.permission ?? "default",
    ...(event === "SessionStart" ? { source: "startup" } : { turn_id: options.turn ?? "turn-1" }),
    ...(event === "PreToolUse" || event === "PostToolUse" ? { tool_name: "apply_patch", tool_input: "SECRET TOOL INPUT" } : {}),
    ...(options.agentId ? { agent_id: options.agentId } : {}),
    ...(proof ? { companion_proof: proof } : {}),
    prompt: "SECRET PROMPT",
    tool_response: "SECRET TOOL OUTPUT",
  });
}

async function enroll(
  store: CodexBridgeStore,
  root: string,
  sessionId: string,
  role: "plan" | "materialization" = "materialization",
  workId = "work-1",
  applicationId = "app-1",
  permission = role === "plan" ? "plan" : "default",
) {
  const receipt = await store.createEnrollment(validateCreateEnrollmentInput({
    application_id: applicationId,
    work_id: workId,
    requested_role: role,
    activation_origin: "af_cli_launch",
    hook_mode: "side_effect_gated",
  }));
  const activation: CompanionHookProof = { kind: "activation", activation_capsule: receipt.activation_capsule };
  await store.handleHook(hook("SessionStart", sessionId, root, activation, { permission }));
  return { receipt, lease: await store.leaseProofForTesting(sessionId) };
}

function bundle(workspaceId: string, workId = "work-1", graphEtag = "etag-1"): SelectionBundleV1 {
  return {
    schema_version: 1,
    selection_id: "selection-1",
    workspace_id: workspaceId,
    artifact_root_id: `artifacts/af/${workId}`,
    graph_id: "graph-1",
    source_revision: { head: "abc123", dirty_hash: null, graph_etag: graphEtag },
    selected_objects: [{ kind: "graph_node", id: "node-1", label: "Review", node_kind: "agent", artifact_ref: null, source_refs: [] }],
    derived_context: { connecting_edges: [], related_assets: [] },
    user_intent: { text: null },
    created_at: "2030-01-01T00:00:00.000Z",
    expires_at: "2030-01-01T00:30:00.000Z",
  };
}

function delivery(store: CodexBridgeStore, overrides: Record<string, unknown> = {}) {
  const selection = bundle(store.workspaceId);
  return validateCreateDeliveryInput({
    target_session_id: "session-1",
    delivery_mode: "next_prompt",
    consume_policy: "once",
    scope: { workspace_id: store.workspaceId, application_id: "app-1", work_id: "work-1", allowed_roles: ["materialization"] },
    current_role: "materialization",
    current_source_revision: selection.source_revision,
    bundle: selection,
    ...overrides,
  });
}

async function driftCanonicalDecisionRevision(root: string): Promise<void> {
  const path = join(root, "artifacts", "af", "work-plan", "af-work-item.json");
  const manifest = parseAfWorkItemManifest(await readFile(path, "utf8"));
  manifest.revisions.decision = {
    digest: "e".repeat(64),
    subjects: [{ ref: "af-work-item.json#decisions", sha256: "e".repeat(64) }],
    registry_revision: null,
  };
  await writeFile(path, serializeAfWorkItemManifest(manifest), "utf8");
}

test("enrollment rejects a missing canonical Work Item", async (t) => {
  const { store } = await fixture(t);
  await assert.rejects(store.createEnrollment(validateCreateEnrollmentInput({
    application_id: "app-1",
    work_id: "missing-work",
    requested_role: "materialization",
    activation_origin: "af_cli_launch",
  })), /Work Item/i);
});

test("enrollment activation rechecks the exact canonical Work Item", async (t) => {
  const { root, store } = await fixture(t);
  const ticket = await store.createEnrollment(validateCreateEnrollmentInput({
    application_id: "app-1",
    work_id: "work-1",
    requested_role: "materialization",
    activation_origin: "af_cli_launch",
  }));
  await rm(join(root, "artifacts", "af", "work-1", "af-work-item.json"));

  assert.equal(await store.handleHook(hook("SessionStart", "phantom-session", root, {
    kind: "activation",
    activation_capsule: ticket.activation_capsule,
  })), null);
  assert.deepEqual((await store.snapshot()).sessions, []);
});

test("enrollment activation rejects a valid Work Item changed after ticket issuance", async (t) => {
  const { root, store } = await fixture(t);
  const ticket = await store.createEnrollment(validateCreateEnrollmentInput({
    application_id: "app-1",
    work_id: "work-1",
    requested_role: "materialization",
    activation_origin: "af_cli_launch",
  }));
  const path = join(root, "artifacts", "af", "work-1", "af-work-item.json");
  const manifest = parseAfWorkItemManifest(await readFile(path, "utf8"));
  manifest.ledger_revision += 1;
  await writeFile(path, serializeAfWorkItemManifest(manifest), "utf8");

  assert.equal(await store.handleHook(hook("SessionStart", "stale-ticket-session", root, {
    kind: "activation",
    activation_capsule: ticket.activation_capsule,
  })), null);
  const snapshot = await store.snapshot();
  assert.deepEqual(snapshot.sessions, []);
  const persisted = JSON.parse(await readFile(store.statePath, "utf8"));
  assert.equal(persisted.enrollment_tickets[0].status, "revoked");
});

function rewriteCapsule(raw: string, mutate: (payload: Record<string, unknown>) => void): string {
  const lines = raw.split("\n");
  const payload = JSON.parse(Buffer.from(lines[1], "base64url").toString("utf8"));
  mutate(payload);
  lines[1] = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return lines.join("\n");
}

test("negative: unmanaged lifecycle Hooks create no durable session, activity, or receipt", async (t) => {
  const { root, store } = await fixture(t);
  const before = await readFile(store.statePath, "utf8");
  for (const event of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"] as const) {
    assert.equal(await store.handleHook(hook(event, "unmanaged", root)), null);
  }
  const snapshot = await store.snapshot();
  assert.deepEqual(snapshot.sessions, []);
  assert.deepEqual(snapshot.activities, []);
  const persisted = JSON.parse(await readFile(store.statePath, "utf8"));
  assert.deepEqual(persisted.prompt_receipts, []);
  assert.doesNotMatch(JSON.stringify(persisted), /SECRET PROMPT|SECRET TOOL|transcript/);
  assert.equal(JSON.parse(before).sessions.length, 0);
  assert.equal(snapshot.diagnostics.ignored_hook_invocations, 5);
});

test("negative: forged, replayed, expired, and cross-scope tickets cannot enroll", async (t) => {
  const clock = await fixture(t);
  const ticket = await clock.store.createEnrollment(validateCreateEnrollmentInput({
    application_id: "app-1", work_id: "work-1", requested_role: "materialization", activation_origin: "af_cli_launch",
  }));
  for (const [name, capsule] of [
    ["forged", rewriteCapsule(ticket.activation_capsule, (value) => { value.claim_token = "forged"; })],
    ["workspace", rewriteCapsule(ticket.activation_capsule, (value) => { value.workspace_id = "workspace-other"; })],
    ["application", rewriteCapsule(ticket.activation_capsule, (value) => { value.application_id = "app-other"; })],
    ["work", rewriteCapsule(ticket.activation_capsule, (value) => { value.work_id = "work-other"; })],
    ["role", rewriteCapsule(ticket.activation_capsule, (value) => { value.role = "plan"; })],
  ] as const) {
    await clock.store.handleHook(hook("SessionStart", name, clock.root, { kind: "activation", activation_capsule: capsule }));
  }
  assert.deepEqual((await clock.store.snapshot()).sessions, []);

  await clock.store.handleHook(hook("SessionStart", "claimed", clock.root, { kind: "activation", activation_capsule: ticket.activation_capsule }));
  await clock.store.handleHook(hook("SessionStart", "replay", clock.root, { kind: "activation", activation_capsule: ticket.activation_capsule }));
  assert.deepEqual((await clock.store.snapshot()).sessions.map((session) => session.session_id), ["claimed"]);

  const expiring = await clock.store.createEnrollment(validateCreateEnrollmentInput({
    application_id: "app-1", work_id: "work-2", requested_role: "materialization", activation_origin: "af_cli_launch",
    expires_at: "2030-01-01T00:00:00.500Z",
  }));
  clock.advance(501);
  await clock.store.handleHook(hook("SessionStart", "expired", clock.root, { kind: "activation", activation_capsule: expiring.activation_capsule }));
  const snapshot = await clock.store.snapshot();
  assert.equal(snapshot.sessions.some((session) => session.session_id === "expired"), false);
  assert.equal(snapshot.enrollment_tickets.some((item) => item.ticket_id === expiring.ticket.ticket_id), false);
  assert.equal(snapshot.diagnostics.expired_tickets, 1);
});

test("negative: enrollment activation on a subagent prompt never creates a top-level session", async (t) => {
  const { root, store } = await fixture(t);
  const ticket = await store.createEnrollment(validateCreateEnrollmentInput({
    application_id: "app-1", work_id: "work-1", requested_role: "materialization", activation_origin: "af_cli_launch",
  }));
  const proof = { kind: "activation" as const, activation_capsule: ticket.activation_capsule };
  assert.equal(await store.handleHook(hook("UserPromptSubmit", "subagent-session", root, proof, { turn: "sub-turn", agentId: "child-agent" })), null);
  assert.deepEqual((await store.snapshot()).sessions, []);
  assert.equal((await store.snapshot()).enrollment_tickets[0].status, "pending");
});

test("one-time activation creates an exact 0600 lease and only that lease can update or consume", async (t) => {
  const { root, store } = await fixture(t);
  const { lease } = await enroll(store, root, "session-1");
  const leasePath = join(store.leaseDir, `${createHash("sha256").update("session-1").digest("hex")}.json`);
  assert.equal((await lstat(leasePath)).mode & 0o777, 0o600);

  const forged = { ...lease, lease_token: "forged" };
  await store.handleHook(hook("UserPromptSubmit", "session-1", root, forged, { turn: "forged-turn" }));
  assert.equal((await store.snapshot()).sessions[0].last_turn_id, null);
  await store.handleHook(hook("UserPromptSubmit", "session-1", root, lease, { turn: "valid-turn" }));
  assert.equal((await store.snapshot()).sessions[0].last_turn_id, "valid-turn");

  const outside = await mkdtemp(join(tmpdir(), "af-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await assert.rejects(store.handleHook(hook("UserPromptSubmit", "session-1", outside, lease)), /inside the repository/);
  const persisted = await readFile(store.statePath, "utf8");
  assert.doesNotMatch(persisted, new RegExp(lease.lease_token));
  assert.doesNotMatch(persisted, /SECRET PROMPT|SECRET TOOL|transcript_path/);
  assert.deepEqual((await store.snapshot()).enrollment_tickets, [], "claimed ticket history is not public snapshot state");
});

test("VS Code lifecycle plan attachment consumes context when Codex permission mode is not plan", async (t) => {
  const { root, store } = await fixture(t);
  const ticket = await store.createEnrollment(validateCreateEnrollmentInput({
    application_id: "app-1",
    work_id: "work-1",
    requested_role: "plan",
    activation_origin: "af_vscode_launch",
  }));
  const activation = { kind: "activation" as const, activation_capsule: ticket.activation_capsule };
  await store.handleHook(hook("SessionStart", "vscode-default-session", root, activation, {
    permission: "bypassPermissions",
  }));

  const lease = await store.leaseProofForTesting("vscode-default-session");
  const selection = bundle(store.workspaceId);
  await store.createDelivery(validateCreateDeliveryInput({
    target_session_id: "vscode-default-session",
    delivery_mode: "next_prompt",
    consume_policy: "once",
    scope: {
      workspace_id: store.workspaceId,
      application_id: "app-1",
      work_id: "work-1",
      allowed_roles: ["plan"],
    },
    current_role: "plan",
    current_source_revision: selection.source_revision,
    bundle: selection,
  }));

  const output = await store.handleHook(hook(
    "UserPromptSubmit",
    "vscode-default-session",
    root,
    lease,
    { turn: "default-mode-prompt", permission: "bypassPermissions" },
  ));
  const [session] = (await store.snapshot()).sessions;
  assert.equal(session.activation_origin, "af_vscode_launch");
  assert.equal(session.role, "plan", "role is the lifecycle attachment, not the Codex collaboration mode");
  assert.equal(session.permission_mode, "bypassPermissions");
  assert.equal(session.last_turn_id, "default-mode-prompt");
  assert.match(output?.hookSpecificOutput.additionalContext ?? "", /selection-1/);
});

test("negative: delivery fails closed for workspace, application, work, role, revision, stale, and revoked scope", async (t) => {
  const clock = await fixture(t);
  const { lease } = await enroll(clock.store, clock.root, "session-1");
  const base = delivery(clock.store);
  for (const candidate of [
    { ...base, scope: { ...base.scope, workspace_id: "workspace-other" } },
    { ...base, scope: { ...base.scope, application_id: "app-other" } },
    { ...base, scope: { ...base.scope, work_id: "work-other" } },
    { ...base, current_role: "plan" as const },
    { ...base, current_source_revision: { ...base.current_source_revision, graph_etag: "stale" } },
  ]) await assert.rejects(clock.store.createDelivery(candidate), /delivery rejected|role|scope|revision|Work Item/i);

  clock.setCurrentSourceRevision({ ...TEST_SOURCE_REVISION, graph_etag: "canonical-new-etag" });
  await assert.rejects(clock.store.createDelivery(base), /canonical source revision is stale/i);
  clock.setCurrentSourceRevision(TEST_SOURCE_REVISION);

  const queued = await clock.store.createDelivery(base);
  assert.equal(queued.bundle.schema_version, 1);
  const output = await clock.store.handleHook(hook("UserPromptSubmit", "session-1", clock.root, lease, { turn: "consume" }));
  assert.match(output?.hookSpecificOutput.additionalContext ?? "", /selection-1/);

  clock.advance(30 * 60 * 1_000 + 1);
  await assert.rejects(clock.store.createDelivery(delivery(clock.store)), /session_stale/);
  await clock.store.revokeSession("session-1", validateRevokeSessionInput({ confirmation: REVOKE_CONFIRMATION, reason: "user requested" }));
  await assert.rejects(clock.store.createDelivery(delivery(clock.store)), /lease is missing, invalid, or expired|participation_inactive/);
  assert.equal((await lstat(join(clock.store.leaseDir, `${createHash("sha256").update("session-1").digest("hex")}.json`)).catch(() => null)), null);
});

test("queued delivery rechecks the canonical source revision at consume time", async (t) => {
  const clock = await fixture(t);
  const { lease } = await enroll(clock.store, clock.root, "session-1");
  await clock.store.createDelivery(delivery(clock.store));
  clock.setCurrentSourceRevision({ ...TEST_SOURCE_REVISION, graph_etag: "changed-after-queue" });

  assert.equal(
    await clock.store.handleHook(hook("UserPromptSubmit", "session-1", clock.root, lease, { turn: "stale-consume" })),
    null,
  );
  const [queued] = (await clock.store.snapshot()).deliveries;
  assert.equal(queued.status, "failed");
  assert.equal(queued.error, "stale_revision");
});

test("negative: delivery and handoff creation revalidate deleted or scope-tampered lease files", async (t) => {
  const deliveryClock = await fixture(t);
  await enroll(deliveryClock.store, deliveryClock.root, "session-1");
  const deliveryLeasePath = join(deliveryClock.store.leaseDir, `${createHash("sha256").update("session-1").digest("hex")}.json`);
  const leaseValue = JSON.parse(await readFile(deliveryLeasePath, "utf8"));
  leaseValue.workspace_id = "workspace-tampered";
  await writeFile(deliveryLeasePath, `${JSON.stringify(leaseValue)}\n`, { mode: 0o600 });
  await assert.rejects(deliveryClock.store.createDelivery(delivery(deliveryClock.store)), /lease is missing, invalid, or expired/);

  const handoffClock = await fixture(t);
  const { lease } = await enroll(handoffClock.store, handoffClock.root, "plan-session", "plan", "work-plan");
  await handoffClock.store.handleHook(hook("UserPromptSubmit", "plan-session", handoffClock.root, lease, { turn: "plan-turn", permission: "plan" }));
  const handoffRequest = planHandoffRequest(handoffClock.store);
  const created = await handoffClock.store.createPlanHandoff(handoffRequest);
  await assert.rejects(handoffClock.store.createPlanHandoff(handoffRequest), /already exists/);
  await rm(join(handoffClock.store.leaseDir, `${createHash("sha256").update("plan-session").digest("hex")}.json`));
  await assert.rejects(handoffClock.store.createPlanHandoff(handoffRequest), /lease is missing, invalid, or expired/);
  await assert.rejects(handoffClock.store.continueHandoff(created.handoff_id, validateContinueHandoffInput({ confirmation: CONTINUE_CONFIRMATION })), /lease is missing, invalid, or expired/);
});

test("materialization bootstrap grant resumes after Bridge restart and claims exactly one fresh session", async (t) => {
  const clock = await fixture(t);
  const { lease } = await enroll(
    clock.store,
    clock.root,
    "bootstrap-plan-session",
    "plan",
    "work-1",
  );
  await clock.store.handleHook(hook(
    "UserPromptSubmit",
    "bootstrap-plan-session",
    clock.root,
    lease,
    { turn: "bootstrap-plan-turn", permission: "plan" },
  ));

  const created = await clock.store.createMaterializationGrant(materializationGrantRequest());
  assert.equal(created.grant.status, "ready");
  assert.match(created.portable_marker, new RegExp(`AF_MATERIALIZATION_GRANT=${created.grant.grant_id}`));
  assert.equal(JSON.stringify(created).includes(TEST_PLAN_BODY), false);
  assert.equal(JSON.stringify(await clock.store.snapshot()).includes(TEST_PLAN_BODY), false);
  const localState = await readFile(clock.store.statePath, "utf8");
  assert.equal(
    JSON.parse(localState).materialization_grants[0].plan_body,
    TEST_PLAN_BODY,
    "the local-only 0600 state carries the resumable Plan",
  );
  assert.equal((await lstat(clock.store.statePath)).mode & 0o777, 0o600);

  const first = await clock.store.continueMaterializationGrant(
    created.grant.grant_id,
    validateContinueHandoffInput({ confirmation: CONTINUE_CONFIRMATION }),
  );
  const restarted = await CodexBridgeStore.open(clock.root, { now: clock.now });
  assert.equal((await restarted.snapshot()).materialization_grants[0].status, "waiting_for_fresh_session");
  const rotated = await restarted.continueMaterializationGrant(
    created.grant.grant_id,
    validateContinueHandoffInput({ confirmation: CONTINUE_CONFIRMATION }),
  );
  assert.notEqual(first.activation_capsule, rotated.activation_capsule);

  assert.equal(await restarted.handleHook(hook(
    "UserPromptSubmit",
    "old-bootstrap-target",
    clock.root,
    { kind: "activation", activation_capsule: first.activation_capsule },
    { turn: "old-bootstrap-turn" },
  )), null);
  const proof = { kind: "activation" as const, activation_capsule: rotated.activation_capsule };
  const claimed = await restarted.handleHook(hook(
    "UserPromptSubmit",
    "fresh-bootstrap-target",
    clock.root,
    proof,
    { turn: "fresh-bootstrap-turn" },
  ));
  const context = claimed?.hookSpecificOutput.additionalContext ?? "";
  assert.match(context, /materialization bootstrap was claimed/);
  for (const expected of [
    `Grant: ${created.grant.grant_id}`,
    "Source Plan session: bootstrap-plan-session",
    "Source Plan turn: bootstrap-plan-turn",
    `Bootstrap Work Item ETag: ${created.grant.bootstrap_work_item_etag}`,
    `Plan body hash: ${created.grant.plan_body_hash}`,
    `Marker digest: ${created.grant.marker_digest}`,
    `Grant created at: ${created.grant.created_at}`,
    `Grant expires at: ${created.grant.expires_at}`,
    "Claim session: fresh-bootstrap-target",
    "Claim turn: fresh-bootstrap-turn",
    `Claimed at: ${clock.now().toISOString()}`,
    TEST_PLAN_BODY,
  ]) assert.ok(context.includes(expected), `claim context must include ${expected}`);
  assert.equal(await restarted.handleHook(hook(
    "UserPromptSubmit",
    "bootstrap-replay",
    clock.root,
    proof,
    { turn: "bootstrap-replay-turn" },
  )), null);
  const snapshot = await restarted.snapshot();
  assert.equal(snapshot.materialization_grants[0].status, "claimed");
  assert.equal(snapshot.materialization_grants[0].claimed_by_session_id, "fresh-bootstrap-target");
  assert.equal(Object.hasOwn(snapshot.materialization_grants[0], "plan_body"), false);
  assert.equal(Object.hasOwn(snapshot.materialization_grants[0], "claim_token_digest"), false);
  assert.equal(snapshot.sessions.filter((session) => session.role === "materialization").length, 1);
  const persisted = JSON.parse(await readFile(restarted.statePath, "utf8")).materialization_grants[0];
  assert.equal(persisted.plan_body, null);
  assert.equal(persisted.claim_token_digest, null);
});

test("materialization bootstrap requires a pristine unchanged Work Item and the latest Plan turn", async (t) => {
  const clock = await fixture(t);
  const { lease } = await enroll(
    clock.store,
    clock.root,
    "bootstrap-plan-session",
    "plan",
    "work-1",
  );
  await clock.store.handleHook(hook(
    "UserPromptSubmit",
    "bootstrap-plan-session",
    clock.root,
    lease,
    { turn: "bootstrap-plan-turn", permission: "plan" },
  ));
  const created = await clock.store.createMaterializationGrant(materializationGrantRequest());
  const path = join(clock.root, "artifacts", "af", "work-1", "af-work-item.json");
  const manifest = parseAfWorkItemManifest(await readFile(path, "utf8"));
  manifest.ledger_revision += 1;
  await writeFile(path, serializeAfWorkItemManifest(manifest), "utf8");
  await assert.rejects(
    clock.store.continueMaterializationGrant(
      created.grant.grant_id,
      validateContinueHandoffInput({ confirmation: CONTINUE_CONFIRMATION }),
    ),
    /expired or no longer matches/,
  );
  let snapshot = await clock.store.snapshot();
  assert.equal(snapshot.materialization_grants[0].status, "failed");
  assert.equal(snapshot.materialization_grants[0].failure_code, "work_item_changed");

  const secondClock = await fixture(t);
  const second = await enroll(
    secondClock.store,
    secondClock.root,
    "bootstrap-plan-session",
    "plan",
    "work-1",
  );
  await secondClock.store.handleHook(hook(
    "UserPromptSubmit",
    "bootstrap-plan-session",
    secondClock.root,
    second.lease,
    { turn: "bootstrap-plan-turn", permission: "plan" },
  ));
  await secondClock.store.createMaterializationGrant(materializationGrantRequest());
  await secondClock.store.handleHook(hook(
    "UserPromptSubmit",
    "bootstrap-plan-session",
    secondClock.root,
    second.lease,
    { turn: "later-bootstrap-plan-turn", permission: "plan" },
  ));
  snapshot = await secondClock.store.snapshot();
  assert.equal(snapshot.materialization_grants[0].status, "failed");
  assert.equal(snapshot.materialization_grants[0].failure_code, "source_changed");
});

test("claimed bootstrap finalizes only after one exact canonical materialization record exists", async (t) => {
  const clock = await fixture(t);
  const { lease } = await enroll(
    clock.store,
    clock.root,
    "bootstrap-plan-session",
    "plan",
    "work-1",
  );
  await clock.store.handleHook(hook(
    "UserPromptSubmit",
    "bootstrap-plan-session",
    clock.root,
    lease,
    { turn: "bootstrap-plan-turn", permission: "plan" },
  ));
  const created = await clock.store.createMaterializationGrant(materializationGrantRequest());
  const continued = await clock.store.continueMaterializationGrant(
    created.grant.grant_id,
    validateContinueHandoffInput({ confirmation: CONTINUE_CONFIRMATION }),
  );
  await clock.store.handleHook(hook(
    "UserPromptSubmit",
    "fresh-bootstrap-target",
    clock.root,
    { kind: "activation", activation_capsule: continued.activation_capsule },
    { turn: "fresh-bootstrap-turn" },
  ));
  const claimed = (await clock.store.snapshot()).materialization_grants[0];
  const path = join(clock.root, "artifacts", "af", "work-1", "af-work-item.json");
  const manifest = parseAfWorkItemManifest(await readFile(path, "utf8"));
  manifest.ledger_revision += 1;
  manifest.revisions.discovery = {
    digest: DISCOVERY,
    subjects: [{ ref: "analysis-result.json", sha256: DISCOVERY }],
    registry_revision: null,
  };
  manifest.revisions.decision = {
    digest: DECISIONS,
    subjects: [{ ref: "af-work-item.json#decisions", sha256: DECISIONS }],
    registry_revision: null,
  };
  await writeFile(path, serializeAfWorkItemManifest(manifest), "utf8");
  assert.equal((await clock.store.snapshot()).materialization_grants[0].status, "claimed");

  manifest.session_handoffs.push({
    handoff_id: claimed.grant_id,
    work_id: claimed.work_id,
    from_session_id: claimed.from_session_id,
    from_turn_id: claimed.from_turn_id,
    discovery_revision: manifest.revisions.discovery,
    decision_revision: manifest.revisions.decision,
    plan_hash: claimed.plan_body_hash,
    target_skill: "af-discover-assets.materialize",
    status: "claimed",
    created_at: claimed.created_at,
    expires_at: claimed.expires_at,
    marker_digest: claimed.marker_digest,
    claimed_by_session_id: claimed.claimed_by_session_id,
    claimed_turn_id: claimed.claimed_by_turn_id,
    claimed_at: claimed.claimed_at,
    superseded_by_handoff_id: null,
  });
  await writeFile(path, serializeAfWorkItemManifest(manifest), "utf8");
  const finalized = (await clock.store.snapshot()).materialization_grants[0];
  assert.equal(finalized.status, "finalized");
  assert.equal(finalized.finalized_at, clock.now().toISOString());
});

test("restart invalidates prior leases and pending interaction authority", async (t) => {
  const clock = await fixture(t);
  const { lease } = await enroll(clock.store, clock.root, "session-1");
  await clock.store.createDelivery(delivery(clock.store));
  const { lease: planLease } = await enroll(clock.store, clock.root, "plan-session", "plan", "work-plan");
  await clock.store.handleHook(hook("UserPromptSubmit", "plan-session", clock.root, planLease, { turn: "plan-turn", permission: "plan" }));
  const handoff = await clock.store.createPlanHandoff(planHandoffRequest(clock.store));
  await clock.store.continueHandoff(handoff.handoff_id, validateContinueHandoffInput({ confirmation: CONTINUE_CONFIRMATION }));
  const restarted = await CodexBridgeStore.open(clock.root, { now: clock.now });
  const snapshot = await restarted.snapshot();
  assert.ok(snapshot.sessions.every((session) => session.participation === "expired"));
  assert.equal(snapshot.deliveries[0].status, "canceled");
  assert.equal(snapshot.handoffs[0].status, "failed");
  assert.equal(snapshot.handoffs[0].failure_code, "bridge_restarted");
  assert.notEqual(snapshot.bridge_instance_id, (await clock.store.snapshot()).bridge_instance_id);
  assert.equal(await restarted.handleHook(hook("UserPromptSubmit", "session-1", clock.root, lease)), null);
});

test("stale Plan source fails pending handoffs before Continue can issue authority", async (t) => {
  const clock = await fixture(t, { sessionTtlMs: 1_000 });
  const { lease } = await enroll(clock.store, clock.root, "plan-session", "plan", "work-plan");
  await clock.store.handleHook(hook("UserPromptSubmit", "plan-session", clock.root, lease, { turn: "plan-turn", permission: "plan" }));
  const handoff = await clock.store.createPlanHandoff(planHandoffRequest(clock.store));
  clock.advance(1_001);
  const snapshot = await clock.store.snapshot();
  assert.equal(snapshot.handoffs[0].status, "failed");
  assert.equal(snapshot.handoffs[0].failure_code, "source_inactive");
  await assert.rejects(
    clock.store.continueHandoff(handoff.handoff_id, validateContinueHandoffInput({ confirmation: CONTINUE_CONFIRMATION })),
    /cannot be continued/,
  );
});

test("canonical Work Item drift durably fails an already-created handoff", async (t) => {
  const clock = await fixture(t);
  const { lease } = await enroll(clock.store, clock.root, "plan-session", "plan", "work-plan");
  await clock.store.handleHook(hook("UserPromptSubmit", "plan-session", clock.root, lease, { turn: "plan-turn", permission: "plan" }));
  const handoff = await clock.store.createPlanHandoff(planHandoffRequest(clock.store));
  await driftCanonicalDecisionRevision(clock.root);
  await assert.rejects(
    clock.store.continueHandoff(handoff.handoff_id, validateContinueHandoffInput({ confirmation: CONTINUE_CONFIRMATION })),
    /canonical Work Item revision is stale/,
  );
  const snapshot = await clock.store.snapshot();
  assert.equal(snapshot.handoffs[0].status, "failed");
  assert.equal(snapshot.handoffs[0].failure_code, "canonical_handoff_stale");
});

test("snapshot reconciles a removed canonical Handoff and erases its protected Plan", async (t) => {
  const clock = await fixture(t);
  const { lease } = await enroll(clock.store, clock.root, "plan-session", "plan", "work-plan");
  await clock.store.handleHook(hook("UserPromptSubmit", "plan-session", clock.root, lease, { turn: "plan-turn", permission: "plan" }));
  await clock.store.createPlanHandoff(planHandoffRequest(clock.store));
  const path = join(clock.root, "artifacts", "af", "work-plan", "af-work-item.json");
  const manifest = parseAfWorkItemManifest(await readFile(path, "utf8"));
  manifest.session_handoffs = [];
  await writeFile(path, serializeAfWorkItemManifest(manifest), "utf8");

  const snapshot = await clock.store.snapshot();
  assert.equal(snapshot.handoffs[0].status, "failed");
  assert.equal(snapshot.handoffs[0].failure_code, "canonical_handoff_stale");
  const persisted = JSON.parse(await readFile(clock.store.statePath, "utf8")).handoffs[0];
  assert.equal(persisted.plan_body_ciphertext, null);
  assert.equal(persisted.plan_body_iv, null);
  assert.equal(persisted.plan_body_auth_tag, null);
});

test("a later Plan turn invalidates an older pending handoff", async (t) => {
  const clock = await fixture(t);
  const { lease } = await enroll(clock.store, clock.root, "plan-session", "plan", "work-plan");
  await clock.store.handleHook(hook("UserPromptSubmit", "plan-session", clock.root, lease, { turn: "plan-turn", permission: "plan" }));
  await clock.store.createPlanHandoff(planHandoffRequest(clock.store));
  await clock.store.handleHook(hook("UserPromptSubmit", "plan-session", clock.root, lease, { turn: "later-plan-turn", permission: "plan" }));
  const snapshot = await clock.store.snapshot();
  assert.equal(snapshot.handoffs[0].status, "failed");
  assert.equal(snapshot.handoffs[0].failure_code, "source_turn_stale");
});

test("lease expiry marks participation expired and removes the lease file", async (t) => {
  const clock = await fixture(t);
  await enroll(clock.store, clock.root, "session-expiring");
  const leasePath = join(clock.store.leaseDir, `${createHash("sha256").update("session-expiring").digest("hex")}.json`);
  clock.advance(2 * 60 * 60 * 1_000 + 1);
  const snapshot = await clock.store.snapshot();
  assert.equal(snapshot.sessions[0].participation, "expired");
  assert.equal(await lstat(leasePath).catch(() => null), null);
});

test("distinct fresh non-subagent session claims the exact continued handoff atomically", async (t) => {
  const { root, store } = await fixture(t);
  const { lease } = await enroll(store, root, "plan-session", "plan", "work-plan");
  await store.handleHook(hook("UserPromptSubmit", "plan-session", root, lease, { turn: "plan-turn", permission: "plan" }));
  assert.throws(
    () => planHandoffRequest(store, { plan_body: "# Different Plan\n" }),
    /plan_body_hash does not match/,
  );
  await assert.rejects(
    store.createPlanHandoff(planHandoffRequest(store, { handoff_id: "wrong-canonical-handoff" })),
    /canonical Work Item handoff/i,
  );
  await assert.rejects(
    store.createPlanHandoff(planHandoffRequest(store, { marker_digest: "f".repeat(64) })),
    /canonical Work Item handoff/i,
  );
  const created = await store.createPlanHandoff(planHandoffRequest(store));
  assert.equal(created.status, "ready");
  assert.equal(created.handoff_id, TEST_HANDOFF_ID);
  assert.equal(created.marker_digest, TEST_MARKER_DIGEST);
  assert.equal("plan_body" in created, false);
  const protectedState = await readFile(store.statePath, "utf8");
  assert.doesNotMatch(protectedState, /Implement the exact approved materialization/);
  assert.match(protectedState, /plan_body_ciphertext/);
  const first = await store.continueHandoff(created.handoff_id, validateContinueHandoffInput({ confirmation: CONTINUE_CONFIRMATION }));
  const rotated = await store.continueHandoff(created.handoff_id, validateContinueHandoffInput({ confirmation: CONTINUE_CONFIRMATION }));
  assert.notEqual(first.activation_capsule, rotated.activation_capsule);
  assert.deepEqual(rotated.command, ["codex", rotated.activation_capsule]);
  const rotatedToken = JSON.parse(Buffer.from(rotated.activation_capsule.split("\n")[1], "base64url").toString("utf8")).claim_token as string;

  const oldProof = { kind: "activation" as const, activation_capsule: first.activation_capsule };
  assert.equal(await store.handleHook(hook("UserPromptSubmit", "old-token", root, oldProof, { turn: "old" })), null);
  const proof = { kind: "activation" as const, activation_capsule: rotated.activation_capsule };
  assert.equal(await store.handleHook(hook("UserPromptSubmit", "plan-session", root, proof, { turn: "same", permission: "plan" })), null);
  assert.equal(await store.handleHook(hook("UserPromptSubmit", "subagent", root, proof, { turn: "sub", agentId: "child" })), null);

  const results = await Promise.all([
    store.handleHook(hook("UserPromptSubmit", "fresh-a", root, proof, { turn: "fresh-a-turn" })),
    store.handleHook(hook("UserPromptSubmit", "fresh-b", root, proof, { turn: "fresh-b-turn" })),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  const claimedContext = results.find((result) => result !== null)?.hookSpecificOutput.additionalContext ?? "";
  assert.match(claimedContext, /Canonical Discovery Decision Plan/);
  assert.ok(claimedContext.includes(TEST_PLAN_BODY));
  const snapshot = await store.snapshot();
  const claimed = snapshot.handoffs[0];
  assert.equal(claimed.status, "claimed");
  assert.ok(["fresh-a", "fresh-b"].includes(claimed.claimed_by_session_id ?? ""));
  const persistedClaimed = JSON.parse(await readFile(store.statePath, "utf8")).handoffs[0];
  assert.equal(persistedClaimed.plan_body_ciphertext, null);
  assert.equal(persistedClaimed.plan_body_iv, null);
  assert.equal(persistedClaimed.plan_body_auth_tag, null);
  assert.equal(snapshot.sessions.filter((session) => session.role === "materialization").length, 1);
  const persisted = await readFile(store.statePath, "utf8");
  assert.doesNotMatch(persisted, new RegExp(rotatedToken));
  assert.doesNotMatch(persisted, /AF_COMPANION_HANDOFF_V2/);
});

test("attach cannot promote observed sessions and requires exact scope plus lease proof", async (t) => {
  const { root, store } = await fixture(t);
  await store.handleHook(hook("SessionStart", "observed-only", root));
  assert.throws(() => validateAttachSessionInput({ session_id: "observed-only", workspace_id: store.workspaceId, application_id: "app-1", work_id: "work-1", role: "materialization", cwd: root, confirmation: ATTACH_CONFIRMATION }), /companion_proof/);
  const { lease } = await enroll(store, root, "session-1");
  const attached = await store.attachSession(validateAttachSessionInput({
    session_id: "session-1", workspace_id: store.workspaceId, application_id: "app-1", work_id: "work-1",
    role: "materialization", cwd: root, confirmation: ATTACH_CONFIRMATION, companion_proof: lease,
  }));
  assert.equal(attached.session_id, "session-1");
  await assert.rejects(store.attachSession(validateAttachSessionInput({
    session_id: "session-1", workspace_id: store.workspaceId, application_id: "app-1", work_id: "work-other",
    role: "materialization", cwd: root, confirmation: ATTACH_CONFIRMATION, companion_proof: lease,
  })), /rescope/);

  const manual = await store.createEnrollment(validateCreateEnrollmentInput({
    application_id: "app-1", work_id: "work-1", requested_role: "materialization", activation_origin: "manual_attach_confirmed",
  }));
  const activated = await store.attachSession(validateAttachSessionInput({
    session_id: "manual-session", workspace_id: store.workspaceId, application_id: "app-1", work_id: "work-1",
    role: "materialization", cwd: root, confirmation: ATTACH_CONFIRMATION,
    companion_proof: { kind: "activation", activation_capsule: manual.activation_capsule },
  }));
  assert.equal(activated.activation_origin, "manual_attach_confirmed");
});

test("V1 state is rejected with explicit cleanup guidance and lease symlinks are refused", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "af-bridge-v1-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, ".agent-factory/codex-bridge/v1"), { recursive: true });
  await assert.rejects(CodexBridgeStore.open(root), /remove .agent-factory\/codex-bridge\/v1/);

  const invalidV2 = await mkdtemp(join(tmpdir(), "af-bridge-invalid-v2-"));
  t.after(() => rm(invalidV2, { recursive: true, force: true }));
  await mkdir(join(invalidV2, ".agent-factory/codex-bridge/v2/leases"), { recursive: true });
  await writeFile(join(invalidV2, ".agent-factory/codex-bridge/v2/state.json"), '{"schema_version":1}\n', { mode: 0o600 });
  await assert.rejects(CodexBridgeStore.open(invalidV2), /invalid V2 state.*V1 state is not migrated/i);

  const clean = await fixture(t);
  const receipt = await clean.store.createEnrollment(validateCreateEnrollmentInput({ application_id: "app-1", work_id: "work-1", requested_role: "materialization", activation_origin: "af_cli_launch" }));
  const leasePath = join(clean.store.leaseDir, `${createHash("sha256").update("session-link").digest("hex")}.json`);
  const outside = join(clean.root, "outside.json");
  await writeFile(outside, "{}\n");
  await symlink(outside, leasePath);
  await assert.rejects(clean.store.handleHook(hook("SessionStart", "session-link", clean.root, { kind: "activation", activation_capsule: receipt.activation_capsule })), /already exists/);
});
