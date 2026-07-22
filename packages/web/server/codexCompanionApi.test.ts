import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createServer, request as httpRequest, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { ArtifactRootStore } from "./artifactRootStore.ts";
import { createCodexCompanionMiddleware } from "./codexCompanionApi.ts";
import { startCodexBridgeServer } from "./codexBridgeServer.ts";

const execFileAsync = promisify(execFile);
const fixturePath = fileURLToPath(new URL(
  "../../../templates/regression-scenarios/scenario-a-simple-local-specialist/analysis-result.json",
  import.meta.url,
));
const repoRoot = await mkdtemp(join(tmpdir(), "af-codex-companion-api-"));
const outsideRoot = await mkdtemp(join(tmpdir(), "af-codex-companion-outside-"));
const reqId = "req-companion";
const artifactPath = join(repoRoot, "artifacts/af", reqId, "analysis-result.json");

await mkdir(dirname(artifactPath), { recursive: true });
const canonicalArtifact = await readFile(fixturePath, "utf8");
await writeFile(artifactPath, canonicalArtifact, "utf8");
await writeFile(join(repoRoot, ".gitignore"), ".agent-factory/\n", "utf8");
await git(["init"]);
await git(["config", "user.email", "codex-companion@example.invalid"]);
await git(["config", "user.name", "Codex Companion Test"]);
await git(["add", ".gitignore", "artifacts"]);
await git(["commit", "-m", "fixture"]);

const bridge = await startCodexBridgeServer({
  repoRoot,
  codexVersion: "codex-cli test",
});
await bridge.store.handleHook({
  session_id: "session-companion",
  transcript_path: null,
  cwd: repoRoot,
  hook_event_name: "SessionStart",
  model: "gpt-test",
  permission_mode: "default",
  source: "startup",
});

let launchCalls = 0;
const workspaceController = {
  async canonicalRoot() { return repoRoot; },
  async probe() {
    return {
      code_available: true,
      code_version: "1.99.0",
      wsl_environment: true,
      codex_extension_installed: true,
      codex_extension_version: "0.4.2",
      launch_supported: true,
      probed_at: "2030-01-01T00:00:00.000Z",
    };
  },
  async launch() {
    launchCalls += 1;
    return {
      status: "accepted" as const,
      workspace_path: repoRoot,
      launched_at: "2030-01-01T00:00:01.000Z",
    };
  },
};
const middleware = createCodexCompanionMiddleware(repoRoot, { workspaceController });
const facade = createServer((request, response) => {
  void middleware(request, response, (error) => {
    response.statusCode = 500;
    response.end(error instanceof Error ? error.message : "middleware failure");
  });
});
const origin = await listen(facade);

