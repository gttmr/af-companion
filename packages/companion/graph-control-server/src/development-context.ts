import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readdir, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type {
  AddCompanionSourceProjectRequest,
  CompanionAppManifest,
  CompanionAppManifestV2,
  CompanionDevelopmentLock,
  CompanionDevelopmentContextCapsule,
  CompanionDevelopmentContextRequest,
  CompanionDevelopmentReadiness,
  CompanionImplementationMappingEntry,
  CompanionImplementationMappingDocument,
  CompanionImplementationMappingSnapshot,
  CompanionImplementationMappingStatus,
  CompanionAssetBindingsDocument,
  CompanionRegistryRecord,
  GraphWorkspaceSnapshot,
  PutCompanionImplementationMappingRequest,
  CompanionSourceProject,
  CompanionSourceProjectSnapshot,
  CompanionSourceProjectsSnapshot,
} from "@agent-factory/companion-contracts";
import { semanticRevision, type GraphEdge, type GraphIR, type GraphNode, type GraphRegion } from "@agent-factory/companion-graph-domain";
import { ensureContainedDirectory, readContainedFile, writeAtomicJson } from "./atomic-files.js";

const execFileAsync = promisify(execFile);
const SOURCE_PROJECT_ID = /^[a-z][a-z0-9-]{1,62}$/u;
const MANIFEST_PATH = ".agent-factory/companion-app.json";
export const DEVELOPMENT_LOCK_PATH = ".agent-factory/companion-development.json";
export const IMPLEMENTATION_MAPPING_PATH = ".agent-factory/companion-implementation.json";

export class DevelopmentContextError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "DevelopmentContextError";
  }
}

export const SESSION2_DEVELOPMENT_LOCK: CompanionDevelopmentLock = {
  schema_version: 1,
  profile_id: "session2-qwen3.6-27b-offline-target",
  skill_bundle: {
    bundle_id: "af-skills-vnext",
    version: "2.0.0-adk2.4-session1",
    digest: "8bafba76b99095265b927b696eddbd6ea251c68039ff356a933efdb75db8350c",
  },
  required_skills: [
    { skill_id: "google-agents-cli-workflow", version: "1.2.1", tree_digest: "83dea9d79fe84b2c79d8323fdddbe493e040be2c1ebb3a0a365aef266f445c31" },
    { skill_id: "google-agents-cli-scaffold", version: "1.2.1", tree_digest: "fc3c18e81027108e18338617d105ef31c2e98821736a5b7d2b37508990240d2f" },
    { skill_id: "google-agents-cli-adk-code", version: "1.2.1", tree_digest: "e67352cc574bcea3017e3e03a6247c3b033be7929087b119a7e987914cb48e9f" },
    { skill_id: "google-agents-cli-eval", version: "1.2.1", tree_digest: "37c2d1659016791608630fb402b67cceb51f61aa8953804ea7347e4fc7081fc9" },
  ],
  runtime: {
    google_adk: "2.4.0",
    mcp: "1.28.1",
    a2a_sdk: "0.3.26",
    agents_cli: "1.2.1",
    dependency_source: "local_cache_only",
  },
  model: {
    acceptance: "self-hosted-27B Session 2 acceptance",
    provider: "self_hosted_qwen_vllm",
    model_id: "qwen3.6-27b-128k",
    input_context_tokens: 131_072,
    transport: {
      kind: "private_openai_compatible",
      endpoint_source: "ignored_local_configuration",
      endpoint_env: "AF_QWEN_BASE_URL",
      api_key_source: "ignored_local_configuration",
      api_key_env: "AF_QWEN_API_KEY",
    },
    fallback: false,
    required: true,
  },
  network: {
    acceptance_profile: "private_vllm_only",
    acceptance_internet_egress: "denied",
    cloud_deploy_publish_observability: "denied",
  },
  representative_integration: {
    authority: "session2_decision",
    session1_required_integration_artifact: "absent",
    experiment_ids: ["CP-001", "CP-002", "CP-003", "CP-004", "CP-005"],
    capability_groups: [
      "coordinator_subagent_aggregation_and_error_propagation",
      "explicit_route_parallel_fan_out_fan_in_and_join",
      "bounded_loop_exit_or_exhaustion",
      "reviewed_dynamic_selection_and_unsupported_target",
      "workflow_fixed_and_agent_selected_tool_control",
      "state_artifact_and_event_commit_ownership",
      "pause_resume_guardrail_and_duplicate_side_effect_prevention",
      "typed_output_and_terminal_failure",
    ],
  },
  unsupported_guards: [
    { capability_id: "B12-live-workflow-streaming", reason: "Exact ADK 2.4 Workflow has no live or bidi implementation." },
    { capability_id: "F04-public-python-cancellation", reason: "Exact ADK 2.4 Python Runner has no public cancellation API." },
    { capability_id: "G06-workflow-a2a-exposure", reason: "Agent Factory permits A2A binding or exposure only for Agent assets." },
    { capability_id: "H07-unsupported-api-refusal", reason: "Do not invent public END, Runner cancellation, or compaction exports." },
  ],
};

export function emptyImplementationMapping(): CompanionImplementationMappingDocument {
  const unsigned = { schema_version: 1 as const, entries: [] };
  return { ...unsigned, mapping_revision: semanticRevision(unsigned) };
}

export async function ensureDevelopmentSidecars(projectRoot: string): Promise<void> {
  try {
    const current = JSON.parse((await readContainedFile(projectRoot, DEVELOPMENT_LOCK_PATH, 256 * 1024)).toString("utf8")) as unknown;
    if (semanticRevision(current) !== semanticRevision(SESSION2_DEVELOPMENT_LOCK)) throw new DevelopmentContextError(409, "development_lock_mismatch", "Existing development lock을 자동으로 덮어쓸 수 없습니다.");
  } catch (error) {
    if (!isCode(error, "ENOENT")) throw error;
    await writeAtomicJson(projectRoot, DEVELOPMENT_LOCK_PATH, SESSION2_DEVELOPMENT_LOCK);
  }
  try { await readContainedFile(projectRoot, IMPLEMENTATION_MAPPING_PATH, 1024 * 1024); }
  catch (error) {
    if (!isCode(error, "ENOENT")) throw error;
    await writeAtomicJson(projectRoot, IMPLEMENTATION_MAPPING_PATH, emptyImplementationMapping());
  }
}

