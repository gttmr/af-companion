import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { CodexEditorCapabilities } from "../src/companion/types.ts";
import {
  TEST_HANDOFF_ID,
  TEST_MARKER_DIGEST,
  TEST_PLAN_BODY,
  TEST_PLAN_HASH,
  TEST_SOURCE_REVISION,
  writeCompanionWorkItems,
} from "./companionTestFixtures.ts";
import { createCodexCompanionMiddleware } from "./codexCompanionApi.ts";
import { startCodexBridgeServer } from "./codexBridgeServer.ts";

const editor: CodexEditorCapabilities = {
  code_available: false, code_version: null, wsl_environment: true,
  codex_extension_installed: false, codex_extension_version: null,
  launch_supported: false, probed_at: "2030-01-01T00:00:00.000Z",
};

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function fixture(t: test.TestContext, withBridge = true) {
  const root = await mkdtemp(join(tmpdir(), "af-companion-v2-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeCompanionWorkItems(root);
  const bridge = withBridge ? await startCodexBridgeServer({
    repoRoot: root,
    port: 0,
    now: () => new Date("2030-01-01T00:00:00.000Z"),
    readCurrentSourceRevision: async () => structuredClone(TEST_SOURCE_REVISION),
  }) : null;
  if (bridge) t.after(() => bridge.close());
  const middleware = createCodexCompanionMiddleware(root, {
    workspaceController: {
      canonicalRoot: async () => root,
      probe: async () => editor,
      launch: async () => ({ status: "accepted", workspace_path: root, launched_at: "2030-01-01T00:00:00.000Z" }),
    },
  });
  const server = createServer((request, response) => {
    request.url = (request.url ?? "/").replace(/^\/api\/codex-companion/, "") || "/";
    void middleware(request, response, (error) => {
      response.statusCode = error ? 500 : 404;
      response.end();
    });
  });
  const origin = await listen(server);
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const facade = (path: string, body?: unknown, headers: Record<string, string> = {}) => fetch(`${origin}/api/codex-companion${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json", origin, "sec-fetch-site": "same-origin" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const direct = (path: string, body?: unknown) => {
    assert.ok(bridge);
    return fetch(`${bridge.endpoint.url}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { authorization: `Bearer ${bridge.endpoint.token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };
  return { root, bridge, facade, direct, origin };
}

function sessionHook(root: string, sessionId: string, proof: unknown, permission = "default", turn?: string) {
  return {
    session_id: sessionId, transcript_path: null, cwd: root,
    hook_event_name: turn ? "UserPromptSubmit" : "SessionStart", model: "gpt-5.6", permission_mode: permission,
    ...(turn ? { turn_id: turn } : { source: "startup" }), companion_proof: proof,
  };
}

test("Facade projects V2 snapshot and keeps unavailable state V2-shaped", async (t) => {
  let fx = await fixture(t);
  let response = await fx.facade("/snapshot");
  assert.equal(response.status, 200);
  let snapshot = await response.json();
  assert.equal(snapshot.schema_version, 2);
  assert.equal(snapshot.workspace.canonical_path, fx.root);
  assert.deepEqual(snapshot.sessions, []);

  fx = await fixture(t, false);
  response = await fx.facade("/snapshot");
  snapshot = await response.json();
  assert.equal(snapshot.schema_version, 2);
  assert.equal(snapshot.capabilities.bridge_available, false);
  assert.deepEqual(snapshot.enrollment_tickets, []);
});

test("Facade requires same-origin and rejects default_target from alias-only preferences", async (t) => {
  const { facade } = await fixture(t);
  let response = await facade("/enrollments", { application_id: "app-1", work_id: "work-1", requested_role: "materialization", activation_origin: "af_cli_launch" }, { origin: "https://evil.example" });
  assert.equal(response.status, 403);
  response = await facade("/sessions/session-1/preferences", { default_target: true });
  assert.equal(response.status, 400);
});

test("Facade rejects enrollment for a nonexistent exact Work Item before ticket issuance", async (t) => {
  const { bridge, facade } = await fixture(t);
  assert.ok(bridge);
  const response = await facade("/enrollments", { application_id: "logical-app", work_id: "missing-work", requested_role: "materialization", activation_origin: "af_cli_launch" });
  assert.equal(response.status, 404);
  assert.deepEqual((await bridge.store.snapshot()).enrollment_tickets, []);
});

test("Facade enrollment and direct scoped delivery preserve SelectionBundleV1", async (t) => {
  const { root, bridge, facade, direct } = await fixture(t);
  assert.ok(bridge);
  let response = await facade("/enrollments", { application_id: "app-1", work_id: "work-1", requested_role: "materialization", activation_origin: "af_cli_launch" });
  assert.equal(response.status, 201);
  const enrollment = await response.json();
  await direct("/v1/hooks", sessionHook(root, "session-1", { kind: "activation", activation_capsule: enrollment.activation_capsule }));
  response = await facade("/sessions/session-1/preferences", { alias: "  Review session  " });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).alias, "Review session");
  const revision = structuredClone(TEST_SOURCE_REVISION);
  const bundle = {
    schema_version: 1, selection_id: "selection-1", workspace_id: bridge.store.workspaceId, artifact_root_id: "artifacts/af/work-1", graph_id: "graph-1", source_revision: revision,
    selected_objects: [{ kind: "graph_node", id: "node-1", label: "Node", node_kind: "agent", artifact_ref: null, source_refs: [] }],
    derived_context: { connecting_edges: [], related_assets: [] }, user_intent: { text: null },
    created_at: "2030-01-01T00:00:00.000Z", expires_at: "2030-01-01T00:30:00.000Z",
  };
  response = await facade("/deliveries", {
    target_session_id: "session-1", delivery_mode: "next_prompt", consume_policy: "once",
    scope: { workspace_id: bridge.store.workspaceId, application_id: "app-1", work_id: "work-1", allowed_roles: ["materialization"] },
    current_role: "materialization", current_source_revision: revision, bundle,
  });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).bundle.schema_version, 1);
});

test("Facade maps bounded Continue, attach, cancel, and Revoke actions to exact Bridge confirmations", async (t) => {
  const { root, bridge, facade, direct } = await fixture(t);
  assert.ok(bridge);
  let response = await facade("/enrollments", { application_id: "app-1", work_id: "work-plan", requested_role: "plan", activation_origin: "af_cli_launch" });
  const enrollment = await response.json();
  await direct("/v1/hooks", sessionHook(root, "plan-session", { kind: "activation", activation_capsule: enrollment.activation_capsule }, "plan"));
  const lease = await bridge.store.leaseProofForTesting("plan-session");
  await direct("/v1/hooks", sessionHook(root, "plan-session", lease, "plan", "plan-turn"));
  response = await facade("/handoffs", {
    handoff_id: TEST_HANDOFF_ID, marker_digest: TEST_MARKER_DIGEST,
    workspace_id: bridge.store.workspaceId, application_id: "app-1", work_id: "work-plan", from_session_id: "plan-session", from_turn_id: "plan-turn",
    discovery_revision: "a".repeat(64), decision_revision: "b".repeat(64), plan_body_hash: TEST_PLAN_HASH, plan_body: TEST_PLAN_BODY,
    transport_capability: "client_dependent", expires_at: "2030-01-01T00:10:00.000Z",
  });
  const handoff = await response.json();
  response = await facade(`/handoffs/${handoff.handoff_id}/continue`, {});
  assert.equal(response.status, 200);
  const continued = await response.json();
  assert.deepEqual(continued.command, ["codex", continued.activation_capsule]);

  response = await facade("/enrollments", { application_id: "app-1", work_id: "work-plan", requested_role: "materialization", activation_origin: "af_cli_launch" });
  const targetEnrollment = await response.json();
  await direct("/v1/hooks", sessionHook(root, "materialization-session", { kind: "activation", activation_capsule: targetEnrollment.activation_capsule }));
  response = await facade(`/handoffs/${handoff.handoff_id}/attach`, { target_session_id: "materialization-session" });
  assert.equal(response.status, 200);
  const attachment = await response.json();
  assert.equal(attachment.target_session_id, "materialization-session");
  assert.equal("activation_capsule" in attachment, false);
  assert.equal("command" in attachment, false);
  assert.equal(attachment.handoff.target_session_id, "materialization-session");
  response = await facade(`/handoffs/${handoff.handoff_id}/cancel`, {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "canceled");

  response = await facade("/sessions/plan-session/revoke", {});
  assert.equal(response.status, 200);
  const revoked = await response.json();
  assert.equal(revoked.participation, "revoked");
  assert.equal(revoked.revoke_reason, "revoked_from_companion_ui");
});

test("Facade reset maps bounded empty action while direct Bridge still requires confirmation", async (t) => {
  const { facade, direct } = await fixture(t);
  let response = await direct("/v1/state/reset", {});
  assert.equal(response.status, 400);
  response = await facade("/state/reset", {});
  assert.equal(response.status, 204);
});
