#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { validateAgainstSchema } from "./artifact-validation/json-schema.mjs";
import { scaffoldAssetProjectionErrors } from "./artifact-validation/scaffold-asset-projection.mjs";

const root = resolve(process.argv[2] ?? "templates");
const errors = [];
const REMOVED_FILENAMES = new Map([
  ["af-run-manifest.json", "af-work-item.json"],
  ["module-candidates.json", "asset-candidates.json"],
  ["process-flow.json", "graph-ir.json"],
  ["commonization-notes.json", "analysis-result.json"]
]);
const REMOVED_KEYS = new Set([
  "moduleCandidates", "processFlow", "modules", "excluded_modules", "module_category", "subtype",
  "adapter_kind", "agent_kind", "workflow_kind", "access_protocol", "runtime_binding", "invoke_binding",
  "selected_by_llm", "decision_owner", "call_control", "mcp_server", "mcp_tool_name", "mcp_schema_ref",
  "mcp_auth_mode", "remote_contract_kind", "module_id", "execution_kind", "edge_kind",
  "execution_semantics", "flow_kind", "route_condition", "route_aliases", "state_key", "artifact_key",
  "a2a_contract_id", "remote_module_id", "is_remote_boundary_crossing"
]);
const OPAQUE_PAYLOAD_KEYS = new Set([
  "schema",
  "synthetic_inputs",
  "expected_output_shape",
  "synthetic_examples",
  "graph_ir_annotations",
  "response_mapping",
  "accepted_aliases"
]);

if (!existsSync(root)) fail(`Path does not exist: ${root}`);
for (const path of jsonFiles(root)) validateFile(path);

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log("Artifact validation OK");

function validateFile(path) {
  const name = basename(path);
  const label = relativeLabel(path);
  if (REMOVED_FILENAMES.has(name)) {
    push(`${label} is removed; use ${REMOVED_FILENAMES.get(name)}.`);
    return;
  }
  const value = readJson(path);
  if (value === undefined) return;
  rejectRemovedRecursive(value, label);
  if (name === "analysis-result.json") validateAnalysis(value, label, path);
  else if (name === "normalized-requirement.json") pushAll(validateAgainstSchema(value, "normalized-requirement.schema.json", label));
  else if (name === "asset-candidates.json") validateAssetList(value, label);
  else if (name === "graph-ir.json") validateGraph(value, label, siblingAssets(path));
  else if (name === "scaffold-plan.json" || name === "scaffold-plan.template.json") validateScaffoldPlan(value, label, path);
  else if (name === "af-work-item.json") validateWorkItem(value, label, path);
  else if (name === "a2a-contract.template.json") validateA2aContract(value, label, null);
}

