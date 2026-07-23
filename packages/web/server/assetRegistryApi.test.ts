import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

import { computeContractHash, type AssetContractInput } from "../../agent-factory-core/src/assetRegistry.ts";
import { createAssetRegistryMiddleware } from "./assetRegistryApi.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const seedRegistry = resolve(repositoryRoot, "catalog", "asset-registry.json");

let tempRoot = "";
let server: Server;
let origin = "";

before(async () => {
  tempRoot = await mkdtemp(resolve(tmpdir(), "af-web-asset-registry-"));
  await mkdir(resolve(tempRoot, "catalog"), { recursive: true });
  await cp(seedRegistry, resolve(tempRoot, "catalog", "asset-registry.json"));
  const middleware = createAssetRegistryMiddleware(tempRoot);
  server = createServer((request, response) => {
    void middleware(request, response, (error) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : "unexpected middleware continuation");
    });
  });
  origin = await listen(server);
});

after(async () => {
  await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  await rm(tempRoot, { recursive: true, force: true });
});

test("serves progressive L0, L1, and L2 reads with registry ETags", async () => {
  const index = await request("/");
  assert.equal(index.response.status, 200);
  assert.equal(index.body.schema_version, 1);
  assert.deepEqual(index.body.counts, { agent: 4, workflow: 2, tool: 6 });
  assert.equal(index.body.registry_revision, index.response.headers.get("etag"));
  assert.equal(Array.isArray(index.body.items), true);
  assert.equal("agents" in index.body, false);
  assert.equal("workflows" in index.body, false);
  assert.equal("tools" in index.body, false);

  const listed = await request("/assets?asset_type=workflow&statuses=published&all_versions=true&limit=2");
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.registry_revision, listed.response.headers.get("etag"));
  assert.equal(listed.body.items.length, 2);
  assert.equal(listed.body.items.every((item: Record<string, unknown>) => item.asset_type === "workflow"), true);
  assert.equal("owner" in listed.body.items[0], false, "L0 must not expose L1 fields");

  const assetId = "workflow.page-recommendation.required-page-selection";
  const versions = await request(`/assets/${assetId}/versions`);
  assert.equal(versions.response.status, 200);
  assert.deepEqual(versions.body.items.map((item: Record<string, unknown>) => item.version), [1]);
  assert.equal("owner" in versions.body.items[0], false);

  const l1 = await request(`/assets/${assetId}/versions/1?level=1`);
  assert.equal(l1.response.status, 200);
  assert.equal(l1.body.asset.owner, "AI공통플랫폼팀");
  assert.equal(typeof l1.body.asset.usage_count, "number");
  assert.equal("lifecycle" in l1.body.asset, false);

  const l2 = await request(`/assets/${assetId}/versions/1?level=2`);
  assert.equal(l2.response.status, 200);
  assert.equal(l2.body.asset.asset_id, assetId);
  assert.equal(l2.body.asset.lifecycle.seed_publication.kind, "repository_seed");
  assert.equal("runtime_mock" in l2.body.asset, true);
});

test("serves usage and strict search bundles", async () => {
  const usage = await request("/assets/tool.page-recommendation.get-scenario-taxonomy/versions/1/usage");
  assert.equal(usage.response.status, 200);
  assert.equal(usage.body.usage.usage_count, 1);
  assert.deepEqual(usage.body.usage.dependents, [
    { asset_id: "workflow.page-recommendation.required-page-selection", version: 1 },
  ]);

  const search = await jsonRequest("/search", "POST", {
    text: "taxonomy",
    asset_type: "tool",
    side_effect_class: "read_only",
    limit: 5,
  });
  assert.equal(search.response.status, 200);
  assert.equal(search.body.registry_revision, search.response.headers.get("etag"));
  assert.deepEqual(search.body.query, {
    text: "taxonomy",
    asset_type: "tool",
    side_effect_class: "read_only",
    limit: 5,
  });
  assert.equal(search.body.results.some((result: Record<string, any>) => result.card.asset_id === "tool.page-recommendation.get-scenario-taxonomy"), true);

  const unknownSearchField = await jsonRequest("/search", "POST", { text: "taxonomy", fabricated: true });
  assert.equal(unknownSearchField.response.status, 400);
  assert.equal(unknownSearchField.body.code, "invalid_request");
});

