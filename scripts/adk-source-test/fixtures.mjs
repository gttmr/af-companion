import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSnapshot } from "../../packages/agent-factory-core/src/assetRegistry.ts";
import { writeBundleFiles } from "../adk-source/bundle-writer.mjs";
import { loadArtifactContext } from "../adk-source/context.mjs";
import { buildFiles } from "../adk-source/file-builder.mjs";

export const scriptsRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
export const repoRoot = join(scriptsRoot, "..");
export const generator = join(scriptsRoot, "generate-adk-source.mjs");

export function targetRequirement(requirementId, patch = {}) {
  return {
    id: requirementId,
    title: requirementId,
    raw_text: `Build ${requirementId}`,
    domain: "domain-neutral",
    requester: { team: "platform", role: "developer" },
    business_goal: `Exercise ${requirementId}`,
    current_process: [],
    inputs: [],
    outputs: [],
    systems: [],
    risk_signals: [],
    missing_information: [],
    contradictions: [],
    status: "approved",
    ...patch
  };
}

export function targetEvidence(requirement) {
  return {
    requested_goal: requirement.business_goal,
    business_domain_hint: requirement.domain,
    user_role: requirement.requester.role,
    input_data: requirement.inputs.map((field) => field.name),
    output_data: requirement.outputs.map((field) => field.name),
    systems_mentioned: requirement.systems.map((system) => system.name),
    decisions_implied: [],
    risk_signals: [...requirement.risk_signals],
    missing_information: [...requirement.missing_information],
    contradictions: [...requirement.contradictions],
    assumptions: []
  };
}

export function targetAsset(assetId, assetType, patch = {}) {
  return {
    asset_id: assetId,
    source_requirement_id: patch.source_requirement_id ?? "req-target",
    catalog_entry_id: null,
    name: assetId,
    asset_type: assetType,
    domain_scope: "domain_neutral",
    business_domains: [],
    owner: "platform",
    reuse_status: "project_only",
    capability_tags: [],
    binding: assetType === "tool" ? { kind: "unresolved" } : null,
    connection: assetType === "tool" ? { transport: "unknown" } : null,
    workflow_profile: assetType === "workflow"
      ? { representation: "graph", coordination: "explicit", template_ref: null }
      : null,
    exposure: null,
    confidence: 0.9,
    rationale: `Reviewed ${assetType} asset ${assetId}`,
    inputs: [],
    outputs: [],
    risk_level: "low",
    risk_signals: [],
    status: "approved",
    missing_information: [],
    developer_todos: ["review"],
    smoke_spec: {
      sample_user_message: "hello",
      synthetic_inputs: {},
      expected_output_shape: {},
      expected_event_markers: [],
      mock_sources: [],
      ready: true
    },
    ...patch
  };
}

export function targetGraph({ requirementId, nodes, edges, regions = [], workflowRef = null }) {
  return {
    graph_id: `graph.${requirementId.replace(/^req-/, "")}`,
    source_requirement_id: requirementId,
    workflow_ref: workflowRef,
    nodes: nodes.map((node) => ({ label: node.label ?? node.id, ...node })),
    edges,
    regions
  };
}

export function targetEdge(from, to, kind = "next", patch = {}) {
  return {
    id: `edge.${from}.${to}`,
    from,
    to,
    channel: null,
    ...patch,
    control: {
      kind,
      condition: null,
      accepted_aliases: [],
      default: false,
      ...(patch.control ?? {})
    }
  };
}

export function writeTargetArtifacts(dir, { requirement, assets, graph, runnable, a2aContracts = [], runtimeContracts = [] }) {
  const strictRequirement = targetRequirement(requirement.id, requirement);
  const strictAssets = assets.map((asset) => ({ ...asset, source_requirement_id: strictRequirement.id }));
  const analysisPath = join(dir, "analysis-result.json");
  writeJson(analysisPath, {
    contract_version: "2.0",
    normalizedRequirement: strictRequirement,
    evidence: targetEvidence(strictRequirement),
    assetCandidates: structuredClone(strictAssets),
    a2aContracts,
    runtimeContracts,
    graph
  });
  writeJson(join(dir, "scaffold-plan.json"), {
    contract_version: "2.0",
    requirement_id: requirement.id,
    source: "approved_workbench_artifact",
    raw_requirement_to_code: false,
    output_mode: runnable ? "runnable" : "smoke",
    assets: structuredClone(strictAssets),
    graph,
    runtime_contracts: runtimeContracts,
    excluded_assets: [],
    manifest: { catalog_bound_assets: [], new_code_required: [] },
    validation: { can_generate_source: true, blockers: [], warnings: [] }
  });
  writeJson(join(dir, "af-work-item.json"), targetWorkItem(dir));
}