function validateWorkItem(manifest, label, path) {
  pushAll(validateAgainstSchema(manifest, "af-work-item.schema.json", label));
  if (!record(manifest)) return;
  validateRevisionObjects(manifest, label);
  const skills = manifest.skills ?? {};
  const discovery = skills["af-discover-assets"];
  const compose = skills["af-compose-solution"];
  const scaffold = skills["af-scaffold-runtime"];
  const verify = skills["af-verify-runtime"];
  for (const [skillId, state] of Object.entries(skills)) {
    if (!record(state)) continue;
    if (record(state.output_revision) && Array.isArray(state.output_refs)) {
      const subjects = new Set((state.output_revision.subjects ?? []).map((subject) => subject?.ref));
      for (const ref of state.output_refs) {
        if (!subjects.has(ref)) push(`${label}.skills.${skillId}.output_refs ${ref} is absent from output_revision subjects.`);
      }
    }
  }
  if (manifest.review_gates?.composition?.status === "approved" && manifest.review_gates?.discovery?.status !== "approved") {
    push(`${label}.review_gates.composition approval requires approved discovery.`);
  }
  if (manifest.review_gates?.discovery?.status === "approved" && discovery?.status !== "complete") {
    push(`${label}.review_gates.discovery approval requires af-discover-assets complete.`);
  }
  if (manifest.review_gates?.composition?.status === "approved" && compose?.status !== "complete") {
    push(`${label}.review_gates.composition approval requires af-compose-solution complete.`);
  }
  if (scaffold?.status === "complete") {
    const outputRoots = Array.isArray(scaffold.output_roots) ? scaffold.output_roots : [];
    if (!outputRoots.length) {
      push(`${label}.skills.af-scaffold-runtime complete requires at least one declared output root.`);
    }
    for (const outputRoot of outputRoots) {
      if (!containsRegularFile(resolve(dirname(path), outputRoot))) {
        push(`${label}.skills.af-scaffold-runtime.output_roots ${outputRoot} must reference a non-empty output root.`);
      }
    }
  }
  if (manifest.verification?.outcome === "passed" && verify?.status !== "complete") {
    push(`${label}.verification.outcome passed requires af-verify-runtime complete.`);
  }
  if (verify?.status === "complete" && manifest.verification?.outcome !== "passed") {
    push(`${label}.af-verify-runtime complete requires verification.outcome passed.`);
  }
  const catalogSnapshot = manifest.revisions?.catalog_snapshot;
  if (record(catalogSnapshot)) {
    if (typeof catalogSnapshot.registry_revision !== "string") {
      push(`${label}.revisions.catalog_snapshot requires a Registry revision.`);
    }
    if (!catalogSnapshot.subjects?.some((subject) => subject?.ref === "catalog/asset-registry.json")) {
      push(`${label}.revisions.catalog_snapshot must include catalog/asset-registry.json.`);
    }
    for (const [key, revision] of Object.entries(manifest.revisions ?? {})) {
      if (record(revision) && revision.registry_revision !== catalogSnapshot.registry_revision) {
        push(`${label}.revisions.${key}.registry_revision must match catalog_snapshot.`);
      }
    }
  } else if (Object.values(manifest.revisions ?? {}).some((revision) => record(revision) && revision.registry_revision !== null)) {
    push(`${label} current revisions using a Registry revision require catalog_snapshot.`);
  }
  assertUniqueWorkItemIds(manifest.active_runs, "run_id", `${label}.active_runs`);
  assertUniqueWorkItemIds(manifest.discovery_cycles, "cycle_id", `${label}.discovery_cycles`);
  assertUniqueWorkItemIds(manifest.composition_cycles, "cycle_id", `${label}.composition_cycles`);
  assertUniqueWorkItemIds(manifest.decisions, "decision_id", `${label}.decisions`);
  assertUniqueWorkItemIds(manifest.asset_decisions, "asset_decision_id", `${label}.asset_decisions`);
  assertUniqueWorkItemIds(manifest.invalidations, "invalidation_id", `${label}.invalidations`);
  assertUniqueWorkItemIds(manifest.session_handoffs, "handoff_id", `${label}.session_handoffs`);
  for (const [collection, recommendationKey, selectionKey] of [
    ["decisions", "recommended_option", "selected_option"],
    ["asset_decisions", "recommended_disposition", "selected_disposition"]
  ]) {
    for (const [index, decision] of (manifest[collection] ?? []).entries()) {
      if (!record(decision)) continue;
      const decisionLabel = `${label}.${collection}[${index}]`;
      if ((decision[recommendationKey] === null) !== (decision.recommendation_revision === null)) {
        push(`${decisionLabel}.${recommendationKey} and recommendation_revision must be present together.`);
      }
      if (decision.selection_source === "delegated_recommendation"
        && decision[selectionKey] !== decision[recommendationKey]) {
        push(`${decisionLabel}.delegated_recommendation must select the displayed recommendation.`);
      }
    }
  }
  for (const [name, cycles] of [["discovery_cycles", manifest.discovery_cycles], ["composition_cycles", manifest.composition_cycles]]) {
    if (Array.isArray(cycles) && cycles.filter((cycle) => cycle?.status === "active").length > 1) {
      push(`${label}.${name} may contain only one active cycle.`);
    }
  }
  validateCurrentGateBinding(
    manifest.review_gates?.discovery,
    manifest.revisions,
    ["requirement_revision", "decision_revision", "asset_decision_revision", "discovery_revision", "catalog_snapshot_revision"],
    ["requirement", "decision", "asset_decision", "discovery", "catalog_snapshot"],
    `${label}.review_gates.discovery`
  );
  validateCurrentGateBinding(
    manifest.review_gates?.composition,
    manifest.revisions,
    ["discovery_revision", "graph_revision", "root_executable_revision", "runtime_contract_revision", "composition_revision"],
    ["discovery", "graph", "root_executable", "runtime_contract", "composition"],
    `${label}.review_gates.composition`
  );
  if (manifest.solution_control_strategy && !manifest.decisions?.some((decision) =>
    decision?.topic === "solution_control_strategy"
    && decision?.status === "resolved"
    && decision?.selected_by === "user"
    && decision?.selected_option === manifest.solution_control_strategy
  )) {
    push(`${label}.solution_control_strategy requires a matching resolved user decision.`);
  }
  if (manifest.root_executable && !manifest.decisions?.some((decision) =>
    decision?.decision_id === manifest.root_executable.decision_id
    && decision?.status === "resolved"
    && decision?.selected_by === "user"
  )) {
    push(`${label}.root_executable.decision_id must reference a resolved user decision.`);
  }
  const analysisPath = join(dirname(path), "analysis-result.json");
  if (!existsSync(analysisPath)) return;
  const actualEtag = createHash("sha256").update(readFileSync(analysisPath)).digest("hex");
  const currentAnalysisOwner = record(manifest.revisions?.composition) ? "composition" : "discovery";
  const currentAnalysisSubject = revisionSubject(manifest.revisions?.[currentAnalysisOwner], "analysis-result.json");
  if (!currentAnalysisSubject || currentAnalysisSubject.sha256 !== actualEtag) {
    push(`${label}.revisions.${currentAnalysisOwner} analysis-result.json subject must match current analysis-result.json bytes.`);
  }
  for (const [gateName, revisionKey] of [["discovery", "discovery_revision"], ["composition", "composition_revision"]]) {
    const gate = manifest.review_gates?.[gateName];
    if (gate?.binding) {
      const reviewedAnalysisSubject = revisionSubject(gate.binding[revisionKey], "analysis-result.json");
      if (!reviewedAnalysisSubject || gate.binding.artifact_etag !== reviewedAnalysisSubject.sha256) {
        push(`${label}.review_gates.${gateName}.binding.artifact_etag must match its bound ${revisionKey} analysis-result.json subject.`);
      }
    }
    if (gateName === "composition" && gate?.status === "approved" && gate.binding?.artifact_etag !== actualEtag) {
      push(`${label}.review_gates.composition.binding.artifact_etag must match current analysis-result.json bytes.`);
    }
  }
  const analysis = readJson(analysisPath);
  if (record(analysis) && manifest.work_id !== analysis.normalizedRequirement?.id) {
    push(`${label}.work_id must equal analysis-result.json.normalizedRequirement.id.`);
  }
  if (record(analysis) && record(manifest.root_executable)) {
    const root = (analysis.assetCandidates ?? []).find((asset) => asset?.asset_id === manifest.root_executable.asset_ref);
    if (!root || root.asset_type !== manifest.root_executable.asset_type) {
      push(`${label}.root_executable must reference an analysis-result Agent or Workflow asset.`);
    }
  }
}

