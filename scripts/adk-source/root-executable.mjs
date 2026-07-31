import { assetNodeSpec, graphIndexes } from "./graph/indexes.mjs";
import { nodeSymbol } from "./naming.mjs";

const WORKFLOW_OWNED_NODE_KINDS = new Set(["tool", "function", "human_input", "subworkflow", "join"]);

export function resolveRootExecutablePlan({ assets, graph, workItem }) {
  const root = workItem.root_executable;
  const strategy = workItem.solution_control_strategy;
  assertDecisionPreservation(workItem, root, strategy);
  const rootAsset = assets.find((asset) => asset.asset_id === root.asset_ref);
  if (!rootAsset || rootAsset.asset_type !== root.asset_type) {
    throw new Error("Root Executable must reference a matching scaffold Agent or Workflow asset.");
  }
  if (root.asset_type === "workflow") {
    return workflowRootPlan({ graph, root, rootAsset, strategy });
  }
  return agentRootPlan({ assets, graph, root, rootAsset, strategy });
}

function workflowRootPlan({ graph, root, rootAsset, strategy }) {
  if (graph.workflow_ref !== root.asset_ref) {
    throw new Error(
      `Workflow Root Executable ${root.asset_ref} must equal Graph IR workflow_ref; found ${graph.workflow_ref ?? "null"}.`
    );
  }
  if (strategy === "single_agent") {
    throw new Error("single_agent requires an Agent Root Executable.");
  }
  if (strategy === "agent_delegation") {
    throw new Error("agent_delegation requires an Agent Root Executable in the current ADK 2.4 lowering contract.");
  }
  const coordination = rootAsset.workflow_profile?.coordination;
  if (strategy === "explicit_workflow" && coordination !== "explicit") {
    throw new Error(
      `explicit_workflow Workflow Root Executable requires coordination explicit; found ${coordination ?? "missing"}.`
    );
  }
  if (strategy === "hybrid" && coordination !== "mixed") {
    throw new Error(
      `hybrid Workflow Root Executable requires coordination mixed; found ${coordination ?? "missing"}.`
    );
  }
  return Object.freeze({
    strategy,
    assetType: "workflow",
    assetRef: root.asset_ref,
    assetVersion: root.asset_version,
    decisionId: root.decision_id,
    rootAsset,
    rootNodeId: null,
    rootSymbol: "root_executable",
    delegatedAgentNodeIds: Object.freeze([]),
    delegatedAgentSymbols: Object.freeze([])
  });
}

function agentRootPlan({ assets, graph, root, rootAsset, strategy }) {
  if (graph.workflow_ref !== null) {
    throw new Error(
      `Agent Root Executable ${root.asset_ref} requires Graph IR workflow_ref null; found ${graph.workflow_ref}.`
    );
  }
  if (strategy === "explicit_workflow") {
    throw new Error("explicit_workflow requires a Workflow Root Executable.");
  }
  const invalidNode = graph.nodes.find((node) => WORKFLOW_OWNED_NODE_KINDS.has(node.node_kind));
  if (invalidNode) {
    throw new Error(
      `Agent Root Executable cannot lower Workflow-owned node kind ${invalidNode.node_kind} (${invalidNode.id}); return to Compose and select a Workflow root or remove the explicit node.`
    );
  }
  const indexes = graphIndexes({ assets, graph });
  const agentTargets = indexes.nodes
    .filter((node) => node.node_kind === "agent")
    .map((node) => assetNodeSpec(node, indexes))
    .filter(Boolean);
  const rootTargets = agentTargets.filter((target) => target.asset.asset_id === root.asset_ref);
  if (rootTargets.length !== 1) {
    throw new Error(
      `Agent Root Executable ${root.asset_ref} must map to exactly one Agent Graph node; found ${rootTargets.length}.`
    );
  }
  const duplicateAgentRef = firstDuplicate(agentTargets.map((target) => target.asset.asset_id));
  if (duplicateAgentRef) {
    throw new Error(
      `Agent Root Executable topology cannot instantiate Agent asset ${duplicateAgentRef} more than once; model distinct delegated responsibilities as distinct reviewed Agent assets.`
    );
  }
  const rootTarget = rootTargets[0];
  const delegatedTargets = agentTargets.filter((target) => target.node.id !== rootTarget.node.id);
  if (strategy === "single_agent" && delegatedTargets.length) {
    throw new Error(
      `single_agent cannot include delegated Agent nodes; found ${delegatedTargets.map((target) => target.node.id).join(", ")}.`
    );
  }
  if ((strategy === "agent_delegation" || strategy === "hybrid") && !delegatedTargets.length) {
    throw new Error(`${strategy} with an Agent Root Executable requires at least one reviewed delegated Agent node.`);
  }
  if (
    (strategy === "agent_delegation" || strategy === "hybrid")
    && rootAsset.binding?.kind === "a2a"
  ) {
    throw new Error(`${strategy} requires a local LlmAgent coordinator; Remote A2A Agent ${root.asset_ref} cannot own sub_agents.`);
  }
  assertAgentTopologyEdges(graph, rootTarget, delegatedTargets);
  return Object.freeze({
    strategy,
    assetType: "agent",
    assetRef: root.asset_ref,
    assetVersion: root.asset_version,
    decisionId: root.decision_id,
    rootAsset,
    rootNodeId: rootTarget.node.id,
    rootSymbol: nodeSymbol(rootTarget),
    delegatedAgentNodeIds: Object.freeze(delegatedTargets.map((target) => target.node.id)),
    delegatedAgentSymbols: Object.freeze(delegatedTargets.map((target) => nodeSymbol(target)))
  });
}

