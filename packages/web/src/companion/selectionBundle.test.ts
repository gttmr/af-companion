import assert from "node:assert/strict";
import type { AssetCandidate, GraphIR } from "../analyzer/types.ts";
import {
  buildSelectionBundleV1,
  renderSelectionBundlePreview,
  type BuildSelectionBundleV1Input
} from "./selectionBundle.ts";

function candidate(
  assetId: string,
  assetType: AssetCandidate["asset_type"],
  binding: AssetCandidate["binding"] = null
): AssetCandidate {
  return {
    asset_id: assetId,
    source_requirement_id: "req.selection",
    catalog_entry_id: null,
    name: assetId,
    asset_type: assetType,
    domain_scope: "domain_specific",
    business_domains: ["review"],
    owner: `${assetType}-platform`,
    reuse_status: "project_only",
    capability_tags: [],
    binding,
    connection: null,
    workflow_profile: assetType === "workflow"
      ? { representation: "graph", coordination: "explicit", template_ref: null }
      : null,
    exposure: null,
    confidence: 0.9,
    rationale: "selection fixture",
    inputs: [],
    outputs: [],
    risk_level: "low",
    risk_signals: [],
    status: "approved",
    missing_information: []
  };
}

const graph = {
  graph_id: "graph.selection",
  source_requirement_id: "req.selection",
  workflow_ref: "workflow.root",
  nodes: [
    { id: "node.input", label: "입력", node_kind: "input" },
    { id: "node.agent-a", label: "검토 Agent A", node_kind: "agent", agent_ref: "agent.review", available_tools: [] },
    { id: "node.agent-b", label: "검토 Agent B", node_kind: "agent", agent_ref: "agent.review", available_tools: [] },
    { id: "node.tool", label: "조회 Tool", node_kind: "tool", tool_ref: "tool.lookup", invocation_control: "workflow" },
    { id: "node.function", label: "결과 정리", node_kind: "function", role: "format_output" },
    { id: "node.workflow", label: "하위 Workflow", node_kind: "subworkflow", workflow_ref: "workflow.child" },
    { id: "node.output", label: "출력", node_kind: "output" }
  ],
  edges: [
    { id: "edge.input-agent", from: "node.input", to: "node.agent-a", control: { kind: "next", condition: null, accepted_aliases: [], default: false }, channel: "event" },
    { id: "edge.agent-tool", from: "node.agent-a", to: "node.tool", control: { kind: "next", condition: null, accepted_aliases: [], default: false }, channel: "state" },
    { id: "edge.agent-b-tool", from: "node.agent-b", to: "node.tool", control: { kind: "fallback", condition: null, accepted_aliases: [], default: false }, channel: null },
    { id: "edge.tool-workflow", from: "node.tool", to: "node.workflow", control: { kind: "next", condition: null, accepted_aliases: [], default: false }, channel: "artifact" },
    { id: "edge.workflow-output", from: "node.workflow", to: "node.output", control: { kind: "next", condition: null, accepted_aliases: [], default: false }, channel: "event" }
  ],
  regions: []
} satisfies GraphIR;

const assetCandidates = [
  candidate("agent.review", "agent", { kind: "a2a", contract_ref: "a2a.review.v1" }),
  candidate("tool.lookup", "tool", { kind: "mcp", server_ref: "lookup", tool_name: "lookup" }),
  candidate("workflow.child", "workflow")
];

const baseInput: BuildSelectionBundleV1Input = {
  graph,
  assetCandidates,
  selectedNodeIds: ["node.tool", "node.agent-a", "node.workflow"],
  source: {
    workspaceId: "workspace.agent-factory",
    artifactRootId: "req.selection",
    graphEtag: "graph-etag-7",
    gitHead: "abc1234",
    dirtyHash: "dirty-55"
  },
  userIntent: "  선택한 경로를 검토해 줘  ",
  now: "2026-07-22T01:00:00.000Z",
  expiresAt: "2026-07-22T01:15:00.000Z"
};

function build(overrides: Partial<BuildSelectionBundleV1Input> = {}) {
  return buildSelectionBundleV1({ ...baseInput, ...overrides });
}

{
  const first = build();
  const laterMetadata = build({
    now: "2026-07-22T02:00:00.000Z",
    expiresAt: "2026-07-22T02:30:00.000Z"
  });
  assert.equal(first.selection_id, laterMetadata.selection_id, "timestamps must not affect stable identity");
  assert.notEqual(
    first.selection_id,
    build({ selectedNodeIds: ["node.agent-a", "node.tool", "node.workflow"] }).selection_id,
    "selection order must affect stable identity"
  );
  assert.notEqual(first.selection_id, build({ userIntent: "다른 의도" }).selection_id, "intent must affect stable identity");
  assert.equal(first.user_intent.text, "선택한 경로를 검토해 줘");
}

{
  const bundle = build();
  assert.deepEqual(bundle.selected_objects.map((object) => object.id), ["node.tool", "node.agent-a", "node.workflow"]);
  assert.deepEqual(bundle.selected_objects.map((object) => object.artifact_ref), ["tool.lookup", "agent.review", "workflow.child"]);
  assert.equal(bundle.selected_objects.every((object) => object.source_refs.length === 0), true);
  assert.deepEqual(bundle.derived_context.connecting_edges.map((edge) => edge.id), ["edge.agent-tool", "edge.tool-workflow"]);
  assert.deepEqual(bundle.derived_context.related_assets.map((asset) => asset.asset_id), [
    "tool.lookup",
    "agent.review",
    "workflow.child"
  ]);
  assert.equal(bundle.derived_context.related_assets[0]?.binding_kind, "mcp");
}

