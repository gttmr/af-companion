import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./af-codex-hook.mjs", import.meta.url));
const PROJECT_HOOKS = fileURLToPath(new URL("../.codex/hooks.json", import.meta.url));
const PLUGIN_HOOKS = fileURLToPath(new URL(
  "../plugins/agent-factory-companion/hooks/hooks.json",
  import.meta.url,
));
const PLUGIN_ENTRY = fileURLToPath(new URL(
  "../plugins/agent-factory-companion/scripts/af-codex-hook-entry.mjs",
  import.meta.url,
));
const ENROLLMENT_CAPSULE = [
  "[AF_COMPANION_ENROLLMENT_V2]",
  "AF_TICKET=ticket-v2",
  "AF_CLAIM_TOKEN=ticket.claim.token",
  "[/AF_COMPANION_ENROLLMENT_V2]",
].join("\n");
const HANDOFF_CAPSULE = [
  "[AF_COMPANION_HANDOFF_V2]",
  "AF_HANDOFF=handoff-v2",
  "AF_CLAIM_TOKEN=handoff.claim.token",
  "[/AF_COMPANION_HANDOFF_V2]",
].join("\n");
const BRIDGE_INSTANCE_ID = "bridge-test-v2";

async function runAdapter(cwd, input, options = {}) {
  return new Promise((resolve, reject) => {
    const baseEnvironment = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => key !== "AF_COMPANION_ENROLLMENT"),
    );
    const child = spawn(process.execPath, [SCRIPT], {
      cwd,
      env: { ...baseEnvironment, ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({
      code,
      signal,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
    child.stdin.end(typeof input === "string" ? input : JSON.stringify(input));
  });
}

async function runScript(script, cwd, input = "") {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({
      code,
      signal,
      stdout: Buffer.concat(stdout).toString("utf8"),
      stderr: Buffer.concat(stderr).toString("utf8"),
    }));
    child.stdin.end(input);
  });
}

async function hookWorkspace(t) {
  const root = await mkdtemp(join(tmpdir(), "af-codex-hook-v2-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts"), { recursive: true });
  await symlink(SCRIPT, join(root, "scripts", "af-codex-hook.mjs"));
  const nested = join(root, "packages", "application");
  await mkdir(nested, { recursive: true });
  return { root, nested };
}

async function startBroker(t, handler) {
  const requests = [];
  const broker = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length === 0 ? null : JSON.parse(Buffer.concat(chunks).toString("utf8"));
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      contentType: request.headers["content-type"],
      body,
    });
    await handler(request, response, body);
  });
  await new Promise((resolve, reject) => {
    broker.once("error", reject);
    broker.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => broker.close(resolve)));
  const address = broker.address();
  assert.notEqual(typeof address, "string");
  return { requests, url: `http://127.0.0.1:${address.port}` };
}

async function writeEndpoint(root, url, overrides = {}) {
  const path = join(root, ".agent-factory", "codex-bridge", "v2", "endpoint.json");
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({
    schema_version: 2,
    bridge_instance_id: BRIDGE_INSTANCE_ID,
    url,
    token: "endpoint-secret-token-".padEnd(43, "x"),
    ...overrides,
  }));
  return path;
}

async function writeLease(root, sessionId, overrides = {}) {
  const canonicalRoot = await realpath(root);
  const path = join(
    root,
    ".agent-factory",
    "codex-bridge",
    "v2",
    "leases",
    `${sha256(sessionId)}.json`,
  );
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({
    schema_version: 2,
    lease_id: `lease-${sessionId}`,
    lease_token: `lease-secret-${sessionId}`,
    bridge_instance_id: BRIDGE_INSTANCE_ID,
    session_id: sessionId,
    canonical_cwd_digest: sha256(canonicalRoot),
    workspace_id: "workspace-test",
    application_id: "application-test",
    work_id: "work-test",
    role: "materialization",
    activation_origin: "af_cli_launch",
    issued_at: "2026-07-24T00:00:00.000Z",
    expires_at: "2036-07-24T00:00:00.000Z",
    ...overrides,
  }));
  await chmod(path, 0o600);
  return path;
}

