import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AssetRegistryService,
  contractContent,
  loadSnapshot,
  resolveExact
} from "../../packages/agent-factory-core/src/assetRegistry.ts";
import { resolveAssetBindings } from "../adk-source/asset-bindings.mjs";
import { generatedPythonExecutable } from "./generated-python-runtime.mjs";
import {
  generateBundle,
  readBundle,
  readJson,
  repoRoot,
  targetAsset,
  targetEdge,
  targetGraph,
  targetRequirement,
  targetRevision,
  temporaryTargetFixture,
  writeJson
} from "./fixtures.mjs";

test("project-only Asset decisions remain project drafts with exact versions", () => {
  withFixture(projectFixture(), ({ artifactRoot }) => {
    const outputRoot = join(artifactRoot, "out");
    generateBundle(artifactRoot, outputRoot);
    const { manifest } = readBundle(outputRoot);
    assert.deepEqual(manifest.asset_bindings, [{
      asset_id: "agent.project-root",
      asset_type: "agent",
      asset_version: 1,
      disposition: "create_project_draft",
      decision_id: "asset-decision-1",
      source: "project_draft",
      generation_action: "implement_project_draft",
      registry_ref: null,
      source_ref: null,
      component_registry_refs: [],
      warnings: []
    }]);
    assert.equal(manifest.root_executable.asset_version, 1);
  });
});

test("reuse_new_version and create_publish_candidate bind only mutable Registry versions", () => {
  withRegistry(({ registryPath, service }) => {
    let snapshot = service.loadSnapshot();
    const base = resolveExact(snapshot, "agent.page-recommendation.objective-classifier", 1);
    snapshot = service.createDraft(
      { ...contractContent(base), responsibility: `${base.responsibility} Extended.` },
      snapshot.registry_revision,
      "asset-binding-test"
    );
    const extension = resolveExact(snapshot, base.asset_id, 2);
    const extensionAsset = candidateFromRegistry(extension);
    const extensionDecision = bindingDecision(extensionAsset, "reuse_new_version", extension.version, [
      `${extension.asset_id}@${extension.version}`
    ]);
    const extensionBinding = resolveAssetBindings({
      assets: [extensionAsset],
      workItem: bindingWorkItem(extensionAsset, extensionDecision, snapshot.registry_revision),
      registryPath
    }).bindings[0];
    assert.equal(extensionBinding.generation_action, "implement_registry_version");
    assert.equal(extensionBinding.registry_ref.status, "draft");

    const publishId = "agent.test.publish-candidate";
    snapshot = service.createDraft(
      {
        ...contractContent(base),
        asset_id: publishId,
        name: "Publish Candidate",
        responsibility: "Provides a synthetic publish candidate for binding tests.",
        reuse_status: "publish_candidate"
      },
      snapshot.registry_revision,
      "asset-binding-test"
    );
    const publishCandidate = resolveExact(snapshot, publishId, 1);
    const publishAsset = candidateFromRegistry(publishCandidate);
    const publishDecision = bindingDecision(publishAsset, "create_publish_candidate", 1, [`${publishId}@1`]);
    const publishBinding = resolveAssetBindings({
      assets: [publishAsset],
      workItem: bindingWorkItem(publishAsset, publishDecision, snapshot.registry_revision),
      registryPath
    }).bindings[0];
    assert.equal(publishBinding.generation_action, "implement_publish_candidate");
    assert.equal(publishBinding.registry_ref.status, "draft");

    const publishedAsset = candidateFromRegistry(base);
    const invalidDecision = bindingDecision(publishedAsset, "reuse_new_version", 1, [`${base.asset_id}@1`]);
    assert.throws(
      () => resolveAssetBindings({
        assets: [publishedAsset],
        workItem: bindingWorkItem(publishedAsset, invalidDecision, snapshot.registry_revision),
        registryPath
      }),
      /reuse_new_version requires a draft or reviewed new Registry version/i
    );
  });
});

