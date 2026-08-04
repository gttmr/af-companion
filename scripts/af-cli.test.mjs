import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  canonicalRegistryBytes,
  computeContractHash,
  computeRegistryRevision,
} from "../packages/agent-factory-core/src/assetRegistry.ts";
import { validateContext } from "../packages/agent-factory-context-mcp/src/context.mjs";

const CLI_PATH = fileURLToPath(new URL("./af.mjs", import.meta.url));

async function tempRepository(t) {
  const root = await mkdtemp(join(tmpdir(), "af-cli-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "catalog"), { recursive: true });
  return root;
}

function runCli(root, args) {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1" },
  });
  return {
    code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    output: result.stdout ? JSON.parse(result.stdout) : null,
    error: result.stderr ? JSON.parse(result.stderr) : null,
  };
}

function runCliAsync(root, args, options = {}) {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: root,
      env: { ...process.env, NO_COLOR: "1", ...options.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.end(options.input ?? "");
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", rejectResult);
    child.once("close", (code) => {
      const stdoutText = Buffer.concat(stdout).toString("utf8");
      const stderrText = Buffer.concat(stderr).toString("utf8");
      resolveResult({
        code,
        stdout: stdoutText,
        stderr: stderrText,
        output: stdoutText ? JSON.parse(stdoutText) : null,
        error: stderrText ? JSON.parse(stderrText) : null,
      });
    });
  });
}

function toolContract(assetId, responsibility, overrides = {}) {
  return {
    asset_id: assetId,
    asset_type: "tool",
    name: `${assetId} name`,
    responsibility,
    capability_tags: ["transform", "fixture"],
    inputs: [{ name: "input", type: "string", required: true }],
    outputs: [{ name: "output", type: "string", required: true }],
    side_effect_class: "none",
    domain_scope: "domain_neutral",
    business_domains: [],
    owner: "team-a",
    reuse_status: "publish_candidate",
    binding: { kind: "function" },
    connection: { transport: "in_process" },
    workflow_profile: null,
    exposure: null,
    runtime_requirements: ["node"],
    source_refs: ["test-fixture"],
    handbook_refs: ["test-handbook"],
    depends_on: [],
    contract_status: "mock_ready",
    risk_signals: [],
    runtime_mock: { output: "fixture" },
    composition: [],
    notes: "CLI test fixture.",
    ...overrides,
  };
}

function workflowContract(assetId, dependency) {
  return {
    ...toolContract(assetId, "Consumes the transformer.", {
      asset_type: "workflow",
      capability_tags: ["orchestration"],
      binding: null,
      connection: null,
      workflow_profile: {
        representation: "graph",
        coordination: "explicit",
        template_ref: null,
      },
      depends_on: [dependency],
    }),
  };
}

function publishedRecord(contract, version) {
  return {
    ...contract,
    version,
    status: "published",
    contract_hash: computeContractHash(contract),
    lifecycle: {
      created_by: "cli-test-seed",
      seed_publication: {
        kind: "repository_seed",
        source_ref: "test:asset-registry",
        rationale: "Creates deterministic CLI read fixtures.",
      },
    },
  };
}

async function writeRegistry(root, assets = []) {
  const document = { schema_version: 1, assets };
  await writeFile(join(root, "catalog", "asset-registry.json"), canonicalRegistryBytes(document));
  return computeRegistryRevision(document);
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

async function fakeCodex(root) {
  const bin = join(root, "fake-bin");
  const executable = join(bin, "codex");
  const capture = join(root, "codex-launches.jsonl");
  await mkdir(bin, { recursive: true });
  await writeFile(executable, `#!/usr/bin/env node
const { appendFileSync } = require("node:fs");
appendFileSync(process.env.CODEX_CAPTURE_PATH, JSON.stringify({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  enrollment: process.env.AF_COMPANION_ENROLLMENT ?? null,
  stale: process.env.AF_COMPANION_STALE ?? null,
}) + "\\n");
`);
  await chmod(executable, 0o755);
  return {
    capture,
    env: {
      PATH: `${bin}:${process.env.PATH}`,
      CODEX_CAPTURE_PATH: capture,
      AF_COMPANION_STALE: "must-not-reach-child",
    },
  };
}

async function readLaunches(path) {
  const source = await readFile(path, "utf8");
  return source.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line));
}

