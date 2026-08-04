import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startCompanionWeb } from "@agent-factory/companion-web";

const mcpBin = resolve("mcp-plane/dist/bin.js");

test("persistent MCP get → apply updates Web and external-invalid blocks writes", async (t) => {
  const projectRoot = await mkdtemp(join(tmpdir(), "companion-v2-integration-")); const web = await startCompanionWeb({ projectRoot, port: 0 });
  const transport = new StdioClientTransport({ command: process.execPath, args: [mcpBin, "--project-root", projectRoot], stderr: "pipe" }); const client = new Client({ name: "companion-integration", version: "0.2.0" });
  t.after(async () => { await client.close().catch(() => undefined); await web.close(); await rm(projectRoot, { recursive: true, force: true }); }); await client.connect(transport);
  const listed = await client.listTools(); assert.deepEqual(listed.tools.map((tool) => tool.name), ["companion_get_graph_workspace", "companion_apply_graph_changes"]);
  const events = await openEvents(`${web.origin}/api/companion/v2/events`);
  const first = await call(client, "companion_get_graph_workspace", {}); assert.equal(first.status, "VERIFIED"); const revision = first.workspace.graph_revision;
  const selection = await request(`${web.origin}/api/companion/v2/selection`, "PUT", { selection: { kind: "node", id: "node.output" } }); assert.equal(selection.active_selection.id, "node.output");
  await request(`${web.origin}/api/companion/v2/draft`, "PUT", { base_graph_revision: revision, operations: [{ op: "replace", target: "node", id: "node.output", value: { id: "node.output", label: "Web draft", node_kind: "output" } }] });
  const applied = await call(client, "companion_apply_graph_changes", { base_graph_revision: revision, operations: [{ op: "replace", target: "node", id: "node.output", value: { id: "node.output", label: "Codex 결과 정리", node_kind: "output" } }] }); assert.equal(applied.status, "APPLIED"); assert.equal(applied.workspace.active_draft, null); assert.equal(applied.workspace.active_selection.id, "node.output");
  const event = await events.next("graph_mcp"); assert.equal(event.discarded_draft_count, 1); assert.deepEqual(event.changed_nodes, ["node.output"]); events.close();
  const browser = await (await fetch(`${web.origin}/api/companion/v2/workspace`)).json(); assert.equal(browser.graph.nodes.find((node) => node.id === "node.output").label, "Codex 결과 정리");
  await writeFile(join(projectRoot, ".agent-factory", "companion-graph.json"), "{", "utf8"); const invalid = await call(client, "companion_get_graph_workspace", {}); assert.equal(invalid.workspace.source_health.status, "invalid");
  const blocked = await client.callTool({ name: "companion_apply_graph_changes", arguments: { base_graph_revision: invalid.workspace.graph_revision, operations: [{ op: "replace", target: "node", id: "node.output", value: { id: "node.output", label: "blocked", node_kind: "output" } }] } }); assert.equal(blocked.isError, true); assert.equal(blocked.structuredContent.reasons[0], "invalid_external_source");
});

async function call(client, name, args) { const result = await client.callTool({ name, arguments: args }); assert.equal(result.isError, false, JSON.stringify(result.structuredContent)); return result.structuredContent; }
async function request(url, method, body) { const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const value = await response.json(); assert.equal(response.ok, true, JSON.stringify(value)); return value; }
async function openEvents(url) { const controller = new AbortController(); const response = await fetch(url, { signal: controller.signal }); assert.equal(response.ok, true); const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; return { async next(reason) { const deadline = Date.now() + 3000; while (Date.now() < deadline) { const result = await reader.read(); if (result.done) break; buffer += decoder.decode(result.value, { stream: true }); for (const block of buffer.split("\n\n")) { const data = block.split("\n").find((line) => line.startsWith("data: ")); if (data) { const event = JSON.parse(data.slice(6)); if (event.reason === reason) return event; } } buffer = buffer.slice(buffer.lastIndexOf("\n\n") + 2); } throw new Error(`SSE event ${reason} was not observed`); }, close() { controller.abort(); } }; }
