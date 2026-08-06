import assert from "node:assert/strict";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createDemoGraph, createDemoPresentation, graphRevision } from "@agent-factory/companion-graph-domain";
import { finalizeUiContextDocument } from "@agent-factory/companion-contracts";
import { createGraphMcpServer } from "../src/index.js";

test("exposes exactly get and write Tools with honest annotations", async () => {
  const graph = createDemoGraph(); const revision = graphRevision(graph); const context = finalizeUiContextDocument({ schema_version: 2, authority: "none", graph_revision: revision, published_at: new Date().toISOString(), scope: { workspace_id: "w", application_id: "a", work_id: "x" }, graph, active_selection: null, active_draft: null, recent_changes: [], source_health: { status: "valid", observed_at: new Date().toISOString(), graph_revision: revision } });
  const control = { getWorkspace: async () => ({ ...context, presentation: createDemoPresentation() }), getDevelopmentContext: async () => { throw new Error("not requested"); }, applyChanges: async () => ({ outcome: "NO_CHANGE" as const, workspace: { ...context, presentation: createDemoPresentation() } }) };
  const server = createGraphMcpServer(control); const client = new Client({ name: "test", version: "1" }); const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair(); await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const listed = await client.listTools(); assert.deepEqual(listed.tools.map((tool) => tool.name), ["companion_get_graph_workspace", "companion_apply_graph_changes"]); assert.equal(listed.tools[1]?.annotations?.readOnlyHint, false);
  assert.match(listed.tools[0]?.description ?? "", /workspace\.scope\.application_id/u);
  assert.match(listed.tools[1]?.description ?? "", /exactly \{ base_graph_revision, operations \}/u);
  const get = await client.callTool({ name: "companion_get_graph_workspace", arguments: {} }); assert.equal(get.isError, false);
  await client.close(); await server.close();
});

test("extends the read-only workspace Tool with an optional bounded development capsule", async () => {
  const graph = createDemoGraph(); const revision = graphRevision(graph); const context = finalizeUiContextDocument({ schema_version: 2, authority: "none", graph_revision: revision, published_at: new Date().toISOString(), scope: { workspace_id: "w", application_id: "a", work_id: "x" }, graph, active_selection: { kind: "node", id: "node.reviewer" }, active_draft: null, recent_changes: [], source_health: { status: "valid", observed_at: new Date().toISOString(), graph_revision: revision } });
  const requests: unknown[] = [];
  const capsule = { schema_version: 1, capsule_id: "c".repeat(64), primary_intent: "implement_selected_element" };
  const control = {
    getWorkspace: async () => ({ ...context, presentation: createDemoPresentation() }),
    getDevelopmentContext: async (request: unknown) => { requests.push(request); return capsule as never; },
    applyChanges: async () => ({ outcome: "NO_CHANGE" as const, workspace: { ...context, presentation: createDemoPresentation() } }),
  };
  const server = createGraphMcpServer(control); const client = new Client({ name: "test", version: "1" }); const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair(); await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name), ["companion_get_graph_workspace", "companion_apply_graph_changes"]);
  assert.ok("development_task" in (listed.tools[0]?.inputSchema.properties ?? {}));
  const result = await client.callTool({ name: "companion_get_graph_workspace", arguments: { expected_application_id: "a", development_task: { expected_graph_revision: revision, source_project_id: "review-runtime", primary_intent: "implement_selected_element" } } });
  assert.equal(result.isError, false);
  assert.deepEqual((result.structuredContent as Record<string, unknown>).development_context, capsule);
  assert.deepEqual(requests, [{ expected_application_id: "a", expected_graph_revision: revision, source_project_id: "review-runtime", primary_intent: "implement_selected_element" }]);
  await client.close(); await server.close();
});
