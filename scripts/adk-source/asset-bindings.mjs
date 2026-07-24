import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import {
  loadSnapshot,
  resolveExact
} from "../../packages/agent-factory-core/src/assetRegistry.ts";

const REGISTRY_PATH = fileURLToPath(new URL("../../catalog/asset-registry.json", import.meta.url));
const REGISTRY_DISPOSITIONS = new Set(["reuse_exact", "reuse_new_version", "create_publish_candidate"]);

export function resolveAssetBindings({ assets, workItem, registryPath = REGISTRY_PATH }) {
  const snapshot = loadSnapshot(registryPath);
  assertCurrentRegistryRevision(workItem, snapshot.registry_revision);
  const decisionsByAsset = new Map();
  for (const decision of workItem.asset_decisions) {
    const decisions = decisionsByAsset.get(decision.asset_ref) ?? [];
    decisions.push(decision);
    decisionsByAsset.set(decision.asset_ref, decisions);
  }

  const registryBindingOwners = new Map();
  const bindings = assets.map((asset) => {
    const decisions = (decisionsByAsset.get(asset.asset_id) ?? []).filter(
      (decision) => decision.status === "resolved" && decision.selected_by === "user"
    );
    if (decisions.length !== 1) {
      throw new Error(
        `Scaffold requires exactly one resolved Asset disposition for ${asset.asset_id}; found ${decisions.length}.`
      );
    }
    const decision = decisions[0];
    if (decision.asset_type !== asset.asset_type) {
      throw new Error(
        `Asset decision ${decision.asset_decision_id} type ${decision.asset_type} does not match scaffold Asset ${asset.asset_id} type ${asset.asset_type}.`
      );
    }
    if (!Number.isInteger(decision.asset_version) || decision.asset_version < 1) {
      throw new Error(`Asset decision ${decision.asset_decision_id} requires an exact positive asset_version before Scaffold.`);
    }
    const disposition = decision.selected_disposition;
    if (disposition === "defer" || disposition === "exclude") {
      throw new Error(
        `Scaffold Asset ${asset.asset_id} cannot use disposition ${disposition}; remove it from the approved scaffold or resolve a generation disposition.`
      );
    }
    if (REGISTRY_DISPOSITIONS.has(disposition)) {
      const key = `${asset.catalog_entry_id}@${decision.asset_version}`;
      const prior = registryBindingOwners.get(key);
      if (prior) {
        throw new Error(`Scaffold binds Registry version ${key} more than once through ${prior} and ${asset.asset_id}.`);
      }
      registryBindingOwners.set(key, asset.asset_id);
      return registryBinding({ asset, decision, disposition, snapshot });
    }
    return projectBinding({ asset, decision, disposition, snapshot });
  });
  for (const binding of bindings) {
    if (binding.generation_action !== "reference_existing") continue;
    const record = resolveExact(snapshot, binding.registry_ref.asset_id, binding.registry_ref.version);
    binding.source_ref = executableSourceRef(record);
  }

  const root = workItem.root_executable;
  assertCompositionBindings(bindings, root);
  const rootBinding = bindings.find((binding) => binding.asset_id === root.asset_ref);
  if (!rootBinding) throw new Error(`Root Executable ${root.asset_ref} has no approved Asset binding.`);
  if (rootBinding.asset_version !== root.asset_version) {
    throw new Error(
      `Root Executable version ${root.asset_version} does not match Asset decision version ${rootBinding.asset_version} for ${root.asset_ref}.`
    );
  }
  if (
    rootBinding.generation_action === "reference_existing"
    && root.asset_type === "agent"
    && workItem.solution_control_strategy !== "single_agent"
  ) {
    throw new Error(
      `Exact Registry Agent Root ${root.asset_ref} cannot be modified with ${workItem.solution_control_strategy}; select reuse_new_version before adding delegation.`
    );
  }
  if (rootBinding.generation_action === "reference_existing" && root.asset_type === "workflow") {
    const generated = bindings.filter((binding) => binding.generation_action !== "reference_existing");
    if (generated.length) {
      throw new Error(
        `Exact Registry Workflow Root ${root.asset_ref} cannot include newly generated Assets: ${generated.map((binding) => binding.asset_id).join(", ")}. Select reuse_new_version for the Workflow.`
      );
    }
  }
  return Object.freeze({
    registryRevision: snapshot.registry_revision,
    bindings: Object.freeze(bindings.map((binding) => Object.freeze(binding)))
  });
}