function revisionSubject(revision, ref) {
  return record(revision) && Array.isArray(revision.subjects)
    ? revision.subjects.find((subject) => subject?.ref === ref)
    : undefined;
}

function validateRevision(revision, label) {
  if (revision === null || revision === undefined || !record(revision) || !Array.isArray(revision.subjects)) return;
  if (revision.subjects.length === 0) push(`${label}.subjects must include at least one subject.`);
  const refs = revision.subjects.map((subject) => subject?.ref);
  if (new Set(refs).size !== refs.length) push(`${label}.subjects refs must be unique.`);
  const sorted = [...refs].sort((left, right) => String(left).localeCompare(String(right)));
  if (refs.some((ref, index) => ref !== sorted[index])) push(`${label}.subjects must be sorted by ref.`);
  const digest = createHash("sha256").update(JSON.stringify({
    subjects: revision.subjects,
    registry_revision: revision.registry_revision
  })).digest("hex");
  if (revision.digest !== digest) push(`${label}.digest must match canonical subjects and registry_revision.`);
}

function validateRevisionObjects(value, label) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateRevisionObjects(entry, `${label}[${index}]`));
    return;
  }
  if (!record(value)) return;
  if ("digest" in value && "subjects" in value && "registry_revision" in value) {
    validateRevision(value, label);
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    validateRevisionObjects(entry, `${label}.${key}`);
  }
}

