import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseAfWorkItemManifest, serializeAfWorkItemManifest } from "../src/analyzer/afWorkItem.ts";
import { canonicalizePlanBody } from "../src/companion/sessionContract.ts";
import {
  ATTACH_HANDOFF_CONFIRMATION,
  CANCEL_HANDOFF_CONFIRMATION,
  CONTINUE_CONFIRMATION,
  REVOKE_CONFIRMATION,
  RESET_CONFIRMATION,
} from "./codexBridgeStore.ts";
import { startCodexBridgeServer } from "./codexBridgeServer.ts";
import {
  TEST_HANDOFF_ID,
  TEST_MARKER_DIGEST,
  TEST_PLAN_BODY,
  TEST_PLAN_HASH,
  TEST_SOURCE_REVISION,
  writeCompanionWorkItems,
} from "./companionTestFixtures.ts";

async function fixture(t: test.TestContext) {
  const root = await mkdtemp(join(tmpdir(), "af-bridge-server-v2-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeCompanionWorkItems(root);
  const running = await startCodexBridgeServer({
    repoRoot: root,
    port: 0,
    now: () => new Date("2030-01-01T00:00:00.000Z"),
    readCurrentSourceRevision: async () => structuredClone(TEST_SOURCE_REVISION),
  });
  t.after(() => running.close());
  const request = (path: string, body?: unknown, token = running.endpoint.token) => fetch(`${running.endpoint.url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { root, running, request };
}

function sessionHook(root: string, sessionId: string, proof?: unknown, permission = "default", turn?: string) {
  return {
    session_id: sessionId, transcript_path: "/private/transcript", cwd: root,
    hook_event_name: turn ? "UserPromptSubmit" : "SessionStart", model: "gpt-5.6", permission_mode: permission,
    ...(turn ? { turn_id: turn } : { source: "startup" }), ...(proof ? { companion_proof: proof } : {}),
  };
}

async function addCanonicalPlanHandoff(root: string, turnId: string, planHash: string, handoffId: string): Promise<void> {
  const path = join(root, "artifacts", "af", "work-plan", "af-work-item.json");
  const manifest = parseAfWorkItemManifest(await readFile(path, "utf8"));
  assert.ok(manifest.revisions.discovery && manifest.revisions.decision);
  manifest.session_handoffs.push({
    handoff_id: handoffId,
    work_id: "work-plan",
    from_session_id: "plan-session",
    from_turn_id: turnId,
    discovery_revision: structuredClone(manifest.revisions.discovery),
    decision_revision: structuredClone(manifest.revisions.decision),
    plan_hash: planHash,
    target_skill: "af-discover-assets.materialize",
    status: "pending",
    created_at: "2030-01-01T00:00:00.000Z",
    expires_at: "2030-01-01T00:10:00.000Z",
    marker_digest: createHash("sha256").update(handoffId).digest("hex"),
    claimed_by_session_id: null,
    claimed_turn_id: null,
    claimed_at: null,
    superseded_by_handoff_id: null,
  });
  await writeFile(path, serializeAfWorkItemManifest(manifest), "utf8");
}

test("direct Bridge exposes only authenticated V2 state and unmanaged Hooks stay inert", async (t) => {
  const { root, running, request } = await fixture(t);
  let response = await request("/v1/health");
  assert.equal(response.status, 200);
  assert.equal((await response.json()).schema_version, 2);
  response = await request("/v1/snapshot", undefined, "wrong-token");
  assert.equal(response.status, 401);
  response = await request("/v1/hooks", sessionHook(root, "unmanaged"));
  assert.equal(response.status, 204);
  response = await request("/v1/snapshot");
  const snapshot = await response.json();
  assert.deepEqual(snapshot.sessions, []);
  assert.deepEqual(snapshot.activities, []);
  const endpoint = JSON.parse(await readFile(running.store.endpointPath, "utf8"));
  assert.equal(endpoint.schema_version, 2);
  assert.equal(endpoint.bridge_instance_id, snapshot.bridge_instance_id);
});

test("direct enrollment, scoped delivery, consume, cancel, and revoke routes are fail-closed", async (t) => {
  const { root, running, request } = await fixture(t);
  let response = await request("/v1/enrollments", { application_id: "app-1", work_id: "work-1", requested_role: "materialization", activation_origin: "af_cli_launch" });
  assert.equal(response.status, 201);
  const enrollment = await response.json();
  response = await request("/v1/hooks", sessionHook(root, "session-1", { kind: "activation", activation_capsule: enrollment.activation_capsule }));
  assert.equal(response.status, 204);
  const lease = await running.store.leaseProofForTesting("session-1");
  const revision = structuredClone(TEST_SOURCE_REVISION);
  const bundle = {
    schema_version: 1, selection_id: "selection-1", workspace_id: running.store.workspaceId,
    artifact_root_id: "artifacts/af/work-1", graph_id: "graph-1", source_revision: revision,
    selected_objects: [{ kind: "graph_node", id: "node-1", label: "Node", node_kind: "agent", artifact_ref: null, source_refs: [] }],
    derived_context: { connecting_edges: [], related_assets: [] }, user_intent: { text: null },
    created_at: "2030-01-01T00:00:00.000Z", expires_at: "2030-01-01T01:00:00.000Z",
  };
  const deliveryBody = {
    target_session_id: "session-1", delivery_mode: "next_prompt", consume_policy: "once",
    scope: { workspace_id: running.store.workspaceId, application_id: "app-1", work_id: "work-1", allowed_roles: ["materialization"] },
    current_role: "materialization", current_source_revision: revision, bundle,
  };
  response = await request("/v1/deliveries", { ...deliveryBody, scope: { ...deliveryBody.scope, application_id: "wrong" } });
  assert.equal(response.status, 409);
  response = await request("/v1/deliveries", deliveryBody);
  assert.equal(response.status, 201);
  const delivery = await response.json();
  assert.equal(delivery.bundle.schema_version, 1);
  response = await request("/v1/hooks", sessionHook(root, "session-1", lease, "default", "turn-1"));
  assert.equal(response.status, 200);
  assert.match((await response.json()).hookSpecificOutput.additionalContext, /selection-1/);

  response = await request("/v1/sessions/session-1/revoke", { confirmation: REVOKE_CONFIRMATION, reason: "done" });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).participation, "revoked");
  response = await request("/v1/hooks", sessionHook(root, "session-1", lease, "default", "turn-2"));
  assert.equal(response.status, 204);
});

test("direct handoff Continue rotates a claim and only an exact distinct session claims it", async (t) => {
  const { root, running, request } = await fixture(t);
  let response = await request("/v1/enrollments", { application_id: "app-1", work_id: "work-plan", requested_role: "plan", activation_origin: "af_cli_launch" });
  const enrollment = await response.json();
  await request("/v1/hooks", sessionHook(root, "plan-session", { kind: "activation", activation_capsule: enrollment.activation_capsule }, "plan"));
  const lease = await running.store.leaseProofForTesting("plan-session");
  await request("/v1/hooks", sessionHook(root, "plan-session", lease, "plan", "plan-turn"));
  response = await request("/v1/handoffs", {
    handoff_id: TEST_HANDOFF_ID, marker_digest: TEST_MARKER_DIGEST,
    workspace_id: running.store.workspaceId, application_id: "app-1", work_id: "work-plan", from_session_id: "plan-session", from_turn_id: "plan-turn",
    discovery_revision: "a".repeat(64), decision_revision: "b".repeat(64), plan_body_hash: TEST_PLAN_HASH, plan_body: TEST_PLAN_BODY,
    transport_capability: "client_dependent", expires_at: "2030-01-01T00:10:00.000Z",
  });
  assert.equal(response.status, 201);
  const handoff = await response.json();
  assert.equal(handoff.status, "ready");
  response = await request(`/v1/handoffs/${handoff.handoff_id}/continue`, { confirmation: CONTINUE_CONFIRMATION });
  assert.equal(response.status, 200);
  const continued = await response.json();
  response = await request("/v1/hooks", sessionHook(root, "fresh-session", { kind: "activation", activation_capsule: continued.activation_capsule }, "default", "fresh-turn"));
  assert.equal(response.status, 200);
  const context = (await response.json()).hookSpecificOutput.additionalContext;
  assert.match(context, /work-plan/);
  assert.ok(context.includes(TEST_PLAN_BODY));
  const snapshot = await (await request("/v1/snapshot")).json();
  assert.equal(snapshot.handoffs[0].status, "claimed");
  assert.equal(snapshot.handoffs[0].claimed_by_session_id, "fresh-session");
});

test("direct handoff attachment targets one existing Companion session and cancel is explicit", async (t) => {
  const { root, running, request } = await fixture(t);
  let response = await request("/v1/enrollments", { application_id: "app-1", work_id: "work-plan", requested_role: "plan", activation_origin: "af_cli_launch" });
  const planEnrollment = await response.json();
  await request("/v1/hooks", sessionHook(root, "plan-session", { kind: "activation", activation_capsule: planEnrollment.activation_capsule }, "plan"));
  const planLease = await running.store.leaseProofForTesting("plan-session");
  await request("/v1/hooks", sessionHook(root, "plan-session", planLease, "plan", "plan-turn"));

  for (const sessionId of ["materialization-a", "materialization-b"]) {
    response = await request("/v1/enrollments", { application_id: "app-1", work_id: "work-plan", requested_role: "materialization", activation_origin: "af_cli_launch" });
    const enrollment = await response.json();
    await request("/v1/hooks", sessionHook(root, sessionId, { kind: "activation", activation_capsule: enrollment.activation_capsule }));
  }

  const createHandoff = (
    turnId = "plan-turn",
    handoffId = TEST_HANDOFF_ID,
    planBody = TEST_PLAN_BODY,
    markerDigest = handoffId === TEST_HANDOFF_ID ? TEST_MARKER_DIGEST : createHash("sha256").update(handoffId).digest("hex"),
  ) => request("/v1/handoffs", {
    handoff_id: handoffId, marker_digest: markerDigest,
    workspace_id: running.store.workspaceId, application_id: "app-1", work_id: "work-plan", from_session_id: "plan-session", from_turn_id: turnId,
    discovery_revision: "a".repeat(64), decision_revision: "b".repeat(64),
    plan_body_hash: createHash("sha256").update(planBody).digest("hex"), plan_body: planBody,
    transport_capability: "client_dependent", expires_at: "2030-01-01T00:10:00.000Z",
  });

  response = await createHandoff();
  const attachedHandoff = await response.json();
  response = await request(`/v1/handoffs/${attachedHandoff.handoff_id}/attach`, {
    confirmation: ATTACH_HANDOFF_CONFIRMATION,
    target_session_id: "materialization-a",
  });
  assert.equal(response.status, 200);
  const attachment = await response.json();
  assert.equal(attachment.target_session_id, "materialization-a");
  assert.equal("activation_capsule" in attachment, false);
  assert.equal("command" in attachment, false);
  let snapshot = await (await request("/v1/snapshot")).json();
  assert.equal(snapshot.handoffs[0].target_session_id, "materialization-a");

  const materializationBLease = await running.store.leaseProofForTesting("materialization-b");
  response = await request("/v1/hooks", sessionHook(root, "materialization-b", materializationBLease, "default", "wrong-turn"));
  assert.equal(response.status, 204);
  const materializationALease = await running.store.leaseProofForTesting("materialization-a");
  response = await request("/v1/hooks", sessionHook(root, "materialization-a", materializationALease, "default", "claim-turn"));
  assert.equal(response.status, 200);
  assert.ok(((await response.json()).hookSpecificOutput.additionalContext as string).includes(TEST_PLAN_BODY));
  assert.equal((await (await request("/v1/snapshot")).json()).handoffs[0].claimed_by_session_id, "materialization-a");

  const planBody2 = canonicalizePlanBody("# Discovery Decision Plan 2\n\nCancel this exact handoff.\n");
  const planHash2 = createHash("sha256").update(planBody2).digest("hex");
  await addCanonicalPlanHandoff(root, "plan-turn-2", planHash2, "ledger-handoff-plan-2");
  await request("/v1/hooks", sessionHook(root, "plan-session", planLease, "plan", "plan-turn-2"));
  response = await createHandoff("plan-turn-2", "ledger-handoff-plan-2", planBody2);
  const canceledHandoff = await response.json();
  response = await request(`/v1/handoffs/${canceledHandoff.handoff_id}/cancel`, {});
  assert.equal(response.status, 400);
  response = await request(`/v1/handoffs/${canceledHandoff.handoff_id}/cancel`, { confirmation: CANCEL_HANDOFF_CONFIRMATION });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "canceled");
  response = await request(`/v1/handoffs/${canceledHandoff.handoff_id}/continue`, { confirmation: CONTINUE_CONFIRMATION });
  assert.equal(response.status, 409);

  const planBody3 = canonicalizePlanBody("# Discovery Decision Plan 3\n\nDetach this exact target.\n");
  const planHash3 = createHash("sha256").update(planBody3).digest("hex");
  await addCanonicalPlanHandoff(root, "plan-turn-3", planHash3, "ledger-handoff-plan-3");
  await request("/v1/hooks", sessionHook(root, "plan-session", planLease, "plan", "plan-turn-3"));
  response = await createHandoff("plan-turn-3", "ledger-handoff-plan-3", planBody3);
  const revokeCanceledHandoff = await response.json();
  response = await request(`/v1/handoffs/${revokeCanceledHandoff.handoff_id}/attach`, {
    confirmation: ATTACH_HANDOFF_CONFIRMATION,
    target_session_id: "materialization-b",
  });
  assert.equal(response.status, 200);
  response = await request("/v1/sessions/materialization-b/revoke", { confirmation: REVOKE_CONFIRMATION, reason: "target closed" });
  assert.equal(response.status, 200);
  snapshot = await (await request("/v1/snapshot")).json();
  const detached = snapshot.handoffs.find((item: { handoff_id: string }) => item.handoff_id === revokeCanceledHandoff.handoff_id);
  assert.equal(detached.status, "ready");
  assert.equal(detached.target_session_id, null);

  response = await request("/v1/sessions/plan-session/revoke", { confirmation: REVOKE_CONFIRMATION, reason: "plan complete" });
  assert.equal(response.status, 200);
  snapshot = await (await request("/v1/snapshot")).json();
  assert.equal(snapshot.handoffs.find((item: { handoff_id: string }) => item.handoff_id === revokeCanceledHandoff.handoff_id).status, "canceled");
});

test("preferences are alias-only, reset needs confirmation, and one bridge owns a workspace", async (t) => {
  const { root, request } = await fixture(t);
  let response = await request("/v1/sessions/anything/preferences", { default_target: true });
  assert.equal(response.status, 400);
  response = await request("/v1/state/reset", {});
  assert.equal(response.status, 400);
  response = await request("/v1/state/reset", { confirmation: RESET_CONFIRMATION });
  assert.equal(response.status, 204);
  await assert.rejects(startCodexBridgeServer({ repoRoot: root, port: 0 }), /already running/);
});