export function assertSourceProjectContract(value: unknown): asserts value is CompanionSourceProject {
  if (!record(value) || !exactKeys(value, ["source_project_id", "root", "runtime"])) throw invalidSource("source_project must use the exact contract fields");
  if (typeof value.source_project_id !== "string" || !SOURCE_PROJECT_ID.test(value.source_project_id)) throw invalidSource("source_project_id is invalid");
  assertRelativePath(value.root, "invalid_source_root");
  if (reservedRoot(value.root)) throw new DevelopmentContextError(422, "invalid_source_root", "Source root cannot overlap Companion or Git control paths.");
  if (!record(value.runtime) || !exactKeys(value.runtime, ["framework", "framework_version", "language", "package_manager", "entrypoint"])) throw invalidSource("runtime must use the exact contract fields");
  if (value.runtime.framework !== "google-adk" || value.runtime.framework_version !== "2.4.0" || value.runtime.language !== "python" || value.runtime.package_manager !== "uv") throw new DevelopmentContextError(422, "unsupported_source_runtime", "Session 2 accepts only google-adk 2.4.0 Python projects managed by uv.");
  assertRelativePath(value.runtime.entrypoint, "invalid_source_entrypoint");
}

export async function sourceProjectsSnapshot(projectRoot: string, manifest: CompanionAppManifest): Promise<CompanionSourceProjectsSnapshot> {
  const sourceProjects = manifest.schema_version === 2 ? manifest.source_projects : [];
  return {
    schema_version: 1,
    application_id: manifest.application_id,
    manifest_schema_version: manifest.schema_version,
    upgrade_required: manifest.schema_version === 1,
    source_projects: await Promise.all(sourceProjects.map((project) => sourceProjectSnapshot(projectRoot, project))),
  };
}

export async function addSourceProject(projectRoot: string, manifest: CompanionAppManifest, request: AddCompanionSourceProjectRequest): Promise<{ manifest: CompanionAppManifestV2; snapshot: CompanionSourceProjectsSnapshot }> {
  if (!record(request) || !exactKeys(request, ["mode", "source_project"]) || !["create", "attach"].includes(String(request.mode))) throw new DevelopmentContextError(422, "invalid_source_request", "Source project request is invalid.");
  assertSourceProjectContract(request.source_project);
  const existing = manifest.schema_version === 2 ? manifest.source_projects : [];
  if (existing.some((entry) => entry.source_project_id === request.source_project.source_project_id)) throw new DevelopmentContextError(409, "source_project_id_conflict", "같은 source project ID가 이미 있습니다.");
  if (existing.some((entry) => entry.root === request.source_project.root)) throw new DevelopmentContextError(409, "source_project_root_conflict", "같은 source project root가 이미 연결되어 있습니다.");

  const target = resolve(projectRoot, request.source_project.root);
  assertContained(projectRoot, target);
  const targetInfo = await lstat(target).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
  if (targetInfo?.isSymbolicLink()) throw new DevelopmentContextError(409, "symlink_not_allowed", "Source project root에는 symbolic link를 사용할 수 없습니다.");
  if (request.mode === "create") {
    if (targetInfo) throw new DevelopmentContextError(409, "source_root_exists", "Create 대상 source root가 이미 존재합니다. attach를 사용하세요.");
    await ensureContainedDirectory(projectRoot, request.source_project.root);
  } else {
    if (!targetInfo?.isDirectory()) throw new DevelopmentContextError(404, "source_root_missing", "Attach 대상 source root directory를 찾을 수 없습니다.");
    const canonical = await realpath(target);
    if (canonical !== target) throw new DevelopmentContextError(409, "symlink_not_allowed", "Source project path에는 symbolic link를 사용할 수 없습니다.");
    await assertNoSymlinkSegments(projectRoot, target);
  }

  const next: CompanionAppManifestV2 = {
    schema_version: 2,
    application_id: manifest.application_id,
    display_name: manifest.display_name,
    created_at: manifest.created_at,
    source_projects: [...existing, structuredClone(request.source_project)].sort((a, b) => a.source_project_id.localeCompare(b.source_project_id)),
  };
  await ensureDevelopmentSidecars(projectRoot);
  await writeAtomicJson(projectRoot, MANIFEST_PATH, next);
  return { manifest: next, snapshot: await sourceProjectsSnapshot(projectRoot, next) };
}

export interface DevelopmentAssetCatalog {
  resolveContract?(assetId: string, version: number): CompanionRegistryRecord;
}

export type DevelopmentReadinessProbe = () => Promise<CompanionDevelopmentReadiness>;

export async function implementationMappings(input: {
  projectRoot: string;
  manifest: CompanionAppManifest;
  workspace: GraphWorkspaceSnapshot;
  bindings: CompanionAssetBindingsDocument;
}): Promise<CompanionImplementationMappingSnapshot> {
  const document = await readImplementationMapping(input.projectRoot);
  const entries = await Promise.all(document.entries.map((entry) => evaluateMapping(input, entry)));
  return { schema_version: 1, mapping_revision: document.mapping_revision, entries };
}

