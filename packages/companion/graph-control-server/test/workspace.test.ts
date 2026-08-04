import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createDemoGraph } from "@agent-factory/companion-graph-domain";
import { GraphControlWorkspace, GraphStaleError, InvalidExternalSourceError } from "../src/index.js";

test("reconciles valid external edits, blocks invalid source, and recovers", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "companion-control-")); const workspace = new GraphControlWorkspace({ projectRoot: root }); await workspace.initialize();
  t.after(async () => { await workspace.close(); await rm(root, { recursive: true, force: true }); });
  const initial = await workspace.snapshot(); const graph = structuredClone(initial.graph); graph.nodes.find((node) => node.id === "node.output")!.label = "결과 정리 변경";
  await writeFile(join(root, ".agent-factory", "companion-graph.json"), JSON.stringify(graph), "utf8");
  const external = await workspace.snapshot(); assert.equal(external.graph.nodes.find((node) => node.id === "node.output")?.label, "결과 정리 변경");
  await writeFile(join(root, ".agent-factory", "companion-graph.json"), "{", "utf8");
  assert.equal((await workspace.snapshot()).source_health.status, "invalid");
  await assert.rejects(() => workspace.updateSelection({ kind: "node", id: "node.input" }), InvalidExternalSourceError);
  await writeFile(join(root, ".agent-factory", "companion-graph.json"), JSON.stringify(createDemoGraph(), null, 4), "utf8");
  assert.equal((await workspace.snapshot()).source_health.status, "valid");
});

test("serializes stale writes and keeps presentation outside Graph revision", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "companion-control-")); const workspace = new GraphControlWorkspace({ projectRoot: root }); await workspace.initialize();
  t.after(async () => { await workspace.close(); await rm(root, { recursive: true, force: true }); });
  const initial = await workspace.snapshot(); const operation = { op: "replace" as const, target: "node" as const, id: "node.output", value: { id: "node.output", label: "완료", node_kind: "output" as const } };
  const first = await workspace.apply(initial.graph_revision, [operation], "mcp"); assert.equal(first.outcome, "APPLIED");
  const noChange = await workspace.apply(first.workspace.graph_revision, [operation], "mcp"); assert.equal(noChange.outcome, "NO_CHANGE"); assert.equal(noChange.workspace.graph_revision, first.workspace.graph_revision);
  await assert.rejects(() => workspace.apply(initial.graph_revision, [operation], "web"), GraphStaleError);
  const beforeSnapshot = await workspace.snapshot(); const presentation = structuredClone(beforeSnapshot.presentation); presentation.positions["node.output"]!.x += 80;
  await workspace.updatePresentation(presentation); const afterPresentation = await workspace.snapshot(); assert.equal(afterPresentation.graph_revision, beforeSnapshot.graph_revision); assert.equal(afterPresentation.document_revision, beforeSnapshot.document_revision);
  assert.match(await readFile(join(root, ".agent-factory", "companion-ui-context.json"), "utf8"), /"schema_version": 2/);
});

test("rejects symlinked and oversized external Graph sources", async () => {
  const symlinkRoot = await mkdtemp(join(tmpdir(), "companion-symlink-")); const external = join(symlinkRoot, "external.json"); await writeFile(external, JSON.stringify(createDemoGraph()), "utf8");
  await mkdir(join(symlinkRoot, ".agent-factory"), { recursive: true }); await symlink(external, join(symlinkRoot, ".agent-factory", "companion-graph.json"));
  await assert.rejects(() => new GraphControlWorkspace({ projectRoot: symlinkRoot }).initialize(), /Symlink|symbolic|symlink/i); await rm(symlinkRoot, { recursive: true, force: true });
  const largeRoot = await mkdtemp(join(tmpdir(), "companion-large-")); await mkdir(join(largeRoot, ".agent-factory"), { recursive: true }); await writeFile(join(largeRoot, ".agent-factory", "companion-graph.json"), " ".repeat(8 * 1024 * 1024 + 1), "utf8");
  await assert.rejects(() => new GraphControlWorkspace({ projectRoot: largeRoot }).initialize(), /exceeds|large/i); await rm(largeRoot, { recursive: true, force: true });
});