async function repositoryFiles(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name).slice(root.length + 1))
    .sort();
}

test("work init refuses overwrite and work validate enforces strict v2", async (t) => {
  const root = await tempRepository(t);
  await rm(join(root, "catalog"), { recursive: true });

  let result = runCli(root, ["work", "init", "cli-work", "--root", root]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.output.created, true);
  assert.equal(result.output.work_item.schema_version, 2);
  assert.equal(result.output.work_item.work_id, "cli-work");
  assert.deepEqual(await repositoryFiles(root), ["artifacts/af/cli-work/af-work-item.json"]);

  result = runCli(root, ["work", "validate", "cli-work", "--root", root]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.output.valid, true);
  assert.equal(result.output.work_item.artifact_root, "artifacts/af/cli-work");

  result = runCli(root, ["work", "init", "cli-work", "--root", root]);
  assert.equal(result.code, 5);
  assert.equal(result.output, null);
  assert.equal(result.error.error.code, "work_item_exists");

  const workItemPath = join(root, "artifacts", "af", "cli-work", "af-work-item.json");
  const invalid = JSON.parse(await readFile(workItemPath, "utf8"));
  invalid.retired_field = true;
  await writeJson(workItemPath, invalid);
  result = runCli(root, ["work", "validate", workItemPath, "--root", root]);
  assert.equal(result.code, 3);
  assert.equal(result.error.error.code, "work_item_validation_failed");
});