function hookInput(cwd, event, overrides = {}) {
  return {
    session_id: "session-hook-v2",
    turn_id: "turn-hook-v2",
    transcript_path: "/private/transcript.jsonl",
    cwd,
    hook_event_name: event,
    model: "gpt-5.6",
    permission_mode: "default",
    source: "startup",
    prompt: "ordinary private prompt",
    tool_name: "apply_patch",
    tool_input: { patch: "PRIVATE PATCH" },
    tool_response: "PRIVATE OUTPUT",
    future_codex_field: { added_without_notice: true },
    ...overrides,
  };
}

function assertSilentSuccess(result) {
  assert.deepEqual({ code: result.code, stdout: result.stdout, stderr: result.stderr }, {
    code: 0,
    stdout: "",
    stderr: "",
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("project and plugin hooks expose the same additive events through thin adapter bootstraps", async () => {
  const project = JSON.parse(await readFile(PROJECT_HOOKS, "utf8"));
  const plugin = JSON.parse(await readFile(PLUGIN_HOOKS, "utf8"));
  assert.deepEqual(Object.keys(project.hooks).sort(), [
    "PostToolUse",
    "PreToolUse",
    "SessionStart",
    "Stop",
    "UserPromptSubmit",
  ]);
  assert.deepEqual(Object.keys(plugin.hooks).sort(), Object.keys(project.hooks).sort());
  for (const event of Object.values(project.hooks)) {
    const command = event[0].hooks[0].command;
    assert.match(command, /git rev-parse --show-toplevel/);
    assert.match(command, /scripts\/af-codex-hook\.mjs/);
    assert.equal(event[0].hooks[0].timeout, 1);
  }
  for (const eventName of Object.keys(project.hooks)) {
    const projectGroup = project.hooks[eventName][0];
    const pluginGroup = plugin.hooks[eventName][0];
    assert.equal(pluginGroup.matcher, projectGroup.matcher);
    assert.equal(pluginGroup.hooks[0].timeout, projectGroup.hooks[0].timeout);
    assert.match(pluginGroup.hooks[0].command, /af-codex-hook-entry\.mjs/);
  }
});

test("plugin bootstrap delegates to the nearest workspace adapter even when a project hook exists", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "af-codex-plugin-entry-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "scripts"), { recursive: true });
  await writeFile(join(root, "scripts", "af-codex-hook.mjs"), "console.log('workspace-adapter-ran');\n");

  let result = await runScript(PLUGIN_ENTRY, root);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), "workspace-adapter-ran");

  await mkdir(join(root, ".codex"), { recursive: true });
  await writeFile(join(root, ".codex", "hooks.json"), JSON.stringify({
    hooks: { UserPromptSubmit: [{ hooks: [{ command: "node scripts/af-codex-hook.mjs" }] }] },
  }));
  result = await runScript(PLUGIN_ENTRY, root);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), "workspace-adapter-ran");
  assert.equal(result.stderr, "");
});

test("ordinary unmanaged lifecycle events perform zero AF network, endpoint access, or state mutation", async (t) => {
  const { root, nested } = await hookWorkspace(t);
  const broker = await startBroker(t, (_request, response) => {
    response.statusCode = 204;
    response.end();
  });
  const endpointPath = await writeEndpoint(root, broker.url);
  const statePath = join(root, ".agent-factory", "codex-bridge", "v2", "state.json");
  await writeFile(statePath, "state-sentinel\n");
  const old = new Date("2001-01-01T00:00:00.000Z");
  await utimes(endpointPath, old, old);
  const beforeEndpoint = await stat(endpointPath);
  const beforeState = await stat(statePath);

  for (const event of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop"]) {
    assertSilentSuccess(await runAdapter(nested, hookInput(nested, event)));
  }

  const afterEndpoint = await stat(endpointPath);
  const afterState = await stat(statePath);
  assert.equal(broker.requests.length, 0);
  assert.equal(afterEndpoint.atimeMs, beforeEndpoint.atimeMs);
  assert.equal(afterEndpoint.mtimeMs, beforeEndpoint.mtimeMs);
  assert.equal(afterState.mtimeMs, beforeState.mtimeMs);
  assert.equal(await readFile(statePath, "utf8"), "state-sentinel\n");
});

