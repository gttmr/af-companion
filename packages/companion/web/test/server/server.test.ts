import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { startCompanionWeb } from "../../src/server/main.js";
import type { AssetCatalog } from "@agent-factory/companion-graph-control-server";

const registryRevision = "a".repeat(64);
const assetCatalog: AssetCatalog = {
  snapshotRevision: () => registryRevision,
  search: () => ({ registry_revision: registryRevision, results: [{ asset_id: "agent.review", asset_type: "agent", version: 1, status: "published", name: "검토 Agent", responsibility: "문서를 검토합니다.", capability_tags: ["review"], contract_hash: "b".repeat(64) }] }),
  resolveExact: () => ({ asset_id: "agent.review", asset_type: "agent", version: 1, status: "published", name: "검토 Agent", responsibility: "문서를 검토합니다.", capability_tags: ["review"], contract_hash: "b".repeat(64) }),
};

test("v2 API applies operations with CAS and reports stale writes", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "companion-web-")); const server = await startCompanionWeb({ projectRoot: root, port: 0 }); t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  const initial = await get(`${server.origin}/api/companion/v2/workspace`); assert.equal(initial.schema_version, 2); assert.equal("sequence" in initial, false);
  const operation = { op: "replace", target: "node", id: "node.output", value: { id: "node.output", label: "완료", node_kind: "output" } };
  const applied = await fetch(`${server.origin}/api/companion/v2/graph/operations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base_graph_revision: initial.graph_revision, operations: [operation] }) }); assert.equal(applied.status, 200); assert.equal((await applied.json()).outcome, "APPLIED");
  const stale = await fetch(`${server.origin}/api/companion/v2/graph/operations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base_graph_revision: initial.graph_revision, operations: [operation] }) }); assert.equal(stale.status, 412); assert.equal((await stale.json()).error, "graph_stale");
});

test("Web composition opens only the server-derived project root in VS Code", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "companion-vscode-"));
  const launches: string[] = [];
  const server = await startCompanionWeb({
    projectRoot: root,
    port: 0,
    vscodeLauncher: {
      async launch() {
        launches.push(root);
        return {
          status: "accepted",
          workspace_path: root,
          launched_at: "2030-01-01T00:00:00.000Z",
          codex_extension_installed: true,
          codex_extension_version: "1.2.3",
        };
      },
    },
  });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });

  const response = await fetch(`${server.origin}/api/companion/editor/launch-vscode`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
    body: "{}",
  });
  assert.equal(response.status, 202);
  assert.equal((await response.json()).workspace_path, root);
  assert.deepEqual(launches, [root]);

  const crossSite = await fetch(`${server.origin}/api/companion/editor/launch-vscode`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "cross-site" },
    body: "{}",
  });
  assert.equal(crossSite.status, 403);
  assert.deepEqual(launches, [root]);
});
async function get(url: string) { const response = await fetch(url); assert.equal(response.ok, true); return response.json() as Promise<Record<string, any>>; }

test("App Manager API creates an isolated app and binds a published Asset before Graph use", async (t) => {
  const applicationsRoot = await mkdtemp(join(tmpdir(), "companion-app-api-"));
  const server = await startCompanionWeb({ applicationsRoot, assetCatalog, mcpBinPath: "/opt/companion/mcp.js", port: 0 });
  t.after(async () => { await server.close(); await rm(applicationsRoot, { recursive: true, force: true }); });
  const empty = await get(`${server.origin}/api/companion/apps`); assert.equal(empty.active_application_id, null);
  const created = await fetch(`${server.origin}/api/companion/apps`, { method: "POST", headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" }, body: JSON.stringify({ application_id: "review-app", display_name: "검토 App" }) });
  assert.equal(created.status, 201); assert.equal((await created.json()).active_application_id, "review-app");
  const search = await get(`${server.origin}/api/companion/assets?q=review`); assert.equal(search.results[0].asset_id, "agent.review");
  const bindings = await get(`${server.origin}/api/companion/app-assets`);
  const bound = await fetch(`${server.origin}/api/companion/app-assets`, { method: "POST", headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" }, body: JSON.stringify({ asset_id: "agent.review", version: 1, registry_revision: registryRevision, base_assets_revision: bindings.assets_revision }) });
  assert.equal(bound.status, 201); assert.equal((await bound.json()).bindings[0].asset_id, "agent.review");
  const workspace = await get(`${server.origin}/api/companion/v2/workspace`);
  const applied = await fetch(`${server.origin}/api/companion/v2/graph/operations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base_graph_revision: workspace.graph_revision, operations: [{ op: "add", target: "node", value: { id: "node.review", label: "검토 Agent", node_kind: "agent", agent_ref: "agent.review", available_tools: [] } }] }) });
  assert.equal(applied.status, 200); assert.equal((await applied.json()).outcome, "APPLIED");
});
