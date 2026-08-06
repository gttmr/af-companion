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

test("App development API exposes source, mapping, and bounded context without adding a write MCP Tool", async (t) => {
  const applicationsRoot = await mkdtemp(join(tmpdir(), "companion-development-api-"));
  const launches: string[] = [];
  const server = await startCompanionWeb({
    applicationsRoot,
    assetCatalog,
    mcpBinPath: "/opt/companion/mcp.js",
    port: 0,
    developmentReadinessProbe: async () => ({ schema_version: 1, status: "offline_ready", bundle_status: "offline_ready", skills: [], model_status: "ready", reasons: [] }),
    vscodeLauncher: { async launch(projectRoot) { launches.push(projectRoot ?? ""); return { status: "accepted", workspace_path: projectRoot ?? "", launched_at: "2030-01-01T00:00:00.000Z", codex_extension_installed: true, codex_extension_version: "1.2.3" }; } },
  });
  t.after(async () => { await server.close(); await rm(applicationsRoot, { recursive: true, force: true }); });
  await fetch(`${server.origin}/api/companion/apps`, { method: "POST", headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" }, body: JSON.stringify({ application_id: "development-api", display_name: "개발 API" }) });
  const workspace = await get(`${server.origin}/api/companion/v2/workspace`);
  const created = await fetch(`${server.origin}/api/companion/source-projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" },
    body: JSON.stringify({ mode: "create", source_project: { source_project_id: "adk-runtime", root: "src/adk-runtime", runtime: { framework: "google-adk", framework_version: "2.4.0", language: "python", package_manager: "uv", entrypoint: "app/agent.py" } } }),
  });
  const createdBody = await created.json();
  assert.equal(created.status, 201, JSON.stringify(createdBody));
  assert.equal(createdBody.source_projects[0].readiness.status, "scaffold_required");
  const sources = await get(`${server.origin}/api/companion/source-projects`);
  assert.equal(sources.manifest_schema_version, 2);
  const mappings = await get(`${server.origin}/api/companion/implementation-mappings`);
  assert.deepEqual(mappings.entries, []);
  const selected = await fetch(`${server.origin}/api/companion/v2/selection`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selection: { kind: "node", id: "node.input" } }) });
  assert.equal(selected.status, 200);
  const capsule = await fetch(`${server.origin}/api/companion/development-context`, { method: "POST", headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" }, body: JSON.stringify({ expected_application_id: "development-api", expected_graph_revision: workspace.graph_revision, source_project_id: "adk-runtime", primary_intent: "implement_selected_element" }) });
  assert.equal(capsule.status, 200);
  const capsuleBody = await capsule.json();
  assert.equal(capsuleBody.graph_context.selection.id, "node.input");
  assert.equal(capsuleBody.primary_skill, "$google-agents-cli-adk-code");
  assert.equal(capsuleBody.model.model_id, "qwen3.6-27b-128k");
  assert.equal("development_model" in capsuleBody, false);
  const launched = await fetch(`${server.origin}/api/companion/development-task/launch-vscode`, { method: "POST", headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" }, body: JSON.stringify({ expected_application_id: "development-api", expected_graph_revision: workspace.graph_revision, source_project_id: "adk-runtime", primary_intent: "implement_selected_element" }) });
  const launchedBody = await launched.json();
  assert.equal(launched.status, 202, JSON.stringify(launchedBody));
  assert.equal(launchedBody.status, "requested");
  assert.equal(launchedBody.prompt_delivery, "manual_copy_required");
  assert.deepEqual(launches, [join(applicationsRoot, "development-api/src/adk-runtime")]);
  const escaped = await fetch(`${server.origin}/api/companion/source-projects`, { method: "POST", headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" }, body: JSON.stringify({ mode: "create", source_project: { source_project_id: "escape", root: "../escape", runtime: { framework: "google-adk", framework_version: "2.4.0", language: "python", package_manager: "uv", entrypoint: "app/agent.py" } } }) });
  assert.equal(escaped.status, 422);
  assert.equal((await escaped.json()).error, "invalid_source_root");
  const stale = await fetch(`${server.origin}/api/companion/development-context`, { method: "POST", headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" }, body: JSON.stringify({ expected_application_id: "development-api", expected_graph_revision: "0".repeat(64), source_project_id: "adk-runtime", primary_intent: "implement_selected_element" }) });
  assert.equal(stale.status, 412);
  assert.equal((await stale.json()).error, "graph_stale");
});
