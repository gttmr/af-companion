import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import type { CompanionRegistryContract } from "@agent-factory/companion-contracts";
import { createAssetRegistryGateway } from "../../src/server/asset-catalog.js";
import { startCompanionWeb } from "../../src/server/main.js";

const coreModulePath = fileURLToPath(new URL("../../../../agent-factory-core/src/assetRegistry.ts", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

test("shared Registry gateway owns draft, review, publish, and deprecate transitions", async (t) => {
  const fixture = await registryFixture();
  t.after(() => fixture.close());
  const { gateway } = fixture;
  const initial = gateway.listRegistry({ statuses: ["draft", "reviewed", "published", "deprecated"] });
  assert.equal(initial.items.length, 0);
  assert.match(gateway.validateRegistryContract(contract()).contract_hash, /^[a-f0-9]{64}$/u);

  const drafted = gateway.createRegistryDraft(contract(), "user:test", initial.registry_revision);
  assert.equal(drafted.asset.status, "draft");
  const editedContract = { ...contract(), responsibility: "Produce a reviewed deterministic example response." };
  const updated = gateway.updateRegistryDraft(drafted.asset.asset_id, drafted.asset.version, editedContract, drafted.registry_revision);
  assert.equal(updated.asset.responsibility, editedContract.responsibility);
  assert.notEqual(updated.asset.contract_hash, drafted.asset.contract_hash);
  const reviewed = gateway.reviewRegistryDraft(updated.asset.asset_id, updated.asset.version, decision("review"), updated.registry_revision);
  assert.equal(reviewed.asset.status, "reviewed");
  const published = gateway.publishRegistryAsset(reviewed.asset.asset_id, reviewed.asset.version, { ...decision("publish"), owner_confirmed: true, domain_confirmed: true, reuse_confirmed: true }, reviewed.registry_revision);
  assert.equal(published.asset.status, "published");
  assert.equal(gateway.search({ text: "example" }).results[0]?.asset_id, "agent.example");
  const deprecated = gateway.deprecateRegistryAsset(published.asset.asset_id, published.asset.version, decision("deprecate"), published.registry_revision);
  assert.equal(deprecated.asset.status, "deprecated");
  assert.equal(gateway.listRegistry({ statuses: ["deprecated"] }).items[0]?.status, "deprecated");
});

test("Companion Registry API requires same-origin decisions and rejects stale revisions without retry", async (t) => {
  const fixture = await registryFixture();
  const applicationsRoot = await mkdtemp(join(tmpdir(), "companion-registry-apps-"));
  const server = await startCompanionWeb({ applicationsRoot, repoRoot, registryPath: fixture.registryPath, mcpBinPath: "/opt/companion/mcp.js", port: 0 });
  t.after(async () => { await server.close(); await fixture.close(); await rm(applicationsRoot, { recursive: true, force: true }); });

  const initial = await get(`${server.origin}/api/companion/registry/assets?asset_type=agent&statuses=draft,reviewed,published,deprecated&all_versions=true`);
  const unknownQuery = await fetch(`${server.origin}/api/companion/registry/assets?unexpected=true`);
  assert.equal(unknownQuery.status, 422);
  assert.equal((await unknownQuery.json() as Record<string, unknown>).error, "invalid_query");
  const malformedRef = await fetch(`${server.origin}/api/companion/registry/assets/agent.%ZZ/versions/1`);
  assert.equal(malformedRef.status, 400);
  assert.equal((await malformedRef.json() as Record<string, unknown>).error, "invalid_asset_ref");
  const crossSite = await json(`${server.origin}/api/companion/registry/validate`, "POST", { contract: contract() }, { "Sec-Fetch-Site": "cross-site" });
  assert.equal(crossSite.status, 403);
  const missingRevision = await json(`${server.origin}/api/companion/registry/drafts`, "POST", { contract: contract(), created_by: "user:test" });
  assert.equal(missingRevision.status, 428);

  const draftedResponse = await json(`${server.origin}/api/companion/registry/drafts`, "POST", { contract: contract(), created_by: "user:test" }, { "If-Match": initial.registry_revision });
  assert.equal(draftedResponse.status, 201);
  const drafted = await draftedResponse.json() as Record<string, any>;

  const stale = await json(`${server.origin}/api/companion/registry/drafts/agent.example/versions/1/review`, "POST", { decision: decision("stale-review") }, { "If-Match": initial.registry_revision });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json() as Record<string, unknown>).error, "registry_revision_conflict");
  assert.equal((await get(`${server.origin}/api/companion/registry/assets/agent.example/versions/1`)).asset.status, "draft");

  const reviewedResponse = await json(`${server.origin}/api/companion/registry/drafts/agent.example/versions/1/review`, "POST", { decision: decision("review") }, { "If-Match": drafted.registry_revision });
  assert.equal(reviewedResponse.status, 200);
  const reviewed = await reviewedResponse.json() as Record<string, any>;
  const incompletePublish = await json(`${server.origin}/api/companion/registry/assets/agent.example/versions/1/publish`, "POST", { decision: decision("publish") }, { "If-Match": reviewed.registry_revision });
  assert.equal(incompletePublish.status, 422);

  const publishDecision = { ...decision("publish"), owner_confirmed: true, domain_confirmed: true, reuse_confirmed: true };
  const publishedResponse = await json(`${server.origin}/api/companion/registry/assets/agent.example/versions/1/publish`, "POST", { decision: publishDecision }, { "If-Match": reviewed.registry_revision });
  assert.equal(publishedResponse.status, 200);
  assert.equal((await publishedResponse.json() as Record<string, any>).asset.status, "published");
  assert.equal((await get(`${server.origin}/api/companion/assets?q=example`)).results[0]?.asset_id, "agent.example");

  const onDisk = JSON.parse(await readFile(fixture.registryPath, "utf8")) as Record<string, any>;
  assert.equal(onDisk.assets[0].status, "published");
  assert.equal(onDisk.assets[0].lifecycle.publish_decision.selected_by, "user");
});

