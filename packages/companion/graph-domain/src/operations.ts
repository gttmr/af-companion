import type { GraphDiff, GraphEditOperation, GraphElementKind, GraphIR } from "./types.js";
import { assertGraph, GraphValidationError } from "./validation.js";
import { graphRevision, stableStringify } from "./revision.js";

export class GraphOperationError extends Error {
  constructor(readonly code: string, readonly path: string, message: string) {
    super(message);
    this.name = "GraphOperationError";
  }
}

export function applyGraphOperations(graph: GraphIR, operations: readonly GraphEditOperation[]): { graph: GraphIR; revision: string; noChange: boolean } {
  if (!Array.isArray(operations) || operations.length === 0 || operations.length > 100) throw new GraphOperationError("invalid_operations", "operations", "Provide 1 to 100 operations.");
  const next = structuredClone(graph);
  operations.forEach((operation, index) => applyOne(next, operation, index));
  try { assertGraph(next); } catch (error) {
    if (error instanceof GraphValidationError) throw error;
    throw error;
  }
  const before = graphRevision(graph); const after = graphRevision(next);
  return { graph: next, revision: after, noChange: before === after };
}

function applyOne(graph: GraphIR, operation: GraphEditOperation, index: number): void {
  if (!operation || typeof operation !== "object" || !["add", "replace", "remove"].includes(operation.op) || !["node", "edge", "region"].includes(operation.target)) throw new GraphOperationError("invalid_operation", `operations[${index}]`, "Operation is invalid.");
  const list = operation.target === "node" ? graph.nodes : operation.target === "edge" ? graph.edges : graph.regions;
  if (operation.op === "add") {
    if (!operation.value || typeof operation.value.id !== "string") throw new GraphOperationError("invalid_operation", `operations[${index}].value`, "Added element requires an ID.");
    if (list.some((entry) => entry.id === operation.value.id)) throw new GraphOperationError("element_exists", `operations[${index}].value.id`, `${operation.target} already exists.`);
    (list as Array<typeof operation.value>).push(structuredClone(operation.value));
    return;
  }
  const found = list.findIndex((entry) => entry.id === operation.id);
  if (found === -1) throw new GraphOperationError("element_missing", `operations[${index}].id`, `${operation.target} does not exist.`);
  if (operation.op === "remove") { list.splice(found, 1); return; }
  if (operation.value.id !== operation.id) throw new GraphOperationError("id_change_not_allowed", `operations[${index}].value.id`, "replace cannot change an element ID.");
  if (operation.target === "node") {
    const current = graph.nodes[found];
    if (current && current.node_kind !== operation.value.node_kind) throw new GraphOperationError("node_kind_change_not_allowed", `operations[${index}].value.node_kind`, "Delete and recreate a Node to change its kind.");
  }
  (list as Array<typeof operation.value>)[found] = structuredClone(operation.value);
}

export function diffGraphs(before: GraphIR, after: GraphIR): GraphDiff {
  const changed_nodes = changedIds(before.nodes, after.nodes);
  const changed_edges = changedIds(before.edges, after.edges);
  const changed_regions = changedIds(before.regions, after.regions);
  return { changed_nodes, changed_edges, changed_regions, changed_count: changed_nodes.length + changed_edges.length + changed_regions.length };
}

export function selectionExists(graph: GraphIR, selection: { kind: GraphElementKind; id: string } | null): boolean {
  if (!selection) return true;
  const list = selection.kind === "node" ? graph.nodes : selection.kind === "edge" ? graph.edges : graph.regions;
  return list.some((entry) => entry.id === selection.id);
}

function changedIds(before: Array<{ id: string }>, after: Array<{ id: string }>): string[] {
  const left = new Map(before.map((value) => [value.id, stableStringify(value)]));
  const right = new Map(after.map((value) => [value.id, stableStringify(value)]));
  return [...new Set([...left.keys(), ...right.keys()])].filter((id) => left.get(id) !== right.get(id)).sort();
}