function assertCompositionBindings(bindings, root) {
  const registryBindings = new Map(
    bindings
      .filter((binding) => binding.registry_ref)
      .map((binding) => [`${binding.registry_ref.asset_id}@${binding.registry_ref.version}`, binding])
  );
  for (const composition of bindings.filter((binding) => binding.disposition === "compose_existing")) {
    if (composition.asset_type !== "workflow" || composition.asset_id !== root.asset_ref) {
      throw new Error(
        `compose_existing Asset ${composition.asset_id} must be the selected project Workflow Root in the current generator.`
      );
    }
    const missing = composition.component_registry_refs
      .map((ref) => `${ref.asset_id}@${ref.version}`)
      .filter((key) => registryBindings.get(key)?.generation_action !== "reference_existing");
    if (missing.length) {
      throw new Error(
        `compose_existing Asset ${composition.asset_id} requires each exact component as an included reuse_exact binding; missing ${missing.join(", ")}.`
      );
    }
  }
}

function assertCurrentRegistryRevision(workItem, currentRevision) {
  const stale = Object.entries(workItem.revisions)
    .filter(([, revision]) => revision?.registry_revision && revision.registry_revision !== currentRevision)
    .map(([name, revision]) => `${name}:${revision.registry_revision}`);
  if (stale.length) {
    throw new Error(
      `Asset Registry snapshot is stale; current ${currentRevision}, Work Item revisions ${stale.join(", ")}. Return to Discover before Scaffold.`
    );
  }
}

function registryBinding({ asset, decision, disposition, snapshot }) {
  if (!asset.catalog_entry_id) {
    throw new Error(`${disposition} Asset ${asset.asset_id} requires catalog_entry_id to name the selected Registry Asset.`);
  }
  const record = resolveExact(snapshot, asset.catalog_entry_id, decision.asset_version);
  if (record.asset_type !== asset.asset_type) {
    throw new Error(
      `Registry Asset ${record.asset_id}@${record.version} type ${record.asset_type} does not match ${asset.asset_id} type ${asset.asset_type}.`
    );
  }
  assertRegistryProjection(asset, record);
  const exactRef = `${record.asset_id}@${record.version}`;
  if (!decision.catalog_refs.includes(exactRef)) {
    throw new Error(`Asset decision ${decision.asset_decision_id} must preserve exact catalog ref ${exactRef}.`);
  }
  if (disposition === "reuse_exact" && !["published", "deprecated"].includes(record.status)) {
    throw new Error(`reuse_exact requires a published or explicitly accepted deprecated version; ${exactRef} is ${record.status}.`);
  }
  if (disposition === "create_publish_candidate" && !["draft", "reviewed"].includes(record.status)) {
    throw new Error(`create_publish_candidate requires a draft or reviewed Registry version; ${exactRef} is ${record.status}.`);
  }
  if (disposition === "reuse_new_version") {
    if (!["draft", "reviewed"].includes(record.status)) {
      throw new Error(`reuse_new_version requires a draft or reviewed new Registry version; ${exactRef} is ${record.status}.`);
    }
    const hasPriorVersion = snapshot.assets.some(
      (candidate) => candidate.asset_id === record.asset_id && candidate.version < record.version
    );
    if (!hasPriorVersion) {
      throw new Error(`reuse_new_version requires ${exactRef} to extend an existing Registry version.`);
    }
  }
  const expectedReuseStatus = disposition === "create_publish_candidate" ? "publish_candidate" : "reuse_existing";
  if (asset.reuse_status !== expectedReuseStatus) {
    throw new Error(
      `${asset.asset_id} reuse_status must be ${expectedReuseStatus} for disposition ${disposition}; found ${asset.reuse_status}.`
    );
  }
  return {
    asset_id: asset.asset_id,
    asset_type: asset.asset_type,
    asset_version: decision.asset_version,
    disposition,
    decision_id: decision.asset_decision_id,
    source: "asset_registry",
    generation_action: disposition === "reuse_exact"
      ? "reference_existing"
      : disposition === "reuse_new_version"
        ? "implement_registry_version"
        : "implement_publish_candidate",
    registry_ref: {
      asset_id: record.asset_id,
      version: record.version,
      status: record.status,
      contract_hash: record.contract_hash
    },
    source_ref: null,
    warnings: record.status === "deprecated" ? ["deprecated_version"] : []
  };
}

