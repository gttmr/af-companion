import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import { generatedPythonExecutable } from "./generated-python-runtime.mjs";
import {
  discoverGeneratedPackage,
  generateBundle,
  targetAsset,
  targetEdge,
  targetGraph,
  targetRequirement,
  temporaryTargetFixture
} from "./fixtures.mjs";

const cases = [
  { strategy: "single_agent", rootType: "agent" },
  { strategy: "agent_delegation", rootType: "agent" },
  { strategy: "explicit_workflow", rootType: "workflow" },
  { strategy: "hybrid", rootType: "workflow" },
  { strategy: "hybrid", rootType: "agent" }
];

for (const scenario of cases) {
  test(`${scenario.strategy} lowers the selected ${scenario.rootType} Root Executable`, () => {
    withRootFixture(scenario, ({ artifactRoot }) => {
      const outputRoot = join(artifactRoot, "out");
      generateBundle(artifactRoot, outputRoot);
      const packageName = discoverGeneratedPackage(outputRoot);
      const manifest = JSON.parse(
        execFileSync(generatedPythonExecutable(), ["-c", [
          "import json",
          `print(open(${JSON.stringify(join(outputRoot, packageName, "workflow_manifest.json"))}, encoding='utf-8').read())`
        ].join("\n")], { encoding: "utf8" })
      );
      assert.equal(manifest.solution_control_strategy, scenario.strategy);
      assert.equal(manifest.root_executable.asset_type, scenario.rootType);
      assert.equal(manifest.root_executable.asset_ref, rootId(scenario.rootType));
      assert.equal(manifest.root_executable.asset_version, 1);
      assert.equal(manifest.root_executable.generated_symbol, "root_agent");

      const runtime = JSON.parse(execFileSync(
        generatedPythonExecutable(),
        ["-c", runtimeInspectionScript(packageName)],
        {
          cwd: outputRoot,
          encoding: "utf8",
          env: { ...process.env, AF_LLM_PROVIDER: "gemini" },
          stdio: ["ignore", "pipe", "pipe"]
        }
      ));
      assert.equal(runtime.identity, true);
      assert.equal(runtime.root_type, scenario.rootType === "workflow" ? "Workflow" : "LlmAgent");
      if (scenario.strategy === "agent_delegation" || (scenario.strategy === "hybrid" && scenario.rootType === "agent")) {
        assert.deepEqual(runtime.sub_agents, [{ name: "worker", mode: "task" }]);
        assert.equal(runtime.root_mode, null);
      } else if (scenario.rootType === "agent") {
        assert.deepEqual(runtime.sub_agents, []);
        assert.equal(runtime.root_mode, null);
      }
      execFileSync(
        generatedPythonExecutable(),
        ["-m", "pytest", "-q", join(outputRoot, packageName, "tests", "test_workflow_contract.py")],
        {
          cwd: outputRoot,
          env: { ...process.env, AF_LLM_PROVIDER: "gemini" },
          stdio: "pipe"
        }
      );
    });
  });
}

for (const rootType of ["agent", "workflow"]) {
  test(`smoke output preserves a selected ${rootType} Root Executable runtime type`, () => {
    const strategy = rootType === "agent" ? "single_agent" : "explicit_workflow";
    withRootFixture({ strategy, rootType, runnable: false }, ({ artifactRoot }) => {
      const outputRoot = join(artifactRoot, "out");
      generateBundle(artifactRoot, outputRoot);
      const packageName = discoverGeneratedPackage(outputRoot);
      const runtime = JSON.parse(execFileSync(
        generatedPythonExecutable(),
        ["-c", runtimeInspectionScript(packageName)],
        { cwd: outputRoot, encoding: "utf8", env: { ...process.env, AF_LLM_PROVIDER: "gemini" } }
      ));
      assert.equal(runtime.identity, true);
      assert.equal(runtime.root_type, rootType === "workflow" ? "Workflow" : "SyntheticRuntimeSmokeAgent");
    });
  });
}

test("root_agent is the exact selected Agent object when more than one Agent is present", () => {
  withRootFixture({ strategy: "agent_delegation", rootType: "agent", reverseAgents: true }, ({ artifactRoot }) => {
    const outputRoot = join(artifactRoot, "out");
    generateBundle(artifactRoot, outputRoot);
    const packageName = discoverGeneratedPackage(outputRoot);
    const result = JSON.parse(execFileSync(
      generatedPythonExecutable(),
      ["-c", [
        "import importlib, json",
        `module = importlib.import_module(${JSON.stringify(`${packageName}.agent`)})`,
        "print(json.dumps({",
        "  'selected': module.root_agent.name,",
        "  'identity': module.root_agent is module.agent_agent_root,",
        "  'worker_is_subagent': module.agent_agent_worker in module.root_agent.sub_agents,",
        "}))"
      ].join("\n")],
      { cwd: outputRoot, encoding: "utf8", env: { ...process.env, AF_LLM_PROVIDER: "gemini" } }
    ));
    assert.deepEqual(result, { selected: "agent_root", identity: true, worker_is_subagent: true });
  });
});

