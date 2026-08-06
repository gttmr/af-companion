import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { chmod, lstat, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import type { CompanionAssetCard } from "@agent-factory/companion-contracts";
import { ActiveAppWorkspaceController, AppWorkspaceError, inspectDevelopmentReadiness, normalizePrivateModelBaseUrl, type AssetCatalog } from "../src/index.js";

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

async function userCommit(projectRoot: string, message: string): Promise<string> {
  await execFileAsync("git", ["add", "--all"], { cwd: projectRoot });
  await execFileAsync("git", ["-c", "user.name=Test User", "-c", "user.email=test@example.invalid", "-c", "commit.gpgSign=false", "-c", "core.hooksPath=/dev/null", "commit", "--quiet", "--no-verify", "--message", message], { cwd: projectRoot });
  return gitOutput(projectRoot, ["rev-parse", "HEAD"]);
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
    ".agent-factory/companion-development.json",
    ".agent-factory/companion-graph.json",
    ".agent-factory/companion-implementation.json",
    ".gitignore",
  ].sort());
  assert.equal(await gitOutput(appRoot, ["status", "--porcelain=v1", "--untracked-files=all"]), "");
  assert.equal(await gitOutput(appRoot, ["remote"]), "");
  assert.doesNotMatch(await gitOutput(appRoot, ["config", "--local", "--list"]), /^user\./mu);
});

test("creates a v2 App development baseline without secrets or private endpoints", async (t) => {
  const { root, manager } = await managerRoot();
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }); });
  await manager.createApp("development-app", "개발 App");
  const appRoot = join(root, "development-app");
  const manifest = JSON.parse(await readFile(join(appRoot, ".agent-factory/companion-app.json"), "utf8"));
  const lock = JSON.parse(await readFile(join(appRoot, ".agent-factory/companion-development.json"), "utf8"));
  const mapping = JSON.parse(await readFile(join(appRoot, ".agent-factory/companion-implementation.json"), "utf8"));
  assert.equal(manifest.schema_version, 2);
  assert.deepEqual(manifest.source_projects, []);
  assert.equal(lock.skill_bundle.version, "2.0.0-adk2.4-session1");
  assert.equal(lock.skill_bundle.digest, "8bafba76b99095265b927b696eddbd6ea251c68039ff356a933efdb75db8350c");
  assert.equal(lock.runtime.google_adk, "2.4.0");
  assert.equal(lock.runtime.agents_cli, "1.2.1");
  assert.equal(lock.model.acceptance, "self-hosted-27B Session 2 acceptance");
  assert.equal(lock.model.model_id, "qwen3.6-27b-128k");
  assert.equal(lock.model.input_context_tokens, 131072);
  assert.equal(lock.model.provider, "self_hosted_qwen_vllm");
  assert.deepEqual(lock.model.transport, {
    kind: "private_openai_compatible",
    endpoint_source: "ignored_local_configuration",
    endpoint_env: "AF_QWEN_BASE_URL",
    api_key_source: "ignored_local_configuration",
    api_key_env: "AF_QWEN_API_KEY",
  });
  assert.equal(lock.model.required, true);
  assert.equal(lock.model.fallback, false);
  assert.equal("development_model" in lock, false);
  assert.equal(lock.representative_integration.authority, "session2_decision");
  assert.equal(lock.representative_integration.session1_required_integration_artifact, "absent");
  assert.deepEqual(lock.representative_integration.experiment_ids, ["CP-001", "CP-002", "CP-003", "CP-004", "CP-005"]);
  assert.equal(mapping.schema_version, 1);
  assert.deepEqual(mapping.entries, []);
  const serialized = JSON.stringify({ lock, manifest, mapping });
  assert.doesNotMatch(serialized, /GOOGLE_API_KEY|100\.108\.38\.59|"api_key"\s*:/i);
  assert.deepEqual((await gitOutput(appRoot, ["ls-tree", "-r", "--name-only", "HEAD"])).split("\n").sort(), [
    ".agent-factory/companion-app.json",
    ".agent-factory/companion-assets.json",
    ".agent-factory/companion-development.json",
    ".agent-factory/companion-graph.json",
    ".agent-factory/companion-implementation.json",
    ".gitignore",
  ].sort());
});