function executableSourceRef(record) {
  if (record.asset_type === "agent" && record.binding?.kind === "a2a") return null;
  if (record.asset_type === "tool" && record.binding?.kind === "mcp") return null;
  const refs = record.source_refs.filter((ref) => /^python:[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*#[A-Za-z_]\w*$/.test(ref));
  if (refs.length !== 1) {
    throw new Error(
      `reuse_exact Registry Asset ${record.asset_id}@${record.version} requires exactly one executable python:module#symbol source ref; found ${refs.length}.`
    );
  }
  return refs[0];
}

function projectBinding({ asset, decision, disposition, snapshot }) {
  if (disposition !== "create_project_draft" && disposition !== "compose_existing") {
    throw new Error(`Unsupported resolved Asset disposition ${disposition} for ${asset.asset_id}.`);
  }
  if (asset.catalog_entry_id !== null) {
    throw new Error(`${disposition} Asset ${asset.asset_id} must not masquerade as Registry Asset ${asset.catalog_entry_id}.`);
  }
  if (decision.asset_version !== 1) {
    throw new Error(`${disposition} Asset ${asset.asset_id} uses project-local version 1; found ${decision.asset_version}.`);
  }
  if (asset.reuse_status !== "project_only") {
    throw new Error(`${disposition} Asset ${asset.asset_id} must use reuse_status project_only; found ${asset.reuse_status}.`);
  }
  const componentRegistryRefs = disposition === "compose_existing"
    ? resolveCompositionRefs(decision, snapshot)
    : [];
  if (disposition === "create_project_draft" && decision.catalog_refs.length) {
    throw new Error(`${disposition} Asset decision ${decision.asset_decision_id} must not contain Registry refs.`);
  }
  return {
    asset_id: asset.asset_id,
    asset_type: asset.asset_type,
    asset_version: decision.asset_version,
    disposition,
    decision_id: decision.asset_decision_id,
    source: disposition === "compose_existing" ? "project_composition" : "project_draft",
    generation_action: disposition === "compose_existing" ? "compose_references" : "implement_project_draft",
    registry_ref: null,
    source_ref: null,
    component_registry_refs: componentRegistryRefs,
    warnings: componentRegistryRefs.some((ref) => ref.status === "deprecated") ? ["deprecated_component_version"] : []
  };
}

function resolveCompositionRefs(decision, snapshot) {
  if (decision.catalog_refs.length < 2) {
    throw new Error(
      `compose_existing Asset decision ${decision.asset_decision_id} requires at least two exact Registry component refs.`
    );
  }
  const seen = new Set();
  return decision.catalog_refs.map((reference) => {
    const match = /^(.+)@([1-9]\d*)$/.exec(reference);
    if (!match) throw new Error(`compose_existing requires exact Registry ref asset_id@version; found ${reference}.`);
    if (seen.has(reference)) throw new Error(`compose_existing repeats Registry component ${reference}.`);
    seen.add(reference);
    const record = resolveExact(snapshot, match[1], Number(match[2]));
    if (!["published", "deprecated"].includes(record.status)) {
      throw new Error(`compose_existing component ${reference} must be published or explicitly accepted deprecated; found ${record.status}.`);
    }
    return {
      asset_id: record.asset_id,
      version: record.version,
      status: record.status,
      contract_hash: record.contract_hash
    };
  });
}

function assertRegistryProjection(asset, record) {
  const fields = [
    "name",
    "domain_scope",
    "business_domains",
    "owner",
    "reuse_status",
    "capability_tags",
    "binding",
    "connection",
    "workflow_profile",
    "exposure",
    "inputs",
    "outputs",
    "risk_signals"
  ];
  const drifted = fields.filter((field) => !isDeepStrictEqual(asset[field], record[field]));
  if (drifted.length) {
    throw new Error(
      `Scaffold Asset ${asset.asset_id} drifts from Registry contract ${record.asset_id}@${record.version}: ${drifted.join(", ")}.`
    );
  }
}
