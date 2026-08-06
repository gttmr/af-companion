import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import type {
  AddCompanionSourceProjectRequest,
  ApplyGraphOperationsResponse,
  BindCompanionAssetRequest,
  CompanionAppAssetSnapshot,
  CompanionAppManifest,
  CompanionDevelopmentContextCapsule,
  CompanionDevelopmentContextRequest,
  CompanionImplementationMappingSnapshot,
  CompanionRegistryRecord,
  CompanionSourceProjectsSnapshot,
  PutCompanionImplementationMappingRequest,
  CompanionAppsSnapshot,
  CompanionAssetBinding,
  CompanionAssetBindingsDocument,
  CompanionAssetCard,
  CompanionAssetSearchResult,
  GraphWorkspaceSnapshot,
} from "@agent-factory/companion-contracts";
import {
  createMinimalAppGraph,
  createMinimalAppPresentation,
  GraphValidationError,
  semanticRevision,
  type GraphEditOperation,
  type GraphIR,
  type GraphPresentation,
  type GraphSelection,
  type GraphValidationIssue,
} from "@agent-factory/companion-graph-domain";
import type { ControlCapability, GraphWorkspaceController } from "./http.js";
import { readContainedFile, writeAtomicJson } from "./atomic-files.js";
import {
  addSourceProject,
  assertSourceProjectContract,
  DEVELOPMENT_LOCK_PATH,
  DevelopmentContextError,
  developmentContext,
  type DevelopmentReadinessProbe,
  emptyImplementationMapping,
  IMPLEMENTATION_MAPPING_PATH,
  implementationMappings,
  inspectDevelopmentReadiness,
  putImplementationMapping,
  SESSION2_DEVELOPMENT_LOCK,
  sourceProjectsSnapshot,
} from "./development-context.js";
import { GraphControlWorkspace, type WorkspaceEvent } from "./workspace.js";

const execFileAsync = promisify(execFile);
const APP_ID = /^[a-z][a-z0-9-]{1,62}$/u;
const MANIFEST_PATH = ".agent-factory/companion-app.json";
const ASSETS_PATH = ".agent-factory/companion-assets.json";
const GRAPH_PATH = ".agent-factory/companion-graph.json";
const ROOT_STATE_PATH = ".companion-state.json";
const DEFAULT_CAPABILITY_PATH = ".agent-factory/companion-capability.json";
const INITIAL_GIT_BRANCH = "main";
const INITIAL_GIT_COMMIT_MESSAGE = "chore: initialize Companion app workspace";
const INITIAL_GIT_IDENTITY = {
  name: "Agent Factory Companion",
  email: "companion@agent-factory.local",
} as const;
const INITIAL_GIT_PATHS = [
  ".gitignore",
  MANIFEST_PATH,
  ASSETS_PATH,
  DEVELOPMENT_LOCK_PATH,
  GRAPH_PATH,
  IMPLEMENTATION_MAPPING_PATH,
] as const;

export interface AssetCatalog {
  snapshotRevision(): string;
  search(input: { text?: string; asset_type?: "agent" | "workflow" | "tool" }): CompanionAssetSearchResult;
  resolveExact(assetId: string, version: number): CompanionAssetCard;
  resolveContract?(assetId: string, version: number): CompanionRegistryRecord;
}

export interface AppWorkspaceManagerOptions {
  applicationsRoot?: string;
  mcpBinPath: string;
  assetCatalog: AssetCatalog;
  now?: () => Date;
  developmentReadinessProbe?: DevelopmentReadinessProbe;
}

export class AppWorkspaceError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "AppWorkspaceError";
  }
}

export class ActiveAppWorkspaceController implements GraphWorkspaceController {
  readonly applicationsRoot: string;
  #activeId: string | null = null;
  #workspace: GraphControlWorkspace | null = null;
  #workspaceUnsubscribe: (() => void) | null = null;
  #bindings: CompanionAssetBindingsDocument = emptyBindings();
  #manifest: CompanionAppManifest | null = null;
  #listeners = new Set<(event: WorkspaceEvent) => void>();
  #tail = Promise.resolve();
  #capability: ControlCapability | null = null;
  #now: () => Date;

  constructor(private readonly options: AppWorkspaceManagerOptions) {
    this.applicationsRoot = resolve(options.applicationsRoot ?? process.env.COMPANION_APPLICATIONS_ROOT ?? join(homedir(), "work", "af-companion-apps"));
    this.#now = options.now ?? (() => new Date());
  }

