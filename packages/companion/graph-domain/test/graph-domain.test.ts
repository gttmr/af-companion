import assert from "node:assert/strict";
import test from "node:test";
import { applyGraphOperations, createDemoGraph, diffGraphs, graphRevision, GraphOperationError, GraphValidationError, validateGraph } from "../src/index.js";

test("supports all Node, Edge, and Region operation families", () => {
  const graph = createDemoGraph();
  const added = applyGraphOperations(graph, [
    { op: "add", target: "node", value: { id: "node.join", label: "병합", node_kind: "join" } },
    { op: "add", target: "edge", value: { id: "edge.join", from: "node.evidence", to: "node.join", control: { kind: "fan_in", condition: null, accepted_aliases: [], default: false }, channel: null } },
    { op: "add", target: "region", value: { id: "region.parallel", kind: "parallel", node_ids: ["node.evidence", "node.join"], entry_node_ids: ["node.evidence"], exit_node_ids: ["node.join"], parent_region_id: null } },
  ]).graph;
  const replaced = applyGraphOperations(added, [
    { op: "replace", target: "node", id: "node.join", value: { id: "node.join", label: "결과 병합", node_kind: "join" } },
    { op: "replace", target: "edge", id: "edge.join", value: { id: "edge.join", from: "node.evidence", to: "node.join", control: { kind: "next", condition: null, accepted_aliases: [], default: false }, channel: "state" } },
    { op: "replace", target: "region", id: "region.parallel", value: { id: "region.parallel", kind: "loop", node_ids: ["node.evidence", "node.join"], entry_node_ids: ["node.evidence"], exit_node_ids: ["node.join"], parent_region_id: null } },
  ]).graph;
  const removed = applyGraphOperations(replaced, [
    { op: "remove", target: "edge", id: "edge.join" },
    { op: "remove", target: "region", id: "region.parallel" },
    { op: "remove", target: "node", id: "node.join" },
  ]).graph;
  assert.equal(removed.nodes.some((node) => node.id === "node.join"), false);
  assert.equal(diffGraphs(graph, replaced).changed_count, 3);
});

test("requires explicit dependent operations before a Node can be removed", () => {
  assert.throws(() => applyGraphOperations(createDemoGraph(), [{ op: "remove", target: "node", id: "node.reviewer" }]), GraphValidationError);
});

test("rejects Node kind replacement and Region parent cycles", () => {
  assert.throws(() => applyGraphOperations(createDemoGraph(), [{ op: "replace", target: "node", id: "node.reviewer", value: { id: "node.reviewer", label: "검토", node_kind: "output" } }]), (error) => error instanceof GraphOperationError && error.code === "node_kind_change_not_allowed");
  const graph = createDemoGraph();
  graph.regions = [
    { id: "r1", kind: "parallel", node_ids: ["node.input"], entry_node_ids: ["node.input"], exit_node_ids: ["node.input"], parent_region_id: "r2" },
    { id: "r2", kind: "loop", node_ids: ["node.input"], entry_node_ids: ["node.input"], exit_node_ids: ["node.input"], parent_region_id: "r1" },
  ];
  assert.equal(validateGraph(graph).errors.some((entry) => entry.code === "cyclic_parent_region"), true);
});

test("semantic revision ignores JSON object key formatting", () => {
  const graph = createDemoGraph();
  const reordered = JSON.parse(JSON.stringify(graph, Object.keys(graph).reverse())) as unknown;
  assert.notEqual(reordered, null);
  assert.equal(graphRevision(graph), graphRevision(structuredClone(graph)));
});
