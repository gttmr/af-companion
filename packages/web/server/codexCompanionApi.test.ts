import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { CodexEditorCapabilities } from "../src/companion/types.ts";
import { parseAfWorkItemManifest, serializeAfWorkItemManifest } from "../src/analyzer/afWorkItem.ts";
import { canonicalizePlanBody } from "../src/companion/sessionContract.ts";
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
import { ApplicationRegistryStore } from "./applicationRegistryStore.ts";
import type { VscodeSessionWorkspaceInput } from "./vscodeWorkspaceLauncher.ts";

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
  const applicationsRoot = join(root, "external-applications");
  const applicationRoot = join(applicationsRoot, "app-1");
  await mkdir(applicationRoot, { recursive: true });
  const applicationRegistry = new ApplicationRegistryStore({ repoRoot: root, applicationsRoot });
  await applicationRegistry.register({
    application_id: "app-1",
    application_root: applicationRoot,
    work_id: "work-1",
    created_at: "2030-01-01T00:00:00.000Z",
  });
  const bridge = withBridge ? await startCodexBridgeServer({
    repoRoot: root,
    port: 0,
    now: () => new Date("2030-01-01T00:00:00.000Z"),
    readCurrentSourceRevision: async () => structuredClone(TEST_SOURCE_REVISION),
  }) : null;
  if (bridge) t.after(() => bridge.close());
  const sessionLaunches: VscodeSessionWorkspaceInput[] = [];
  const middleware = createCodexCompanionMiddleware(root, {
    applicationsRoot,
    workspaceController: {
      canonicalRoot: async () => root,
      probe: async () => editor,
      launch: async () => ({ status: "accepted", workspace_path: root, launched_at: "2030-01-01T00:00:00.000Z" }),
      launchSessionWorkspace: async (input) => {
        sessionLaunches.push(input);
        return {
          status: "accepted",
          workspace_path: join(root, ".agent-factory", "vscode", `${input.workId}.code-workspace`),
          launched_at: "2030-01-01T00:00:00.000Z",
        };
      },
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
  return {
    root,
    bridge,
    facade,
    direct,
    origin,
    applicationsRoot,
    applicationRoot,
    sessionLaunches,
  };
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

test("Facade launches a registered plan workspace without issuing browser enrollment", async (t) => {
  const { root, bridge, facade, applicationsRoot, applicationRoot, sessionLaunches } = await fixture(t);
  assert.ok(bridge);

  let response = await facade("/vscode-sessions", { work_id: "work-1", mode: "plan" });
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), {
    status: "accepted",
    workspace_path: join(root, ".agent-factory", "vscode", "work-1.code-workspace"),
    launched_at: "2030-01-01T00:00:00.000Z",
    application_id: "app-1",
    work_id: "work-1",
    role: "plan",
  });
  assert.deepEqual(sessionLaunches, [{
    applicationId: "app-1",
    applicationRoot,
    applicationsRoot,
    workId: "work-1",
    role: "plan",
  }]);
  assert.deepEqual((await bridge.store.snapshot()).enrollment_tickets, []);

  response = await facade("/vscode-sessions", { work_id: "work-2", mode: "plan" });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "application_registration_missing");
  response = await facade("/vscode-sessions", { work_id: "work-1", mode: "materialization" });
  assert.equal(response.status, 400);
  response = await facade("/vscode-sessions", { work_id: "work-1", mode: "plan", unexpected: true });
  assert.equal(response.status, 400);
  assert.equal(sessionLaunches.length, 1);
});

test("Facade refuses session workspace launch while the Bridge is unavailable", async (t) => {
  const { facade, sessionLaunches } = await fixture(t, false);
  const response = await facade("/vscode-sessions", { work_id: "work-1", mode: "plan" });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, "bridge_unavailable");
  assert.deepEqual(sessionLaunches, []);
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

test("Facade carries every valid 64 KiB Plan body after worst-case JSON escaping", async (t) => {
  const { root, bridge, facade, direct } = await fixture(t);
  assert.ok(bridge);
  const planBody = canonicalizePlanBody(`${"\u0000".repeat(65_534)}A`);
  assert.equal(Buffer.byteLength(planBody, "utf8"), 64 * 1_024);
  const planHash = createHash("sha256").update(planBody, "utf8").digest("hex");
  const workItemPath = join(root, "artifacts", "af", "work-plan", "af-work-item.json");
  const manifest = parseAfWorkItemManifest(await readFile(workItemPath, "utf8"));
  manifest.session_handoffs[0].plan_hash = planHash;
  await writeFile(workItemPath, serializeAfWorkItemManifest(manifest), "utf8");

  let response = await facade("/enrollments", {
    application_id: "app-1", work_id: "work-plan", requested_role: "plan", activation_origin: "af_cli_launch",
  });
  const enrollment = await response.json();
  await direct("/v1/hooks", sessionHook(root, "plan-session", { kind: "activation", activation_capsule: enrollment.activation_capsule }, "plan"));
  const lease = await bridge.store.leaseProofForTesting("plan-session");
  await direct("/v1/hooks", sessionHook(root, "plan-session", lease, "plan", "plan-turn"));
  const request = {
    handoff_id: TEST_HANDOFF_ID, marker_digest: TEST_MARKER_DIGEST,
    workspace_id: bridge.store.workspaceId, application_id: "app-1", work_id: "work-plan",
    from_session_id: "plan-session", from_turn_id: "plan-turn",
    discovery_revision: "a".repeat(64), decision_revision: "b".repeat(64),
    plan_body_hash: planHash, plan_body: planBody,
    transport_capability: "client_dependent", expires_at: "2030-01-01T00:10:00.000Z",
  };
  assert.ok(Buffer.byteLength(JSON.stringify(request), "utf8") > 256 * 1_024);
  response = await facade("/handoffs", request);
  assert.equal(response.status, 201);
});

test("Facade reset maps bounded empty action while direct Bridge still requires confirmation", async (t) => {
  const { facade, direct } = await fixture(t);
  let response = await direct("/v1/state/reset", {});
  assert.equal(response.status, 400);
  response = await facade("/state/reset", {});
  assert.equal(response.status, 204);
});