test("mcp export-context writes portable project-scoped config and refreshes current evidence", async (t) => {
  const root = await tempRepository(t);
  const applicationRoot = join(root, "external-app");
  await mkdir(applicationRoot);
  await writeRegistry(root, [publishedRecord(toolContract("tool.shared-transform", "Transforms bounded input."), 1)]);

  let result = runCli(root, ["work", "init", "mcp-slice", "--root", root]);
  assert.equal(result.code, 0, result.stderr);
  result = runCli(root, [
    "mcp", "export-context", "mcp-slice",
    "--application", "mcp-slice-app",
    "--application-root", applicationRoot,
    "--root", root,
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.output.tool_names, [
    "af_get_context",
    "af_get_pending_work",
    "af_get_asset_or_handbook_context",
    "af_validate_decision_value",
  ]);
  assert.equal(result.output.context_path, ".agent-factory/af-context.json");
  assert.equal(result.output.config_path, ".codex/config.toml");

  const contextPath = join(applicationRoot, result.output.context_path);
  const first = validateContext(JSON.parse(await readFile(contextPath, "utf8")));
  assert.equal(first.application_id, "mcp-slice-app");
  assert.equal(first.current.ledger_revision, 0);
  assert.deepEqual(first.pending_work.actionable, [{
    id: "workflow.route",
    owner_skill: "af-workflow",
    status: "route_required",
    reason: "use the canonical workflow router; MCP does not choose or start a Work Skill",
  }]);
  assert.equal(first.pending_work.historical_handoffs.length, 0);
  assert.equal(first.support.canonical_mutation, "excluded");
  assert.doesNotMatch(JSON.stringify(first), /\/tmp\/|\/home\/|[A-Za-z]:\\/);

  const config = await readFile(join(applicationRoot, result.output.config_path), "utf8");
  assert.match(config, /^\[mcp_servers\.agent_factory\]/);
  assert.match(config, /command = "npm"/);
  assert.match(config, /"exec", "--offline", "--", "af-context-mcp", "--project-context"/);
  assert.doesNotMatch(config, /^cwd\s*=/m);
  assert.doesNotMatch(config, /\/tmp\/|\/home\/|[A-Za-z]:\\/);

  const workItemPath = join(root, "artifacts", "af", "mcp-slice", "af-work-item.json");
  const workItem = JSON.parse(await readFile(workItemPath, "utf8"));
  workItem.ledger_revision = 1;
  await writeJson(workItemPath, workItem);
  result = runCli(root, [
    "mcp", "export-context", "mcp-slice",
    "--application", "mcp-slice-app",
    "--application-root", applicationRoot,
    "--root", root,
  ]);
  assert.equal(result.code, 0, result.stderr);
  const refreshed = validateContext(JSON.parse(await readFile(contextPath, "utf8")));
  assert.equal(refreshed.current.ledger_revision, 1);
  assert.notEqual(refreshed.context_revision, first.context_revision);

  await writeFile(join(applicationRoot, ".codex", "config.toml"), "[mcp_servers.other]\ncommand = \"other\"\n");
  result = runCli(root, [
    "mcp", "export-context", "mcp-slice",
    "--application", "mcp-slice-app",
    "--application-root", applicationRoot,
    "--root", root,
  ]);
  assert.equal(result.code, 5);
  assert.equal(result.error.error.code, "project_config_conflict");
});

test("work revision hashes files deterministically and rejects duplicates and traversal", async (t) => {
  const root = await tempRepository(t);
  await writeFile(join(root, "one.txt"), "one\n");
  await mkdir(join(root, "nested"), { recursive: true });
  await writeFile(join(root, "nested", "two.txt"), "two\n");

  const first = runCli(root, [
    "work", "revision", "--root", root, "--registry-revision", "null",
    "z/two.txt=nested/two.txt", "a/one.txt=one.txt",
  ]);
  const second = runCli(root, [
    "work", "revision", "a/one.txt=one.txt", "z/two.txt=nested/two.txt",
    "--registry-revision", "null", "--root", root,
  ]);
  assert.equal(first.code, 0, first.stderr);
  assert.equal(second.code, 0, second.stderr);
  assert.deepEqual(first.output, second.output);
  assert.deepEqual(first.output.subjects.map((subject) => subject.ref), ["a/one.txt", "z/two.txt"]);
  assert.equal(
    first.output.subjects[0].sha256,
    createHash("sha256").update("one\n").digest("hex"),
  );
  assert.equal(first.output.registry_revision, null);

  let rejected = runCli(root, [
    "work", "revision", "--registry-revision", "null", "same=one.txt", "same=nested/two.txt", "--root", root,
  ]);
  assert.equal(rejected.code, 2);
  assert.match(rejected.error.error.message, /duplicated/);

  rejected = runCli(root, [
    "work", "revision", "--registry-revision", "null", "escape=../outside.txt", "--root", root,
  ]);
  assert.equal(rejected.code, 2);
  assert.match(rejected.error.error.message, /traversal/);

  rejected = runCli(root, [
    "work", "revision", "--registry-revision", "null", "../escape=one.txt", "--root", root,
  ]);
  assert.equal(rejected.code, 2);
  assert.match(rejected.error.error.message, /traversal/);
});

test("asset search, get, compare, and usage use exact Registry versions", async (t) => {
  const root = await tempRepository(t);
  const alphaV1 = toolContract("tool.cli.transformer", "Transforms version one.");
  const alphaV2 = toolContract("tool.cli.transformer", "Transforms version two with normalized output.", {
    outputs: [{ name: "normalized_output", type: "string", required: true }],
  });
  const consumer = workflowContract("workflow.cli.consumer", {
    asset_id: alphaV2.asset_id,
    version: 2,
  });
  await writeRegistry(root, [
    publishedRecord(alphaV1, 1),
    publishedRecord(alphaV2, 2),
    publishedRecord(consumer, 1),
  ]);

  let result = runCli(root, [
    "asset", "search", "--root", root, "--text", "transform", "--type", "tool", "--owner", "team-a",
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.output.results.length, 1);
  assert.equal(result.output.results[0].card.asset_id, alphaV2.asset_id);
  assert.equal(result.output.results[0].card.version, 2);

  result = runCli(root, ["asset", "get", `${alphaV2.asset_id}@2`, "--level", "1", "--root", root]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.output.usage_count, 1);
  assert.deepEqual(result.output.dependents, [{ asset_id: consumer.asset_id, version: 1 }]);
  assert.equal(result.output.runtime_mock, undefined);

  result = runCli(root, ["asset", "get", `${alphaV2.asset_id}@2`, "--level", "2", "--root", root]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.output.runtime_mock, { output: "fixture" });

  result = runCli(root, ["asset", "compare", alphaV2.asset_id, "1", "2", "--root", root]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.output.same_contract, false);
  assert.ok(result.output.changed_fields.includes("responsibility"));
  assert.ok(result.output.changed_fields.includes("outputs"));

  result = runCli(root, ["asset", "usage", `${alphaV2.asset_id}@2`, "--root", root]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.output.usage_count, 1);
  assert.deepEqual(result.output.dependents, [{ asset_id: consumer.asset_id, version: 1 }]);
});

test("asset mutations require explicit inputs, preserve decisions, and reject stale revisions", async (t) => {
  const root = await tempRepository(t);
  const initialRevision = await writeRegistry(root);
  const contractPath = join(root, "inputs", "contract.json");
  const reviewPath = join(root, "inputs", "review.json");
  const publishPath = join(root, "inputs", "publish.json");
  const deprecatePath = join(root, "inputs", "deprecate.json");
  const contract = toolContract("tool.cli.mutable", "Initial draft responsibility.");
  await writeJson(contractPath, contract);
  await writeJson(reviewPath, {
    decision_id: "decision-review-cli",
    selected_by: "user",
    rationale: "The user reviewed this exact draft.",
  });
  await writeJson(publishPath, {
    decision_id: "decision-publish-cli",
    selected_by: "user",
    rationale: "The user approved publication.",
    owner_confirmed: true,
    domain_confirmed: true,
    reuse_confirmed: true,
  });
  await writeJson(deprecatePath, {
    decision_id: "decision-deprecate-cli",
    selected_by: "user",
    rationale: "The user approved deprecation.",
  });

  let result = runCli(root, ["asset", "validate", "--contract", contractPath, "--root", root]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.output.valid, true);
  assert.equal(result.output.asset_id, contract.asset_id);
  assert.equal(result.output.contract_hash, computeContractHash(contract));

  result = runCli(root, [
    "asset", "create-draft", "--contract", contractPath, "--created-by", "cli-user",
    "--expected-revision", initialRevision, "--root", root,
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.output.asset.status, "draft");
  assert.equal(result.output.asset.lifecycle.created_by, "cli-user");
  const draftRevision = result.output.registry_revision;

  const otherContractPath = join(root, "inputs", "other-contract.json");
  await writeJson(otherContractPath, toolContract("tool.cli.stale", "Must not be created."));
  const stale = runCli(root, [
    "asset", "create-draft", "--contract", otherContractPath, "--created-by", "cli-user",
    "--expected-revision", initialRevision, "--root", root,
  ]);
  assert.equal(stale.code, 5);
  assert.equal(stale.error.error.code, "registry_revision_conflict");

  const updatedContract = { ...contract, responsibility: "Updated draft responsibility." };
  await writeJson(contractPath, updatedContract);
  result = runCli(root, [
    "asset", "update-draft", `${contract.asset_id}@1`, "--contract", contractPath,
    "--expected-revision", draftRevision, "--root", root,
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.output.asset.responsibility, updatedContract.responsibility);
  const updatedRevision = result.output.registry_revision;

  result = runCli(root, ["asset", "validate", `${contract.asset_id}@1`, "--root", root]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.output.valid, true);
  assert.equal(result.output.status, "draft");
  assert.equal(result.output.contract_hash, computeContractHash(updatedContract));

  result = runCli(root, [
    "asset", "review", `${contract.asset_id}@1`, "--decision", reviewPath,
    "--expected-revision", updatedRevision, "--root", root,
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.output.asset.status, "reviewed");
  assert.equal(result.output.asset.lifecycle.review_decision.decision_id, "decision-review-cli");
  const reviewedRevision = result.output.registry_revision;

  result = runCli(root, [
    "asset", "publish", `${contract.asset_id}@1`, "--decision", publishPath,
    "--expected-revision", reviewedRevision, "--root", root,
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.output.asset.status, "published");
  assert.equal(result.output.asset.lifecycle.publish_decision.decision_id, "decision-publish-cli");
  const publishedRevision = result.output.registry_revision;

  result = runCli(root, [
    "asset", "deprecate", `${contract.asset_id}@1`, "--decision", deprecatePath,
    "--expected-revision", publishedRevision, "--root", root,
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.output.asset.status, "deprecated");
  assert.equal(result.output.asset.lifecycle.deprecation_decision.decision_id, "decision-deprecate-cli");
});

test("companion start and join enroll exact scopes and launch fixed Codex argv with bounded per-session approval", async (t) => {
  const root = await tempRepository(t);
  const fake = await fakeCodex(root);
  const applicationRoot = join(root, "external-application");
  await mkdir(applicationRoot);
  const token = "bridge-secret-token-".padEnd(43, "x");
  const received = [];
  const bridge = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    received.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      contentType: request.headers["content-type"],
      body,
    });
    const capsule = `[AF_COMPANION_ENROLLMENT_V2]ticket-${received.length}[/AF_COMPANION_ENROLLMENT_V2]`;
    response.statusCode = 201;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      ticket: {
        ticket_id: `ticket-${received.length}`,
        workspace_eligibility: "factory",
        workspace_id: "workspace-cli",
        application_id: body.application_id,
        work_id: body.work_id,
        requested_role: body.requested_role,
        activation_origin: body.activation_origin,
        canonical_cwd_digest: "a".repeat(64),
        issued_at: "2026-07-24T00:00:00.000Z",
        expires_at: "2036-07-24T00:00:00.000Z",
        status: "pending",
        claimed_by_session_id: null,
        claimed_at: null,
        claim_token: "must-never-be-printed",
        diagnostic: token,
      },
      activation_capsule: capsule,
      command: ["codex"],
    }));
  });
  await new Promise((resolveListen, rejectListen) => {
    bridge.once("error", rejectListen);
    bridge.listen(0, "127.0.0.1", resolveListen);
  });
  t.after(() => new Promise((resolveClose) => bridge.close(resolveClose)));
  const address = bridge.address();
  assert.notEqual(typeof address, "string");
  await writeJson(join(root, ".agent-factory", "codex-bridge", "v2", "endpoint.json"), {
    schema_version: 2,
    bridge_instance_id: "bridge-cli-v2",
    url: `http://127.0.0.1:${address.port}`,
    token,
  });

  let result = await runCliAsync(root, [
    "companion", "start", "--application", "app.cli", "--work", "work-cli",
    "--role", "plan", "--root", root,
  ], { env: fake.env });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Companion Work Item not found/);
  assert.equal(received.length, 0, "a missing Work Item must fail before contacting the Bridge");

  result = runCli(root, ["work", "init", "work-cli", "--root", root]);
  assert.equal(result.code, 0, result.stderr);

  result = await runCliAsync(root, [
    "companion", "start", "--application", "app.cli", "--work", "work-cli",
    "--role", "plan", "--root", root,
  ], { env: fake.env });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.output.ticket.ticket_id, "ticket-1");
  assert.deepEqual(result.output.command, ["codex"]);

  result = await runCliAsync(root, [
    "companion", "join", "--application", "app.cli", "--work", "work-cli",
    "--role", "materialization", "--root", root,
  ], { env: fake.env });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.output.ticket.ticket_id, "ticket-2");

  result = await runCliAsync(root, [
    "companion", "vscode-start", "--application", "app.cli", "--work", "work-cli",
    "--role", "plan", "--application-root", applicationRoot, "--root", root,
  ], { env: fake.env });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.output.ticket.ticket_id, "ticket-3");
  assert.equal(result.output.ticket.activation_origin, "af_vscode_launch");
  assert.deepEqual(result.output.command, [
    "codex",
    "--sandbox",
    "workspace-write",
    "--ask-for-approval",
    "on-request",
    "--config",
    `sandbox_workspace_write.writable_roots=${JSON.stringify([applicationRoot])}`,
  ]);
  assert.equal(result.output.command.includes("--plan"), false, "VS Code launch must not force Codex Plan mode");

  assert.deepEqual(received, [
    {
      method: "POST",
      url: "/v1/enrollments",
      authorization: `Bearer ${token}`,
      contentType: "application/json",
      body: {
        application_id: "app.cli",
        work_id: "work-cli",
        requested_role: "plan",
        activation_origin: "af_cli_launch",
      },
    },
    {
      method: "POST",
      url: "/v1/enrollments",
      authorization: `Bearer ${token}`,
      contentType: "application/json",
      body: {
        application_id: "app.cli",
        work_id: "work-cli",
        requested_role: "materialization",
        activation_origin: "explicit_join_capsule",
      },
    },
    {
      method: "POST",
      url: "/v1/enrollments",
      authorization: `Bearer ${token}`,
      contentType: "application/json",
      body: {
        application_id: "app.cli",
        work_id: "work-cli",
        requested_role: "plan",
        activation_origin: "af_vscode_launch",
      },
    },
  ]);
  assert.deepEqual(await readLaunches(fake.capture), [
    {
      argv: [],
      cwd: root,
      enrollment: "[AF_COMPANION_ENROLLMENT_V2]ticket-1[/AF_COMPANION_ENROLLMENT_V2]",
      stale: null,
    },
    {
      argv: [],
      cwd: root,
      enrollment: "[AF_COMPANION_ENROLLMENT_V2]ticket-2[/AF_COMPANION_ENROLLMENT_V2]",
      stale: null,
    },
    {
      argv: [
        "--sandbox",
        "workspace-write",
        "--ask-for-approval",
        "on-request",
        "--config",
        `sandbox_workspace_write.writable_roots=${JSON.stringify([applicationRoot])}`,
      ],
      cwd: root,
      enrollment: "[AF_COMPANION_ENROLLMENT_V2]ticket-3[/AF_COMPANION_ENROLLMENT_V2]",
      stale: null,
    },
  ]);
  assert.equal(result.stdout.includes(token), false);
  assert.equal(result.stderr.includes(token), false);
  assert.equal(result.stdout.includes("AF_COMPANION_ENROLLMENT_V2"), false);
  assert.equal(result.stdout.includes("must-never-be-printed"), false);
});