test("accepts only private OpenAI-compatible vLLM endpoint shapes", () => {
  assert.equal(normalizePrivateModelBaseUrl("http://127.0.0.1:8000/v1"), "http://127.0.0.1:8000/v1");
  assert.equal(normalizePrivateModelBaseUrl("http://10.10.0.8:8000/v1"), "http://10.10.0.8:8000/v1");
  assert.equal(normalizePrivateModelBaseUrl("http://100.64.0.8:8000/v1"), "http://100.64.0.8:8000/v1");
  assert.equal(normalizePrivateModelBaseUrl("https://qwen.bank.internal/v1"), "https://qwen.bank.internal/v1");
  assert.equal(normalizePrivateModelBaseUrl("https://api.openai.com/v1"), null);
  assert.equal(normalizePrivateModelBaseUrl("http://qwen.bank.internal:8000/api"), null);
  assert.equal(normalizePrivateModelBaseUrl("http://user:secret@qwen.internal/v1"), null);
});

test("model readiness requires the exact vLLM model ID and max_model_len", async () => {
  const observedAuthorization: Array<string | null> = [];
  const response = (maxModelLen: number | null) => (async (_input: URL | RequestInfo, init?: RequestInit) => {
    observedAuthorization.push(new Headers(init?.headers).get("Authorization"));
    return new Response(JSON.stringify({
      data: [{ id: "qwen3.6-27b-128k", ...(maxModelLen === null ? {} : { max_model_len: maxModelLen }) }],
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  const options = {
    installManifestPath: join(tmpdir(), "missing-session2-install.json"),
    skillsRoot: join(tmpdir(), "missing-session2-skills"),
    modelBaseUrl: "https://qwen.bank.internal/v1",
    modelApiKey: "test-vllm-key",
  };

  assert.equal((await inspectDevelopmentReadiness({ ...options, fetchImpl: response(131072) })).model_status, "ready");
  assert.equal((await inspectDevelopmentReadiness({ ...options, fetchImpl: response(32768) })).model_status, "contract_mismatch");
  assert.equal((await inspectDevelopmentReadiness({ ...options, fetchImpl: response(null) })).model_status, "contract_mismatch");
  assert.deepEqual(observedAuthorization, ["Bearer test-vllm-key", "Bearer test-vllm-key", "Bearer test-vllm-key"]);
  assert.equal((await inspectDevelopmentReadiness({ ...options, modelApiKey: "", fetchImpl: response(131072) })).model_status, "contract_mismatch");
  assert.equal(observedAuthorization.length, 3);
});

test("upgrades a legacy v1 manifest only on an explicit contained source-project mutation", async (t) => {
  const { root, manager } = await managerRoot();
  t.after(async () => { await manager.close().catch(() => undefined); await rm(root, { recursive: true, force: true }); });
  await manager.createApp("legacy-app", "Legacy App");
  const appRoot = join(root, "legacy-app");
  const current = JSON.parse(await readFile(join(appRoot, ".agent-factory/companion-app.json"), "utf8"));
  await writeFile(join(appRoot, ".agent-factory/companion-app.json"), `${JSON.stringify({ schema_version: 1, application_id: current.application_id, display_name: current.display_name, created_at: current.created_at }, null, 2)}\n`, "utf8");
  await manager.close();

  const restarted = new ActiveAppWorkspaceController({ applicationsRoot: root, mcpBinPath: "/opt/companion/mcp.js", assetCatalog: catalog(), now: () => new Date("2030-01-01T00:00:00.000Z") });
  await restarted.initialize();
  assert.equal((await restarted.sourceProjects()).manifest_schema_version, 1);
  assert.equal((await restarted.sourceProjects()).upgrade_required, true);
  assert.equal(JSON.parse(await readFile(join(appRoot, ".agent-factory/companion-app.json"), "utf8")).schema_version, 1);

  const attached = await restarted.addSourceProject({
    mode: "create",
    source_project: {
      source_project_id: "review-runtime",
      root: "src/review-runtime",
      runtime: { framework: "google-adk", framework_version: "2.4.0", language: "python", package_manager: "uv", entrypoint: "app/agent.py" },
    },
  });
  assert.equal(attached.manifest_schema_version, 2);
  assert.equal(attached.upgrade_required, false);
  assert.equal(attached.source_projects[0]?.readiness.status, "scaffold_required");
  assert.equal((await lstat(join(appRoot, "src/review-runtime"))).isDirectory(), true);
  assert.equal(JSON.parse(await readFile(join(appRoot, ".agent-factory/companion-app.json"), "utf8")).schema_version, 2);

  await assert.rejects(() => restarted.addSourceProject({ mode: "create", source_project: { source_project_id: "review-runtime", root: "src/other", runtime: { framework: "google-adk", framework_version: "2.4.0", language: "python", package_manager: "uv", entrypoint: "app/agent.py" } } }), (error: unknown) => error instanceof AppWorkspaceError && error.code === "source_project_id_conflict");
  await assert.rejects(() => restarted.addSourceProject({ mode: "create", source_project: { source_project_id: "escape", root: "../other-app", runtime: { framework: "google-adk", framework_version: "2.4.0", language: "python", package_manager: "uv", entrypoint: "app/agent.py" } } }), (error: unknown) => error instanceof AppWorkspaceError && error.code === "invalid_source_root");
  await assert.rejects(() => restarted.addSourceProject({ mode: "create", source_project: { source_project_id: "absolute", root: "/tmp/absolute", runtime: { framework: "google-adk", framework_version: "2.4.0", language: "python", package_manager: "uv", entrypoint: "app/agent.py" } } }), (error: unknown) => error instanceof AppWorkspaceError && error.code === "invalid_source_root");
  await mkdir(join(appRoot, "src/real"), { recursive: true });
  await symlink(join(appRoot, "src/real"), join(appRoot, "src/link"));
  await assert.rejects(() => restarted.addSourceProject({ mode: "attach", source_project: { source_project_id: "linked", root: "src/link", runtime: { framework: "google-adk", framework_version: "2.4.0", language: "python", package_manager: "uv", entrypoint: "app/agent.py" } } }), (error: unknown) => error instanceof AppWorkspaceError && error.code === "symlink_not_allowed");
  await restarted.close();
});

test("tracks implementation mapping against Graph, source locators, Asset refs, and local Git commits", async (t) => {
  const { root, manager } = await managerRoot();
  t.after(async () => { await manager.close(); await rm(root, { recursive: true, force: true }); });
  await manager.createApp("mapping-app", "Mapping App");
  const appRoot = join(root, "mapping-app");
  const baseCommit = await gitOutput(appRoot, ["rev-parse", "HEAD"]);
  await manager.addSourceProject({ mode: "create", source_project: { source_project_id: "adk-runtime", root: "src/adk-runtime", runtime: { framework: "google-adk", framework_version: "2.4.0", language: "python", package_manager: "uv", entrypoint: "app/agent.py" } } });
  await mkdir(join(appRoot, "src/adk-runtime/app"), { recursive: true });
  await mkdir(join(appRoot, "src/adk-runtime/tests"), { recursive: true });
  await writeFile(join(appRoot, "src/adk-runtime/app/agent.py"), "root_agent = object()\n", "utf8");
  await writeFile(join(appRoot, "src/adk-runtime/tests/test_agent.py"), "def test_agent():\n    assert True\n", "utf8");
  const resultCommit = await userCommit(appRoot, "feat: add ADK runtime");
  const graph = await manager.snapshot();
  const mapping = {
    mapping_id: "mapping.node-input",
    target: { kind: "graph_element" as const, element: { kind: "node" as const, id: "node.input" } },
    source: { source_project_id: "adk-runtime", module: "app/agent.py", symbol: "root_agent", config: null, tests: ["tests/test_agent.py"] },
    graph_revision: graph.graph_revision,
    asset_refs: [],
    git_base_commit: baseCommit,
    git_result_commit: resultCommit,
    updated_at: "2030-01-01T00:00:00.000Z",
  };
  const mapped = await manager.putImplementationMapping({
    base_mapping_revision: (await manager.implementationMappings()).mapping_revision,
    mapping,
  });
  assert.equal(mapped.entries[0]?.status, "current");
  assert.deepEqual(mapped.entries[0]?.reasons, []);
  await assert.rejects(() => manager.putImplementationMapping({ base_mapping_revision: "0".repeat(64), mapping }), (error: unknown) => error instanceof AppWorkspaceError && error.code === "mapping_stale");
  await manager.apply(graph.graph_revision, [{ op: "replace", target: "node", id: "node.output", value: { id: "node.output", label: "Changed", node_kind: "output" } }], "web");
  const stale = await manager.implementationMappings();
  assert.equal(stale.entries[0]?.status, "stale");
  assert.ok(stale.entries[0]?.reasons.includes("graph_revision_changed"));
});

test("assembles one deterministic bounded development capsule and fails closed on stale Graph or unsupported cancellation", async (t) => {
  const applicationsRoot = await mkdtemp(join(tmpdir(), "companion-capsule-"));
  const manager = new ActiveAppWorkspaceController({
    applicationsRoot,
    mcpBinPath: "/opt/companion/mcp.js",
    assetCatalog: catalog(),
    now: () => new Date("2030-01-01T00:00:00.000Z"),
    developmentReadinessProbe: async () => ({ schema_version: 1, status: "offline_ready", bundle_status: "offline_ready", skills: [], model_status: "ready", reasons: [] }),
  });
  await manager.initialize();
  t.after(async () => { await manager.close(); await rm(applicationsRoot, { recursive: true, force: true }); });
  await manager.createApp("capsule-app", "Capsule App");
  const appRoot = join(applicationsRoot, "capsule-app");
  await manager.addSourceProject({ mode: "create", source_project: { source_project_id: "adk-runtime", root: "src/adk-runtime", runtime: { framework: "google-adk", framework_version: "2.4.0", language: "python", package_manager: "uv", entrypoint: "app/agent.py" } } });
  await mkdir(join(appRoot, "src/adk-runtime/app"), { recursive: true });
  await writeFile(join(appRoot, "src/adk-runtime/app/agent.py"), "root_agent = object()\n", "utf8");
  await userCommit(appRoot, "feat: scaffold capsule runtime");
  const before = await manager.snapshot();
  const withUnrelated = await manager.apply(before.graph_revision, [{ op: "add", target: "node", value: { id: "node.unrelated", label: "Unrelated", node_kind: "function", role: "transform" } }], "web");
  await manager.updateSelection({ kind: "node", id: "node.input" });
  const request = { expected_application_id: "capsule-app", expected_graph_revision: withUnrelated.workspace.graph_revision, source_project_id: "adk-runtime", primary_intent: "implement_selected_element" as const };
  const first = await manager.developmentContext(request);
  const second = await manager.developmentContext(request);
  assert.equal(first.capsule_id, second.capsule_id);
  assert.equal(first.primary_skill, "$google-agents-cli-adk-code");
  assert.match(first.prompt, /^\$google-agents-cli-adk-code/u);
  assert.deepEqual(first.graph_context.nodes.map((node) => node.id), ["node.input", "node.output"]);
  assert.equal(first.graph_context.nodes.some((node) => node.id === "node.unrelated"), false);
  assert.deepEqual(first.evidence.experiment_ids, ["CP-001", "CP-002", "CP-003", "CP-004", "CP-005"]);
  assert.equal(first.evidence.session1_required_integration_artifact, "absent");
  assert.deepEqual(first.write_roots, [join(appRoot, "src/adk-runtime"), join(appRoot, ".agent-factory/companion-implementation.json")]);
  assert.equal(first.model.fallback, false);
  assert.equal(first.model.model_id, "qwen3.6-27b-128k");
  assert.equal(first.model.required, true);
  assert.equal("development_model" in first, false);
  assert.equal(first.network.acceptance_internet_egress, "denied");
  assert.doesNotMatch(JSON.stringify(first), /GOOGLE_API_KEY|100\.108\.38\.59/i);
  await assert.rejects(() => manager.developmentContext({ ...request, expected_graph_revision: "0".repeat(64) }), (error: unknown) => error instanceof AppWorkspaceError && error.code === "graph_stale");

  const latest = await manager.snapshot();
  const cancelled = await manager.apply(latest.graph_revision, [{ op: "replace", target: "edge", id: "edge.input-output", value: { ...latest.graph.edges[0]!, control: { kind: "cancel", condition: null, accepted_aliases: [], default: false } } }], "web");
  await manager.updateSelection({ kind: "edge", id: "edge.input-output" });
  await assert.rejects(() => manager.developmentContext({ ...request, expected_graph_revision: cancelled.workspace.graph_revision }), (error: unknown) => error instanceof AppWorkspaceError && error.code === "unsupported_capability");
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