test("unsupported workspaces and subagent events no-op before proof transport", async (t) => {
  const unsupported = await mkdtemp(join(tmpdir(), "af-codex-unregistered-"));
  t.after(() => rm(unsupported, { recursive: true, force: true }));
  const broker = await startBroker(t, (_request, response) => {
    response.statusCode = 204;
    response.end();
  });
  await writeEndpoint(unsupported, broker.url);
  assertSilentSuccess(await runAdapter(unsupported, hookInput(unsupported, "SessionStart"), {
    env: { AF_COMPANION_ENROLLMENT: ENROLLMENT_CAPSULE },
  }));

  const { root, nested } = await hookWorkspace(t);
  await writeEndpoint(root, broker.url);
  await writeLease(root, "session-hook-v2");
  assertSilentSuccess(await runAdapter(nested, hookInput(nested, "UserPromptSubmit", {
    prompt: HANDOFF_CAPSULE,
    agent_id: "subagent-1",
  })));
  assertSilentSuccess(await runAdapter(nested, hookInput(nested, "Stop", {
    agent_type: "reviewer",
  })));
  assert.equal(broker.requests.length, 0);
});

test("valid enrollment and handoff capsules forward activation proof without raw prompt metadata", async (t) => {
  const { root, nested } = await hookWorkspace(t);
  const broker = await startBroker(t, (_request, response, body) => {
    if (body.hook_event_name === "UserPromptSubmit") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "UserPromptSubmit",
          additionalContext: "scoped handoff context",
        },
      }));
      return;
    }
    response.statusCode = 204;
    response.end();
  });
  const endpointToken = "endpoint-secret-token-".padEnd(43, "x");
  await writeEndpoint(root, broker.url, { token: endpointToken });

  assertSilentSuccess(await runAdapter(nested, hookInput(nested, "SessionStart"), {
    env: { AF_COMPANION_ENROLLMENT: ENROLLMENT_CAPSULE },
  }));
  const promptResult = await runAdapter(nested, hookInput(nested, "UserPromptSubmit", {
    prompt: HANDOFF_CAPSULE,
  }));
  assert.equal(promptResult.code, 0);
  assert.equal(promptResult.stderr, "");
  assert.deepEqual(JSON.parse(promptResult.stdout), {
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "scoped handoff context" },
  });

  assert.equal(broker.requests.length, 2);
  assert.deepEqual(broker.requests.map((request) => request.body.companion_proof), [
    { kind: "activation", activation_capsule: ENROLLMENT_CAPSULE },
    { kind: "activation", activation_capsule: HANDOFF_CAPSULE },
  ]);
  for (const request of broker.requests) {
    assert.equal(request.method, "POST");
    assert.equal(request.url, "/v1/hooks");
    assert.equal(request.authorization, `Bearer ${endpointToken}`);
    assert.equal(request.contentType, "application/json");
    assert.equal(Object.hasOwn(request.body, "prompt"), false);
    assert.equal(Object.hasOwn(request.body, "transcript_path"), false);
    assert.doesNotMatch(JSON.stringify(request.body), /private prompt|private\/transcript/i);
  }
});

test("valid exact lease forwards prompt, tool, and stop metadata with proof and secret redaction", async (t) => {
  const { root, nested } = await hookWorkspace(t);
  const broker = await startBroker(t, (_request, response) => {
    response.statusCode = 204;
    response.end();
  });
  await writeEndpoint(root, broker.url);
  const lease = await writeLease(root, "session-hook-v2");
  assert.equal((await stat(lease)).mode & 0o777, 0o600);

  for (const event of ["UserPromptSubmit", "PostToolUse", "Stop"]) {
    assertSilentSuccess(await runAdapter(nested, hookInput(nested, event)));
  }
  assert.equal(broker.requests.length, 3);
  for (const request of broker.requests) {
    assert.deepEqual(request.body.companion_proof, {
      kind: "lease",
      lease_id: "lease-session-hook-v2",
      lease_token: "lease-secret-session-hook-v2",
    });
  }
  const serialized = JSON.stringify(broker.requests);
  assert.doesNotMatch(serialized, /PRIVATE|ordinary private prompt|private\/transcript/);
  assert.equal(broker.requests[1].body.tool_name, "apply_patch");
  assert.equal(Object.hasOwn(broker.requests[1].body, "tool_input"), false);
  assert.equal(Object.hasOwn(broker.requests[1].body, "tool_response"), false);
});