test("companion start rejects a symbolic-link Work Item before endpoint discovery", async (t) => {
  const root = await tempRepository(t);
  let result = runCli(root, ["work", "init", "work-link", "--root", root]);
  assert.equal(result.code, 0, result.stderr);
  const workRoot = join(root, "artifacts", "af", "work-link");
  const workItem = join(workRoot, "af-work-item.json");
  const realWorkItem = join(workRoot, "real-af-work-item.json");
  await rename(workItem, realWorkItem);
  await symlink(realWorkItem, workItem);

  result = runCli(root, [
    "companion", "start", "--application", "app.cli", "--work", "work-link",
    "--role", "plan", "--root", root,
  ]);
  assert.notEqual(result.code, 0);
  assert.equal(result.error.error.code, "invalid_work_item");
  assert.match(result.error.error.message, /regular file/);
});

test("companion continue names one handoff and launches only the Bridge-returned capsule command", async (t) => {
  const root = await tempRepository(t);
  const fake = await fakeCodex(root);
  const capsule = "[AF_COMPANION_HANDOFF_V2]handoff-claim[/AF_COMPANION_HANDOFF_V2]";
  let received;
  const bridge = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = {
      method: request.method,
      url: request.url,
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    };
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      handoff: { handoff_id: "handoff-cli", status: "waiting_for_fresh_session" },
      activation_capsule: capsule,
      command: ["codex", capsule],
    }));
  });
  await new Promise((resolveListen, rejectListen) => {
    bridge.once("error", rejectListen);
    bridge.listen(0, "127.0.0.1", resolveListen);
  });
  t.after(() => new Promise((resolveClose) => bridge.close(resolveClose)));
  const address = bridge.address();
  assert.notEqual(typeof address, "string");
  await writeJson(join(root, ".agent-factory", "codex-bridge", "v2", "endpoint.json"), {
    schema_version: 2,
    bridge_instance_id: "bridge-cli-v2",
    url: `http://127.0.0.1:${address.port}`,
    token: "t".repeat(43),
  });

  const result = await runCliAsync(root, [
    "companion", "continue", "--handoff", "handoff-cli", "--root", root,
  ], { env: fake.env });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(received, {
    method: "POST",
    url: "/v1/handoffs/handoff-cli/continue",
    body: { confirmation: "CONTINUE_COMPANION_HANDOFF" },
  });
  assert.deepEqual(result.output.command, ["codex", "[handoff-capsule]"]);
  assert.equal(result.stdout.includes(capsule), false);
  assert.deepEqual(await readLaunches(fake.capture), [{
    argv: [capsule],
    cwd: root,
    enrollment: null,
    stale: null,
  }]);
});