function assertUniqueWorkItemIds(records, key, label) {
  if (!Array.isArray(records)) return;
  const ids = records.map((record) => record?.[key]).filter((value) => typeof value === "string");
  if (new Set(ids).size !== ids.length) push(`${label}.${key} values must be unique.`);
}

function validateCurrentGateBinding(gate, revisions, bindingKeys, revisionKeys, label) {
  if (!record(gate) || !record(gate.binding) || gate.status === "stale") return;
  bindingKeys.forEach((bindingKey, index) => {
    const bound = gate.binding[bindingKey];
    const current = revisions?.[revisionKeys[index]];
    if (!record(bound) || !record(current) || bound.digest !== current.digest) {
      push(`${label}.binding.${bindingKey} must match the current top-level revision.`);
    }
  });
}

function validateAnalysis(result, label, path) {
  pushAll(validateAgainstSchema(result, "analysis-result.schema.json", label));
  if (!record(result)) return;
  const assets = validateAssetList(result.assetCandidates, `${label}.assetCandidates`);
  const requirementId = result.normalizedRequirement?.id;
  for (const [index, asset] of assets.entries()) {
    if (asset.source_requirement_id !== requirementId) push(`${label}.assetCandidates[${index}].source_requirement_id must equal normalizedRequirement.id.`);
  }
  validateGraphReferences(result.graph, `${label}.graph`, assets, requirementId);
  if (Array.isArray(result.a2aContracts)) {
    const contractIds = new Set();
    result.a2aContracts.forEach((contract, index) => {
      const at = `${label}.a2aContracts[${index}]`;
      if (text(contract?.contract_id)) {
        if (contractIds.has(contract.contract_id)) push(`${at}.contract_id duplicates ${contract.contract_id}.`);
        contractIds.add(contract.contract_id);
      }
      validateA2aReferences(contract, at, assets);
    });
    validateA2aContractRefsFromAgents(assets, result.a2aContracts, label);
  }
  if (Array.isArray(result.runtimeContracts)) {
    const ids = new Set(assets.map((asset) => asset.asset_id));
    const contractIds = new Set();
    result.runtimeContracts.forEach((contract, index) => {
      if (text(contract?.contract_id)) {
        if (contractIds.has(contract.contract_id)) push(`${label}.runtimeContracts[${index}].contract_id duplicates ${contract.contract_id}.`);
        contractIds.add(contract.contract_id);
      }
      if (contract?.asset_id !== null && typeof contract?.asset_id === "string" && !ids.has(contract.asset_id)) {
        push(`${label}.runtimeContracts[${index}].asset_id must reference an asset candidate or be null.`);
      }
    });
    validateAsyncResumeReferences(result.runtimeContracts, result.graph, assets, label);
  }
  validateSplitParity(path, result, label);
}