export async function putImplementationMapping(input: {
  projectRoot: string;
  manifest: CompanionAppManifest;
  workspace: GraphWorkspaceSnapshot;
  bindings: CompanionAssetBindingsDocument;
  request: PutCompanionImplementationMappingRequest;
}): Promise<CompanionImplementationMappingSnapshot> {
  if (!record(input.request) || !exactKeys(input.request, ["base_mapping_revision", "mapping"]) || typeof input.request.base_mapping_revision !== "string") throw new DevelopmentContextError(422, "invalid_mapping_request", "Implementation mapping request가 유효하지 않습니다.");
  const current = await readImplementationMapping(input.projectRoot);
  if (input.request.base_mapping_revision !== current.mapping_revision) throw new DevelopmentContextError(412, "mapping_stale", "Implementation mapping이 변경되었습니다. 최신 mapping을 다시 읽으세요.", { current_mapping_revision: current.mapping_revision });
  assertMappingEntry(input.request.mapping);
  const entry = structuredClone(input.request.mapping);
  if (entry.graph_revision !== input.workspace.graph_revision) throw new DevelopmentContextError(412, "graph_stale", "Graph가 변경되었습니다. 최신 Graph를 다시 읽으세요.", { current_graph_revision: input.workspace.graph_revision });
  assertMappingTarget(input.workspace.graph, input.bindings, entry);
  const sourceProject = sourceProjectById(input.manifest, entry.source.source_project_id);
  await assertLocatorContract(input.projectRoot, sourceProject, entry.source, true);
  await assertGitMapping(input.projectRoot, entry, true);
  assertAssetRefs(input.bindings, entry.asset_refs);
  const entries = [...current.entries.filter((candidate) => candidate.mapping_id !== entry.mapping_id && targetKey(candidate) !== targetKey(entry)), entry].sort((a, b) => a.mapping_id.localeCompare(b.mapping_id));
  const next = finalizeImplementationMapping(entries);
  await writeAtomicJson(input.projectRoot, IMPLEMENTATION_MAPPING_PATH, next);
  return implementationMappings({ ...input, workspace: input.workspace, bindings: input.bindings });
}

export async function developmentContext(input: {
  projectRoot: string;
  manifest: CompanionAppManifest;
  workspace: GraphWorkspaceSnapshot;
  bindings: CompanionAssetBindingsDocument;
  assetCatalog: DevelopmentAssetCatalog;
  request: CompanionDevelopmentContextRequest;
  readinessProbe: DevelopmentReadinessProbe;
}): Promise<CompanionDevelopmentContextCapsule> {
  assertDevelopmentContextRequest(input.request);
  if (input.request.expected_application_id !== input.manifest.application_id) throw new DevelopmentContextError(409, "application_scope_mismatch", "요청 App과 active App이 일치하지 않습니다.");
  if (input.request.expected_graph_revision !== input.workspace.graph_revision) throw new DevelopmentContextError(412, "graph_stale", "Graph가 변경되었습니다. 최신 Graph와 selection을 다시 읽으세요.", { current_graph_revision: input.workspace.graph_revision });
  const selection = input.workspace.active_selection;
  if (!selection) throw new DevelopmentContextError(409, "selection_required", "먼저 Node, Edge 또는 Region 하나를 선택하세요.");
  const bounded = boundedGraphContext(input.workspace.graph, selection);
  if (selection.kind === "edge" && (bounded.selected as GraphEdge).control.kind === "cancel") throw new DevelopmentContextError(422, "unsupported_capability", "Exact ADK 2.4 Python Runner cancellation은 public API가 아니므로 cancellation task를 만들 수 없습니다.", { capability_ids: ["F04-public-python-cancellation", "H07-unsupported-api-refusal"] });

  const sourceProject = sourceProjectById(input.manifest, input.request.source_project_id);
  const sourceSnapshot = await sourceProjectSnapshot(input.projectRoot, sourceProject);
  if (["missing", "unsupported"].includes(sourceSnapshot.readiness.status)) throw new DevelopmentContextError(409, "source_project_not_ready", "Source project root 또는 entrypoint가 안전한 상태가 아닙니다.", { readiness: sourceSnapshot.readiness });
  const lock = await readDevelopmentLock(input.projectRoot);
  const readiness = await input.readinessProbe();
  if (readiness.model_status !== "ready") throw new DevelopmentContextError(503, "model_unavailable", "Required private Qwen 3.6 vLLM endpoint가 준비되지 않았습니다.", { readiness });
  if (readiness.status !== "offline_ready") throw new DevelopmentContextError(409, "skill_not_ready", "Required local Skill bundle이 offline-ready 상태가 아닙니다.", { readiness });

  const assetRefs = graphAssetRefs(bounded.nodes);
  const assets = assetRefs.map((assetId) => {
    const binding = input.bindings.bindings.find((candidate) => candidate.asset_id === assetId);
    if (!binding) throw new DevelopmentContextError(409, "asset_binding_missing", `${assetId} exact binding을 찾을 수 없습니다.`);
    const contract = input.assetCatalog.resolveContract?.(binding.asset_id, binding.version);
    if (!contract || contract.contract_hash !== binding.contract_hash) throw new DevelopmentContextError(409, "asset_contract_changed", `${binding.asset_id}@${binding.version} exact runtime contract를 확인할 수 없습니다.`);
    return { binding: structuredClone(binding), contract: structuredClone(contract) };
  });
  const mappings = await implementationMappings({ projectRoot: input.projectRoot, manifest: input.manifest, workspace: input.workspace, bindings: input.bindings });
  const selectedMapping = mappings.entries.find((entry) => entry.target.kind === "graph_element" && entry.target.element.kind === selection.kind && entry.target.element.id === selection.id) ?? null;
  const baseCommit = await gitHead(input.projectRoot);
  const writeRoots = [sourceSnapshot.canonical_root, resolve(input.projectRoot, IMPLEMENTATION_MAPPING_PATH)];
  const prompt = buildPrompt({ input, sourceSnapshot, bounded, lock, baseCommit, writeRoots, selectedMapping });
  const unsigned = {
    schema_version: 1 as const,
    application: { application_id: input.manifest.application_id, root: input.projectRoot },
    source_project: sourceSnapshot,
    base_commit: baseCommit,
    graph_revision: input.workspace.graph_revision,
    graph_context: bounded,
    assets,
    implementation_mapping: selectedMapping,
    primary_intent: input.request.primary_intent,
    primary_skill: "$google-agents-cli-adk-code" as const,
    required_skills: structuredClone(lock.required_skills),
    write_roots: writeRoots,
    forbidden_changes: [
      ".agents/skills/** and Session 1 evidence",
      ".agent-factory/companion-graph.json (Graph write authority remains separate)",
      "API keys, private endpoints, deploy, cloud publish, and cloud observability",
      "files outside the declared write roots",
    ],
    verification: [
      `${sourceProject.runtime.package_manager} run python -m pytest`,
      `${sourceProject.runtime.package_manager} run python -m compileall ${sourceProject.runtime.entrypoint}`,
      "exact google-adk 2.4.0 import and local runtime check",
      "update implementation mapping with Graph and local Git evidence",
    ],
    evidence: structuredClone(lock.representative_integration),
    unsupported_guards: structuredClone(lock.unsupported_guards),
    model: structuredClone(lock.model),
    network: structuredClone(lock.network),
    prompt,
  };
  return { ...unsigned, capsule_id: semanticRevision(unsigned) };
}