export function targetWorkItem(root, options = {}) {
  const at = "2030-01-01T00:00:00.000Z";
  const analysisPath = join(root, "analysis-result.json");
  const scaffoldPath = join(root, "scaffold-plan.json");
  const analysis = JSON.parse(readFileSync(analysisPath));
  const scaffoldPlan = JSON.parse(readFileSync(scaffoldPath));
  if (!analysis.assetCandidates.some((asset) => asset.asset_type === "agent" || asset.asset_type === "workflow")) {
    const fixtureRoot = targetAsset("workflow.fixture-root", "workflow", {
      source_requirement_id: analysis.normalizedRequirement.id,
      name: "Fixture Root Workflow"
    });
    analysis.assetCandidates.push(fixtureRoot);
    scaffoldPlan.assets.push(structuredClone(fixtureRoot));
    analysis.graph.workflow_ref = fixtureRoot.asset_id;
    scaffoldPlan.graph.workflow_ref = fixtureRoot.asset_id;
    writeJson(analysisPath, analysis);
    writeJson(scaffoldPath, scaffoldPlan);
  }
  const analysisSource = readFileSync(analysisPath);
  const scaffoldSource = readFileSync(scaffoldPath);
  const workId = analysis.normalizedRequirement.id;
  const registryPath = join(repoRoot, "catalog/asset-registry.json");
  const registrySource = readFileSync(registryPath);
  const registryRevision = loadSnapshot(registryPath).registry_revision;
  const rootAsset = chooseRootAsset(analysis);
  const solutionControlStrategy = rootAsset.asset_type === "workflow" ? "explicit_workflow" : "single_agent";
  const decisions = targetDecisions(rootAsset, solutionControlStrategy);
  const assetDecisions = [];
  const requirementRevision = targetRevision([
    { ref: "analysis-result.json#/normalizedRequirement", content: jsonBytes(analysis.normalizedRequirement) }
  ], registryRevision);
  const decisionRevision = targetRevision([
    { ref: "af-work-item.json#/decisions", content: jsonBytes(decisions) }
  ], registryRevision);
  const assetDecisionRevision = targetRevision([
    { ref: "af-work-item.json#/asset_decisions", content: jsonBytes(assetDecisions) }
  ], registryRevision);
  const discoveryRevision = targetRevision([
    { ref: "analysis-result.json", content: analysisSource }
  ], registryRevision);
  const catalogSnapshotRevision = targetRevision([
    { ref: "catalog/asset-registry.json", content: registrySource }
  ], registryRevision);
  const graphRevision = targetRevision([
    { ref: "analysis-result.json#/graph", content: jsonBytes(analysis.graph) }
  ], registryRevision);
  const rootExecutable = {
    asset_type: rootAsset.asset_type,
    asset_ref: rootAsset.asset_id,
    asset_version: 1,
    decision_id: "decision-root-executable"
  };
  const rootExecutableRevision = targetRevision([
    { ref: "af-work-item.json#/root_executable", content: jsonBytes(rootExecutable) }
  ], registryRevision);
  const runtimeContractRevision = targetRevision([
    { ref: "analysis-result.json#/runtimeContracts", content: jsonBytes(analysis.runtimeContracts) }
  ], registryRevision);
  const compositionRevision = targetRevision([
    { ref: "analysis-result.json", content: analysisSource },
    { ref: "scaffold-plan.json", content: scaffoldSource }
  ], registryRevision);
  const scaffoldStatus = options.scaffoldStatus ?? "not_started";
  const state = (status, inputRevision = null, outputRevision = null, outputRefs = [], blockerRefs = []) => ({
    status,
    input_revision: inputRevision,
    output_revision: outputRevision,
    output_refs: outputRefs,
    blocker_refs: blockerRefs,
    output_roots: [],
    started_at: status === "not_started" ? null : at,
    updated_at: at,
    completed_at: status === "complete" ? at : null
  });
  const approvedGate = (binding, turnId) => ({
    status: "approved",
    binding,
    decided_at: at,
    session_id: "fixture-session",
    turn_id: turnId,
    stale_reasons: []
  });
  const analysisEtag = createHash("sha256").update(analysisSource).digest("hex");
  const activeRuns = scaffoldStatus === "active" ? [{
    run_id: "run-scaffold",
    skill_id: "af-scaffold-runtime",
    role: "scaffold",
    status: "active",
    session_id: "fixture-scaffold-session",
    parent_run_id: null,
    input_revision: compositionRevision,
    started_at: at,
    updated_at: at
  }] : [];
  return {
    schema_version: 2,
    work_id: workId,
    artifact_root: `artifacts/af/${workId}`,
    ledger_revision: 2,
    focus_skill: "af-scaffold-runtime",
    active_runs: activeRuns,
    skills: {
      "af-discover-assets": state("complete", requirementRevision, discoveryRevision, ["analysis-result.json"]),
      "af-compose-solution": state("complete", discoveryRevision, compositionRevision, ["analysis-result.json", "scaffold-plan.json"]),
      "af-scaffold-runtime": state(
        scaffoldStatus,
        scaffoldStatus === "not_started" ? null : compositionRevision,
        null,
        [],
        scaffoldStatus === "blocked" ? ["implementation-handoff.md"] : []
      ),
      "af-verify-runtime": state("not_started")
    },
    revisions: {
      requirement: requirementRevision,
      decision: decisionRevision,
      asset_decision: assetDecisionRevision,
      discovery: discoveryRevision,
      catalog_snapshot: catalogSnapshotRevision,
      graph: graphRevision,
      root_executable: rootExecutableRevision,
      runtime_contract: runtimeContractRevision,
      composition: compositionRevision,
      scaffold: null,
      verification: null
    },
    discovery_cycles: [{
      cycle_id: "discovery-1",
      status: "complete",
      revision: discoveryRevision,
      supersedes_cycle_id: null,
      trigger: "initial",
      artifact_refs: ["analysis-result.json"],
      started_at: at,
      completed_at: at
    }],
    composition_cycles: [{
      cycle_id: "composition-1",
      status: "complete",
      revision: compositionRevision,
      supersedes_cycle_id: null,
      artifact_refs: ["analysis-result.json", "scaffold-plan.json"],
      return_to_discover: null,
      started_at: at,
      completed_at: at
    }],
    decisions,
    asset_decisions: assetDecisions,
    solution_control_strategy: solutionControlStrategy,
    root_executable: rootExecutable,
    review_gates: {
      discovery: approvedGate({
        requirement_revision: requirementRevision,
        decision_revision: decisionRevision,
        asset_decision_revision: assetDecisionRevision,
        discovery_revision: discoveryRevision,
        catalog_snapshot_revision: catalogSnapshotRevision,
        artifact_etag: analysisEtag
      }, "discover-review"),
      composition: approvedGate({
        discovery_revision: discoveryRevision,
        graph_revision: graphRevision,
        root_executable_revision: rootExecutableRevision,
        runtime_contract_revision: runtimeContractRevision,
        composition_revision: compositionRevision,
        artifact_etag: analysisEtag
      }, "compose-review")
    },
    artifact_refs: ["analysis-result.json", "scaffold-plan.json"],
    generated_output_roots: [],
    verification: { outcome: null, revision: null, report_ref: null, evidence_refs: [], verified_at: null },
    invalidations: [],
    session_handoffs: []
  };
}