function validateAsyncResumeReferences(contracts, graph, assets, label) {
  const nodesById = new Map(
    (Array.isArray(graph?.nodes) ? graph.nodes : [])
      .filter(record)
      .map((node) => [node.id, node])
  );
  const assetsById = new Map(assets.filter(record).map((asset) => [asset.asset_id, asset]));
  const interruptOwners = new Map();
  contracts.forEach((contract, index) => {
    if (!record(contract) || contract.contract_kind !== "async_resume") return;
    const at = `${label}.runtimeContracts[${index}]`;
    const annotations = record(contract.graph_ir_annotations) ? contract.graph_ir_annotations : {};
    if (contract.runtime_support?.human_approval_required === true) {
      const node = nodesById.get(annotations.human_input_node_id);
      if (node?.node_kind !== "human_input") {
        push(`${at}.graph_ir_annotations.human_input_node_id must reference an existing Human Input Node.`);
      }
    }
    if (record(contract.side_effect_guard)) {
      const guard = contract.side_effect_guard;
      const tool = assetsById.get(guard.tool_ref);
      if (tool?.asset_type !== "tool") {
        push(`${at}.side_effect_guard.tool_ref must reference a Tool asset.`);
      } else if (
        text(guard.idempotency_key_input) &&
        !(Array.isArray(tool.inputs) && tool.inputs.some((input) => record(input) && input.name === guard.idempotency_key_input))
      ) {
        push(`${at}.side_effect_guard.idempotency_key_input must reference an input on ${guard.tool_ref}.`);
      }
      const node = nodesById.get(annotations.side_effect_tool_node_id);
      if (node?.node_kind !== "tool" || node.tool_ref !== guard.tool_ref) {
        push(`${at}.graph_ir_annotations.side_effect_tool_node_id must reference the Tool Node for side_effect_guard.tool_ref.`);
      }
    }
    const interruptId = contract.resume_policy?.interrupt_id;
    if (contract.contract_status === "approved" && text(interruptId)) {
      if (interruptOwners.has(interruptId)) {
        push(`${at}.resume_policy.interrupt_id duplicates ${interruptId} from ${interruptOwners.get(interruptId)}.`);
      } else {
        interruptOwners.set(interruptId, `${label}.runtimeContracts[${index}]`);
      }
    }
  });
}

function validateSplitParity(analysisPath, result, label) {
  for (const [filename, embeddedKey] of [
    ["normalized-requirement.json", "normalizedRequirement"],
    ["asset-candidates.json", "assetCandidates"],
    ["graph-ir.json", "graph"]
  ]) {
    const splitPath = join(dirname(analysisPath), filename);
    if (!existsSync(splitPath)) continue;
    const split = readJson(splitPath);
    if (split !== undefined && !deepEqual(split, result[embeddedKey])) {
      push(`${relativeLabel(splitPath)} must equal ${label}.${embeddedKey}.`);
    }
  }
}

function validateAssetList(value, label) {
  if (!Array.isArray(value)) {
    push(`${label} must be array.`);
    return [];
  }
  const seen = new Set();
  value.forEach((asset, index) => {
    pushAll(validateAgainstSchema(asset, "asset-candidate.schema.json", `${label}[${index}]`));
    if (typeof asset?.asset_id === "string") {
      if (seen.has(asset.asset_id)) push(`${label}[${index}].asset_id duplicates ${asset.asset_id}.`);
      seen.add(asset.asset_id);
    }
  });
  return value.filter(record);
}

function validateGraph(graph, label, assets) {
  pushAll(validateAgainstSchema(graph, "graph.schema.json", label));
  validateGraphReferences(graph, label, assets);
}