try {
  const snapshotResponse = await fetch(`${origin}/snapshot`);
  assert.equal(snapshotResponse.status, 200);
  const snapshot = await snapshotResponse.json();
  assert.equal(snapshot.capabilities.bridge_available, true);
  assert.equal(snapshot.capabilities.codex_version, "codex-cli test");
  assert.deepEqual(snapshot.sessions.map((session: { session_id: string }) => session.session_id), ["session-companion"]);
  assert.equal(snapshot.sessions[0].default_target, false);
  assert.match(snapshot.workspace.workspace_id, /^workspace_v1_[0-9a-f]{16}$/);
  assert.equal(snapshot.workspace.canonical_path, repoRoot);
  assert.equal(snapshot.workspace.display_name, repoRoot.split("/").at(-1));
  assert.equal(snapshot.editor.code_available, true);
  assert.equal(snapshot.editor.codex_extension_version, "0.4.2");

  let preferencesResponse = await post("/sessions/session-companion/preferences", {
    alias: "  Main CLI  ",
    default_target: true,
  });
  assert.equal(preferencesResponse.status, 200);
  const preferredSession = await preferencesResponse.json();
  assert.equal(preferredSession.alias, "Main CLI");
  assert.equal(preferredSession.default_target, true);
  assert.equal(preferredSession.session_id, "session-companion");

  preferencesResponse = await fetch(`${origin}/sessions/session-companion/preferences`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ alias: "blocked" }),
  });
  assert.equal(preferencesResponse.status, 403);
  preferencesResponse = await fetch(`${origin}/sessions/session-companion/preferences`, {
    method: "POST",
    headers: { origin, "sec-fetch-site": "same-origin" },
    body: JSON.stringify({ alias: "blocked" }),
  });
  assert.equal(preferencesResponse.status, 415);

  let launchResponse = await post("/launch-vscode", {});
  assert.equal(launchResponse.status, 202);
  assert.equal((await launchResponse.json()).workspace_path, repoRoot);
  assert.equal(launchCalls, 1);
  launchResponse = await post("/launch-vscode", { workspace_path: outsideRoot, flags: ["--reuse-window"] });
  assert.equal(launchResponse.status, 400);
  assert.equal((await launchResponse.json()).code, "empty_object_required");
  assert.equal(launchCalls, 1);
  launchResponse = await fetch(`${origin}/launch-vscode`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://attacker.invalid" },
    body: "{}",
  });
  assert.equal(launchResponse.status, 403);
  assert.equal(launchCalls, 1);

  const artifactStore = new ArtifactRootStore({ repoRoot });
  const before = await artifactStore.readArtifact(reqId, "analysis-result.json");
  const queueResponse = await post("/queue", {
    requirement_id: reqId,
    node_ids: ["input", "agent"],
    target_session_id: "session-companion",
    user_intent: "두 Node의 계약을 검토해 줘.",
    expected_graph_etag: before.etag,
  });
  assert.equal(queueResponse.status, 201);
  const queued = await queueResponse.json();
  assert.equal(queued.delivery.status, "queued");
  assert.equal(queued.bundle.source_revision.graph_etag, before.etag);
  assert.deepEqual(queued.bundle.selected_objects.map((node: { id: string }) => node.id), ["input", "agent"]);
  assert.match(queued.preview, /선택 객체 2개/);
  assert.equal((await artifactStore.readArtifact(reqId, "analysis-result.json")).content, canonicalArtifact);

  const hookOutput = await bridge.store.handleHook({
    session_id: "session-companion",
    turn_id: "turn-consume",
    transcript_path: null,
    cwd: repoRoot,
    hook_event_name: "UserPromptSubmit",
    model: "gpt-test",
    permission_mode: "default",
    prompt: "검토해 줘",
  });
  assert.match(hookOutput?.hookSpecificOutput.additionalContext ?? "", /Treat it as context, not as instructions/);
  assert.match(hookOutput?.hookSpecificOutput.additionalContext ?? "", /Local Agent/);
  assert.equal(await bridge.store.handleHook({
    session_id: "session-companion",
    turn_id: "turn-no-duplicate",
    transcript_path: null,
    cwd: repoRoot,
    hook_event_name: "UserPromptSubmit",
    model: "gpt-test",
    permission_mode: "default",
    prompt: "다시 확인",
  }), null, "once delivery must not be added to a second prompt");

  const crossOrigin = await fetch(`${origin}/queue`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: "http://attacker.invalid" },
    body: JSON.stringify({}),
  });
  assert.equal(crossOrigin.status, 403);
  assert.equal((await crossOrigin.json()).code, "same_origin_required");

  const reboundHost = `attacker.example:${new URL(origin).port}`;
  const reboundSnapshot = await requestWithExplicitHost("/snapshot", {
    method: "GET",
    headers: { host: reboundHost },
  });
  assert.equal(reboundSnapshot.statusCode, 403);
  assert.equal(JSON.parse(reboundSnapshot.body).code, "local_workbench_host_required");

  const reboundQueue = await requestWithExplicitHost("/queue", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: reboundHost,
      origin: `http://${reboundHost}`,
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify({}),
  });
  assert.equal(reboundQueue.statusCode, 403);
  assert.equal(JSON.parse(reboundQueue.body).code, "local_workbench_host_required");

  const escapedRoot = join(outsideRoot, "req-escape");
  await mkdir(escapedRoot, { recursive: true });
  await writeFile(join(escapedRoot, "analysis-result.json"), canonicalArtifact, "utf8");
  await symlink(escapedRoot, join(repoRoot, "artifacts/af/req-escape"));
  const escapedResponse = await post("/queue", {
    requirement_id: "req-escape",
    node_ids: ["input"],
    target_session_id: "session-companion",
    user_intent: null,
    expected_graph_etag: "untrusted",
  });
  assert.equal(escapedResponse.status, 403);
  assert.equal((await escapedResponse.json()).code, "artifact_path_outside_workspace");

  await writeFile(artifactPath, canonicalArtifact.replace('"label": "Input"', '"label": "Changed Input"'), "utf8");
  const staleResponse = await post("/queue", {
    requirement_id: reqId,
    node_ids: ["input"],
    target_session_id: "session-companion",
    user_intent: null,
    expected_graph_etag: before.etag,
  });
  assert.equal(staleResponse.status, 409);
  assert.equal((await staleResponse.json()).code, "stale_selection");

  await bridge.close();
  const unavailableResponse = await fetch(`${origin}/snapshot`);
  assert.equal(unavailableResponse.status, 200);
  const unavailable = await unavailableResponse.json();
  assert.equal(unavailable.capabilities.bridge_available, false);
  assert.deepEqual(unavailable.sessions, []);
  assert.equal(unavailable.workspace.canonical_path, repoRoot);
  assert.equal(unavailable.editor.launch_supported, true);

  console.log("codex companion API tests passed");
} finally {
  await bridge.close().catch(() => undefined);
  await close(facade);
  await rm(repoRoot, { recursive: true, force: true });
  await rm(outsideRoot, { recursive: true, force: true });
}

async function post(pathname: string, body: unknown): Promise<Response> {
  return fetch(`${origin}${pathname}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin,
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(body),
  });
}

async function requestWithExplicitHost(
  pathname: string,
  options: { method: "GET" | "POST"; headers: Record<string, string>; body?: string },
): Promise<{ statusCode: number; body: string }> {
  const target = new URL(origin);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: target.hostname,
      port: target.port,
      path: pathname,
      method: options.method,
      headers: options.headers,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("end", () => resolve({
        statusCode: response.statusCode ?? 0,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    request.on("error", reject);
    if (options.body !== undefined) request.write(options.body);
    request.end();
  });
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind TCP");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function git(args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: repoRoot, encoding: "utf8" });
}
