import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import {
  AssetRegistryError,
  AssetRegistryService,
  canonicalRegistryBytes,
  computeContractHash,
  computeRegistryRevision,
  contractContent,
  getL2Contract,
  loadSnapshot,
  list,
  search,
  sha256,
  usage,
  validateAssetContract,
  validateRegistryDocument,
  type AssetContractInput,
  type AssetRecord,
  type AssetRegistryDocument,
  type AssetRegistrySnapshot,
  type PublishDecision,
  type UserDecision,
} from "./assetRegistry.ts";

const repositoryRoot = resolve(dirname(new URL(import.meta.url).pathname), "../../..");
const seedPath = resolve(repositoryRoot, "catalog/asset-registry.json");

const userDecision: UserDecision = {
  decision_id: "decision:test-review",
  selected_by: "user",
  rationale: "The user explicitly approved this lifecycle transition.",
};

const publishDecision: PublishDecision = {
  decision_id: "decision:test-publish",
  selected_by: "user",
  rationale: "The user selected this reviewed contract for publication.",
  owner_confirmed: true,
  domain_confirmed: true,
  reuse_confirmed: true,
};

function errorCode(error: unknown): string | undefined {
  return error instanceof AssetRegistryError ? error.code : undefined;
}

function freshDirectory(): string {
  return mkdtempSync(resolve(tmpdir(), "af-asset-registry-"));
}

function copySeed(): { directory: string; registryPath: string; service: AssetRegistryService } {
  const directory = freshDirectory();
  const registryPath = resolve(directory, "catalog/asset-registry.json");
  const catalogDirectory = dirname(registryPath);
  mkdirSync(catalogDirectory, { recursive: true });
  writeFileSync(registryPath, readFileSync(seedPath));
  const service = new AssetRegistryService(registryPath, { lock_path: resolve(directory, ".agent-factory/state/asset-registry.lock") });
  return { directory, registryPath, service };
}

function draftContract(assetId = "tool.test.synthetic-reader"): AssetContractInput {
  return {
    asset_id: assetId,
    asset_type: "tool",
    name: "Synthetic Reader Tool",
    responsibility: "Returns deterministic synthetic records for contract tests.",
    capability_tags: ["synthetic", "retrieval"],
    inputs: [{ name: "query", type: "string", required: true }],
    outputs: [{ name: "records", type: "array", required: true }],
    side_effect_class: "read_only",
    domain_scope: "domain_neutral",
    business_domains: ["synthetic-testing"],
    owner: "Agent Factory Maintainers",
    reuse_status: "publish_candidate",
    binding: { kind: "function" },
    connection: { transport: "in_process" },
    workflow_profile: null,
    exposure: null,
    runtime_requirements: ["Node.js runtime"],
    source_refs: ["packages/agent-factory-core/src/assetRegistry.test.ts"],
    handbook_refs: ["docs/workbench/taxonomy.md"],
    depends_on: [],
    contract_status: "mock_ready",
    risk_signals: ["audit_required"],
    runtime_mock: { records: [] },
    composition: [],
    notes: "Public synthetic test fixture without production integration data.",
  };
}

function snapshotFromAssets(assets: AssetRecord[]): AssetRegistrySnapshot {
  const document = validateRegistryDocument({ schema_version: 1, assets });
  return { schema_version: 1, registry_revision: computeRegistryRevision(document), assets: document.assets };
}

function publishedRecord(input: AssetContractInput, version = 1): AssetRecord {
  return {
    ...structuredClone(input),
    version,
    status: "published",
    contract_hash: computeContractHash(input),
    lifecycle: {
      created_by: "test",
      review_decision: userDecision,
      publish_decision: publishDecision,
    },
  };
}

function runChild(script: string, env: Record<string, string>): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", script], {
      cwd: repositoryRoot,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

