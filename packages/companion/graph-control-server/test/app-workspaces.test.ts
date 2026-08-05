import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, lstat, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import type { CompanionAssetCard } from "@agent-factory/companion-contracts";
import { ActiveAppWorkspaceController, AppWorkspaceError, type AssetCatalog } from "../src/index.js";

const execFileAsync = promisify(execFile);
const revision = "a".repeat(64);
const assets: CompanionAssetCard[] = [
  { asset_id: "agent.review", asset_type: "agent", version: 1, status: "published", name: "검토 Agent", responsibility: "검토", capability_tags: [], contract_hash: "1".repeat(64) },
  { asset_id: "tool.search", asset_type: "tool", version: 1, status: "published", name: "검색 Tool", responsibility: "검색", capability_tags: [], contract_hash: "2".repeat(64) },
  { asset_id: "workflow.publish", asset_type: "workflow", version: 1, status: "published", name: "게시 Workflow", responsibility: "게시", capability_tags: [], contract_hash: "3".repeat(64) },
];

function catalog(): AssetCatalog {
  return {
    snapshotRevision: () => revision,
    search: ({ text, asset_type }) => ({ registry_revision: revision, results: assets.filter((asset) => (!text || `${asset.name} ${asset.responsibility} ${asset.asset_id}`.includes(text)) && (!asset_type || asset.asset_type === asset_type)) }),
    resolveExact: (assetId, version) => { const asset = assets.find((entry) => entry.asset_id === assetId && entry.version === version); if (!asset) throw new Error("missing"); return structuredClone(asset); },
  };
}

async function managerRoot() {
  const root = await mkdtemp(join(tmpdir(), "companion-apps-"));
  const manager = new ActiveAppWorkspaceController({ applicationsRoot: root, mcpBinPath: "/opt/companion/mcp.js", assetCatalog: catalog(), now: () => new Date("2030-01-01T00:00:00.000Z") });
  await manager.initialize();
  await manager.setControlCapability({ origin: "http://127.0.0.1:8894", token: "f".repeat(64) });
  return { root, manager };
}

async function gitOutput(projectRoot: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd: projectRoot });
  return stdout.replace(/\r?\n$/u, "");
}

test("creates a private Git app workspace with a minimal Graph and exact MCP cwd", async (t) => {
  const { root, manager } = await managerRoot();
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }); });
  const listed = await manager.createApp("document-review", "문서 검토");
  assert.equal(listed.active_application_id, "document-review");
  await assert.rejects(() => manager.createApp("document-review", "덮어쓰기 시도"), (error: unknown) => error instanceof AppWorkspaceError && error.code === "application_exists");
  const appRoot = join(root, "document-review");
  assert.equal((await lstat(join(appRoot, ".git"))).isDirectory(), true);
  const manifest = JSON.parse(await readFile(join(appRoot, ".agent-factory/companion-app.json"), "utf8"));
  assert.equal(manifest.application_id, "document-review");
  const graph = JSON.parse(await readFile(join(appRoot, ".agent-factory/companion-graph.json"), "utf8"));
  assert.deepEqual(graph.nodes.map((node: { node_kind: string }) => node.node_kind), ["input", "output"]);
  assert.equal(graph.edges.length, 1);
  const config = await readFile(join(appRoot, ".codex/config.toml"), "utf8");
  assert.match(config, new RegExp(JSON.stringify(appRoot).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal((await lstat(join(appRoot, ".codex/config.toml"))).mode & 0o777, 0o600);
  assert.equal((await lstat(join(appRoot, ".agent-factory/companion-capability.json"))).mode & 0o777, 0o600);
  assert.equal(await gitOutput(appRoot, ["branch", "--show-current"]), "main");
  assert.equal(await gitOutput(appRoot, ["rev-list", "--count", "HEAD"]), "1");
  assert.deepEqual((await gitOutput(appRoot, ["log", "-1", "--format=%s%n%an%n%ae%n%cn%n%ce"])).split("\n"), [
    "chore: initialize Companion app workspace",
    "Agent Factory Companion",
    "companion@agent-factory.local",
    "Agent Factory Companion",
    "companion@agent-factory.local",
  ]);
  assert.deepEqual((await gitOutput(appRoot, ["ls-tree", "-r", "--name-only", "HEAD"])).split("\n").sort(), [
    ".agent-factory/companion-app.json",
    ".agent-factory/companion-assets.json",
    ".agent-factory/companion-graph.json",
    ".gitignore",
  ].sort());
  assert.equal(await gitOutput(appRoot, ["status", "--porcelain=v1", "--untracked-files=all"]), "");
  assert.equal(await gitOutput(appRoot, ["remote"]), "");
  assert.doesNotMatch(await gitOutput(appRoot, ["config", "--local", "--list"]), /^user\./mu);
});