test("malformed, ambiguous, and replayed-looking capsules are local no-ops", async (t) => {
  const { root, nested } = await hookWorkspace(t);
  const broker = await startBroker(t, (_request, response) => {
    response.statusCode = 204;
    response.end();
  });
  await writeEndpoint(root, broker.url);
  const prompts = [
    "[AF_COMPANION_HANDOFF_V2][/AF_COMPANION_HANDOFF_V2]",
    `${HANDOFF_CAPSULE}\n${ENROLLMENT_CAPSULE}`,
    `Please replay this old capsule: ${HANDOFF_CAPSULE}`,
    `\`${HANDOFF_CAPSULE}\``,
    "[AF_COMPANION_HANDOFF_V2]\nclaim\n[/AF_COMPANION_ENROLLMENT_V2]",
  ];
  for (const prompt of prompts) {
    assertSilentSuccess(await runAdapter(nested, hookInput(nested, "UserPromptSubmit", { prompt })));
  }
  assertSilentSuccess(await runAdapter(nested, hookInput(nested, "SessionStart"), {
    env: { AF_COMPANION_ENROLLMENT: HANDOFF_CAPSULE },
  }));
  assert.equal(broker.requests.length, 0);
});

test("expired, permissive, symlinked, and stale-bridge leases are rejected locally", async (t) => {
  const { root, nested } = await hookWorkspace(t);
  const broker = await startBroker(t, (_request, response) => {
    response.statusCode = 204;
    response.end();
  });
  await writeEndpoint(root, broker.url);
  const sessionId = "session-hook-v2";

  let leasePath = await writeLease(root, sessionId, { expires_at: "2000-01-01T00:00:00.000Z" });
  assertSilentSuccess(await runAdapter(nested, hookInput(nested, "Stop")));

  leasePath = await writeLease(root, sessionId);
  await chmod(leasePath, 0o644);
  assertSilentSuccess(await runAdapter(nested, hookInput(nested, "Stop")));

  await rm(leasePath);
  const target = join(root, "lease-target.json");
  await writeFile(target, "{}", { mode: 0o600 });
  await symlink(target, leasePath);
  assertSilentSuccess(await runAdapter(nested, hookInput(nested, "Stop")));

  await rm(leasePath);
  await writeLease(root, sessionId, { bridge_instance_id: "stale-bridge" });
  assertSilentSuccess(await runAdapter(nested, hookInput(nested, "Stop")));

  const outside = await mkdtemp(join(tmpdir(), "af-codex-lease-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const outsideLease = await writeLease(outside, sessionId, {
    canonical_cwd_digest: sha256(await realpath(root)),
  });
  const workspaceLeases = join(root, ".agent-factory", "codex-bridge", "v2", "leases");
  await rm(workspaceLeases, { recursive: true, force: true });
  await symlink(dirname(outsideLease), workspaceLeases, "dir");
  assertSilentSuccess(await runAdapter(nested, hookInput(nested, "Stop")));
  assert.equal(broker.requests.length, 0);
});

test("adapter fails open with no stdout for input, endpoint, network, and response failures", async (t) => {
  const { root, nested } = await hookWorkspace(t);
  assertSilentSuccess(await runAdapter(nested, "not json"));
  assertSilentSuccess(await runAdapter(nested, hookInput(nested, "SessionStart"), {
    env: { AF_COMPANION_ENROLLMENT: ENROLLMENT_CAPSULE },
  }));

  await writeEndpoint(root, "https://example.com:443");
  assertSilentSuccess(await runAdapter(nested, hookInput(nested, "SessionStart"), {
    env: { AF_COMPANION_ENROLLMENT: ENROLLMENT_CAPSULE },
  }));

  await writeEndpoint(root, "http://127.0.0.1:1");
  assertSilentSuccess(await runAdapter(nested, hookInput(nested, "SessionStart"), {
    env: { AF_COMPANION_ENROLLMENT: ENROLLMENT_CAPSULE },
  }));

  const broker = await startBroker(t, (_request, response) => {
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ unexpected: true }));
  });
  await writeEndpoint(root, broker.url);
  assertSilentSuccess(await runAdapter(nested, hookInput(nested, "UserPromptSubmit", {
    prompt: HANDOFF_CAPSULE,
  })));
});