export async function inspectDevelopmentReadiness(options: {
  installManifestPath?: string;
  skillsRoot?: string;
  disabledSkillIds?: string[];
  fetchImpl?: typeof fetch;
  modelBaseUrl?: string;
  modelApiKey?: string;
} = {}): Promise<CompanionDevelopmentReadiness> {
  const installManifestPath = resolve(options.installManifestPath ?? join(homedir(), ".agents/.af-skills-vnext-install.json"));
  const skillsRoot = resolve(options.skillsRoot ?? join(homedir(), ".agents/skills"));
  const disabled = new Set(options.disabledSkillIds ?? []);
  let install: Record<string, unknown> | null = null;
  try { install = JSON.parse(await readFile(installManifestPath, "utf8")) as Record<string, unknown>; } catch { /* reported below */ }
  let bundleStatus: CompanionDevelopmentReadiness["bundle_status"] = "offline_ready";
  if (!install) bundleStatus = "missing";
  else if (install.bundle_version !== SESSION2_DEVELOPMENT_LOCK.skill_bundle.version) bundleStatus = "version_mismatch";
  else if (install.bundle_digest !== SESSION2_DEVELOPMENT_LOCK.skill_bundle.digest || install.trusted_expected_bundle_digest !== SESSION2_DEVELOPMENT_LOCK.skill_bundle.digest) bundleStatus = "digest_mismatch";
  const installedMembers = new Map<string, string>();
  if (install && Array.isArray(install.members)) for (const member of install.members) if (record(member) && typeof member.member_id === "string" && typeof member.tree_digest === "string") installedMembers.set(member.member_id, member.tree_digest);
  const skills = await Promise.all(SESSION2_DEVELOPMENT_LOCK.required_skills.map(async (expected) => {
    const skillRoot = resolve(skillsRoot, expected.skill_id);
    if (disabled.has(expected.skill_id)) return { skill_id: expected.skill_id, status: "disabled" as const, expected_version: expected.version, expected_digest: expected.tree_digest, observed_version: null, observed_digest: null };
    const skillFile = resolve(skillRoot, "SKILL.md");
    const source = await readFile(skillFile, "utf8").catch(() => null);
    if (source === null) return { skill_id: expected.skill_id, status: "missing" as const, expected_version: expected.version, expected_digest: expected.tree_digest, observed_version: null, observed_digest: null };
    const observedVersion = /^\s{2}version:\s*([^\s]+)\s*$/mu.exec(source)?.[1] ?? null;
    const observedDigest = await computeSkillTreeDigest(skillRoot).catch(() => null);
    const memberDigest = installedMembers.get(expected.skill_id) ?? null;
    const status = observedVersion !== expected.version ? "version_mismatch" as const : observedDigest !== expected.tree_digest || memberDigest !== expected.tree_digest ? "digest_mismatch" as const : "offline_ready" as const;
    return { skill_id: expected.skill_id, status, expected_version: expected.version, expected_digest: expected.tree_digest, observed_version: observedVersion, observed_digest: observedDigest };
  }));
  const fetchImpl = options.fetchImpl ?? fetch;
  const configuredModelBaseUrl = options.modelBaseUrl ?? process.env.AF_QWEN_BASE_URL ?? "";
  const configuredModelApiKey = options.modelApiKey ?? process.env.AF_QWEN_API_KEY ?? "";
  const modelBaseUrl = normalizePrivateModelBaseUrl(configuredModelBaseUrl);
  const modelStatus = !configuredModelBaseUrl
    ? "unreachable"
    : modelBaseUrl && configuredModelApiKey
      ? await probeLockedModel(
          fetchImpl,
          modelBaseUrl,
          configuredModelApiKey,
          SESSION2_DEVELOPMENT_LOCK.model.model_id,
          SESSION2_DEVELOPMENT_LOCK.model.input_context_tokens,
        )
      : "contract_mismatch";
  const reasons = [
    ...(bundleStatus === "offline_ready" ? [] : [`bundle_${bundleStatus}`]),
    ...skills.filter((skill) => skill.status !== "offline_ready").map((skill) => `${skill.skill_id}_${skill.status}`),
    ...(modelStatus === "ready" ? [] : [`model_${modelStatus}`]),
  ];
  return { schema_version: 1, status: reasons.length ? "blocked" : "offline_ready", bundle_status: bundleStatus, skills, model_status: modelStatus, reasons };
}

export async function computeSkillTreeDigest(root: string): Promise<string> {
  const files: string[] = [];
  async function visit(directory: string, prefix: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = resolve(directory, entry.name);
      if (entry.isSymbolicLink()) throw new DevelopmentContextError(409, "skill_symlink_not_allowed", "Skill tree digest는 symbolic link를 허용하지 않습니다.");
      if (entry.isDirectory()) await visit(absolutePath, relativePath);
      else if (entry.isFile()) files.push(relativePath);
    }
  }
  await visit(resolve(root), "");
  files.sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
  const aggregate = createHash("sha256");
  for (const path of files) {
    const bytes = await readFile(resolve(root, path));
    aggregate.update(path, "utf8");
    aggregate.update("\0");
    aggregate.update(createHash("sha256").update(bytes).digest("hex"), "utf8");
    aggregate.update("\n");
  }
  return aggregate.digest("hex");
}