test("does not expose an App when the manager-owned initial Git commit fails", async (t) => {
  const { root, manager } = await managerRoot();
  const fakeBin = await mkdtemp(join(tmpdir(), "companion-git-shim-"));
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }); await rm(fakeBin, { recursive: true, force: true }); });
  const gitShim = join(fakeBin, "git");
  await writeFile(gitShim, [
    "#!/usr/bin/env node",
    'const { spawnSync } = require("node:child_process");',
    "const args = process.argv.slice(2);",
    'if (args.includes("commit")) process.exit(73);',
    'const result = spawnSync("git", args, { stdio: "inherit", env: { ...process.env, PATH: process.env.COMPANION_TEST_REAL_PATH } });',
    "process.exit(result.status ?? 1);",
    "",
  ].join("\n"), "utf8");
  await chmod(gitShim, 0o700);
  const originalPath = process.env.PATH ?? "";
  process.env.COMPANION_TEST_REAL_PATH = originalPath;
  process.env.PATH = `${fakeBin}:${originalPath}`;
  try {
    await assert.rejects(() => manager.createApp("failed-app", "실패 App"), (error: unknown) => error instanceof AppWorkspaceError && error.code === "initial_git_commit_failed");
  } finally {
    process.env.PATH = originalPath;
    delete process.env.COMPANION_TEST_REAL_PATH;
  }
  assert.equal(await lstat(join(root, "failed-app")).catch(() => null), null);
  assert.deepEqual((await readdir(root)).filter((name) => name.startsWith(".creating-")), []);
});

test("switching apps invalidates the old MCP capability and restores the active app after restart", async (t) => {
  const { root, manager } = await managerRoot();
  t.after(async () => { await manager.close().catch(() => undefined); await rm(root, { recursive: true, force: true }); });
  await manager.createApp("first-app", "첫 App");
  await manager.createApp("second-app", "둘째 App");
  const oldCapability = JSON.parse(await readFile(join(root, "first-app/.agent-factory/companion-capability.json"), "utf8"));
  const activeCapability = JSON.parse(await readFile(join(root, "second-app/.agent-factory/companion-capability.json"), "utf8"));
  assert.equal(oldCapability.status, "inactive");
  assert.equal(activeCapability.status, "active");
  await manager.close();
  const restarted = new ActiveAppWorkspaceController({ applicationsRoot: root, mcpBinPath: "/opt/companion/mcp.js", assetCatalog: catalog() });
  await restarted.initialize();
  assert.equal(restarted.activeApplicationId, "second-app");
  await restarted.close();
});

test("a broken candidate App fails before replacing the current valid workspace", async (t) => {
  const { root, manager } = await managerRoot();
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }); });
  await manager.createApp("valid-app", "정상 App");
  await manager.createApp("broken-app", "손상 App");
  await manager.activateApp("valid-app");
  await writeFile(join(root, "broken-app/.agent-factory/companion-graph.json"), "{", "utf8");
  await assert.rejects(() => manager.activateApp("broken-app"));
  assert.equal(manager.activeApplicationId, "valid-app");
  assert.equal((await manager.snapshot()).scope.application_id, "valid-app");
});

test("published exact bindings gate typed Graph references and referenced bindings cannot be removed", async (t) => {
  const { root, manager } = await managerRoot();
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }); });
  await manager.createApp("asset-app", "Asset App");
  const initialAssets = manager.appAssets();
  const bound = await manager.bindAsset({ asset_id: "agent.review", version: 1, registry_revision: revision, base_assets_revision: initialAssets.assets_revision });
  const workspace = await manager.snapshot();
  const result = await manager.apply(workspace.graph_revision, [{ op: "add", target: "node", value: { id: "node.agent-review", label: "검토 Agent", node_kind: "agent", agent_ref: "agent.review", available_tools: [] } }], "web");
  assert.equal(result.outcome, "APPLIED");
  await assert.rejects(() => manager.unbindAsset("agent.review", bound.assets_revision), (error: unknown) => error instanceof AppWorkspaceError && error.code === "asset_binding_in_use");
  await assert.rejects(() => manager.apply(result.workspace.graph_revision, [{ op: "add", target: "node", value: { id: "node.unbound", label: "검색", node_kind: "tool", tool_ref: "tool.search", invocation_control: "workflow" } }], "web"), /app에 먼저 추가/);
  await assert.rejects(() => manager.apply(result.workspace.graph_revision, [{ op: "add", target: "node", value: { id: "node.wrong-type", label: "잘못된 Tool", node_kind: "tool", tool_ref: "agent.review", invocation_control: "workflow" } }], "web"), /tool Asset/);
  const appRoot = join(root, "asset-app");
  assert.equal(await gitOutput(appRoot, ["rev-list", "--count", "HEAD"]), "1");
  assert.deepEqual((await gitOutput(appRoot, ["status", "--porcelain=v1", "--untracked-files=all"])).split("\n").sort(), [
    " M .agent-factory/companion-assets.json",
    " M .agent-factory/companion-graph.json",
  ].sort());
});

test("binding writes use Registry and binding revisions as independent CAS boundaries", async (t) => {
  const { root, manager } = await managerRoot();
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }); });
  await manager.createApp("cas-app", "CAS App");
  const current = manager.appAssets();
  await assert.rejects(() => manager.bindAsset({ asset_id: "tool.search", version: 1, registry_revision: "b".repeat(64), base_assets_revision: current.assets_revision }), (error: unknown) => error instanceof AppWorkspaceError && error.code === "registry_stale");
  const next = await manager.bindAsset({ asset_id: "tool.search", version: 1, registry_revision: revision, base_assets_revision: current.assets_revision });
  await assert.rejects(() => manager.bindAsset({ asset_id: "workflow.publish", version: 1, registry_revision: revision, base_assets_revision: current.assets_revision }), (error: unknown) => error instanceof AppWorkspaceError && error.code === "assets_stale");
  assert.equal(next.bindings[0]?.asset_id, "tool.search");
});