{
  const deduped = build({ selectedNodeIds: ["node.agent-b", "node.tool", "node.agent-a"] });
  assert.deepEqual(deduped.derived_context.related_assets.map((asset) => asset.asset_id), ["agent.review", "tool.lookup"]);
  assert.deepEqual(deduped.derived_context.connecting_edges.map((edge) => edge.id), ["edge.agent-tool", "edge.agent-b-tool"]);
}

{
  const standalone = build({ selectedNodeIds: ["node.function"] });
  assert.equal(standalone.selected_objects[0]?.artifact_ref, null);
  assert.deepEqual(standalone.derived_context.connecting_edges, []);
  assert.deepEqual(standalone.derived_context.related_assets, []);
}

assert.throws(() => build({ selectedNodeIds: [] }), /하나 이상/);
assert.throws(() => build({ selectedNodeIds: ["node.tool", "node.tool"] }), /중복 node ID 'node\.tool'/);
assert.throws(() => build({ selectedNodeIds: ["node.missing"] }), /찾을 수 없습니다/);
assert.throws(() => build({ selectedNodeIds: Array.from({ length: 21 }, (_, index) => `node.${index}`) }), /최대 20개/);
assert.throws(() => build({ now: "not-a-time" }), /유효한 날짜\/시간/);
assert.throws(() => build({ expiresAt: "not-a-time" }), /유효한 날짜\/시간/);
assert.throws(() => build({ expiresAt: baseInput.now }), /now보다 이후/);
assert.throws(() => build({ source: { ...baseInput.source, workspaceId: " " } }), /source\.workspaceId/);
assert.throws(() => build({ source: { ...baseInput.source, artifactRootId: "" } }), /source\.artifactRootId/);
assert.throws(() => build({ source: { ...baseInput.source, graphEtag: "" } }), /source\.graphEtag/);
assert.throws(
  () => build({ source: { ...baseInput.source, gitHead: null, dirtyHash: null } }),
  /gitHead 또는 dirtyHash/
);
assert.throws(() => build({ assetCandidates: assetCandidates.slice(1), selectedNodeIds: ["node.agent-a"] }), /agent\.review/);
assert.throws(
  () => build({ assetCandidates: [candidate("agent.review", "tool")], selectedNodeIds: ["node.agent-a"] }),
  /agent이어야 하지만 tool/
);
assert.throws(
  () => build({
    graph: {
      ...graph,
      nodes: graph.nodes.map((node) => node.id === "node.tool" && node.node_kind === "tool"
        ? { ...node, tool_ref: "agent.review" }
        : node)
    },
    selectedNodeIds: ["node.agent-a", "node.tool"]
  }),
  /tool이어야 하지만 agent/
);

{
  const preview = renderSelectionBundlePreview(build());
  assert.match(preview, /선택 객체 3개: 조회 Tool \(tool · node\.tool\)/);
  assert.match(preview, /직접 연결 Edge: 검토 Agent A → 조회 Tool \(next · state\), 조회 Tool → 하위 Workflow \(next · artifact\)/);
  assert.match(preview, /관련 자산: tool\.lookup \(tool · tool-platform · domain_specific · mcp\)/);
  assert.match(preview, /Revision: Graph graph-etag-7 · Git abc1234 · dirty dirty-55/);
  assert.match(preview, /만료: 2026-07-22T01:15:00\.000Z/);
  assert.match(preview, /사용자 의도: 선택한 경로를 검토해 줘/);

  const standalonePreview = renderSelectionBundlePreview(build({ selectedNodeIds: ["node.function"], userIntent: null }));
  assert.match(standalonePreview, /직접 연결 Edge: 없음/);
  assert.match(standalonePreview, /관련 자산: 없음/);
  assert.match(standalonePreview, /사용자 의도: 없음/);
}

{
  const secret = "sk-exampleSecretValue123456789";
  const graphWithSecretLabel: GraphIR = {
    ...graph,
    nodes: graph.nodes.map((node) => node.id === "node.tool"
      ? { ...node, label: `token=${secret}` }
      : node)
  };
  const candidatesWithSecretOwner = assetCandidates.map((asset) => asset.asset_id === "tool.lookup"
    ? { ...asset, owner: `password=${secret}` }
    : asset);
  const redacted = build({
    graph: graphWithSecretLabel,
    assetCandidates: candidatesWithSecretOwner,
    userIntent: `token=${secret} Bearer abcdefghijklmnopqrstuvwxyz`
  });
  const serialized = JSON.stringify(redacted);
  assert.doesNotMatch(serialized, /exampleSecretValue|abcdefghijklmnopqrstuvwxyz/);
  assert.equal(redacted.selected_objects[0]?.label, "token=[REDACTED]");
  assert.equal(redacted.derived_context.related_assets[0]?.owner, "password=[REDACTED]");
  assert.match(redacted.user_intent.text ?? "", /token=\[REDACTED\]/);
  assert.match(redacted.user_intent.text ?? "", /\[REDACTED\]/);
  assert.doesNotMatch(renderSelectionBundlePreview(redacted), /exampleSecretValue|abcdefghijklmnopqrstuvwxyz/);
}

assert.throws(
  () => build({ selectedNodeIds: ["sk-exampleSecretValue123456789"] }),
  /stable reference에 secret pattern/
);

console.log("selection bundle tests passed");