async function registryFixture() {
  const root = await mkdtemp(join(tmpdir(), "companion-registry-"));
  const registryPath = join(root, "catalog", "asset-registry.json");
  await mkdir(join(root, "catalog"), { recursive: true });
  await writeFile(registryPath, `${JSON.stringify({ schema_version: 1, assets: [] }, null, 2)}\n`, "utf8");
  return { root, registryPath, gateway: await createAssetRegistryGateway(registryPath, coreModulePath), close: () => rm(root, { recursive: true, force: true }) };
}

function contract(): CompanionRegistryContract {
  return {
    asset_id: "agent.example",
    asset_type: "agent",
    name: "Example Agent",
    responsibility: "Produce a deterministic example response.",
    capability_tags: ["example"],
    inputs: [],
    outputs: [],
    side_effect_class: "none",
    domain_scope: "domain_neutral",
    business_domains: [],
    owner: "platform",
    reuse_status: "publish_candidate",
    binding: null,
    connection: null,
    workflow_profile: null,
    exposure: null,
    runtime_requirements: [],
    source_refs: [],
    handbook_refs: [],
    depends_on: [],
    contract_status: "draft_contract",
    risk_signals: [],
    runtime_mock: {},
    composition: [],
    notes: "Test fixture",
  };
}

function decision(id: string) { return { decision_id: `decision:${id}`, selected_by: "user" as const, rationale: `${id} evidence confirmed by the user.` }; }
async function get(url: string) { const response = await fetch(url); assert.equal(response.ok, true); return response.json() as Promise<Record<string, any>>; }
function json(url: string, method: "POST" | "PUT", body: unknown, headers: Record<string, string> = {}) { return fetch(url, { method, headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin", ...headers }, body: JSON.stringify(body) }); }