  get projectRoot(): string { return this.#workspace?.projectRoot ?? this.applicationsRoot; }
  get activeApplicationId(): string | null { return this.#activeId; }

  async initialize(): Promise<void> {
    await ensureRealRoot(this.applicationsRoot);
    const remembered = await this.#readRootState();
    if (remembered && await this.#appExists(remembered)) await this.#activate(remembered, false);
  }

  async close(): Promise<void> {
    await this.#tail;
    await this.#deactivateCurrent();
  }

  subscribe(listener: (event: WorkspaceEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async setControlCapability(capability: ControlCapability): Promise<void> {
    this.#capability = capability;
    if (this.#workspace) await this.#writeActiveCapability(this.#workspace.projectRoot);
  }

  async listApps(): Promise<CompanionAppsSnapshot> {
    const manifests = await this.#readAllManifests();
    return {
      applications_root: this.applicationsRoot,
      active_application_id: this.#activeId,
      apps: manifests.map((manifest) => ({ ...manifest, active: manifest.application_id === this.#activeId })),
    };
  }

  async createApp(applicationIdInput: string, displayNameInput: string): Promise<CompanionAppsSnapshot> {
    return this.#enqueue(async () => {
      const applicationId = applicationIdInput.trim();
      const displayName = displayNameInput.trim();
      if (!APP_ID.test(applicationId)) throw new AppWorkspaceError(422, "invalid_application_id", "App ID는 소문자로 시작하고 소문자, 숫자, 하이픈만 사용할 수 있습니다.");
      if (!displayName || displayName.length > 120) throw new AppWorkspaceError(422, "invalid_display_name", "표시 이름은 1~120자로 입력하세요.");
      const target = join(this.applicationsRoot, applicationId);
      if (await lstat(target).catch(() => null)) throw new AppWorkspaceError(409, "application_exists", "같은 App ID가 이미 존재합니다.");
      const stage = join(this.applicationsRoot, `.creating-${applicationId}-${randomBytes(6).toString("hex")}`);
      try {
        await mkdir(stage, { mode: 0o700 });
        await execFileAsync("git", ["init", "--quiet", `--initial-branch=${INITIAL_GIT_BRANCH}`, stage], { cwd: this.applicationsRoot });
        const createdAt = this.#iso();
        const manifest: CompanionAppManifest = { schema_version: 2, application_id: applicationId, display_name: displayName, created_at: createdAt, source_projects: [] };
        await writeAtomicJson(stage, MANIFEST_PATH, manifest);
        await writeAtomicJson(stage, ASSETS_PATH, emptyBindings());
        await writeAtomicJson(stage, DEVELOPMENT_LOCK_PATH, SESSION2_DEVELOPMENT_LOCK);
        await writeAtomicJson(stage, GRAPH_PATH, createMinimalAppGraph(applicationId));
        await writeAtomicJson(stage, IMPLEMENTATION_MAPPING_PATH, emptyImplementationMapping());
        await writeAtomicJson(stage, ".agent-factory/companion-presentation.json", createMinimalAppPresentation());
        await writePrivateText(stage, ".gitignore", [
          ".codex/config.toml",
          ".agent-factory/companion-capability.json",
          ".agent-factory/companion-presentation.json",
          ".agent-factory/companion-workspace-state.json",
          ".agent-factory/companion-ui-context.json",
          "",
        ].join("\n"));
        await writePrivateText(stage, ".codex/config.toml", generatedCodexConfig(target, this.options.mcpBinPath));
        await createInitialGitCommit(stage);
        await rename(stage, target);
      } catch (error) {
        await rm(stage, { recursive: true, force: true }).catch(() => undefined);
        throw error;
      }
      await this.#activate(applicationId, true);
      return this.listApps();
    });
  }

  async activateApp(applicationId: string): Promise<CompanionAppsSnapshot> {
    return this.#enqueue(async () => {
      if (!APP_ID.test(applicationId) || !await this.#appExists(applicationId)) throw new AppWorkspaceError(404, "application_not_found", "App을 찾을 수 없습니다.");
      if (applicationId !== this.#activeId) await this.#activate(applicationId, true);
      return this.listApps();
    });
  }

  activeProjectRoot(): string {
    if (!this.#workspace) throw new AppWorkspaceError(409, "no_active_app", "먼저 App을 만들거나 선택하세요.");
    return this.#workspace.projectRoot;
  }

  async sourceProjects(): Promise<CompanionSourceProjectsSnapshot> {
    const workspace = this.#requireWorkspace();
    if (!this.#manifest) throw new AppWorkspaceError(409, "invalid_app_manifest", "Active App manifest를 읽을 수 없습니다.");
    return sourceProjectsSnapshot(workspace.projectRoot, this.#manifest);
  }

  async addSourceProject(request: AddCompanionSourceProjectRequest): Promise<CompanionSourceProjectsSnapshot> {
    return this.#enqueue(async () => {
      const workspace = this.#requireWorkspace();
      if (!this.#manifest) throw new AppWorkspaceError(409, "invalid_app_manifest", "Active App manifest를 읽을 수 없습니다.");
      try {
        const result = await addSourceProject(workspace.projectRoot, this.#manifest, request);
        this.#manifest = result.manifest;
        return result.snapshot;
      } catch (error) {
        if (error instanceof DevelopmentContextError) throw new AppWorkspaceError(error.status, error.code, error.message, error.details);
        throw error;
      }
    });
  }

  async implementationMappings(): Promise<CompanionImplementationMappingSnapshot> {
    const workspace = this.#requireWorkspace();
    if (!this.#manifest) throw new AppWorkspaceError(409, "invalid_app_manifest", "Active App manifest를 읽을 수 없습니다.");
    try { return await implementationMappings({ projectRoot: workspace.projectRoot, manifest: this.#manifest, workspace: await workspace.snapshot(), bindings: this.#bindings }); }
    catch (error) { throw appDevelopmentError(error); }
  }

  async putImplementationMapping(request: PutCompanionImplementationMappingRequest): Promise<CompanionImplementationMappingSnapshot> {
    return this.#enqueue(async () => {
      const workspace = this.#requireWorkspace();
      if (!this.#manifest) throw new AppWorkspaceError(409, "invalid_app_manifest", "Active App manifest를 읽을 수 없습니다.");
      try { return await putImplementationMapping({ projectRoot: workspace.projectRoot, manifest: this.#manifest, workspace: await workspace.snapshot(), bindings: this.#bindings, request }); }
      catch (error) { throw appDevelopmentError(error); }
    });
  }

  async developmentContext(request: CompanionDevelopmentContextRequest): Promise<CompanionDevelopmentContextCapsule> {
    const workspace = this.#requireWorkspace();
    if (!this.#manifest) throw new AppWorkspaceError(409, "invalid_app_manifest", "Active App manifest를 읽을 수 없습니다.");
    try {
      return await developmentContext({
        projectRoot: workspace.projectRoot,
        manifest: this.#manifest,
        workspace: await workspace.snapshot(),
        bindings: this.#bindings,
        assetCatalog: this.options.assetCatalog,
        request,
        readinessProbe: this.options.developmentReadinessProbe ?? (() => inspectDevelopmentReadiness()),
      });
    } catch (error) { throw appDevelopmentError(error); }
  }

  async sourceProjectRoot(sourceProjectId: string): Promise<string> {
    const snapshot = await this.sourceProjects();
    const project = snapshot.source_projects.find((candidate) => candidate.source_project_id === sourceProjectId);
    if (!project) throw new AppWorkspaceError(404, "source_project_missing", "Source project를 찾을 수 없습니다.");
    return project.canonical_root;
  }

  searchAssets(text?: string, assetType?: "agent" | "workflow" | "tool"): CompanionAssetSearchResult {
    return this.options.assetCatalog.search({ ...(text?.trim() ? { text: text.trim() } : {}), ...(assetType ? { asset_type: assetType } : {}) });
  }

  appAssets(): CompanionAppAssetSnapshot {
    this.#requireWorkspace();
    const bindings = this.#bindings.bindings.map((binding) => {
      try {
        const current = this.options.assetCatalog.resolveExact(binding.asset_id, binding.version);
        const registry_status = current.contract_hash !== binding.contract_hash ? "contract_changed" as const : current.status;
        return { ...binding, name: current.name, responsibility: current.responsibility, registry_status };
      } catch {
        return { ...binding, name: binding.asset_id, responsibility: "Registry에서 정확한 버전을 찾을 수 없습니다.", registry_status: "missing" as const };
      }
    });
    return { ...this.#bindings, registry_revision: this.options.assetCatalog.snapshotRevision(), bindings };
  }

  async bindAsset(request: BindCompanionAssetRequest): Promise<CompanionAppAssetSnapshot> {
    return this.#enqueue(async () => {
      const workspace = this.#requireWorkspace();
      if (request.base_assets_revision !== this.#bindings.assets_revision) throw new AppWorkspaceError(412, "assets_stale", "Asset binding이 변경되었습니다. 최신 목록을 다시 읽으세요.", { current_assets_revision: this.#bindings.assets_revision });
      const registryRevision = this.options.assetCatalog.snapshotRevision();
      if (request.registry_revision !== registryRevision) throw new AppWorkspaceError(412, "registry_stale", "Asset Registry가 변경되었습니다. 다시 검색하세요.", { current_registry_revision: registryRevision });
      const asset = this.options.assetCatalog.resolveExact(request.asset_id, request.version);
      if (asset.status !== "published") throw new AppWorkspaceError(409, "asset_not_published", "새 binding에는 published Asset만 사용할 수 있습니다.");
      const binding: CompanionAssetBinding = { asset_id: asset.asset_id, asset_type: asset.asset_type, version: asset.version, contract_hash: asset.contract_hash, bound_at: this.#iso() };
      const bindings = [...this.#bindings.bindings.filter((entry) => entry.asset_id !== binding.asset_id), binding].sort((a, b) => a.asset_id.localeCompare(b.asset_id));
      this.#replaceBindings(finalizeBindings(bindings));
      await writeAtomicJson(workspace.projectRoot, ASSETS_PATH, this.#bindings);
      return this.appAssets();
    });
  }

  async unbindAsset(assetId: string, baseRevision: string): Promise<CompanionAppAssetSnapshot> {
    return this.#enqueue(async () => {
      const workspace = this.#requireWorkspace();
      if (baseRevision !== this.#bindings.assets_revision) throw new AppWorkspaceError(412, "assets_stale", "Asset binding이 변경되었습니다. 최신 목록을 다시 읽으세요.");
      if (graphAssetRefs((await workspace.snapshot()).graph).has(assetId)) throw new AppWorkspaceError(409, "asset_binding_in_use", "Graph에서 참조 중인 Asset binding은 제거할 수 없습니다.");
      const bindings = this.#bindings.bindings.filter((entry) => entry.asset_id !== assetId);
      if (bindings.length === this.#bindings.bindings.length) throw new AppWorkspaceError(404, "asset_binding_not_found", "Asset binding을 찾을 수 없습니다.");
      this.#replaceBindings(finalizeBindings(bindings));
      await writeAtomicJson(workspace.projectRoot, ASSETS_PATH, this.#bindings);
      return this.appAssets();
    });
  }

  snapshot(): Promise<GraphWorkspaceSnapshot> { return this.#requireWorkspace().snapshot(); }
  updateSelection(selection: GraphSelection | null): Promise<GraphWorkspaceSnapshot> { return this.#requireWorkspace().updateSelection(selection); }
  updateDraft(baseRevision: string, operations: GraphEditOperation[]): Promise<GraphWorkspaceSnapshot> { return this.#requireWorkspace().updateDraft(baseRevision, operations); }
  apply(baseRevision: string, operations: GraphEditOperation[], source: "web" | "mcp"): Promise<ApplyGraphOperationsResponse> { return this.#requireWorkspace().apply(baseRevision, operations, source); }
  updatePresentation(presentation: GraphPresentation): Promise<GraphWorkspaceSnapshot> { return this.#requireWorkspace().updatePresentation(presentation); }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const current = this.#tail.then(operation);
    this.#tail = current.then(() => undefined, () => undefined);
    return current;
  }

  async #activate(applicationId: string, emit: boolean): Promise<void> {
    const projectRoot = await realpath(join(this.applicationsRoot, applicationId));
    assertContained(this.applicationsRoot, projectRoot);
    const manifest = await readManifest(projectRoot);
    if (manifest.application_id !== applicationId) throw new AppWorkspaceError(409, "application_identity_mismatch", "App directory와 manifest identity가 일치하지 않습니다.");
    const bindings = await readBindings(projectRoot);
    const candidate = new GraphControlWorkspace({
      projectRoot,
      scope: { workspace_id: `workspace.${applicationId}`, application_id: applicationId, work_id: null },
      initialGraph: createMinimalAppGraph(applicationId),
      initialPresentation: createMinimalAppPresentation(),
      validateGraph: (graph) => this.#validateAssetReferences(graph, bindings),
      now: this.#now,
    });
    await candidate.initialize();
    try { await this.#deactivateCurrent(); }
    catch (error) { await candidate.close(); throw error; }
    this.#activeId = applicationId;
    this.#manifest = manifest;
    this.#bindings = bindings;
    this.#workspace = candidate;
    this.#workspaceUnsubscribe = candidate.subscribe((event) => this.#broadcast(event));
    if (this.#capability) await this.#writeActiveCapability(projectRoot);
    await writeAtomicJson(this.applicationsRoot, ROOT_STATE_PATH, { schema_version: 1, active_application_id: applicationId });
    if (emit) {
      const snapshot = await candidate.snapshot();
      this.#broadcast({ type: "workspace_invalidated", reason: "app_switched", document_revision: snapshot.document_revision, graph_revision: snapshot.graph_revision, discarded_draft_count: 0, selection_cleared: false, changed_nodes: [], changed_edges: [], changed_regions: [] });
    }
  }

  async #deactivateCurrent(): Promise<void> {
    const workspace = this.#workspace;
    this.#workspaceUnsubscribe?.();
    this.#workspaceUnsubscribe = null;
    this.#workspace = null;
    this.#manifest = null;
    if (!workspace) return;
    await writeAtomicJson(workspace.projectRoot, DEFAULT_CAPABILITY_PATH, { schema_version: 1, status: "inactive", application_id: this.#activeId }, 0o600).catch(() => undefined);
    await workspace.close();
  }

  async #writeActiveCapability(projectRoot: string): Promise<void> {
    if (!this.#capability) return;
    await writeAtomicJson(projectRoot, DEFAULT_CAPABILITY_PATH, { schema_version: 1, status: "active", application_id: this.#activeId, ...this.#capability }, 0o600);
  }

  #validateAssetReferences(graph: GraphIR, document = this.#bindings): void {
    const bindings = new Map(document.bindings.map((binding) => [binding.asset_id, binding]));
    const issues: GraphValidationIssue[] = [];
    const check = (assetId: string, type: "agent" | "workflow" | "tool", path: string, nodeId: string) => {
      const binding = bindings.get(assetId);
      if (!binding) { issues.push({ code: "asset_not_bound", path, message: `${assetId} Asset을 app에 먼저 추가하세요.`, target_kind: "node", target_id: nodeId }); return; }
      if (binding.asset_type !== type) { issues.push({ code: "asset_type_mismatch", path, message: `${assetId} binding은 ${type} Asset이어야 합니다.`, target_kind: "node", target_id: nodeId }); return; }
      try {
        const exact = this.options.assetCatalog.resolveExact(binding.asset_id, binding.version);
        if (exact.contract_hash !== binding.contract_hash) issues.push({ code: "asset_contract_changed", path, message: `${assetId}@${binding.version} contract hash가 binding과 다릅니다.`, target_kind: "node", target_id: nodeId });
      } catch { issues.push({ code: "asset_version_missing", path, message: `${assetId}@${binding.version}을 Registry에서 찾을 수 없습니다.`, target_kind: "node", target_id: nodeId }); }
    };
    graph.nodes.forEach((node, index) => {
      if (node.node_kind === "agent") {
        check(node.agent_ref, "agent", `graph.nodes[${index}].agent_ref`, node.id);
        node.available_tools.forEach((tool, toolIndex) => check(tool.tool_ref, "tool", `graph.nodes[${index}].available_tools[${toolIndex}].tool_ref`, node.id));
      } else if (node.node_kind === "tool") check(node.tool_ref, "tool", `graph.nodes[${index}].tool_ref`, node.id);
      else if (node.node_kind === "subworkflow") check(node.workflow_ref, "workflow", `graph.nodes[${index}].workflow_ref`, node.id);
    });
    if (issues.length) throw new GraphValidationError(issues);
  }

  #requireWorkspace(): GraphControlWorkspace {
    if (!this.#workspace) throw new AppWorkspaceError(409, "no_active_app", "먼저 App을 만들거나 선택하세요.");
    return this.#workspace;
  }

  #replaceBindings(next: CompanionAssetBindingsDocument): void {
    this.#bindings.schema_version = next.schema_version;
    this.#bindings.assets_revision = next.assets_revision;
    this.#bindings.bindings = next.bindings;
  }

  #broadcast(event: WorkspaceEvent): void { for (const listener of this.#listeners) listener(structuredClone(event)); }
  #iso(): string { return this.#now().toISOString(); }

  async #readRootState(): Promise<string | null> {
    try {
      const value = JSON.parse((await readContainedFile(this.applicationsRoot, ROOT_STATE_PATH, 8192)).toString("utf8")) as { active_application_id?: unknown };
      return typeof value.active_application_id === "string" && APP_ID.test(value.active_application_id) ? value.active_application_id : null;
    } catch { return null; }
  }

  async #readAllManifests(): Promise<CompanionAppManifest[]> {
    const entries = await readdir(this.applicationsRoot, { withFileTypes: true });
    const manifests: CompanionAppManifest[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || !APP_ID.test(entry.name)) continue;
      try { manifests.push(await readManifest(join(this.applicationsRoot, entry.name))); } catch { /* invalid app directories are not selectable */ }
    }
    return manifests.sort((a, b) => a.display_name.localeCompare(b.display_name, "ko"));
  }

  async #appExists(applicationId: string): Promise<boolean> {
    try { return (await readManifest(join(this.applicationsRoot, applicationId))).application_id === applicationId; } catch { return false; }
  }
}

function emptyBindings(): CompanionAssetBindingsDocument { return finalizeBindings([]); }
function finalizeBindings(bindings: CompanionAssetBinding[]): CompanionAssetBindingsDocument {
  const unsigned = { schema_version: 1 as const, bindings: structuredClone(bindings) };
  return { ...unsigned, assets_revision: semanticRevision(unsigned) };
}

async function readManifest(projectRoot: string): Promise<CompanionAppManifest> {
  const value = JSON.parse((await readContainedFile(projectRoot, MANIFEST_PATH, 64 * 1024)).toString("utf8")) as Record<string, unknown>;
  if (![1, 2].includes(Number(value.schema_version)) || typeof value.application_id !== "string" || !APP_ID.test(value.application_id) || typeof value.display_name !== "string" || !value.display_name.trim() || typeof value.created_at !== "string" || !Number.isFinite(Date.parse(value.created_at))) throw new AppWorkspaceError(409, "invalid_app_manifest", "Companion app manifest가 유효하지 않습니다.");
  if (value.schema_version === 1 && Object.keys(value).some((key) => !["schema_version", "application_id", "display_name", "created_at"].includes(key))) throw new AppWorkspaceError(409, "invalid_app_manifest", "Companion v1 app manifest가 유효하지 않습니다.");
  if (value.schema_version === 2) {
    if (Object.keys(value).some((key) => !["schema_version", "application_id", "display_name", "created_at", "source_projects"].includes(key)) || !Array.isArray(value.source_projects)) throw new AppWorkspaceError(409, "invalid_app_manifest", "Companion v2 app manifest가 유효하지 않습니다.");
    try {
      value.source_projects.forEach(assertSourceProjectContract);
      const ids = new Set(value.source_projects.map((entry) => entry.source_project_id));
      const roots = new Set(value.source_projects.map((entry) => entry.root));
      if (ids.size !== value.source_projects.length || roots.size !== value.source_projects.length) throw new Error("duplicate source project");
    } catch { throw new AppWorkspaceError(409, "invalid_app_manifest", "Companion v2 source project contract가 유효하지 않습니다."); }
  }
  return value as unknown as CompanionAppManifest;
}

async function readBindings(projectRoot: string): Promise<CompanionAssetBindingsDocument> {
  try {
    const value = JSON.parse((await readContainedFile(projectRoot, ASSETS_PATH, 1024 * 1024)).toString("utf8")) as CompanionAssetBindingsDocument;
    if (value.schema_version !== 1 || !Array.isArray(value.bindings)) throw new Error("invalid bindings");
    const normalized = finalizeBindings(value.bindings);
    if (normalized.assets_revision !== value.assets_revision) throw new Error("assets revision mismatch");
    return normalized;
  } catch (error) {
    if (isCode(error, "ENOENT")) return emptyBindings();
    throw new AppWorkspaceError(409, "invalid_asset_bindings", "Companion Asset binding 문서가 유효하지 않습니다.");
  }
}

function graphAssetRefs(graph: GraphIR): Set<string> {
  const refs = new Set<string>();
  for (const node of graph.nodes) {
    if (node.node_kind === "agent") { refs.add(node.agent_ref); node.available_tools.forEach((tool) => refs.add(tool.tool_ref)); }
    else if (node.node_kind === "tool") refs.add(node.tool_ref);
    else if (node.node_kind === "subworkflow") refs.add(node.workflow_ref);
  }
  return refs;
}

function generatedCodexConfig(projectRoot: string, mcpBinPath: string): string {
  return [
    "# Generated by Agent Factory Companion for this app workspace.",
    "[mcp_servers.companion_graph]",
    `command = ${JSON.stringify(process.execPath)}`,
    `args = [${JSON.stringify(resolve(mcpBinPath))}, \"--project-root\", ${JSON.stringify(resolve(projectRoot))}]`,
    `cwd = ${JSON.stringify(resolve(projectRoot))}`,
    "enabled = true",
    "required = true",
    'enabled_tools = ["companion_get_graph_workspace", "companion_apply_graph_changes"]',
    'default_tools_approval_mode = "writes"',
    "startup_timeout_sec = 10",
    "tool_timeout_sec = 10",
    "",
  ].join("\n");
}

async function createInitialGitCommit(projectRoot: string): Promise<void> {
  try {
    await execFileAsync("git", ["add", "--force", "--", ...INITIAL_GIT_PATHS], { cwd: projectRoot });
    const { stdout } = await execFileAsync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMRTUXB", "--"], { cwd: projectRoot });
    const stagedPaths = stdout.split(/\r?\n/u).filter(Boolean).sort();
    const expectedPaths = [...INITIAL_GIT_PATHS].sort();
    if (stagedPaths.length !== expectedPaths.length || stagedPaths.some((path, index) => path !== expectedPaths[index])) {
      throw new AppWorkspaceError(500, "initial_git_stage_mismatch", "App의 최초 Git commit 대상이 허용된 baseline과 일치하지 않습니다.");
    }
    await execFileAsync("git", [
      "-c", `user.name=${INITIAL_GIT_IDENTITY.name}`,
      "-c", `user.email=${INITIAL_GIT_IDENTITY.email}`,
      "-c", "commit.gpgSign=false",
      "-c", "core.hooksPath=/dev/null",
      "commit", "--quiet", "--no-verify", "--message", INITIAL_GIT_COMMIT_MESSAGE,
    ], {
      cwd: projectRoot,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: INITIAL_GIT_IDENTITY.name,
        GIT_AUTHOR_EMAIL: INITIAL_GIT_IDENTITY.email,
        GIT_COMMITTER_NAME: INITIAL_GIT_IDENTITY.name,
        GIT_COMMITTER_EMAIL: INITIAL_GIT_IDENTITY.email,
      },
    });
  } catch (error) {
    if (error instanceof AppWorkspaceError) throw error;
    throw new AppWorkspaceError(500, "initial_git_commit_failed", "App의 최초 local Git commit을 만들지 못했습니다.");
  }
}

async function ensureRealRoot(path: string): Promise<void> {
  await mkdir(path, { recursive: true, mode: 0o700 });
  const canonical = await realpath(path);
  if (canonical !== path || !(await lstat(path)).isDirectory() || (await lstat(path)).isSymbolicLink()) throw new AppWorkspaceError(409, "unsafe_applications_root", "App 저장 root에는 symbolic link를 사용할 수 없습니다.");
}

function assertContained(root: string, target: string): void {
  const relation = relative(root, target);
  if (relation === ".." || relation.startsWith(`..${sep}`)) throw new AppWorkspaceError(409, "application_outside_root", "App path가 관리 root 밖을 가리킵니다.");
}

async function writePrivateText(root: string, relativePath: string, text: string): Promise<void> {
  const target = resolve(root, relativePath);
  assertContained(root, target);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const temporary = join(dirname(target), `.${basename(target)}.${randomBytes(6).toString("hex")}.tmp`);
  const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(text, "utf8"); await handle.sync(); } finally { await handle.close(); }
  await rename(temporary, target);
  const directory = await open(dirname(target), constants.O_RDONLY); try { await directory.sync(); } finally { await directory.close(); }
}

function isCode(error: unknown, code: string): error is NodeJS.ErrnoException { return error instanceof Error && "code" in error && error.code === code; }
function appDevelopmentError(error: unknown): Error {
  return error instanceof DevelopmentContextError ? new AppWorkspaceError(error.status, error.code, error.message, error.details) : error instanceof Error ? error : new Error("Development context operation failed");
}