test("companion prepares and continues one local pristine materialization grant without printing Plan or Capsule bytes", async (t) => {
  const root = await tempRepository(t);
  const fake = await fakeCodex(root);
  let result = runCli(root, ["work", "init", "work-bootstrap", "--root", root]);
  assert.equal(result.code, 0, result.stderr);
  const rawPlan = "\r\n# Discovery Decision Plan\r\n\r\nBuild the approved graph.\r\n\r\n";
  const canonicalPlan = "# Discovery Decision Plan\n\nBuild the approved graph.\n";
  const planHash = createHash("sha256").update(canonicalPlan, "utf8").digest("hex");
  const grantId = "grant-cli";
  const marker = [
    `AF_MATERIALIZATION_GRANT=${grantId}`,
    "AF_WORK_ITEM=work-bootstrap",
    `AF_PLAN_BODY_HASH=${planHash}`,
    "AF_TARGET=materialize-discovery",
    "",
  ].join("\n");
  const markerDigest = createHash("sha256").update(marker, "utf8").digest("hex");
  const capsule = "[AF_COMPANION_HANDOFF_V2]grant-claim[/AF_COMPANION_HANDOFF_V2]";
  const received = [];
  const bridge = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    received.push({ method: request.method, url: request.url, body });
    response.setHeader("content-type", "application/json");
    if (request.url === "/v1/materializations") {
      response.statusCode = 201;
      response.end(JSON.stringify({
        authority_kind: "grant",
        grant: {
          grant_id: grantId,
          work_id: body.work_id,
          from_session_id: body.from_session_id,
          from_turn_id: body.from_turn_id,
          plan_body_hash: body.plan_body_hash,
          marker_digest: markerDigest,
          target_skill: "af-discover-assets.materialize",
          status: "ready",
        },
        portable_marker: marker,
      }));
      return;
    }
    response.statusCode = 200;
    response.end(JSON.stringify({
      grant: { grant_id: grantId, status: "waiting_for_fresh_session" },
      activation_capsule: capsule,
      command: ["codex", capsule],
    }));
  });
  await new Promise((resolveListen, rejectListen) => {
    bridge.once("error", rejectListen);
    bridge.listen(0, "127.0.0.1", resolveListen);
  });
  t.after(() => new Promise((resolveClose) => bridge.close(resolveClose)));
  const address = bridge.address();
  assert.notEqual(typeof address, "string");
  await writeJson(join(root, ".agent-factory", "codex-bridge", "v2", "endpoint.json"), {
    schema_version: 2,
    bridge_instance_id: "bridge-cli-v2",
    url: `http://127.0.0.1:${address.port}`,
    token: "g".repeat(43),
  });

  result = await runCliAsync(root, [
    "companion", "prepare-materialization",
    "--work", "work-bootstrap",
    "--session", "plan-session",
    "--turn", "plan-turn",
    "--root", root,
  ], { input: rawPlan });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.output.authority_kind, "grant");
  assert.equal(result.output.grant.grant_id, grantId);
  assert.equal(result.output.portable_marker, marker);
  assert.equal(result.stdout.includes(canonicalPlan), false);
  assert.deepEqual(received[0], {
    method: "POST",
    url: "/v1/materializations",
    body: {
      work_id: "work-bootstrap",
      from_session_id: "plan-session",
      from_turn_id: "plan-turn",
      plan_body_hash: planHash,
      plan_body: canonicalPlan,
    },
  });

  result = await runCliAsync(root, [
    "companion", "continue", "--grant", grantId, "--root", root,
  ], { env: fake.env });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(received[1], {
    method: "POST",
    url: "/v1/materialization-grants/grant-cli/continue",
    body: { confirmation: "CONTINUE_COMPANION_HANDOFF" },
  });
  assert.equal(result.output.grant.grant_id, grantId);
  assert.deepEqual(result.output.command, ["codex", "[handoff-capsule]"]);
  assert.equal(result.stdout.includes(capsule), false);
  assert.deepEqual(await readLaunches(fake.capture), [{
    argv: [capsule],
    cwd: root,
    enrollment: null,
    stale: null,
  }]);
});