async function readDevelopmentLock(projectRoot: string): Promise<CompanionDevelopmentLock> {
  let value: unknown;
  try { value = JSON.parse((await readContainedFile(projectRoot, DEVELOPMENT_LOCK_PATH, 256 * 1024)).toString("utf8")); }
  catch { throw new DevelopmentContextError(409, "development_lock_missing", "Session 2 development lock을 찾을 수 없습니다."); }
  if (semanticRevision(value) !== semanticRevision(SESSION2_DEVELOPMENT_LOCK)) throw new DevelopmentContextError(409, "development_lock_mismatch", "App development lock이 active Session 2 profile과 일치하지 않습니다.");
  return structuredClone(SESSION2_DEVELOPMENT_LOCK);
}

async function readImplementationMapping(projectRoot: string): Promise<CompanionImplementationMappingDocument> {
  let value: unknown;
  try { value = JSON.parse((await readContainedFile(projectRoot, IMPLEMENTATION_MAPPING_PATH, 1024 * 1024)).toString("utf8")); }
  catch (error) {
    if (isCode(error, "ENOENT")) return emptyImplementationMapping();
    throw new DevelopmentContextError(409, "invalid_implementation_mapping", "Implementation mapping sidecar를 읽을 수 없습니다.");
  }
  try {
    if (!record(value) || !exactKeys(value, ["schema_version", "mapping_revision", "entries"]) || value.schema_version !== 1 || typeof value.mapping_revision !== "string" || !Array.isArray(value.entries)) throw new Error("invalid mapping document");
    value.entries.forEach(assertMappingEntry);
    const normalized = finalizeImplementationMapping(value.entries);
    if (normalized.mapping_revision !== value.mapping_revision) throw new Error("mapping revision mismatch");
    return normalized;
  } catch { throw new DevelopmentContextError(409, "invalid_implementation_mapping", "Implementation mapping sidecar contract가 유효하지 않습니다."); }
}

function finalizeImplementationMapping(entries: CompanionImplementationMappingEntry[]): CompanionImplementationMappingDocument {
  const sorted = structuredClone(entries).sort((a, b) => a.mapping_id.localeCompare(b.mapping_id));
  if (new Set(sorted.map((entry) => entry.mapping_id)).size !== sorted.length || new Set(sorted.map(targetKey)).size !== sorted.length) throw new DevelopmentContextError(409, "mapping_conflict", "Implementation mapping ID와 target은 각각 유일해야 합니다.");
  const unsigned = { schema_version: 1 as const, entries: sorted };
  return { ...unsigned, mapping_revision: semanticRevision(unsigned) };
}

function assertMappingEntry(value: unknown): asserts value is CompanionImplementationMappingEntry {
  if (!record(value) || !exactKeys(value, ["mapping_id", "target", "source", "graph_revision", "asset_refs", "git_base_commit", "git_result_commit", "updated_at"])) throw new DevelopmentContextError(422, "invalid_mapping", "Implementation mapping fields가 정확하지 않습니다.");
  if (typeof value.mapping_id !== "string" || !/^[a-z][a-z0-9.-]{2,127}$/u.test(value.mapping_id)) throw new DevelopmentContextError(422, "invalid_mapping", "mapping_id가 유효하지 않습니다.");
  if (!record(value.target) || !["graph_element", "asset"].includes(String(value.target.kind))) throw new DevelopmentContextError(422, "invalid_mapping", "mapping target이 유효하지 않습니다.");
  if (value.target.kind === "graph_element") {
    if (!exactKeys(value.target, ["kind", "element"]) || !record(value.target.element) || !exactKeys(value.target.element, ["kind", "id"]) || !["node", "edge", "region"].includes(String(value.target.element.kind)) || typeof value.target.element.id !== "string" || !value.target.element.id) throw new DevelopmentContextError(422, "invalid_mapping", "Graph element target이 유효하지 않습니다.");
  } else if (!exactKeys(value.target, ["kind", "asset_id", "version", "contract_hash"]) || typeof value.target.asset_id !== "string" || !value.target.asset_id || !Number.isInteger(value.target.version) || Number(value.target.version) < 1 || typeof value.target.contract_hash !== "string" || !/^[a-f0-9]{64}$/u.test(value.target.contract_hash)) throw new DevelopmentContextError(422, "invalid_mapping", "Asset target이 유효하지 않습니다.");
  if (!record(value.source) || !exactKeys(value.source, ["source_project_id", "module", "symbol", "config", "tests"]) || typeof value.source.source_project_id !== "string" || typeof value.source.module !== "string" || (value.source.symbol !== null && (typeof value.source.symbol !== "string" || !value.source.symbol)) || (value.source.config !== null && typeof value.source.config !== "string") || !Array.isArray(value.source.tests) || value.source.tests.some((path) => typeof path !== "string")) throw new DevelopmentContextError(422, "invalid_mapping", "Source locator가 유효하지 않습니다.");
  if (typeof value.graph_revision !== "string" || !/^[a-f0-9]{64}$/u.test(value.graph_revision) || !Array.isArray(value.asset_refs) || typeof value.git_base_commit !== "string" || typeof value.git_result_commit !== "string" || !/^[a-f0-9]{40,64}$/u.test(value.git_base_commit) || !/^[a-f0-9]{40,64}$/u.test(value.git_result_commit) || typeof value.updated_at !== "string" || !Number.isFinite(Date.parse(value.updated_at))) throw new DevelopmentContextError(422, "invalid_mapping", "Mapping revision 또는 Git evidence가 유효하지 않습니다.");
  for (const ref of value.asset_refs) if (!record(ref) || !exactKeys(ref, ["asset_id", "version", "contract_hash"]) || typeof ref.asset_id !== "string" || !Number.isInteger(ref.version) || Number(ref.version) < 1 || typeof ref.contract_hash !== "string" || !/^[a-f0-9]{64}$/u.test(ref.contract_hash)) throw new DevelopmentContextError(422, "invalid_mapping", "Mapping Asset ref가 유효하지 않습니다.");
}