test("generator rejects Solution Control Strategy and Compose topology mismatches", () => {
  const mismatches = [
    {
      scenario: { strategy: "explicit_workflow", rootType: "agent" },
      expected: /explicit_workflow requires a Workflow Root Executable/i
    },
    {
      scenario: { strategy: "single_agent", rootType: "workflow" },
      expected: /single_agent requires an Agent Root Executable/i
    },
    {
      scenario: { strategy: "hybrid", rootType: "workflow", workflowCoordination: "explicit" },
      expected: /hybrid Workflow Root Executable requires coordination mixed/i
    },
    {
      scenario: { strategy: "agent_delegation", rootType: "agent", includeWorkflowNode: true },
      expected: /Agent Root Executable cannot lower Workflow-owned node kind function/i
    },
    {
      scenario: { strategy: "single_agent", rootType: "agent", omitRootEdges: true },
      expected: /requires exactly one Input→Root edge and one Root→Output edge; found 0 ingress and 0 egress/i
    },
    {
      scenario: { strategy: "single_agent", rootType: "agent", duplicateRootIngress: true },
      expected: /requires exactly one Input→Root edge and one Root→Output edge; found 2 ingress and 1 egress/i
    }
  ];
  for (const { scenario, expected } of mismatches) {
    withRootFixture(scenario, ({ artifactRoot }) => {
      assert.throws(() => generateBundle(artifactRoot, join(artifactRoot, "out")), expected);
    });
  }
});

function withRootFixture(scenario, run) {
  const data = rootFixture(scenario);
  const fixture = temporaryTargetFixture(data);
  try {
    run(fixture);
  } finally {
    fixture.cleanup();
  }
}

function rootFixture({
  strategy,
  rootType,
  reverseAgents = false,
  workflowCoordination = strategy === "hybrid" ? "mixed" : "explicit",
  includeWorkflowNode = false,
  runnable = true,
  omitRootEdges = false,
  duplicateRootIngress = false
}) {
  const requirement = targetRequirement(`req-root-${strategy.replaceAll("_", "-")}-${rootType}`);
  const root = targetAsset(rootId(rootType), rootType, rootType === "workflow" ? {
    workflow_profile: { representation: "graph", coordination: workflowCoordination, template_ref: null }
  } : {});
  const worker = targetAsset("agent.worker", "agent", { name: "worker" });
  const delegated = strategy === "agent_delegation" || (strategy === "hybrid" && rootType === "agent");
  const assets = rootType === "workflow" ? [root, worker] : delegated ? [root, worker] : [root];
  const rootNode = { id: "root", node_kind: "agent", agent_ref: root.asset_id, available_tools: [] };
  const workerNode = { id: "worker", node_kind: "agent", agent_ref: worker.asset_id, available_tools: [] };
  let nodes;
  let edges;
  if (rootType === "workflow") {
    nodes = [
      { id: "input", node_kind: "input" },
      ...(includeWorkflowNode
        ? [{ id: "step", node_kind: "function", role: "transform" }]
        : [workerNode]),
      { id: "output", node_kind: "output" }
    ];
    edges = [targetEdge("input", nodes[1].id), targetEdge(nodes[1].id, "output")];
  } else if (includeWorkflowNode) {
    nodes = [
      { id: "input", node_kind: "input" },
      rootNode,
      workerNode,
      { id: "step", node_kind: "function", role: "transform" },
      { id: "output", node_kind: "output" }
    ];
    edges = [targetEdge("input", "root"), targetEdge("root", "worker"), targetEdge("root", "output")];
  } else {
    const agentNodes = delegated
      ? (reverseAgents ? [workerNode, rootNode] : [rootNode, workerNode])
      : [rootNode];
    nodes = [{ id: "input", node_kind: "input" }, ...agentNodes, { id: "output", node_kind: "output" }];
    edges = omitRootEdges ? [] : [
      targetEdge("input", "root"),
      ...(duplicateRootIngress
        ? [{ ...targetEdge("input", "root"), id: "edge.input.root.duplicate" }]
        : []),
      ...(delegated ? [targetEdge("root", "worker")] : []),
      targetEdge("root", "output")
    ];
  }
  return {
    requirement,
    assets,
    graph: targetGraph({
      requirementId: requirement.id,
      nodes,
      edges,
      workflowRef: rootType === "workflow" ? root.asset_id : null
    }),
    runnable,
    rootOptions: {
      rootAssetId: root.asset_id,
      solutionControlStrategy: strategy
    }
  };
}

function rootId(rootType) {
  return rootType === "workflow" ? "workflow.root" : "agent.root";
}

function runtimeInspectionScript(packageName) {
  return [
    "import importlib, json",
    `module = importlib.import_module(${JSON.stringify(`${packageName}.agent`)})`,
    "root = module.root_agent",
    "print(json.dumps({",
    "  'identity': root is module.root_executable,",
    "  'root_type': type(root).__name__,",
    "  'root_mode': getattr(root, 'mode', None),",
    "  'sub_agents': [",
    "    {'name': child.name, 'mode': getattr(child, 'mode', None)}",
    "    for child in getattr(root, 'sub_agents', [])",
    "  ],",
    "}))"
  ].join("\n");
}
