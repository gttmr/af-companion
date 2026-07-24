import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { MAX_CODEX_BRIDGE_BODY_BYTES, startCodexBridgeServer } from "./codexBridgeServer.ts";

const DISCOVERY_REVISION = "a".repeat(64);
const DECISION_REVISION = "b".repeat(64);
const PLAN_HASH = "c".repeat(64);

function deliveryRequest(selectionId: string) {
  return {
    target_session_id: "session-http",
    delivery_mode: "next_prompt",
    consume_policy: "once",
    bundle: {
      schema_version: 1,
      selection_id: selectionId,
      workspace_id: "workspace-http",
      artifact_root_id: "req-http",
      graph_id: "graph-http",
      source_revision: { head: "0123456789abcdef", dirty_hash: null, graph_etag: "etag-http" },
      selected_objects: [{
        kind: "graph_node",
        id: "node-http",
        label: "HTTP node",
        node_kind: "agent",
        artifact_ref: "agent:http",
        source_refs: ["graph-ir.json#node-http"],
      }],
      derived_context: {
        connecting_edges: [],
        related_assets: [{ asset_id: "agent:http", asset_type: "agent", owner: "platform", domain_scope: "cross_domain", binding_kind: null }],
      },
      user_intent: { text: "Review selected HTTP node" },
      created_at: "2030-01-01T00:00:00.000Z",
      expires_at: "2030-01-01T00:15:00.000Z",
    },
  };
}

test("binds to loopback with an ephemeral port and protects all HTTP APIs", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "af-codex-server-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const running = await startCodexBridgeServer({
    repoRoot: root,
    now: () => new Date("2030-01-01T00:00:00.000Z"),
    codexVersion: "0.144.6",
  });
  t.after(() => running.close());
  const auth = { authorization: `Bearer ${running.endpoint.token}` };

  assert.match(running.endpoint.url, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.notEqual(new URL(running.endpoint.url).port, "0");
  assert.equal((await stat(running.store.stateDir)).mode & 0o777, 0o700);
  assert.equal((await stat(running.store.statePath)).mode & 0o777, 0o600);
  assert.equal((await stat(running.store.endpointPath)).mode & 0o777, 0o600);

  let response = await fetch(`${running.endpoint.url}/v1/health`);
  assert.equal(response.status, 401);
  assert.equal(response.headers.get("access-control-allow-origin"), null);

  response = await fetch(`${running.endpoint.url}/v1/health`, { headers: auth });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ok, true);
  assert.equal(response.headers.get("access-control-allow-origin"), null);

  response = await fetch(`${running.endpoint.url}/v1/hooks`, {
    method: "POST",
    headers: auth,
    body: "{}",
  });
  assert.equal(response.status, 415);

  response = await fetch(`${running.endpoint.url}/v1/hooks`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ padding: "x".repeat(MAX_CODEX_BRIDGE_BODY_BYTES) }),
  });
  assert.equal(response.status, 413);

  response = await fetch(`${running.endpoint.url}/v1/hooks`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      session_id: "session-http",
      transcript_path: "/private/transcript.jsonl",
      cwd: root,
      hook_event_name: "SessionStart",
      model: "gpt-5.6",
      permission_mode: "default",
      source: "startup",
    }),
  });
  assert.equal(response.status, 204);
  assert.equal(await response.text(), "");

  response = await fetch(`${running.endpoint.url}/v1/deliveries`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify(deliveryRequest("selection-http")),
  });
  assert.equal(response.status, 201);
  const queued = await response.json();
  assert.equal(queued.status, "queued");

  response = await fetch(`${running.endpoint.url}/v1/sessions/session-http/preferences`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ alias: "  HTTP session  ", default_target: true }),
  });
  assert.equal(response.status, 200);
  const preferredSession = await response.json();
  assert.equal(preferredSession.alias, "HTTP session");
  assert.equal(preferredSession.default_target, true);
  assert.equal(preferredSession.session_id, "session-http");

  const promptBody = {
    session_id: "session-http",
    turn_id: "turn-http",
    transcript_path: "/private/transcript.jsonl",
    cwd: root,
    hook_event_name: "UserPromptSubmit",
    model: "gpt-5.6",
    permission_mode: "default",
    prompt: "private HTTP prompt",
  };
  const duplicateHookResponses = await Promise.all([1, 2].map(() => fetch(`${running.endpoint.url}/v1/hooks`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify(promptBody),
  })));
  assert.deepEqual(duplicateHookResponses.map((item) => item.status).sort(), [200, 204]);
  const successfulHookResponse = duplicateHookResponses.find((item) => item.status === 200);
  assert.ok(successfulHookResponse);
  const hookOutput = await successfulHookResponse.json();
  assert.equal(hookOutput.hookSpecificOutput.hookEventName, "UserPromptSubmit");
  assert.match(hookOutput.hookSpecificOutput.additionalContext, /selection-http/);

  response = await fetch(`${running.endpoint.url}/v1/hooks`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify({ ...promptBody, turn_id: "turn-http-again" }),
  });
  assert.equal(response.status, 204);

  response = await fetch(`${running.endpoint.url}/v1/deliveries`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: JSON.stringify(deliveryRequest("selection-cancel")),
  });
  const cancelTarget = await response.json();
  response = await fetch(`${running.endpoint.url}/v1/deliveries/${encodeURIComponent(cancelTarget.delivery_id)}/cancel`, {
    method: "POST",
    headers: { ...auth, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "canceled");

  response = await fetch(`${running.endpoint.url}/v1/snapshot`, { headers: auth });
  assert.equal(response.status, 200);
  const snapshot = await response.json();
  assert.equal(snapshot.sessions[0].session_id, "session-http");
  assert.equal(snapshot.sessions[0].transcript_path, undefined);
  assert.equal(snapshot.sessions[0].last_event, "prompt_submit");
  assert.equal(snapshot.sessions[0].last_turn_id, "turn-http-again");
  assert.deepEqual(snapshot.capabilities, {
    bridge_available: true,
    codex_version: "0.144.6",
    session_registration: true,
    next_prompt_context: true,
    session_end_event: "unsupported",
    delivery_ack: false,
    mcp_context_pull: false,
    direct_turn_start: false,
    inflight_steer: false,
    fresh_session_handoff: true,
    automatic_fresh_context: false,
  });

  response = await fetch(`${running.endpoint.url}/v1/health`, {
    method: "OPTIONS",
    headers: { ...auth, origin: "https://example.test" },
  });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("access-control-allow-origin"), null);
});