test("companion prepares one re-entrant materialization handoff without printing Plan bytes", async (t) => {
  const root = await tempRepository(t);
  let result = runCli(root, ["work", "init", "work-reentry", "--root", root]);
  assert.equal(result.code, 0, result.stderr);
  const rawPlan = "\r\n# Return-to-Discover Plan\r\n\r\nMaterialize the approved disposition change.\r\n";
  const canonicalPlan = "# Return-to-Discover Plan\n\nMaterialize the approved disposition change.\n";
  const planHash = createHash("sha256").update(canonicalPlan, "utf8").digest("hex");
  const handoffId = "handoff-reentry-cli";
  const discoveryRevision = "a".repeat(64);
  const decisionRevision = "b".repeat(64);
  const marker = [
    "AF_WORK_ITEM=work-reentry",
    `AF_HANDOFF=${handoffId}`,
    `AF_DISCOVERY_REVISION=${discoveryRevision}`,
    "AF_TARGET=materialize-discovery",
    "",
  ].join("\n");
  const markerDigest = createHash("sha256").update(marker, "utf8").digest("hex");
  let received;
  const bridge = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    received = { method: request.method, url: request.url, body };
    response.statusCode = 201;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      authority_kind: "handoff",
      handoff: {
        handoff_id: handoffId,
        work_id: body.work_id,
        from_session_id: body.from_session_id,
        from_turn_id: body.from_turn_id,
        discovery_revision: discoveryRevision,
        decision_revision: decisionRevision,
        plan_body_hash: body.plan_body_hash,
        marker_digest: markerDigest,
        target_skill: "af-discover-assets.materialize",
        status: "ready",
      },
      portable_marker: marker,
    }));
  });
  await new Promise((resolveListen, rejectListen) => {
    bridge.once("error", rejectListen);
    bridge.listen(0, "127.0.0.1", resolveListen);
  });
  t.after(() => new Promise((resolveClose) => bridge.close(resolveClose)));
  const address = bridge.address();
  assert.notEqual(typeof address, "string");
  await writeJson(join(root, ".agent-factory", "codex-bridge", "v2", "endpoint.json"), {
    schema_version: 2,
    bridge_instance_id: "bridge-reentry-cli-v2",
    url: `http://127.0.0.1:${address.port}`,
    token: "h".repeat(43),
  });

  result = await runCliAsync(root, [
    "companion", "prepare-materialization",
    "--work", "work-reentry",
    "--session", "plan-session",
    "--turn", "plan-turn",
    "--root", root,
  ], { input: rawPlan });

  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.output.authority_kind, "handoff");
  assert.equal(result.output.handoff.handoff_id, handoffId);
  assert.equal(result.output.portable_marker, marker);
  assert.equal(result.stdout.includes(canonicalPlan), false);
  assert.deepEqual(received, {
    method: "POST",
    url: "/v1/materializations",
    body: {
      work_id: "work-reentry",
      from_session_id: "plan-session",
      from_turn_id: "plan-turn",
      plan_body_hash: planHash,
      plan_body: canonicalPlan,
    },
  });
});