test("loads all published seed assets with only the three canonical types", () => {
  const snapshot = loadSnapshot(seedPath);
  assert.equal(snapshot.assets.length, 12);
  assert.deepEqual([...new Set(snapshot.assets.map((asset) => asset.asset_type))].sort(), ["agent", "tool", "workflow"]);
  assert.equal(snapshot.assets.every((asset) => asset.version === 1 && asset.status === "published"), true);
  assert.equal(snapshot.assets.every((asset) => asset.contract_hash === computeContractHash(asset)), true);
  assert.equal(snapshot.assets.every((asset) => asset.lifecycle.seed_publication?.kind === "repository_seed"), true);
  assert.equal(snapshot.assets.every((asset) => !asset.lifecycle.review_decision && !asset.lifecycle.publish_decision), true);
  const legacySemanticProjection = snapshot.assets.map((asset) => ({
    asset_id: asset.asset_id,
    asset_type: asset.asset_type,
    name: asset.name,
    domain_scope: asset.domain_scope,
    business_domains: asset.business_domains,
    owner: asset.owner,
    reuse_status: asset.reuse_status,
    capability_tags: asset.capability_tags,
    binding: asset.binding,
    connection: asset.connection,
    workflow_profile: asset.workflow_profile,
    exposure: asset.exposure,
    contract_status: asset.contract_status,
    inputs: asset.inputs,
    outputs: asset.outputs,
    risk_signals: asset.risk_signals,
    runtime_mock: asset.runtime_mock,
    notes: asset.notes,
    composition: asset.composition,
    ...(asset.asset_type === "tool" ? {} : { responsibility: asset.responsibility }),
  }));
  assert.equal(
    sha256(legacySemanticProjection),
    "92d6c86af64924b612f51a2bc3725ae4feb8f5059f08e55a9802a06c5cdf0ed7",
    "the v1 seed semantics must remain byte-order-independent and complete after the hard cut",
  );
});

