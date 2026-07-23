import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
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

function runCliAsync(root, args) {
  return new Promise((resolveResult, rejectResult) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], {
      cwd: root,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
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

test("work attach-session posts the exact bridge contract without token leakage", async (t) => {
  const root = await tempRepository(t);
  const token = "bridge-secret-token-".padEnd(43, "x");
  let received;
  const bridge = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = {
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      contentType: request.headers["content-type"],
      body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
    };
    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({
      session_id: "session-cli",
      work_id: "work-cli",
      role: "materialization",
      diagnostic: token,
    }));
  });
  await new Promise((resolveListen, rejectListen) => {
    bridge.once("error", rejectListen);
    bridge.listen(0, "127.0.0.1", resolveListen);
  });
  t.after(() => new Promise((resolveClose) => bridge.close(resolveClose)));
  const address = bridge.address();
  assert.notEqual(typeof address, "string");

  const endpointPath = join(root, ".agent-factory", "codex-bridge", "v1", "endpoint.json");
  await writeJson(endpointPath, {
    schema_version: 1,
    url: `http://127.0.0.1:${address.port}`,
    token,
    pid: process.pid,
    started_at: new Date().toISOString(),
  });

  const result = await runCliAsync(root, [
    "work", "attach-session", "--session", "session-cli", "--work-id", "work-cli",
    "--role", "materialization", "--root", root,
  ]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.deepEqual(received, {
    method: "POST",
    url: "/v1/sessions/attach",
    authorization: `Bearer ${token}`,
    contentType: "application/json",
    body: {
      session_id: "session-cli",
      work_id: "work-cli",
      role: "materialization",
    },
  });
  assert.equal(result.output.diagnostic, "[redacted]");
  assert.equal(result.stdout.includes(token), false);
  assert.equal(result.stderr.includes(token), false);
});