test("compose_existing preserves exact component versions and warns on deprecated components", () => {
  withRegistry(({ registryPath, service }) => {
    let snapshot = service.loadSnapshot();
    const first = resolveExact(snapshot, "tool.page-recommendation.search-page-candidates", 1);
    const secondRef = { asset_id: "tool.page-recommendation.search-page-products", version: 1 };
    snapshot = service.deprecate(
      secondRef,
      { decision_id: "decision:deprecate-component", selected_by: "user", rationale: "Exercise explicit deprecated reuse warning." },
      snapshot.registry_revision
    );
    const second = resolveExact(snapshot, secondRef.asset_id, secondRef.version);
    const composite = targetAsset("workflow.project-composition", "workflow", {
      name: "Project Composition",
      workflow_profile: { representation: "graph", coordination: "explicit", template_ref: null }
    });
    const decision = bindingDecision(composite, "compose_existing", 1, [
      `${first.asset_id}@${first.version}`,
      `${second.asset_id}@${second.version}`
    ]);
    const firstAsset = candidateFromRegistry(first);
    const secondAsset = candidateFromRegistry(second);
    const decisions = [
      decision,
      bindingDecision(firstAsset, "reuse_exact", first.version, [`${first.asset_id}@${first.version}`]),
      bindingDecision(secondAsset, "reuse_exact", second.version, [`${second.asset_id}@${second.version}`])
    ];
    const binding = resolveAssetBindings({
      assets: [composite, firstAsset, secondAsset],
      workItem: bindingWorkItem(composite, decisions, snapshot.registry_revision),
      registryPath
    }).bindings.find((candidate) => candidate.asset_id === composite.asset_id);
    assert.equal(binding.source, "project_composition");
    assert.equal(binding.generation_action, "compose_references");
    assert.deepEqual(binding.component_registry_refs.map((ref) => `${ref.asset_id}@${ref.version}`), decision.catalog_refs);
    assert.deepEqual(binding.warnings, ["deprecated_component_version"]);
  });
});

test("reuse_exact fails closed when a local Registry Asset has no executable source", () => {
  const snapshot = loadSnapshot(join(repoRoot, "catalog/asset-registry.json"));
  const record = resolveExact(snapshot, "agent.page-recommendation.objective-classifier", 1);
  withFixture(reuseFixture(record), ({ artifactRoot }) => {
    const outputRoot = join(artifactRoot, "out");
    assert.throws(
      () => generateBundle(artifactRoot, outputRoot),
      /requires exactly one executable python:module#symbol source ref/i
    );
  });
});