function validateGraphReferences(graph, label, assets, requirementId = null) {
  if (!record(graph)) return;
  const assetsById = new Map((assets ?? []).filter(record).map((asset) => [asset.asset_id, asset]));
  if (requirementId && graph.source_requirement_id !== requirementId) push(`${label}.source_requirement_id must equal normalizedRequirement.id.`);
  if (graph.workflow_ref !== null) validateRef(graph.workflow_ref, "workflow", `${label}.workflow_ref`, assetsById);
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const nodeIds = new Set();
  for (const [index, node] of nodes.entries()) {
    const at = `${label}.nodes[${index}]`;
    if (text(node?.id)) {
      if (nodeIds.has(node.id)) push(`${at}.id duplicates ${node.id}.`);
      nodeIds.add(node.id);
    }
    if (node?.node_kind === "agent") {
      validateRef(node.agent_ref, "agent", `${at}.agent_ref`, assetsById);
      for (const [toolIndex, available] of (node.available_tools ?? []).entries()) {
        validateRef(available?.tool_ref, "tool", `${at}.available_tools[${toolIndex}].tool_ref`, assetsById);
      }
    } else if (node?.node_kind === "tool") validateRef(node.tool_ref, "tool", `${at}.tool_ref`, assetsById);
    else if (node?.node_kind === "subworkflow") validateRef(node.workflow_ref, "workflow", `${at}.workflow_ref`, assetsById);
  }
  const edgeIds = new Set();
  for (const [index, edge] of (Array.isArray(graph.edges) ? graph.edges : []).entries()) {
    const at = `${label}.edges[${index}]`;
    if (text(edge?.id)) {
      if (edgeIds.has(edge.id)) push(`${at}.id duplicates ${edge.id}.`);
      edgeIds.add(edge.id);
    }
    for (const endpoint of ["from", "to"]) {
      if (text(edge?.[endpoint]) && !nodeIds.has(edge[endpoint])) push(`${at}.${endpoint} must reference an existing node.`);
    }
  }

  const regions = Array.isArray(graph.regions) ? graph.regions : [];
  const regionIds = new Set();
  for (const [index, region] of regions.entries()) {
    if (!text(region?.id)) continue;
    if (regionIds.has(region.id)) push(`${label}.regions[${index}].id duplicates ${region.id}.`);
    regionIds.add(region.id);
  }
  for (const [index, region] of regions.entries()) {
    const at = `${label}.regions[${index}]`;
    const containedNodeIds = new Set(Array.isArray(region?.node_ids) ? region.node_ids : []);
    for (const key of ["node_ids", "entry_node_ids", "exit_node_ids"]) {
      if (Array.isArray(region?.[key]) && region[key].some((nodeId) => text(nodeId) && !nodeIds.has(nodeId))) {
        push(`${at}.${key} must reference existing nodes.`);
      }
    }
    for (const key of ["entry_node_ids", "exit_node_ids"]) {
      if (Array.isArray(region?.[key]) && region[key].some((nodeId) => text(nodeId) && !containedNodeIds.has(nodeId))) {
        push(`${at}.${key} must be contained in node_ids.`);
      }
    }
    if (text(region?.parent_region_id) && !regionIds.has(region.parent_region_id)) {
      push(`${at}.parent_region_id must reference an existing region.`);
    }
  }
  const parentByRegion = new Map(
    regions
      .filter((region) => text(region?.id))
      .map((region) => [region.id, text(region.parent_region_id) ? region.parent_region_id : null])
  );
  for (const [regionId, initialParent] of parentByRegion) {
    const visited = new Set([regionId]);
    let parent = initialParent;
    while (parent !== null && parentByRegion.has(parent)) {
      if (visited.has(parent)) {
        push(`${label}.regions ${regionId} has a cyclic parent_region_id chain.`);
        break;
      }
      visited.add(parent);
      parent = parentByRegion.get(parent) ?? null;
    }
  }
}

function validateScaffoldPlan(plan, label, path) {
  pushAll(validateAgainstSchema(plan, "scaffold-plan.schema.json", label));
  if (!record(plan)) return;
  const assets = Array.isArray(plan.assets) ? plan.assets : [];
  validateGraphReferences(plan.graph, `${label}.graph`, assets, plan.requirement_id);
  const analysisPath = join(dirname(path), "analysis-result.json");
  if (!existsSync(analysisPath)) return;
  const analysis = readJson(analysisPath);
  if (!record(analysis)) return;
  if (isHistoricalScaffoldPlan(path)) return;
  pushAll(scaffoldAssetProjectionErrors(analysis.assetCandidates ?? [], assets, `${label}.assets`));
  if (!deepEqual(analysis.graph, plan.graph)) push(`${label}.graph drifts from the approved Graph IR.`);
  if (!deepEqual(analysis.runtimeContracts, plan.runtime_contracts)) push(`${label}.runtime_contracts drift from approved runtime contracts.`);
}

function isHistoricalScaffoldPlan(path) {
  const workItemPath = join(dirname(path), "af-work-item.json");
  if (!existsSync(workItemPath)) return false;
  const workItem = readJson(workItemPath);
  if (!record(workItem)) return false;

  const ref = basename(path);
  const sha256 = createHash("sha256").update(readFileSync(path)).digest("hex");
  const matchesPlan = (revision) => revisionSubject(revision, ref)?.sha256 === sha256;
  if (matchesPlan(workItem.revisions?.composition)) return false;

  const compose = workItem.skills?.["af-compose-solution"];
  return (
    (compose?.status === "stale" && matchesPlan(compose.output_revision))
    || (workItem.composition_cycles ?? []).some(
      (cycle) => cycle?.status === "superseded" && matchesPlan(cycle.revision)
    )
  );
}