async function evaluateMapping(input: { projectRoot: string; manifest: CompanionAppManifest; workspace: GraphWorkspaceSnapshot; bindings: CompanionAssetBindingsDocument }, entry: CompanionImplementationMappingEntry): Promise<CompanionImplementationMappingStatus> {
  const missing: string[] = [];
  const stale: string[] = [];
  const conflict: string[] = [];
  try { assertMappingTarget(input.workspace.graph, input.bindings, entry); } catch (error) { missing.push(error instanceof DevelopmentContextError ? error.code : "target_missing"); }
  let sourceProject: CompanionSourceProject | null = null;
  try { sourceProject = sourceProjectById(input.manifest, entry.source.source_project_id); } catch { missing.push("source_project_missing"); }
  if (sourceProject) {
    const locatorIssues = await assertLocatorContract(input.projectRoot, sourceProject, entry.source, false);
    missing.push(...locatorIssues);
  }
  if (entry.graph_revision !== input.workspace.graph_revision) stale.push("graph_revision_changed");
  for (const ref of entry.asset_refs) {
    const binding = input.bindings.bindings.find((candidate) => candidate.asset_id === ref.asset_id);
    if (!binding) missing.push(`asset_binding_missing:${ref.asset_id}`);
    else if (binding.version !== ref.version || binding.contract_hash !== ref.contract_hash) stale.push(`asset_binding_changed:${ref.asset_id}`);
  }
  const gitIssues = await assertGitMapping(input.projectRoot, entry, false);
  conflict.push(...gitIssues.filter((issue) => issue.startsWith("git_commit") || issue === "git_history_conflict"));
  stale.push(...gitIssues.filter((issue) => issue === "git_head_changed"));
  const reasons = [...new Set([...conflict, ...missing, ...stale])];
  const status = conflict.length ? "conflict" as const : missing.length ? "missing" as const : stale.length ? "stale" as const : "current" as const;
  return { ...structuredClone(entry), status, reasons };
}

function assertMappingTarget(graph: GraphIR, bindings: CompanionAssetBindingsDocument, entry: CompanionImplementationMappingEntry): void {
  const target = entry.target;
  if (target.kind === "graph_element") {
    const collection = target.element.kind === "node" ? graph.nodes : target.element.kind === "edge" ? graph.edges : graph.regions;
    if (!collection.some((candidate) => candidate.id === target.element.id)) throw new DevelopmentContextError(409, "mapping_target_missing", "Mapping target Graph element를 찾을 수 없습니다.");
  } else {
    const binding = bindings.bindings.find((candidate) => candidate.asset_id === target.asset_id);
    if (!binding) throw new DevelopmentContextError(409, "asset_binding_missing", "Mapping target Asset binding을 찾을 수 없습니다.");
    if (binding.version !== target.version || binding.contract_hash !== target.contract_hash) throw new DevelopmentContextError(409, "asset_contract_changed", "Mapping target Asset binding이 변경되었습니다.");
  }
}

function assertAssetRefs(bindings: CompanionAssetBindingsDocument, refs: CompanionImplementationMappingEntry["asset_refs"]): void {
  if (new Set(refs.map((ref) => ref.asset_id)).size !== refs.length) throw new DevelopmentContextError(422, "invalid_mapping", "Mapping Asset ref는 중복될 수 없습니다.");
  for (const ref of refs) {
    const binding = bindings.bindings.find((candidate) => candidate.asset_id === ref.asset_id);
    if (!binding) throw new DevelopmentContextError(409, "asset_binding_missing", `${ref.asset_id} binding을 찾을 수 없습니다.`);
    if (binding.version !== ref.version || binding.contract_hash !== ref.contract_hash) throw new DevelopmentContextError(409, "asset_contract_changed", `${ref.asset_id} exact binding이 변경되었습니다.`);
  }
}

async function assertLocatorContract(projectRoot: string, sourceProject: CompanionSourceProject, locator: CompanionImplementationMappingEntry["source"], strict: boolean): Promise<string[]> {
  const issues: string[] = [];
  for (const [kind, path] of [["module", locator.module], ...(locator.config ? [["config", locator.config]] : []), ...locator.tests.map((path) => ["test", path])] as Array<[string, string]>) {
    try {
      assertRelativePath(path, "invalid_source_locator");
      const sourceRoot = resolve(projectRoot, sourceProject.root);
      const target = resolve(sourceRoot, path);
      assertContained(sourceRoot, target);
      await assertNoSymlinkSegments(sourceRoot, target);
      const info = await lstat(target);
      if (!info.isFile() || info.isSymbolicLink()) throw new Error("not a regular file");
    } catch {
      const reason = `${kind}_missing:${path}`;
      if (strict) throw new DevelopmentContextError(409, "source_locator_missing", `Source locator를 찾을 수 없습니다: ${path}`);
      issues.push(reason);
    }
  }
  return issues;
}

async function assertGitMapping(projectRoot: string, entry: CompanionImplementationMappingEntry, strict: boolean): Promise<string[]> {
  const issues: string[] = [];
  const commitExists = async (commit: string) => execFileAsync("git", ["cat-file", "-e", `${commit}^{commit}`], { cwd: projectRoot }).then(() => true, () => false);
  if (!await commitExists(entry.git_base_commit)) issues.push("git_commit_missing:base");
  if (!await commitExists(entry.git_result_commit)) issues.push("git_commit_missing:result");
  if (!issues.length) {
    const ancestor = await execFileAsync("git", ["merge-base", "--is-ancestor", entry.git_base_commit, entry.git_result_commit], { cwd: projectRoot }).then(() => true, () => false);
    if (!ancestor) issues.push("git_history_conflict");
    if (await gitHead(projectRoot) !== entry.git_result_commit) issues.push("git_head_changed");
  }
  if (strict && issues.length) throw new DevelopmentContextError(409, issues.includes("git_head_changed") ? "git_head_changed" : "git_evidence_conflict", "Mapping Git base/result evidence가 current App history와 일치하지 않습니다.", { reasons: issues });
  return issues;
}