test("rejects a second broker for the same workspace", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "af-codex-server-lock-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const running = await startCodexBridgeServer({ repoRoot: root });
  t.after(() => running.close());

  await assert.rejects(
    startCodexBridgeServer({ repoRoot: root }),
    /already running/,
  );
});

test("exposes strict direct routes for Plan handoff creation and exact session attachment", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "af-codex-server-handoff-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const running = await startCodexBridgeServer({
    repoRoot: root,
    now: () => new Date("2030-01-01T00:00:00.000Z"),
  });
  t.after(() => running.close());
  const headers = {
    authorization: `Bearer ${running.endpoint.token}`,
    "content-type": "application/json",
  };
  const hook = async (body: unknown) => fetch(`${running.endpoint.url}/v1/hooks`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  assert.equal((await hook({
    session_id: "plan-http",
    transcript_path: "/private/plan.jsonl",
    cwd: root,
    hook_event_name: "SessionStart",
    model: "gpt-5.6",
    permission_mode: "plan",
    source: "startup",
  })).status, 204);
  assert.equal((await hook({
    session_id: "plan-http",
    turn_id: "plan-turn-http",
    transcript_path: "/private/plan.jsonl",
    cwd: root,
    hook_event_name: "UserPromptSubmit",
    model: "gpt-5.6",
    permission_mode: "plan",
    prompt: "private plan",
  })).status, 204);

  const handoffBody = {
    work_id: "work-http-1",
    from_session_id: "plan-http",
    from_turn_id: "plan-turn-http",
    discovery_revision: DISCOVERY_REVISION,
    decision_revision: DECISION_REVISION,
    plan_hash: PLAN_HASH,
    expires_at: "2030-01-01T00:15:00.000Z",
  };
  let response = await fetch(`${running.endpoint.url}/v1/handoffs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...handoffBody, unexpected: true }),
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "invalid_request");

  response = await fetch(`${running.endpoint.url}/v1/handoffs`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ...handoffBody, plan_hash: "not-a-sha256" }),
  });
  assert.equal(response.status, 400);

  response = await fetch(`${running.endpoint.url}/v1/handoffs`, {
    method: "POST",
    headers,
    body: JSON.stringify(handoffBody),
  });
  assert.equal(response.status, 201);
  const created = await response.json();
  assert.equal(created.handoff.work_id, "work-http-1");
  assert.equal(created.handoff.marker_digest.length, 64);
  assert.match(created.marker, /^AF_CLAIM_TOKEN=/m);

  assert.equal((await hook({
    session_id: "manual-http",
    transcript_path: "/private/manual.jsonl",
    cwd: root,
    hook_event_name: "SessionStart",
    model: "gpt-5.6",
    permission_mode: "default",
    source: "startup",
  })).status, 204);
  response = await fetch(`${running.endpoint.url}/v1/sessions/attach`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      session_id: "manual-http",
      work_id: "work-http-1",
      role: "materialization",
    }),
  });
  assert.equal(response.status, 200);
  const attached = await response.json();
  assert.equal(attached.session_id, "manual-http");
  assert.equal(attached.work_id, "work-http-1");
  assert.equal(attached.role, "materialization");

  response = await fetch(`${running.endpoint.url}/v1/sessions/attach`, {
    method: "POST",
    headers,
    body: JSON.stringify({ work_id: "work-http-1", role: "materialization" }),
  });
  assert.equal(response.status, 400);
});

test("rejects a bridge state directory that escapes through a symlink", async (t) => {
  const base = await mkdtemp(join(tmpdir(), "af-codex-server-symlink-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const root = join(base, "repo");
  const outside = join(base, "outside");
  await mkdir(root);
  await mkdir(outside);
  await symlink(outside, join(root, ".agent-factory"));

  await assert.rejects(
    startCodexBridgeServer({ repoRoot: root }),
    /state directory must remain inside/,
  );
});
