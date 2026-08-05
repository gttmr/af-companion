import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createDemoGraph, createDemoPresentation, graphRevision } from "@agent-factory/companion-graph-domain";
import { finalizeUiContextDocument } from "@agent-factory/companion-contracts";
import { GraphCanvas } from "../../src/browser/graph/GraphCanvas.js";
import { ContextPublicationStrip } from "../../src/browser/context/ContextPublicationStrip.js";
import { presentationForGraph } from "../../src/browser/app/GraphContextScreen.js";
import { AssetRegistryScreen } from "../../src/browser/assets/AssetRegistryScreen.js";
import type { CompanionApi } from "../../src/browser/api/CompanionApi.js";

function workspace() { const graph = createDemoGraph(); const revision = graphRevision(graph); return { ...finalizeUiContextDocument({ schema_version: 2 as const, authority: "none" as const, graph_revision: revision, published_at: new Date().toISOString(), scope: { workspace_id: "w", application_id: "a", work_id: "x" }, graph, active_selection: null, active_draft: null, recent_changes: [], source_health: { status: "valid" as const, observed_at: new Date().toISOString(), graph_revision: revision } }), presentation: createDemoPresentation() }; }

test("canvas exposes canonical Node and Edge semantics", () => {
  const value = workspace(); const html = renderToStaticMarkup(<GraphCanvas graph={value.graph} presentation={value.presentation} selection={null} changed={{ nodes: new Set(), edges: new Set(), regions: new Set() }} onSelectionChange={() => undefined} onPositionChange={() => undefined} />);
  assert.match(html, /검토 Agent, agent Node 선택/); assert.match(html, /Edge edge.review-evidence 선택/); assert.match(html, /Canonical Graph IR/);
});

test("Context strip has revisions but no sequence or connected claim", () => {
  const html = renderToStaticMarkup(<ContextPublicationStrip workspace={workspace()} pending={false} />);
  assert.match(html, /Context 사용 가능/); assert.match(html, /authority · none/); assert.doesNotMatch(html, /sequence|Codex 연결됨/);
});

test("draft-only Node positions stay local until the canonical Graph includes them", () => {
  const initial = createDemoPresentation();
  const beforeSave = presentationForGraph({ ...initial, positions: { ...initial.positions, "node.draft": { x: 900, y: 300, pinned: false } } }, Object.keys(initial.positions));
  assert.equal("node.draft" in beforeSave.positions, false);
  const afterSave = presentationForGraph(initial, [...Object.keys(initial.positions), "node.draft"]);
  assert.deepEqual(afterSave.positions["node.draft"], { x: 90, y: 250, pinned: false });
});

test("primary Companion exposes a repository-global Asset lifecycle register", () => {
  const html = renderToStaticMarkup(<AssetRegistryScreen api={{} as CompanionApi} />);
  assert.match(html, /Repository-global Asset authority/);
  assert.match(html, /Agent/);
  assert.match(html, /Workflow/);
  assert.match(html, /Tool/);
  assert.match(html, /New draft/);
  assert.doesNotMatch(html, /A2A<\/button>/);
});