test("reuse_exact imports the reviewed Registry object instead of regenerating an Agent", () => {
  withRegistry(({ registryPath, service }) => {
    let snapshot = service.loadSnapshot();
    const base = resolveExact(snapshot, "agent.page-recommendation.objective-classifier", 1);
    const assetId = "agent.test.executable-reference";
    snapshot = service.createDraft({
      ...contractContent(base),
      asset_id: assetId,
      name: "Executable Registry Reference",
      responsibility: "References one reviewed Python Agent object without regenerating it.",
      source_refs: ["python:registry_fixture#referenced_agent"]
    }, snapshot.registry_revision, "asset-binding-test");
    snapshot = service.markReviewed(
      { asset_id: assetId, version: 1 },
      { decision_id: "decision:review-reference", selected_by: "user", rationale: "Synthetic source reviewed." },
      snapshot.registry_revision
    );
    snapshot = service.publish(
      { asset_id: assetId, version: 1 },
      {
        decision_id: "decision:publish-reference",
        selected_by: "user",
        rationale: "Synthetic source approved for reuse test.",
        owner_confirmed: true,
        domain_confirmed: true,
        reuse_confirmed: true
      },
      snapshot.registry_revision
    );
    const record = resolveExact(snapshot, assetId, 1);
    withFixture(reuseFixture(record), ({ artifactRoot }) => {
      retargetRegistryRevision(artifactRoot, registryPath, snapshot.registry_revision);
      const outputRoot = join(artifactRoot, "out");
      generateBundle(artifactRoot, outputRoot, { registryPath });
      writeFileSync(join(outputRoot, "registry_fixture.py"), [
        "from google.adk.agents import LlmAgent",
        "",
        "referenced_agent = LlmAgent(",
        "    name='registry_reference_agent',",
        "    model='gemini-2.5-flash',",
        "    instruction='Reviewed synthetic reference.',",
        "    output_key='registry_reference_output',",
        ")",
        ""
      ].join("\n"));
      const bundle = readBundle(outputRoot);
      const binding = bundle.manifest.asset_bindings[0];
      assert.equal(binding.generation_action, "reference_existing");
      assert.equal(binding.source_ref, "python:registry_fixture#referenced_agent");
      assert.doesNotMatch(bundle.agentSource, /= LlmAgent\(/);
      assert.match(bundle.agentSource, /_load_registry_asset\("python:registry_fixture#referenced_agent", "agent"\)/);
      const probe = execFileSync(generatedPythonExecutable(), ["-c", [
        `import ${bundle.packageName}.agent as generated`,
        "import registry_fixture",
        "assert generated.root_agent is registry_fixture.referenced_agent",
        "print(generated.root_agent.name)"
      ].join("; ")], { cwd: outputRoot, encoding: "utf8" });
      assert.equal(probe.trim(), "registry_reference_agent");
    });
  });
});

test("compose_existing lowers a project Workflow from included exact Registry components", () => {
  withRegistry(({ registryPath, service }) => {
    const agentRecord = publishExecutableRecord(service, {
      baseId: "agent.page-recommendation.objective-classifier",
      assetId: "agent.test.composed-reference",
      name: "Composed Agent Reference",
      sourceRef: "python:registry_fixture#referenced_agent"
    });
    const toolRecord = publishExecutableRecord(service, {
      baseId: "tool.page-recommendation.search-page-candidates",
      assetId: "tool.test.composed-reference",
      name: "Composed Tool Reference",
      sourceRef: "python:registry_fixture#referenced_tool",
      contractPatch: {
        binding: { kind: "function" },
        connection: { transport: "in_process" }
      }
    });
    const snapshot = service.loadSnapshot();
    const requirement = targetRequirement("req-compose-existing-runtime");
    const root = targetAsset("workflow.project-composition-runtime", "workflow", {
      name: "Project Composition Runtime",
      workflow_profile: { representation: "graph", coordination: "explicit", template_ref: null }
    });
    const agent = candidateFromRegistry(agentRecord);
    const tool = candidateFromRegistry(toolRecord);
    const data = {
      requirement,
      assets: [root, agent, tool],
      graph: targetGraph({
        requirementId: requirement.id,
        workflowRef: root.asset_id,
        nodes: [
          { id: "input", node_kind: "input" },
          { id: "agent", node_kind: "agent", agent_ref: agent.asset_id, available_tools: [] },
          { id: "tool", node_kind: "tool", tool_ref: tool.asset_id, invocation_control: "workflow" },
          { id: "output", node_kind: "output" }
        ],
        edges: [targetEdge("input", "agent"), targetEdge("agent", "tool"), targetEdge("tool", "output")]
      }),
      runnable: true,
      rootOptions: {
        rootAssetId: root.asset_id,
        solutionControlStrategy: "explicit_workflow",
        assetDispositions: {
          [root.asset_id]: "compose_existing",
          [agent.asset_id]: "reuse_exact",
          [tool.asset_id]: "reuse_exact"
        }
      }
    };
    withFixture(data, ({ artifactRoot }) => {
      const workItemPath = join(artifactRoot, "af-work-item.json");
      const workItem = readJson(workItemPath);
      const refs = [`${agent.asset_id}@1`, `${tool.asset_id}@1`];
      workItem.asset_decisions.find((decision) => decision.asset_ref === root.asset_id).catalog_refs = refs;
      refreshReviewedRevision(workItem, "asset_decision", "asset_decisions", "discovery");
      writeJson(workItemPath, workItem);
      retargetRegistryRevision(artifactRoot, registryPath, snapshot.registry_revision);
      const outputRoot = join(artifactRoot, "out");
      generateBundle(artifactRoot, outputRoot, { registryPath });
      writeRegistryFixtureModule(outputRoot);
      const bundle = readBundle(outputRoot);
      assert.match(bundle.agentSource, /_load_registry_asset\("python:registry_fixture#referenced_agent", "agent"\)/);
      assert.match(bundle.agentSource, /_load_registry_asset\("python:registry_fixture#referenced_tool", "tool"\)/);
      assert.doesNotMatch(bundle.agentSource, /node_agent = LlmAgent\(/);
      assert.equal(
        bundle.manifest.asset_bindings.find((binding) => binding.asset_id === root.asset_id).generation_action,
        "compose_references"
      );
      const probe = execFileSync(generatedPythonExecutable(), ["-c", [
        `import ${bundle.packageName}.agent as generated`,
        "from google.adk.workflow import Workflow",
        "assert isinstance(generated.root_agent, Workflow)",
        "print(type(generated.root_agent).__name__)"
      ].join("; ")], { cwd: outputRoot, encoding: "utf8" });
      assert.equal(probe.trim(), "Workflow");
    });
  });
});

test("Agent-owned reuse_exact Python Tools are imported into available_tools", () => {
  withRegistry(({ registryPath, service }) => {
    const toolRecord = publishExecutableRecord(service, {
      baseId: "tool.page-recommendation.search-page-candidates",
      assetId: "tool.test.agent-owned-reference",
      name: "Agent-owned Tool Reference",
      sourceRef: "python:registry_fixture#referenced_tool",
      contractPatch: {
        binding: { kind: "function" },
        connection: { transport: "in_process" }
      }
    });
    const snapshot = service.loadSnapshot();
    const requirement = targetRequirement("req-agent-owned-registry-tool");
    const root = targetAsset("agent.project-tool-owner", "agent", { name: "Project Tool Owner" });
    const tool = candidateFromRegistry(toolRecord);
    const data = {
      requirement,
      assets: [root, tool],
      graph: targetGraph({
        requirementId: requirement.id,
        nodes: [
          { id: "input", node_kind: "input" },
          {
            id: "root",
            node_kind: "agent",
            agent_ref: root.asset_id,
            available_tools: [{ tool_ref: tool.asset_id, invocation_control: "agent" }]
          },
          { id: "output", node_kind: "output" }
        ],
        edges: [targetEdge("input", "root"), targetEdge("root", "output")]
      }),
      runnable: true,
      rootOptions: {
        rootAssetId: root.asset_id,
        solutionControlStrategy: "single_agent",
        assetDispositions: {
          [root.asset_id]: "create_project_draft",
          [tool.asset_id]: "reuse_exact"
        }
      }
    };
    withFixture(data, ({ artifactRoot }) => {
      retargetRegistryRevision(artifactRoot, registryPath, snapshot.registry_revision);
      const outputRoot = join(artifactRoot, "out");
      generateBundle(artifactRoot, outputRoot, { registryPath });
      writeRegistryFixtureModule(outputRoot);
      const bundle = readBundle(outputRoot);
      assert.match(
        bundle.agentSource,
        /tools=\[\s*_load_registry_asset\("python:registry_fixture#referenced_tool", "tool"\),\s*\]/
      );
      assert.doesNotMatch(bundle.agentSource, /McpToolset/);
      const runtimeConfig = readFileSync(join(outputRoot, "agents.config.yaml"), "utf8");
      assert.match(runtimeConfig, /connection: registry_reference/);
      assert.match(runtimeConfig, /source_ref: python:registry_fixture#referenced_tool/);
      assert.equal(bundle.manifest.runtime.unconnected_tools.some((entry) => entry.asset_id === tool.asset_id), false);
      const probe = execFileSync(generatedPythonExecutable(), ["-c", [
        `import ${bundle.packageName}.agent as generated`,
        "assert len(generated.root_agent.tools) == 1",
        "print(callable(generated.root_agent.tools[0]))"
      ].join("; ")], { cwd: outputRoot, encoding: "utf8" });
      assert.equal(probe.trim(), "True");
    });
  });
});

test("generator rejects missing decisions, version drift, stale Registry snapshots, and duplicate Registry bindings", () => {
  const cases = [
    {
      data: projectFixture(),
      mutate(workItem) { workItem.asset_decisions[0].selected_disposition = "compose_existing"; },
      expected: /Asset decision revision content does not match/i
    },
    {
      data: projectFixture(),
      mutate(workItem) {
        workItem.asset_decisions = [];
        refreshReviewedRevision(workItem, "asset_decision", "asset_decisions", "discovery");
      },
      expected: /requires exactly one resolved Asset disposition.*agent\.project-root.*found 0/i
    },
    {
      data: projectFixture(),
      mutate(workItem) {
        workItem.root_executable.asset_version = 2;
        refreshReviewedRevision(workItem, "root_executable", "root_executable", "composition");
      },
      expected: /Root Executable version 2 does not match Asset decision version 1/i
    },
    {
      data: projectFixture(),
      mutate(workItem) {
        const revision = workItem.revisions.catalog_snapshot;
        revision.registry_revision = "0".repeat(64);
        revision.digest = revisionDigest(revision);
        workItem.review_gates.discovery.binding.catalog_snapshot_revision = structuredClone(revision);
      },
      expected: /Asset Registry snapshot is stale/i
    },
    {
      data: duplicateReuseFixture(),
      mutate() {},
      expected: /binds Registry version .* more than once/i
    }
  ];
  for (const { data, mutate, expected } of cases) {
    withFixture(data, ({ artifactRoot }) => {
      const workItemPath = join(artifactRoot, "af-work-item.json");
      const workItem = readJson(workItemPath);
      mutate(workItem);
      writeJson(workItemPath, workItem);
      assert.throws(() => generateBundle(artifactRoot, join(artifactRoot, "out")), expected);
    });
  }
});

function withFixture(data, run) {
  const fixture = temporaryTargetFixture(data);
  try {
    run(fixture);
  } finally {
    fixture.cleanup();
  }
}

function refreshReviewedRevision(workItem, revisionKey, valueKey, gateKey) {
  const revision = targetRevision(
    [{ ref: `af-work-item.json#/${valueKey}`, content: `${JSON.stringify(workItem[valueKey], null, 2)}\n` }],
    workItem.revisions[revisionKey].registry_revision
  );
  workItem.revisions[revisionKey] = revision;
  workItem.review_gates[gateKey].binding[`${revisionKey}_revision`] = structuredClone(revision);
}

function revisionDigest(revision) {
  return createHash("sha256").update(JSON.stringify({
    subjects: revision.subjects,
    registry_revision: revision.registry_revision
  })).digest("hex");
}

function retargetRegistryRevision(artifactRoot, registryPath, registryRevision) {
  const workItemPath = join(artifactRoot, "af-work-item.json");
  const workItem = readJson(workItemPath);
  for (const [name, revision] of Object.entries(workItem.revisions)) {
    if (revision === null) continue;
    revision.registry_revision = registryRevision;
    if (name === "catalog_snapshot") {
      const subject = revision.subjects.find((candidate) => candidate.ref === "catalog/asset-registry.json");
      if (subject) subject.sha256 = createHash("sha256").update(readFileSync(registryPath)).digest("hex");
    }
    revision.digest = revisionDigest(revision);
  }
  const discoveryBindings = {
    requirement_revision: "requirement",
    decision_revision: "decision",
    asset_decision_revision: "asset_decision",
    discovery_revision: "discovery",
    catalog_snapshot_revision: "catalog_snapshot"
  };
  const compositionBindings = {
    discovery_revision: "discovery",
    graph_revision: "graph",
    root_executable_revision: "root_executable",
    runtime_contract_revision: "runtime_contract",
    composition_revision: "composition"
  };
  for (const [field, name] of Object.entries(discoveryBindings)) {
    workItem.review_gates.discovery.binding[field] = structuredClone(workItem.revisions[name]);
  }
  for (const [field, name] of Object.entries(compositionBindings)) {
    workItem.review_gates.composition.binding[field] = structuredClone(workItem.revisions[name]);
  }
  writeJson(workItemPath, workItem);
}

function projectFixture() {
  const requirement = targetRequirement("req-project-binding");
  const root = targetAsset("agent.project-root", "agent", { name: "Project Root" });
  return {
    requirement,
    assets: [root],
    graph: targetGraph({
      requirementId: requirement.id,
      nodes: [
        { id: "input", node_kind: "input" },
        { id: "root", node_kind: "agent", agent_ref: root.asset_id, available_tools: [] },
        { id: "output", node_kind: "output" }
      ],
      edges: [targetEdge("input", "root"), targetEdge("root", "output")]
    }),
    runnable: true,
    rootOptions: {
      rootAssetId: root.asset_id,
      solutionControlStrategy: "single_agent",
      assetDispositions: { [root.asset_id]: "create_project_draft" }
    }
  };
}

function reuseFixture(record) {
  const requirement = targetRequirement("req-reuse-binding");
  const root = candidateFromRegistry(record);
  return {
    requirement,
    assets: [root],
    graph: targetGraph({
      requirementId: requirement.id,
      nodes: [
        { id: "input", node_kind: "input" },
        { id: "root", node_kind: "agent", agent_ref: root.asset_id, available_tools: [] },
        { id: "output", node_kind: "output" }
      ],
      edges: [targetEdge("input", "root"), targetEdge("root", "output")]
    }),
    runnable: true,
    rootOptions: {
      rootAssetId: root.asset_id,
      solutionControlStrategy: "single_agent",
      assetDispositions: { [root.asset_id]: "reuse_exact" }
    }
  };
}

function duplicateReuseFixture() {
  const snapshot = loadSnapshot(join(repoRoot, "catalog/asset-registry.json"));
  const record = resolveExact(snapshot, "agent.page-recommendation.objective-classifier", 1);
  const requirement = targetRequirement("req-duplicate-reuse-binding");
  const owner = targetAsset("workflow.duplicate-owner", "workflow", {
    workflow_profile: { representation: "graph", coordination: "explicit", template_ref: null }
  });
  const first = candidateFromRegistry(record);
  const second = { ...candidateFromRegistry(record), asset_id: `${record.asset_id}.alias` };
  return {
    requirement,
    assets: [owner, first, second],
    graph: targetGraph({
      requirementId: requirement.id,
      workflowRef: owner.asset_id,
      nodes: [
        { id: "input", node_kind: "input" },
        { id: "first", node_kind: "agent", agent_ref: first.asset_id, available_tools: [] },
        { id: "second", node_kind: "agent", agent_ref: second.asset_id, available_tools: [] },
        { id: "output", node_kind: "output" }
      ],
      edges: [targetEdge("input", "first"), targetEdge("first", "second"), targetEdge("second", "output")]
    }),
    runnable: true,
    rootOptions: {
      rootAssetId: owner.asset_id,
      solutionControlStrategy: "explicit_workflow",
      assetDispositions: {
        [owner.asset_id]: "create_project_draft",
        [first.asset_id]: "reuse_exact",
        [second.asset_id]: "reuse_exact"
      }
    }
  };
}

function candidateFromRegistry(record) {
  return targetAsset(record.asset_id, record.asset_type, {
    catalog_entry_id: record.asset_id,
    name: record.name,
    domain_scope: record.domain_scope,
    business_domains: structuredClone(record.business_domains),
    owner: record.owner,
    reuse_status: record.reuse_status,
    capability_tags: structuredClone(record.capability_tags),
    binding: structuredClone(record.binding),
    connection: structuredClone(record.connection),
    workflow_profile: structuredClone(record.workflow_profile),
    exposure: structuredClone(record.exposure),
    inputs: structuredClone(record.inputs),
    outputs: structuredClone(record.outputs),
    risk_signals: structuredClone(record.risk_signals)
  });
}

function withRegistry(run) {
  const directory = mkdtempSync(join(tmpdir(), "af-asset-binding-"));
  const registryPath = join(directory, "asset-registry.json");
  copyFileSync(join(repoRoot, "catalog/asset-registry.json"), registryPath);
  const service = new AssetRegistryService(registryPath, { lock_path: join(directory, "asset-registry.lock") });
  try {
    run({ registryPath, service });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function publishExecutableRecord(service, { baseId, assetId, name, sourceRef, contractPatch = {} }) {
  let snapshot = service.loadSnapshot();
  const base = resolveExact(snapshot, baseId, 1);
  snapshot = service.createDraft({
    ...contractContent(base),
    ...contractPatch,
    asset_id: assetId,
    name,
    responsibility: `Provides reviewed executable Registry source for ${assetId}.`,
    source_refs: [sourceRef]
  }, snapshot.registry_revision, "asset-binding-test");
  snapshot = service.markReviewed(
    { asset_id: assetId, version: 1 },
    { decision_id: `decision:review:${assetId}`, selected_by: "user", rationale: "Synthetic executable source reviewed." },
    snapshot.registry_revision
  );
  snapshot = service.publish(
    { asset_id: assetId, version: 1 },
    {
      decision_id: `decision:publish:${assetId}`,
      selected_by: "user",
      rationale: "Synthetic executable source approved for Registry reference tests.",
      owner_confirmed: true,
      domain_confirmed: true,
      reuse_confirmed: true
    },
    snapshot.registry_revision
  );
  return resolveExact(snapshot, assetId, 1);
}

function writeRegistryFixtureModule(outputRoot) {
  writeFileSync(join(outputRoot, "registry_fixture.py"), [
    "from google.adk.agents import LlmAgent",
    "",
    "referenced_agent = LlmAgent(",
    "    name='registry_reference_agent',",
    "    model='gemini-2.5-flash',",
    "    instruction='Reviewed synthetic reference.',",
    "    output_key='registry_reference_output',",
    ")",
    "",
    "def referenced_tool(ctx=None, node_input=None):",
    "    return {'status': 'referenced', 'input': node_input}",
    ""
  ].join("\n"));
}

function bindingDecision(asset, disposition, version, catalogRefs) {
  return {
    asset_decision_id: `asset-decision-${asset.asset_id}`,
    asset_ref: asset.asset_id,
    asset_type: asset.asset_type,
    asset_version: version,
    selected_disposition: disposition,
    selected_by: "user",
    status: "resolved",
    catalog_refs: catalogRefs
  };
}

function bindingWorkItem(asset, decision, registryRevision) {
  const decisions = Array.isArray(decision) ? decision : [decision];
  const rootDecision = decisions.find((candidate) => candidate.asset_ref === asset.asset_id);
  const revisions = Object.fromEntries([
    "requirement",
    "decision",
    "asset_decision",
    "discovery",
    "catalog_snapshot",
    "graph",
    "root_executable",
    "runtime_contract",
    "composition"
  ].map((name) => [name, { registry_revision: registryRevision }]));
  return {
    revisions,
    asset_decisions: decisions,
    solution_control_strategy: asset.asset_type === "workflow" ? "explicit_workflow" : "single_agent",
    root_executable: {
      asset_type: asset.asset_type,
      asset_ref: asset.asset_id,
      asset_version: rootDecision.asset_version,
      decision_id: "decision-root-executable"
    }
  };
}