test("registry revision ignores JSON formatting, key order, and asset order", () => {
  const directory = freshDirectory();
  try {
    const original = JSON.parse(readFileSync(seedPath, "utf8")) as AssetRegistryDocument;
    const reversed = {
      assets: [...original.assets].reverse().map((asset) => Object.fromEntries(Object.entries(asset).reverse())),
      schema_version: 1,
    };
    const path = resolve(directory, "registry.json");
    writeFileSync(path, JSON.stringify(reversed));
    assert.equal(loadSnapshot(path).registry_revision, loadSnapshot(seedPath).registry_revision);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("strict parsing rejects unknown fields, duplicate versions, type drift, bad versions, and incoherent lifecycle", () => {
  const source = JSON.parse(readFileSync(seedPath, "utf8")) as AssetRegistryDocument;
  const cases: Array<[string, (document: AssetRegistryDocument) => void, string]> = [
    ["unknown", (document) => { Object.assign(document.assets[0], { arbitrary: true }); }, "registry_validation_failed"],
    ["duplicate", (document) => { document.assets.push(structuredClone(document.assets[0])); }, "duplicate_asset_version"],
    ["type", (document) => {
      const next = structuredClone(document.assets[0]);
      next.version = 2;
      next.asset_type = "workflow";
      next.binding = null;
      next.connection = null;
      next.workflow_profile = { representation: "graph", coordination: "explicit", template_ref: null };
      next.contract_hash = computeContractHash(next);
      document.assets.push(next);
    }, "asset_type_changed"],
    ["version", (document) => { document.assets[0].version = 1.5; }, "registry_validation_failed"],
    ["lifecycle", (document) => { document.assets[0].status = "draft"; }, "registry_validation_failed"],
  ];
  for (const [name, mutate, code] of cases) {
    const document = structuredClone(source);
    mutate(document);
    assert.throws(() => validateRegistryDocument(document), (error) => errorCode(error) === code, name);
  }
});

test("standalone contract validation reuses the mutation contract and returns an isolated value", () => {
  const source = draftContract();
  const validated = validateAssetContract(source);
  assert.deepEqual(validated, source);
  assert.notEqual(validated, source);
  assert.throws(
    () => validateAssetContract({ ...source, notes: "" }),
    (error) => errorCode(error) === "registry_validation_failed",
  );
});

test("search emits exact, compatible, partial, and none deterministic evidence without L2 contracts", () => {
  const snapshot = loadSnapshot(seedPath);
  const target = snapshot.assets.find((asset) => asset.asset_id === "tool.page-recommendation.get-scenario-taxonomy")!;
  const exact = search(snapshot, {
    text: target.asset_id,
    asset_type: "tool",
    required_inputs: target.inputs,
    required_outputs: target.outputs,
    side_effect_class: "read_only",
    binding_kind: "mcp",
  });
  assert.equal(exact.results[0].match_grade, "exact");
  assert.equal("runtime_mock" in exact.results[0].card, false);

  const compatible = search(snapshot, {
    asset_type: "tool",
    required_inputs: [{ name: "objective_text", type: "string" }],
    side_effect_class: "read_only",
  });
  assert.equal(compatible.results.some((result) => result.match_grade === "compatible"), true);

  const partial = search(snapshot, {
    text: "taxonomy",
    required_inputs: [{ name: "optional_context", type: "object", required: false }],
  });
  assert.equal(partial.results[0].match_grade, "partial");
  assert.equal(partial.results[0].compatibility_facts.some((fact) => !fact.required && !fact.matched), true);

  const none = search(snapshot, {
    asset_type: "tool",
    required_outputs: [{ name: "impossible_output", type: "binary" }],
  });
  assert.equal(none.results.length, 0);
  assert.equal(none.candidates_considered.every((candidate) => candidate.match_grade === "none" && candidate.rejection_reasons.length > 0), true);

  const lexicalNone = search(snapshot, { text: "capability-that-does-not-exist" });
  assert.equal(lexicalNone.results.length, 0);
  assert.equal(lexicalNone.candidates_considered.every((candidate) => candidate.rejection_reasons.includes("text: no lexical or capability-tag match")), true);
});

test("L0 list and default search result bundles never exceed 20 records", () => {
  const assets = Array.from({ length: 25 }, (_, index) => publishedRecord(draftContract(`tool.test.reader-${String(index).padStart(2, "0")}`)));
  const snapshot = snapshotFromAssets(assets);
  assert.equal(list(snapshot).length, 20);
  const bundle = search(snapshot, { asset_type: "tool" });
  assert.equal(bundle.results.length, 20);
  assert.equal(bundle.candidates_considered.length, 20);
  assert.equal(bundle.candidates_considered_count, 25);
});

test("create, update, review, publish, new version, and deprecate preserve immutable version history", () => {
  const { directory, service } = copySeed();
  try {
    let snapshot = service.loadSnapshot();
    snapshot = service.createDraft(draftContract(), snapshot.registry_revision, "test-user");
    let draft = snapshot.assets.find((asset) => asset.asset_id === "tool.test.synthetic-reader")!;
    assert.equal(draft.version, 1);
    assert.equal(draft.status, "draft");

    const updated = { ...draftContract(), responsibility: "Returns updated deterministic synthetic records." };
    snapshot = service.updateDraft({ asset_id: draft.asset_id, version: 1 }, updated, snapshot.registry_revision);
    draft = snapshot.assets.find((asset) => asset.asset_id === draft.asset_id)!;
    assert.equal(draft.responsibility, updated.responsibility);

    snapshot = service.markReviewed({ asset_id: draft.asset_id, version: 1 }, userDecision, snapshot.registry_revision);
    snapshot = service.publish({ asset_id: draft.asset_id, version: 1 }, publishDecision, snapshot.registry_revision);
    const published = snapshot.assets.find((asset) => asset.asset_id === draft.asset_id && asset.version === 1)!;
    assert.equal(published.status, "published");

    snapshot = service.createDraft({ ...updated, responsibility: "Version two contract." }, snapshot.registry_revision, "test-user");
    assert.equal(snapshot.assets.find((asset) => asset.asset_id === draft.asset_id && asset.status === "draft")!.version, 2);
    assert.throws(
      () => service.createDraft(updated, snapshot.registry_revision, "test-user"),
      (error) => errorCode(error) === "draft_conflict",
    );
    snapshot = service.markReviewed({ asset_id: draft.asset_id, version: 2 }, { ...userDecision, decision_id: "decision:review-v2" }, snapshot.registry_revision);
    snapshot = service.publish({ asset_id: draft.asset_id, version: 2 }, { ...publishDecision, decision_id: "decision:publish-v2" }, snapshot.registry_revision);
    assert.equal(service.resolveActive(draft.asset_id).version, 2);
    assert.deepEqual(service.compare(draft.asset_id, 1, 2).changed_fields, ["responsibility"]);

    snapshot = service.deprecate({ asset_id: draft.asset_id, version: 1 }, { ...userDecision, decision_id: "decision:deprecate" }, snapshot.registry_revision);
    const deprecated = snapshot.assets.find((asset) => asset.asset_id === draft.asset_id && asset.version === 1)!;
    assert.equal(deprecated.status, "deprecated");
    assert.equal(deprecated.contract_hash, published.contract_hash);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("review, publish, and deprecate reject model-selected or unconfirmed decisions", () => {
  const { directory, service } = copySeed();
  try {
    let snapshot = service.loadSnapshot();
    snapshot = service.createDraft(draftContract(), snapshot.registry_revision, "test-user");
    const ref = { asset_id: "tool.test.synthetic-reader", version: 1 };
    assert.throws(
      () => service.markReviewed(ref, { ...userDecision, selected_by: "model" } as never, snapshot.registry_revision),
      (error) => errorCode(error) === "registry_validation_failed",
    );
    snapshot = service.markReviewed(ref, userDecision, snapshot.registry_revision);
    assert.throws(
      () => service.publish(ref, { ...publishDecision, owner_confirmed: false } as never, snapshot.registry_revision),
      (error) => errorCode(error) === "registry_validation_failed",
    );
    snapshot = service.publish(ref, publishDecision, snapshot.registry_revision);
    assert.throws(
      () => service.deprecate(ref, { ...userDecision, selected_by: "model" } as never, snapshot.registry_revision),
      (error) => errorCode(error) === "registry_validation_failed",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("reviewed versions block parallel drafts and unpublished dependencies block publication", () => {
  const { directory, service } = copySeed();
  try {
    let snapshot = service.loadSnapshot();
    snapshot = service.createDraft(draftContract("tool.test.dependency"), snapshot.registry_revision, "test-user");
    snapshot = service.markReviewed(
      { asset_id: "tool.test.dependency", version: 1 },
      { ...userDecision, decision_id: "decision:dependency-review" },
      snapshot.registry_revision,
    );
    assert.throws(
      () => service.createDraft(draftContract("tool.test.dependency"), snapshot.registry_revision, "test-user"),
      (error) => errorCode(error) === "draft_conflict",
    );

    snapshot = service.createDraft({
      ...draftContract("tool.test.dependent"),
      depends_on: [{ asset_id: "tool.test.dependency", version: 1 }],
    }, snapshot.registry_revision, "test-user");
    snapshot = service.markReviewed(
      { asset_id: "tool.test.dependent", version: 1 },
      { ...userDecision, decision_id: "decision:dependent-review" },
      snapshot.registry_revision,
    );
    assert.throws(
      () => service.publish(
        { asset_id: "tool.test.dependent", version: 1 },
        { ...publishDecision, decision_id: "decision:dependent-publish" },
        snapshot.registry_revision,
      ),
      (error) => errorCode(error) === "dependency_not_published",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("repository seeds can be deprecated only with a new explicit user decision", () => {
  const { directory, service } = copySeed();
  try {
    let snapshot = service.loadSnapshot();
    const seed = snapshot.assets[0];
    snapshot = service.deprecate(
      { asset_id: seed.asset_id, version: seed.version },
      { ...userDecision, decision_id: "decision:deprecate-seed" },
      snapshot.registry_revision,
    );
    const deprecated = snapshot.assets.find((asset) => asset.asset_id === seed.asset_id && asset.version === seed.version)!;
    assert.equal(deprecated.status, "deprecated");
    assert.equal(deprecated.lifecycle.seed_publication?.kind, "repository_seed");
    assert.equal(deprecated.lifecycle.deprecation_decision?.selected_by, "user");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("published contracts cannot be edited and failed validation leaves canonical bytes unchanged", () => {
  const { directory, registryPath, service } = copySeed();
  try {
    const before = readFileSync(registryPath);
    const snapshot = service.loadSnapshot();
    const published = snapshot.assets[0];
    assert.throws(
      () => service.updateDraft({ asset_id: published.asset_id, version: published.version }, contractContent(published), snapshot.registry_revision),
      (error) => errorCode(error) === "published_contract_immutable",
    );
    assert.deepEqual(readFileSync(registryPath), before);

    const invalid = { ...draftContract(), unexpected: true } as AssetContractInput;
    assert.throws(() => service.createDraft(invalid, snapshot.registry_revision, "test-user"), (error) => errorCode(error) === "registry_validation_failed");
    assert.deepEqual(readFileSync(registryPath), before);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("stale registry revision fails with HTTP-friendly conflict and unchanged bytes", () => {
  const { directory, registryPath, service } = copySeed();
  try {
    const stale = service.loadSnapshot().registry_revision;
    const next = service.createDraft(draftContract("tool.test.first"), stale, "test-user");
    const beforeConflict = readFileSync(registryPath);
    assert.throws(
      () => service.createDraft(draftContract("tool.test.second"), stale, "test-user"),
      (error) => error instanceof AssetRegistryError && error.status === 409 && error.code === "registry_revision_conflict",
    );
    assert.deepEqual(readFileSync(registryPath), beforeConflict);
    assert.notEqual(next.registry_revision, stale);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("cross-process concurrent draft creation yields one version and one revision conflict", async () => {
  const { directory, registryPath, service } = copySeed();
  try {
    const expected = service.loadSnapshot().registry_revision;
    const modulePath = resolve(repositoryRoot, "packages/agent-factory-core/src/assetRegistry.ts");
    const script = `
      import { AssetRegistryService } from ${JSON.stringify(new URL(`file://${modulePath}`).href)};
      const contract = JSON.parse(process.env.CONTRACT);
      const service = new AssetRegistryService(process.env.REGISTRY, { lock_path: process.env.LOCK });
      try {
        const result = service.createDraft(contract, process.env.EXPECTED, "child-user");
        console.log(JSON.stringify({ ok: true, revision: result.registry_revision }));
      } catch (error) {
        console.log(JSON.stringify({ ok: false, code: error.code }));
      }
    `;
    const env = {
      REGISTRY: registryPath,
      LOCK: resolve(directory, ".agent-factory/state/asset-registry.lock"),
      EXPECTED: expected,
      CONTRACT: JSON.stringify(draftContract("tool.test.concurrent")),
    };
    const children = await Promise.all([runChild(script, env), runChild(script, env)]);
    assert.equal(children.every((child) => child.code === 0), true, children.map((child) => child.stderr).join("\n"));
    const results = children.map((child) => JSON.parse(child.stdout.trim()) as { ok: boolean; code?: string });
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.deepEqual(results.filter((result) => !result.ok).map((result) => result.code), ["registry_revision_conflict"]);
    const versions = service.loadSnapshot().assets.filter((asset) => asset.asset_id === "tool.test.concurrent");
    assert.deepEqual(versions.map((asset) => asset.version), [1]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("usage and L1/L2 disclosure report explicit dependents without leaking full contracts into L0", () => {
  const snapshot = loadSnapshot(seedPath);
  const ref = { asset_id: "agent.page-recommendation.objective-classifier", version: 1 };
  const result = usage(snapshot, ref);
  assert.equal(result.usage_count, 1);
  assert.deepEqual(result.dependents, [{ asset_id: "workflow.page-recommendation.required-page-selection", version: 1 }]);
  assert.equal(getL2Contract(snapshot, ref).runtime_mock !== undefined, true);
});

test("canonical writer emits stable bytes and validator rejects a fourth asset taxonomy", () => {
  const document = JSON.parse(readFileSync(seedPath, "utf8")) as AssetRegistryDocument;
  assert.equal(canonicalRegistryBytes(document), readFileSync(seedPath, "utf8"));
  const invalid = structuredClone(document);
  invalid.assets[0].asset_type = "adapter" as never;
  assert.throws(() => validateRegistryDocument(invalid), (error) => errorCode(error) === "registry_validation_failed");
});