function validateA2aContract(contract, label, assets) {
  pushAll(validateAgainstSchema(contract, "a2a-contract.schema.json", label));
  if (assets) validateA2aReferences(contract, label, assets);
}

function validateA2aReferences(contract, label, assets) {
  if (!record(contract)) return;
  const agent = assets.find((asset) => asset.asset_id === contract.agent_ref);
  if (!agent || agent.asset_type !== "agent") {
    push(`${label}.agent_ref must reference an Agent asset.`);
    return;
  }
  const refs = [agent.binding?.kind === "a2a" ? agent.binding.contract_ref : null, agent.exposure?.protocol === "a2a" ? agent.exposure.contract_ref : null].filter(Boolean);
  if (!refs.includes(contract.contract_id)) push(`${label}.contract_id must match the referenced Agent A2A binding or exposure.`);
}

function validateA2aContractRefsFromAgents(assets, contracts, label) {
  const contractsById = new Map(
    contracts.filter((contract) => record(contract) && text(contract.contract_id)).map((contract) => [contract.contract_id, contract])
  );
  for (const [index, asset] of assets.entries()) {
    if (asset.asset_type !== "agent") continue;
    for (const [field, ref] of [
      ["binding", asset.binding?.kind === "a2a" ? asset.binding.contract_ref : null],
      ["exposure", asset.exposure?.protocol === "a2a" ? asset.exposure.contract_ref : null]
    ]) {
      if (text(ref) && !contractsById.has(ref)) {
        push(`${label}.assetCandidates[${index}].${field}.contract_ref ${ref} must reference an A2A contract.`);
      }
    }
  }
}

function siblingAssets(path) {
  const candidatesPath = join(dirname(path), "asset-candidates.json");
  if (existsSync(candidatesPath)) return readJson(candidatesPath) ?? [];
  const analysisPath = join(dirname(path), "analysis-result.json");
  if (existsSync(analysisPath)) return readJson(analysisPath)?.assetCandidates ?? [];
  return [];
}

function validateRef(ref, type, label, assetsById) {
  if (!text(ref)) return push(`${label} is required.`);
  if (assetsById.get(ref)?.asset_type !== type) push(`${label} must reference a ${type} asset.`);
}

function rejectRemovedRecursive(value, label) {
  if (Array.isArray(value)) return value.forEach((entry, index) => rejectRemovedRecursive(entry, `${label}[${index}]`));
  if (!record(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (REMOVED_KEYS.has(key)) push(`${label}.${key} is retired vocabulary.`);
    if (OPAQUE_PAYLOAD_KEYS.has(key)) continue;
    rejectRemovedRecursive(entry, `${label}.${key}`);
  }
}

function containsRegularFile(path) {
  if (!existsSync(path)) return false;
  const stat = statSync(path);
  if (stat.isFile()) return true;
  if (!stat.isDirectory()) return false;
  return readdirSync(path, { withFileTypes: true }).some((entry) => (
    entry.isFile() || (entry.isDirectory() && containsRegularFile(join(path, entry.name)))
  ));
}

function jsonFiles(path) {
  if (statSync(path).isFile()) return path.endsWith(".json") ? [path] : [];
  const files = [];
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.name === "skill-scenarios" || entry.name === "out" || entry.name === "node_modules") continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) files.push(...jsonFiles(child));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(child);
  }
  return files;
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (error) { push(`${relativeLabel(path)} is not valid JSON: ${error.message}`); return undefined; }
}

function relativeLabel(path) {
  return resolve(path).slice(root.length + (resolve(path) === root ? 0 : 1)) || basename(path);
}

function deepEqual(left, right) { return isDeepStrictEqual(left, right); }
function record(value) { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function text(value) { return typeof value === "string" && Boolean(value.trim()); }
function pushAll(messages) { errors.push(...messages); }
function push(message) { errors.push(message); }
function fail(message) { console.error(`- ${message}`); process.exit(1); }
