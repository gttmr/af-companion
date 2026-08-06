import assert from "node:assert/strict";
import test from "node:test";
import { createDemoGraph, graphRevision } from "@agent-factory/companion-graph-domain";
import { finalizeUiContextDocument, parseUiContextDocument, serializeUiContextDocument } from "../src/index.js";

test("Context v2 has independent document and Graph revisions without sequence", () => {
  const graph = createDemoGraph(); const revision = graphRevision(graph);
  const document = finalizeUiContextDocument({
    schema_version: 2, authority: "none", graph_revision: revision,
    published_at: "2026-08-03T00:00:00.000Z",
    scope: { workspace_id: "workspace.demo", application_id: "companion-greenfield", work_id: "document-review-demo" },
    graph, active_selection: { kind: "node", id: "node.reviewer" }, active_draft: null, recent_changes: [],
    source_health: { status: "valid", observed_at: "2026-08-03T00:00:00.000Z", graph_revision: revision },
  });
  const parsed = parseUiContextDocument(serializeUiContextDocument(document));
  assert.equal(parsed.graph_revision, revision);
  assert.equal("sequence" in parsed, false);
  assert.notEqual(parsed.document_revision, parsed.graph_revision);
});

test("tampered Context revision fails closed", () => {
  const graph = createDemoGraph(); const revision = graphRevision(graph);
  const document = finalizeUiContextDocument({ schema_version: 2, authority: "none", graph_revision: revision, published_at: new Date().toISOString(), scope: { workspace_id: "w", application_id: "a", work_id: "x" }, graph, active_selection: null, active_draft: null, recent_changes: [], source_health: { status: "valid", observed_at: new Date().toISOString(), graph_revision: revision } });
  assert.throws(() => parseUiContextDocument({ ...document, published_at: "2026-01-01T00:00:00.000Z" }), /revision does not match/);
});

test("App workspace Context explicitly represents the absence of a Work Item", () => {
  const graph = createDemoGraph(); const revision = graphRevision(graph);
  const document = finalizeUiContextDocument({ schema_version: 2, authority: "none", graph_revision: revision, published_at: new Date().toISOString(), scope: { workspace_id: "workspace.app", application_id: "app", work_id: null }, graph, active_selection: null, active_draft: null, recent_changes: [], source_health: { status: "valid", observed_at: new Date().toISOString(), graph_revision: revision } });
  assert.equal(parseUiContextDocument(serializeUiContextDocument(document)).scope.work_id, null);
});