function sourceProjectById(manifest: CompanionAppManifest, sourceProjectId: string): CompanionSourceProject {
  const project = manifest.schema_version === 2 ? manifest.source_projects.find((candidate) => candidate.source_project_id === sourceProjectId) : undefined;
  if (!project) throw new DevelopmentContextError(404, "source_project_missing", "Source project를 찾을 수 없습니다.");
  return project;
}

function boundedGraphContext(graph: GraphIR, selection: { kind: "node" | "edge" | "region"; id: string }) {
  let selected: GraphNode | GraphEdge | GraphRegion | undefined;
  let nodes: GraphNode[] = [];
  let edges: GraphEdge[] = [];
  let regions: GraphRegion[] = [];
  if (selection.kind === "node") {
    selected = graph.nodes.find((node) => node.id === selection.id);
    if (!selected) throw new DevelopmentContextError(409, "selection_missing", "Selected Node가 current Graph에 없습니다.");
    edges = graph.edges.filter((edge) => edge.from === selection.id || edge.to === selection.id);
    const nodeIds = new Set([selection.id, ...edges.flatMap((edge) => [edge.from, edge.to])]);
    nodes = graph.nodes.filter((node) => nodeIds.has(node.id));
    regions = graph.regions.filter((region) => region.node_ids.some((id) => nodeIds.has(id)));
  } else if (selection.kind === "edge") {
    selected = graph.edges.find((edge) => edge.id === selection.id);
    if (!selected) throw new DevelopmentContextError(409, "selection_missing", "Selected Edge가 current Graph에 없습니다.");
    edges = [selected];
    const nodeIds = new Set([selected.from, selected.to]);
    nodes = graph.nodes.filter((node) => nodeIds.has(node.id));
    regions = graph.regions.filter((region) => region.node_ids.some((id) => nodeIds.has(id)));
  } else {
    selected = graph.regions.find((region) => region.id === selection.id);
    if (!selected) throw new DevelopmentContextError(409, "selection_missing", "Selected Region이 current Graph에 없습니다.");
    const nodeIds = new Set(selected.node_ids);
    nodes = graph.nodes.filter((node) => nodeIds.has(node.id));
    edges = graph.edges.filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
    regions = graph.regions.filter((region) => region.id === selected!.id || region.parent_region_id === selected!.id);
  }
  nodes.sort((a, b) => a.id.localeCompare(b.id)); edges.sort((a, b) => a.id.localeCompare(b.id)); regions.sort((a, b) => a.id.localeCompare(b.id));
  if (nodes.length > 24 || edges.length > 48 || regions.length > 12) throw new DevelopmentContextError(422, "context_too_large", "Selected neighborhood가 bounded capsule limit을 초과했습니다.", { limits: { nodes: 24, edges: 48, regions: 12 } });
  return { selection: structuredClone(selection), selected: structuredClone(selected), nodes: structuredClone(nodes), edges: structuredClone(edges), regions: structuredClone(regions) };
}

function graphAssetRefs(nodes: GraphNode[]): string[] {
  const refs = new Set<string>();
  for (const node of nodes) {
    if (node.node_kind === "agent") { refs.add(node.agent_ref); node.available_tools.forEach((tool) => refs.add(tool.tool_ref)); }
    else if (node.node_kind === "tool") refs.add(node.tool_ref);
    else if (node.node_kind === "subworkflow") refs.add(node.workflow_ref);
  }
  return [...refs].sort();
}

function buildPrompt(input: {
  input: { manifest: CompanionAppManifest; workspace: GraphWorkspaceSnapshot; request: CompanionDevelopmentContextRequest };
  sourceSnapshot: CompanionSourceProjectSnapshot;
  bounded: ReturnType<typeof boundedGraphContext>;
  lock: CompanionDevelopmentLock;
  baseCommit: string;
  writeRoots: string[];
  selectedMapping: CompanionImplementationMappingStatus | null;
}): string {
  return [
    "$google-agents-cli-adk-code",
    `Primary intent: ${input.input.request.primary_intent}.`,
    `Work only in source project ${input.sourceSnapshot.source_project_id} at ${input.sourceSnapshot.canonical_root}.`,
    `Base Git commit: ${input.baseCommit}. Graph revision: ${input.input.workspace.graph_revision}.`,
    `Selected ${input.bounded.selection.kind}: ${input.bounded.selection.id}.`,
    `Bounded context IDs: nodes=${input.bounded.nodes.map((entry) => entry.id).join(",") || "none"}; edges=${input.bounded.edges.map((entry) => entry.id).join(",") || "none"}; regions=${input.bounded.regions.map((entry) => entry.id).join(",") || "none"}.`,
    `Implementation mapping status: ${input.selectedMapping?.status ?? "missing"}.`,
    `Use exact google-adk ${input.lock.runtime.google_adk}, mcp ${input.lock.runtime.mcp}, a2a-sdk ${input.lock.runtime.a2a_sdk}, and agents-cli ${input.lock.runtime.agents_cli}.`,
    `The required acceptance model is ${input.lock.model.model_id} through private OpenAI-compatible vLLM configuration named by ${input.lock.model.transport.endpoint_env} and ${input.lock.model.transport.api_key_env}; never persist or echo either value.`,
    "Test with Internet egress denied and fallback disabled. Generated source must use only the configured private model transport and require no external model, cloud login, or Internet at runtime.",
    `Write roots: ${input.writeRoots.join("; ")}.`,
    "Do not write the Graph, AF Skill instructions, Session 1 evidence, secrets, deploy, publish, or cloud observability files.",
    "After source checks pass, update only the implementation mapping sidecar with current Graph and local Git evidence. Source and Graph write authority remain separate.",
  ].join("\n");
}

