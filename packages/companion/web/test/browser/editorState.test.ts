import assert from "node:assert/strict";
import test from "node:test";
import { createDemoGraph, createDemoPresentation, graphRevision } from "@agent-factory/companion-graph-domain";
import { finalizeUiContextDocument } from "@agent-factory/companion-contracts";
import { graphEditorReducer, initialGraphEditorState, pendingOperations } from "../../src/browser/graph/editorState.js";

function workspace(label = "결과 정리") { const graph = createDemoGraph(); graph.nodes.find((node) => node.id === "node.output")!.label = label; const revision = graphRevision(graph); return { ...finalizeUiContextDocument({ schema_version: 2 as const, authority: "none" as const, graph_revision: revision, published_at: new Date().toISOString(), scope: { workspace_id: "w", application_id: "a", work_id: "x" }, graph, active_selection: { kind: "node" as const, id: "node.output" }, active_draft: null, recent_changes: [], source_health: { status: "valid" as const, observed_at: new Date().toISOString(), graph_revision: revision } }), presentation: createDemoPresentation() }; }

test("operation history supports undo and redo", () => {
  let state = graphEditorReducer(initialGraphEditorState, { type: "loaded", workspace: workspace() });
  state = graphEditorReducer(state, { type: "stage", operations: [{ op: "replace", target: "node", id: "node.output", value: { id: "node.output", label: "완료", node_kind: "output" } }] });
  assert.equal(state.draftGraph?.nodes.at(-1)?.label, "완료"); state = graphEditorReducer(state, { type: "undo" }); assert.equal(pendingOperations(state).length, 0); state = graphEditorReducer(state, { type: "redo" }); assert.equal(pendingOperations(state).length, 1);
});

test("external snapshot replaces local history", () => {
  let state = graphEditorReducer(initialGraphEditorState, { type: "loaded", workspace: workspace() }); state = graphEditorReducer(state, { type: "stage", operations: [{ op: "replace", target: "node", id: "node.output", value: { id: "node.output", label: "draft", node_kind: "output" } }] });
  state = graphEditorReducer(state, { type: "loaded", workspace: workspace("Codex 결과"), notice: "Codex 변경 반영됨. 저장 전 변경 1개가 대체되었습니다." });
  assert.equal(state.history.length, 0); assert.equal(state.draftGraph?.nodes.at(-1)?.label, "Codex 결과"); assert.match(state.notice ?? "", /대체/);
});