test("validates exact contracts without requiring mutation headers", async () => {
  const contract = draftContract();
  const validated = await jsonRequest("/validate", "POST", { contract });
  assert.equal(validated.response.status, 200);
  assert.deepEqual(validated.body, { valid: true, contract_hash: computeContractHash(contract) });
  assert.equal(validated.response.headers.get("etag"), null);

  const extraKey = await jsonRequest("/validate", "POST", { contract, approved: true });
  assert.equal(extraKey.response.status, 400);
  assert.equal(extraKey.body.code, "invalid_request");

  const invalidContract = await jsonRequest("/validate", "POST", { contract: { ...contract, owner: "" } });
  assert.equal(invalidContract.response.status, 422);
  assert.equal(invalidContract.body.code, "registry_validation_failed");

  const wrongContentType = await request("/validate", {
    method: "POST",
    headers: { "content-type": "text/plain" },
    body: JSON.stringify({ contract }),
  });
  assert.equal(wrongContentType.response.status, 415);
  assert.equal(wrongContentType.body.code, "json_content_type_required");
});

test("enforces mutation boundaries, revisions, decisions, and lifecycle transitions", async () => {
  const initial = await request("/");
  const initialRevision = initial.body.registry_revision as string;
  const contract = draftContract();

  const missingRevision = await mutationRequest("/drafts", "POST", { contract, created_by: "web-test" });
  assert.equal(missingRevision.response.status, 428);
  assert.equal(missingRevision.body.code, "if_match_required");

  const malformedRevision = await mutationRequest("/drafts", "POST", { contract, created_by: "web-test" }, "not-a-revision");
  assert.equal(malformedRevision.response.status, 400);
  assert.equal(malformedRevision.body.code, "invalid_registry_revision");

  const crossOrigin = await mutationRequest("/drafts", "POST", { contract, created_by: "web-test" }, initialRevision, {
    origin: "https://attacker.invalid",
  });
  assert.equal(crossOrigin.response.status, 403);
  assert.equal(crossOrigin.body.code, "same_origin_required");

  const wrongContentType = await request("/drafts", {
    method: "POST",
    headers: { origin, "if-match": initialRevision, "content-type": "text/plain" },
    body: JSON.stringify({ contract, created_by: "web-test" }),
  });
  assert.equal(wrongContentType.response.status, 415);
  assert.equal(wrongContentType.body.code, "json_content_type_required");

  const created = await mutationRequest("/drafts", "POST", { contract, created_by: "web-test" }, initialRevision);
  assert.equal(created.response.status, 201);
  assert.equal(created.body.asset.status, "draft");
  assert.equal(created.body.asset.lifecycle.created_by, "web-test");
  assert.equal(created.body.registry_revision, created.response.headers.get("etag"));
  let revision = created.body.registry_revision as string;

  const stale = await mutationRequest(
    "/drafts",
    "POST",
    { contract: draftContract("tool.test.stale"), created_by: "web-test" },
    initialRevision,
  );
  assert.equal(stale.response.status, 409);
  assert.equal(stale.body.code, "registry_revision_conflict");
  assert.deepEqual(stale.body.details, { expected: initialRevision, actual: revision });

  const updatedContract = { ...contract, name: "Updated Synthetic Reader Tool", notes: "User-requested draft update." };
  const updated = await mutationRequest(`/drafts/${contract.asset_id}/versions/1`, "PUT", { contract: updatedContract }, revision);
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.asset.status, "draft");
  assert.equal(updated.body.asset.name, updatedContract.name);
  assert.equal(updated.body.asset.contract_hash, computeContractHash(updatedContract));
  revision = updated.body.registry_revision as string;

  const publishDecision = {
    decision_id: "decision:web-publish",
    selected_by: "user",
    rationale: "The user explicitly selected this reviewed contract for publication.",
    owner_confirmed: true,
    domain_confirmed: true,
    reuse_confirmed: true,
  };
  const invalidTransition = await mutationRequest(
    `/assets/${contract.asset_id}/versions/1/publish`,
    "POST",
    { decision: publishDecision },
    revision,
  );
  assert.equal(invalidTransition.response.status, 409);
  assert.equal(invalidTransition.body.code, "invalid_asset_transition");

  const reviewDecision = {
    decision_id: "decision:web-review",
    selected_by: "user",
    rationale: "The user explicitly approved this draft for review completion.",
  };
  const reviewed = await mutationRequest(
    `/drafts/${contract.asset_id}/versions/1/review`,
    "POST",
    { decision: reviewDecision },
    revision,
  );
  assert.equal(reviewed.response.status, 200);
  assert.equal(reviewed.body.asset.status, "reviewed");
  assert.deepEqual(reviewed.body.asset.lifecycle.review_decision, reviewDecision);
  revision = reviewed.body.registry_revision as string;

  const published = await mutationRequest(
    `/assets/${contract.asset_id}/versions/1/publish`,
    "POST",
    { decision: publishDecision },
    revision,
  );
  assert.equal(published.response.status, 200);
  assert.equal(published.body.asset.status, "published");
  assert.deepEqual(published.body.asset.lifecycle.publish_decision, publishDecision);
  revision = published.body.registry_revision as string;

  const found = await jsonRequest("/search", "POST", { text: "Updated Synthetic Reader Tool" });
  assert.equal(found.body.results[0].card.asset_id, contract.asset_id);

  const deprecationDecision = {
    decision_id: "decision:web-deprecate",
    selected_by: "user",
    rationale: "The user explicitly selected this version for deprecation.",
  };
  const deprecated = await mutationRequest(
    `/assets/${contract.asset_id}/versions/1/deprecate`,
    "POST",
    { decision: deprecationDecision },
    revision,
  );
  assert.equal(deprecated.response.status, 200);
  assert.equal(deprecated.body.asset.status, "deprecated");
  assert.deepEqual(deprecated.body.asset.lifecycle.deprecation_decision, deprecationDecision);
  revision = deprecated.body.registry_revision as string;

  const versionTwoContract = { ...updatedContract, name: "Synthetic Reader Tool v2", notes: "Second user-authored version." };
  const versionTwo = await mutationRequest(
    "/drafts",
    "POST",
    { contract: versionTwoContract, created_by: "web-test" },
    revision,
  );
  assert.equal(versionTwo.response.status, 201);
  assert.equal(versionTwo.body.asset.version, 2);

  const comparison = await request(`/assets/${contract.asset_id}/compare?from=1&to=2`);
  assert.equal(comparison.response.status, 200);
  assert.equal(comparison.body.comparison.same_contract, false);
  assert.deepEqual(comparison.body.comparison.changed_fields, ["name", "notes"]);

  const versions = await request(`/assets/${contract.asset_id}/versions`);
  assert.deepEqual(versions.body.items.map((item: Record<string, unknown>) => item.version), [2, 1]);
  assert.deepEqual(versions.body.items.map((item: Record<string, unknown>) => item.status), ["draft", "deprecated"]);
});