function assertAgentTopologyEdges(graph, rootTarget, delegatedTargets) {
  const rootNodeId = rootTarget.node.id;
  const delegatedIds = new Set(delegatedTargets.map((target) => target.node.id));
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const inputNodes = graph.nodes.filter((node) => node.node_kind === "input");
  const outputNodes = graph.nodes.filter((node) => node.node_kind === "output");
  if (inputNodes.length !== 1 || outputNodes.length !== 1) {
    throw new Error(
      `Agent Root Executable topology requires exactly one Input and one Output node; found ${inputNodes.length} Input and ${outputNodes.length} Output.`
    );
  }
  let rootIngress = 0;
  let rootEgress = 0;
  const delegatedIncoming = new Map([...delegatedIds].map((id) => [id, 0]));
  for (const edge of graph.edges) {
    if (edge.channel !== null || edge.control?.kind !== "next") {
      throw new Error(
        `Agent Root Executable topology supports only next edges without data channels; edge ${edge.id} requires explicit Workflow lowering.`
      );
    }
    const fromKind = nodesById.get(edge.from)?.node_kind;
    const toKind = nodesById.get(edge.to)?.node_kind;
    const ingress = fromKind === "input" && edge.to === rootNodeId;
    const egress = edge.from === rootNodeId && toKind === "output";
    const delegation = edge.from === rootNodeId && delegatedIds.has(edge.to);
    if (!ingress && !egress && !delegation) {
      throw new Error(
        `Agent Root Executable edge ${edge.id} is not input→root, root→output, or root→delegated Agent; explicit sequencing requires a Workflow root.`
      );
    }
    if (ingress) rootIngress += 1;
    if (egress) rootEgress += 1;
    if (delegation) delegatedIncoming.set(edge.to, (delegatedIncoming.get(edge.to) ?? 0) + 1);
  }
  if (rootIngress !== 1 || rootEgress !== 1) {
    throw new Error(
      `Agent Root Executable topology requires exactly one Input→Root edge and one Root→Output edge; found ${rootIngress} ingress and ${rootEgress} egress.`
    );
  }
  for (const [nodeId, incoming] of delegatedIncoming) {
    if (incoming !== 1) {
      throw new Error(`Delegated Agent node ${nodeId} must have exactly one delegation edge from Root Agent ${rootNodeId}; found ${incoming}.`);
    }
  }
}

function assertDecisionPreservation(workItem, root, strategy) {
  const strategyDecision = workItem.decisions.find(
    (decision) => decision.topic === "solution_control_strategy"
      && decision.status === "resolved"
      && decision.selected_by === "user"
      && decision.selected_option === strategy
  );
  if (!strategyDecision) {
    throw new Error(`Solution Control Strategy ${strategy} is not backed by the matching resolved user decision.`);
  }
  const rootDecision = workItem.decisions.find(
    (decision) => decision.decision_id === root.decision_id
      && decision.topic === "root_executable"
      && decision.status === "resolved"
      && decision.selected_by === "user"
      && decision.selected_option === root.asset_ref
  );
  if (!rootDecision) {
    throw new Error(`Root Executable ${root.asset_ref} is not backed by its resolved user decision ${root.decision_id}.`);
  }
}

function firstDuplicate(values) {
  const seen = new Set();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}
