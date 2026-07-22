import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
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

async function runAdapter(cwd, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT], { cwd, stdio: ["pipe", "pipe", "pipe"] });
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

test("project and plugin hooks expose the same events through thin adapter bootstraps", async () => {
  const project = JSON.parse(await readFile(PROJECT_HOOKS, "utf8"));
  const plugin = JSON.parse(await readFile(PLUGIN_HOOKS, "utf8"));
  assert.deepEqual(Object.keys(project.hooks).sort(), ["SessionStart", "UserPromptSubmit"]);
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

test("plugin bootstrap delegates to the workspace adapter even when a project hook file exists", async (t) => {
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

test("adapter discovers the nearest endpoint and prints only successful broker hook output", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "af-codex-adapter-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const nested = join(root, "packages", "web");
  await mkdir(nested, { recursive: true });
  const token = "t".repeat(43);
  let received;
  const broker = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = {
      url: request.url,
      authorization: request.headers.authorization,
      payload: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    };
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: "selected context",
      },
    }));
  });
  await new Promise((resolve, reject) => {
    broker.once("error", reject);
    broker.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => broker.close(resolve)));
  const address = broker.address();
  assert.notEqual(typeof address, "string");
  const endpointPath = join(root, ".agent-factory", "codex-bridge", "v1", "endpoint.json");
  await mkdir(dirname(endpointPath), { recursive: true });
  await writeFile(endpointPath, JSON.stringify({
    schema_version: 1,
    url: `http://127.0.0.1:${address.port}`,
    token,
    pid: process.pid,
    started_at: new Date().toISOString(),
  }));
  const input = {
    session_id: "session-adapter",
    turn_id: "turn-adapter",
    transcript_path: "/private/transcript.jsonl",
    cwd: nested,
    hook_event_name: "UserPromptSubmit",
    model: "gpt-5.6",
    permission_mode: "default",
    prompt: "private prompt text",
    future_codex_field: { added_without_notice: true },
  };

  const result = await runAdapter(nested, input);
  assert.equal(result.code, 0);
  assert.equal(result.stderr, "");
  assert.deepEqual(JSON.parse(result.stdout), {
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: "selected context" },
  });
  assert.equal(received.url, "/v1/hooks");
  assert.equal(received.authorization, `Bearer ${token}`);
  assert.deepEqual(received.payload, {
    session_id: input.session_id,
    turn_id: input.turn_id,
    transcript_path: input.transcript_path,
    cwd: input.cwd,
    hook_event_name: input.hook_event_name,
    model: input.model,
    permission_mode: input.permission_mode,
    prompt: input.prompt,
  });
});

test("adapter fails open without stdout for config, input, and network failures", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "af-codex-adapter-fail-"));
  t.after(() => rm(root, { recursive: true, force: true }));

  let result = await runAdapter(root, "not json");
  assert.deepEqual({ code: result.code, stdout: result.stdout, stderr: result.stderr }, { code: 0, stdout: "", stderr: "" });

  result = await runAdapter(root, { cwd: root, hook_event_name: "SessionStart" });
  assert.deepEqual({ code: result.code, stdout: result.stdout, stderr: result.stderr }, { code: 0, stdout: "", stderr: "" });

  const endpointPath = join(root, ".agent-factory", "codex-bridge", "v1", "endpoint.json");
  await mkdir(dirname(endpointPath), { recursive: true });
  await writeFile(endpointPath, JSON.stringify({ schema_version: 1, url: "https://example.com:443", token: "t".repeat(43) }));
  result = await runAdapter(root, { cwd: root, hook_event_name: "SessionStart" });
  assert.deepEqual({ code: result.code, stdout: result.stdout, stderr: result.stderr }, { code: 0, stdout: "", stderr: "" });

  await writeFile(endpointPath, JSON.stringify({ schema_version: 1, url: "http://127.0.0.1:1", token: "t".repeat(43) }));
  result = await runAdapter(root, { cwd: root, hook_event_name: "SessionStart" });
  assert.deepEqual({ code: result.code, stdout: result.stdout, stderr: result.stderr }, { code: 0, stdout: "", stderr: "" });
});