test("rejects malformed paths, queries, JSON, oversized bodies, unknown paths, and wrong methods", async () => {
  let result = await request("/assets?limit=01");
  assert.equal(result.response.status, 400);
  assert.equal(result.body.code, "invalid_query");

  result = await request("/assets?statuses=published,published");
  assert.equal(result.response.status, 400);

  result = await request("/assets?limit=1&limit=2");
  assert.equal(result.response.status, 400);

  result = await request("/assets/tool.unknown/versions/1?level=3");
  assert.equal(result.response.status, 400);

  result = await request("/assets?asset_type=%ZZ");
  assert.equal(result.response.status, 400);

  result = await request("/search", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not-json",
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.code, "invalid_json");

  result = await request("/validate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contract: draftContract(), padding: "x".repeat(1024 * 1024) }),
  });
  assert.equal(result.response.status, 413);
  assert.equal(result.body.code, "body_too_large");

  result = await request("/missing");
  assert.equal(result.response.status, 404);
  assert.equal(result.body.code, "not_found");

  result = await request("/assets", { method: "POST" });
  assert.equal(result.response.status, 405);
  assert.equal(result.response.headers.get("allow"), "GET");
});

function draftContract(assetId = "tool.test.synthetic-reader"): AssetContractInput {
  return {
    asset_id: assetId,
    asset_type: "tool",
    name: "Synthetic Reader Tool",
    responsibility: "Returns deterministic synthetic records for HTTP adapter tests.",
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
    source_refs: ["packages/web/server/assetRegistryApi.test.ts"],
    handbook_refs: ["docs/workbench/taxonomy.md"],
    depends_on: [],
    contract_status: "mock_ready",
    risk_signals: ["audit_required"],
    runtime_mock: { records: [] },
    composition: [],
    notes: "Synthetic HTTP adapter fixture without production integration data.",
  };
}

async function listen(httpServer: Server): Promise<string> {
  await new Promise<void>((resolveListen, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = httpServer.address();
  assert(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function request(pathname: string, init: RequestInit = {}) {
  const response = await fetch(`${origin}${pathname}`, init);
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) as Record<string, any> : {} };
}

async function jsonRequest(pathname: string, method: "POST" | "PUT", body: unknown) {
  return request(pathname, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function mutationRequest(
  pathname: string,
  method: "POST" | "PUT",
  body: unknown,
  revision?: string,
  headerOverrides: Record<string, string> = {},
) {
  return request(pathname, {
    method,
    headers: {
      "content-type": "application/json",
      origin,
      ...(revision === undefined ? {} : { "if-match": revision }),
      ...headerOverrides,
    },
    body: JSON.stringify(body),
  });
}
