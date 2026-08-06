import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { startCompanionWeb } from "@agent-factory/companion-web";

const registryRevision = "a".repeat(64);
const assetCatalog = { snapshotRevision: () => registryRevision, search: () => ({ registry_revision: registryRevision, results: [] }), resolveExact: () => { throw new Error("not used"); } };
const mcpBin = resolve("mcp-plane/dist/bin.js");

test("App switch denies the old persistent MCP process and a new process reads the new App", async (t) => {
  const applicationsRoot = await mkdtemp(join(tmpdir(), "companion-app-mcp-"));
  const web = await startCompanionWeb({ applicationsRoot, assetCatalog, mcpBinPath: mcpBin, port: 0 });
  const clients = [];
  t.after(async () => { await Promise.all(clients.map((client) => client.close().catch(() => undefined))); await web.close(); await rm(applicationsRoot, { recursive: true, force: true }); });
  await createApp(web.origin, "first-app", "첫 App");
  const first = await connect(join(applicationsRoot, "first-app")); clients.push(first);
  const initial = await first.callTool({ name: "companion_get_graph_workspace", arguments: {} });
  assert.equal(initial.isError, false); assert.equal(initial.structuredContent.workspace.scope.application_id, "first-app");
  await createApp(web.origin, "second-app", "둘째 App");
  const denied = await first.callTool({ name: "companion_get_graph_workspace", arguments: {} });
  assert.equal(denied.isError, true); assert.deepEqual(denied.structuredContent.reasons, ["app_inactive"]);
  const second = await connect(join(applicationsRoot, "second-app")); clients.push(second);
  const active = await second.callTool({ name: "companion_get_graph_workspace", arguments: {} });
  assert.equal(active.isError, false); assert.equal(active.structuredContent.workspace.scope.application_id, "second-app"); assert.equal(active.structuredContent.workspace.scope.work_id, null);
});

async function connect(projectRoot) { const client = new Client({ name: "app-manager-integration", version: "0.1.0" }); await client.connect(new StdioClientTransport({ command: process.execPath, args: [mcpBin, "--project-root", projectRoot], stderr: "pipe" })); return client; }
async function createApp(origin, application_id, display_name) { const response = await fetch(`${origin}/api/companion/apps`, { method: "POST", headers: { "Content-Type": "application/json", "Sec-Fetch-Site": "same-origin" }, body: JSON.stringify({ application_id, display_name }) }); const body = await response.json(); assert.equal(response.status, 201, JSON.stringify(body)); }