test("companion reset is explicit and no companion command auto-selects scope", async (t) => {
  const root = await tempRepository(t);
  let resetCount = 0;
  const bridge = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : null;
    if (request.method === "POST" && request.url === "/v1/state/reset") {
      assert.deepEqual(body, { confirmation: "RESET_COMPANION_STATE_V2" });
      resetCount += 1;
    }
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ reset: true, schema_version: 2 }));
  });
  await new Promise((resolveListen, rejectListen) => {
    bridge.once("error", rejectListen);
    bridge.listen(0, "127.0.0.1", resolveListen);
  });
  t.after(() => new Promise((resolveClose) => bridge.close(resolveClose)));
  const address = bridge.address();
  assert.notEqual(typeof address, "string");
  await writeJson(join(root, ".agent-factory", "codex-bridge", "v2", "endpoint.json"), {
    schema_version: 2,
    bridge_instance_id: "bridge-cli-v2",
    url: `http://127.0.0.1:${address.port}`,
    token: "r".repeat(43),
  });

  let result = runCli(root, ["companion", "start", "--root", root]);
  assert.equal(result.code, 2);
  assert.match(result.error.error.message, /--application/);
  result = runCli(root, ["companion", "continue", "--root", root]);
  assert.equal(result.code, 2);
  assert.match(result.error.error.message, /--handoff/);
  result = runCli(root, ["companion", "reset", "--root", root]);
  assert.equal(result.code, 2);
  assert.match(result.error.error.message, /--confirm/);
  assert.equal(resetCount, 0);

  result = await runCliAsync(root, ["companion", "reset", "--confirm", "--root", root]);
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.output, { reset: true, schema_version: 2 });
  assert.equal(resetCount, 1);
});