export function targetRevision(subjectInputs, registryRevision = null) {
  const subjects = subjectInputs
    .map(({ ref, content }) => ({
      ref,
      sha256: createHash("sha256").update(content).digest("hex")
    }))
    .sort((left, right) => left.ref.localeCompare(right.ref));
  if (new Set(subjects.map((subject) => subject.ref)).size !== subjects.length) {
    throw new Error("revision subjects must use unique refs");
  }
  const digest = createHash("sha256").update(JSON.stringify({
    subjects,
    registry_revision: registryRevision
  })).digest("hex");
  return { digest, subjects, registry_revision: registryRevision };
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function refreshCompositionReviewEtag(root) {
  writeJson(join(root, "af-work-item.json"), targetWorkItem(root));
}

function chooseRootAsset(analysis) {
  const rootRef = analysis.graph.workflow_ref;
  const rootAsset = rootRef
    ? analysis.assetCandidates.find((asset) => asset.asset_id === rootRef && asset.asset_type === "workflow")
    : analysis.assetCandidates.find((asset) => asset.asset_type === "agent");
  if (!rootAsset) throw new Error("fixture requires an Agent or Workflow root executable");
  return rootAsset;
}

function targetDecisions(rootAsset, solutionControlStrategy) {
  const base = {
    required: true,
    selected_by: "user",
    selection_reason: "Approved synthetic fixture decision.",
    evidence_refs: ["analysis-result.json"],
    catalog_refs: [],
    session_id: "fixture-session",
    turn_id: "fixture-turn",
    status: "resolved",
    supersedes: null
  };
  return [{
    ...base,
    decision_id: "decision-solution-control-strategy",
    topic: "solution_control_strategy",
    options: ["single_agent", "agent_delegation", "explicit_workflow", "hybrid"],
    recommended_option: solutionControlStrategy,
    selected_option: solutionControlStrategy
  }, {
    ...base,
    decision_id: "decision-root-executable",
    topic: "root_executable",
    options: [rootAsset.asset_id],
    recommended_option: rootAsset.asset_id,
    selected_option: rootAsset.asset_id
  }];
}

function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function targetA2aContract({ contractId = "a2a-001", agentRef, name = "Remote", url }) {
  return {
    contract_id: contractId,
    agent_ref: agentRef,
    target_agent_name: name,
    target_agent_purpose: `Delegate reviewed work to ${name}`,
    contract_status: "approved",
    agent_card: { discovery_method: "well-known", agent_card_url: url, version: "1.0", notes: "Reviewed fixture" },
    supported_interfaces: [{ url, protocol_binding: "jsonrpc", protocol_version: "1.0", tenant_policy: "single-tenant fixture" }],
    input_modes: ["text/plain"],
    output_modes: ["text/plain"],
    security_schemes: [],
    security_requirements: [],
    skills: ["reviewed-fixture"],
    extensions: [],
    message_contract: { allowed_part_fields: ["text"], allowed_roles: ["ROLE_USER", "ROLE_AGENT"] },
    task_lifecycle: {
      states: ["TASK_STATE_SUBMITTED", "TASK_STATE_WORKING", "TASK_STATE_COMPLETED", "TASK_STATE_FAILED"],
      allowed_transitions: [
        { from: "TASK_STATE_SUBMITTED", to: "TASK_STATE_WORKING" },
        { from: "TASK_STATE_WORKING", to: "TASK_STATE_COMPLETED" },
        { from: "TASK_STATE_WORKING", to: "TASK_STATE_FAILED" }
      ],
      terminal_states: ["TASK_STATE_COMPLETED", "TASK_STATE_FAILED"],
      input_required_followup: "Return input-required to the caller",
      auth_required_followup: "Return auth-required to the caller"
    },
    streaming: { supported: false, wrappers: [], non_streaming_fallback: "Use SendMessage" },
    operations: ["SendMessage", "GetTask", "CancelTask"],
    http_paths: ["/message:send", "/tasks/{id}", "/tasks/{id}:cancel"],
    artifact_contract: { mutation_rules: "Artifacts are immutable", chunking_policy: "No chunking" },
    adk_host_mapping: "RemoteA2aAgent",
    adk_runtime_policy: {
      timeout_seconds: 30,
      auth: { mode: "none", env_var: null, metadata_key: null },
      retry_handoff: { max_attempts: null, backoff_seconds: null, retry_on: [] },
      fallback_handoff: { mode: "none", message: null }
    },
    timeout: "30 seconds",
    retry: "No automatic retry",
    fallback: "Return the remote failure",
    cancellation: "Forward cancellation",
    unsupported_operation: "Return unsupported operation",
    get_task_fallback: "Return the last known task",
    push_notification_policy: null,
    auth: "No authentication in fixture",
    token_handling: "No tokens",
    audit: "Record contract and task identifiers",
    data_policy: "Synthetic fixture data only"
  };
}

export function targetRuntimeContract({
  contractId,
  contractKind,
  assetId = null,
  operationType = "read",
  sideEffectLevel = "read_only",
  humanApprovalRequired = false,
  asyncResumeRequired = false,
  resumePolicy = null,
  sideEffectGuard = null,
  graphIrAnnotations = {}
}) {
  const contract = {
    contract_id: contractId,
    contract_kind: contractKind,
    asset_id: assetId,
    title: `Reviewed runtime contract ${contractId}`,
    contract_status: "approved",
    summary: `Synthetic runtime boundary for ${contractId}`,
    required_review_fields: [],
    reviewer_notes: "Approved synthetic generator fixture.",
    runtime_support: {
      context_manager_required: false,
      callback_broker_required: false,
      human_approval_required: humanApprovalRequired,
      idempotency_required: sideEffectLevel !== "none" && sideEffectLevel !== "read_only",
      audit_required: true,
      compensation_required: false
    },
    operation: {
      operation_type: operationType,
      side_effect_level: sideEffectLevel,
      callback_expected: false,
      async_resume_required: asyncResumeRequired
    },
    identifiers: [contractId],
    policies: {
      auth_policy: "Synthetic fixture only.",
      timeout_policy: "Bounded by the fixture.",
      retry_policy: "No implicit retry.",
      fallback_policy: "Fail visibly.",
      masking_policy: "Synthetic identifiers only.",
      data_policy: "Synthetic fixture data only."
    },
    graph_ir_annotations: graphIrAnnotations,
    synthetic_examples: [],
    developer_todos: []
  };
  if (contractKind === "async_resume") {
    contract.resume_policy = resumePolicy ?? {
      interrupt_id: `${contractId}-interrupt`,
      correlation_scope: "invocation",
      timeout_seconds: 60,
      on_timeout: "expire_without_side_effect",
      duplicate_response: "return_recorded_result",
      conflicting_response: "reject",
      restart_policy: "resume_incomplete_replay_completed"
    };
    contract.side_effect_guard = sideEffectGuard;
  }
  return contract;
}

export function generateBundle(artifactRoot, outputRoot) {
  const files = buildFiles({ artifactRoot, outputRoot, ...loadArtifactContext(artifactRoot) });
  writeBundleFiles(outputRoot, files);
}

export function discoverGeneratedPackage(root) {
  const packages = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(root, entry.name, "workflow_manifest.json")))
    .map((entry) => entry.name);
  if (packages.length !== 1) throw new Error(`expected one generated ADK package, found ${packages.join(", ") || "none"}`);
  return packages[0];
}

export function readBundle(outputRoot) {
  const packageName = discoverGeneratedPackage(outputRoot);
  const packageRoot = join(outputRoot, packageName);
  return {
    packageName,
    manifest: readJson(join(packageRoot, "workflow_manifest.json")),
    agentSource: readFileSync(join(packageRoot, "agent.py"), "utf8"),
    contractTest: readFileSync(join(packageRoot, "tests", "test_workflow_contract.py"), "utf8")
  };
}

export function collectFiles(root) {
  const entries = readdirSync(root, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name));
  return entries.flatMap((entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? collectFiles(path) : entry.isFile() ? [path] : [];
  });
}

export function collectGeneratorSourceFiles() {
  const sourceRoot = join(scriptsRoot, "adk-source");
  return [generator, ...collectFiles(sourceRoot).filter((path) => path.endsWith(".mjs"))]
    .sort((left, right) => relative(repoRoot, left).localeCompare(relative(repoRoot, right)));
}

export function temporaryTargetFixture(data) {
  const artifactRoot = mkdtempSync(join(tmpdir(), "af-target-fixture-"));
  writeTargetArtifacts(artifactRoot, data);
  return { artifactRoot, cleanup: () => rmSync(artifactRoot, { recursive: true, force: true }) };
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