function assertDevelopmentContextRequest(value: unknown): asserts value is CompanionDevelopmentContextRequest {
  if (!record(value) || !exactKeys(value, ["expected_application_id", "expected_graph_revision", "source_project_id", "primary_intent"]) || typeof value.expected_application_id !== "string" || typeof value.expected_graph_revision !== "string" || !/^[a-f0-9]{64}$/u.test(value.expected_graph_revision) || typeof value.source_project_id !== "string" || !SOURCE_PROJECT_ID.test(value.source_project_id) || !["implement_selected_element", "verify_selected_element"].includes(String(value.primary_intent))) throw new DevelopmentContextError(422, "invalid_development_request", "Development context request가 유효하지 않습니다.");
}

async function probeLockedModel(
  fetchImpl: typeof fetch,
  baseUrl: string,
  apiKey: string,
  modelId: string,
  inputContextTokens: number,
): Promise<CompanionDevelopmentReadiness["model_status"]> {
  try {
    const response = await fetchImpl(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(1_500),
    });
    if (!response.ok) return "unreachable";
    const body = await response.json() as unknown;
    if (!record(body) || !Array.isArray(body.data) || !body.data.some((entry) => record(entry) && entry.id === modelId && entry.max_model_len === inputContextTokens)) return "contract_mismatch";
    return "ready";
  } catch { return "unreachable"; }
}

export function normalizePrivateModelBaseUrl(value: string): string | null {
  const candidate = value.trim().replace(/\/+$/u, "");
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.pathname !== "/v1" || parsed.search || parsed.hash || parsed.username || parsed.password) return null;
    const host = parsed.hostname.replace(/^\[|\]$/gu, "").toLowerCase();
    if (!privateModelHost(host)) return null;
    return `${parsed.origin}/v1`;
  } catch { return null; }
}

function privateModelHost(host: string): boolean {
  if (host === "localhost" || host === "::1" || host.endsWith(".internal") || host.endsWith(".lan") || host.endsWith(".local") || !host.includes(".")) return true;
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return /^f[cd][0-9a-f:]+$/u.test(host);
  const [first, second] = parts as [number, number, number, number];
  return first === 10
    || first === 127
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 100 && second >= 64 && second <= 127);
}

async function gitHead(projectRoot: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8" });
  const value = stdout.trim();
  if (!/^[a-f0-9]{40,64}$/u.test(value)) throw new DevelopmentContextError(409, "git_head_unavailable", "App local Git HEAD를 확인할 수 없습니다.");
  return value;
}

function targetKey(entry: CompanionImplementationMappingEntry): string { return entry.target.kind === "graph_element" ? `graph:${entry.target.element.kind}:${entry.target.element.id}` : `asset:${entry.target.asset_id}@${entry.target.version}`; }

async function sourceProjectSnapshot(projectRoot: string, sourceProject: CompanionSourceProject): Promise<CompanionSourceProjectSnapshot> {
  const canonicalRoot = resolve(projectRoot, sourceProject.root);
  assertContained(projectRoot, canonicalRoot);
  const rootInfo = await lstat(canonicalRoot).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
  let status: CompanionSourceProjectSnapshot["readiness"]["status"] = "ready";
  const reasons: string[] = [];
  if (!rootInfo?.isDirectory() || rootInfo.isSymbolicLink()) { status = "missing"; reasons.push("source_root_missing"); }
  else {
    await assertNoSymlinkSegments(projectRoot, canonicalRoot);
    const entrypoint = resolve(canonicalRoot, sourceProject.runtime.entrypoint);
    assertContained(canonicalRoot, entrypoint);
    const entrypointInfo = await lstat(entrypoint).catch((error: NodeJS.ErrnoException) => error.code === "ENOENT" ? null : Promise.reject(error));
    if (!entrypointInfo) { status = "scaffold_required"; reasons.push("entrypoint_missing"); }
    else if (!entrypointInfo.isFile() || entrypointInfo.isSymbolicLink()) { status = "unsupported"; reasons.push("entrypoint_not_regular_file"); }
  }
  const gitHead = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8" }).then(({ stdout }) => stdout.trim()).catch(() => "");
  if (!/^[a-f0-9]{40,64}$/u.test(gitHead)) throw new DevelopmentContextError(409, "git_head_unavailable", "App local Git HEAD를 확인할 수 없습니다.");
  return { ...structuredClone(sourceProject), canonical_root: canonicalRoot, readiness: { status, reasons, git_head: gitHead } };
}

function assertRelativePath(value: unknown, code: string): asserts value is string {
  if (typeof value !== "string" || !value || isAbsolute(value) || value.includes("\\") || value.startsWith("/") || value.split("/").some((part) => !part || part === "." || part === "..")) throw new DevelopmentContextError(422, code, "Path는 App-relative 경로여야 하며 escape segment를 포함할 수 없습니다.");
}

function reservedRoot(path: string): boolean { return [".git", ".agent-factory", ".codex"].some((entry) => path === entry || path.startsWith(`${entry}/`)); }
function invalidSource(message: string): DevelopmentContextError { return new DevelopmentContextError(422, "invalid_source_project", message); }
function exactKeys(value: Record<string, unknown>, expected: string[]): boolean { const keys = Object.keys(value).sort(); return keys.length === expected.length && keys.every((key, index) => key === [...expected].sort()[index]); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function assertContained(root: string, target: string): void { const relation = relative(root, target); if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) throw new DevelopmentContextError(422, "invalid_source_root", "Source path가 App root 밖을 가리킵니다."); }
async function assertNoSymlinkSegments(root: string, target: string): Promise<void> { let cursor = root; for (const part of relative(root, target).split(sep).filter(Boolean)) { cursor = resolve(cursor, part); if ((await lstat(cursor)).isSymbolicLink()) throw new DevelopmentContextError(409, "symlink_not_allowed", "Source project path에는 symbolic link를 사용할 수 없습니다."); } const info = await stat(root); if (!info.isDirectory()) throw new DevelopmentContextError(409, "invalid_app_root", "App root가 directory가 아닙니다."); }
function isCode(error: unknown, code: string): error is NodeJS.ErrnoException { return error instanceof Error && "code" in error && error.code === code; }
