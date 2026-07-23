import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import type { AfWorkItemManifest } from "../src/analyzer/afWorkItem.ts";
import { ArtifactRootStore } from "./artifactRootStore.ts";
import { startCodexBridgeServer } from "./codexBridgeServer.ts";
import { createWorkItemMiddleware } from "./workItemApi.ts";

const execFileAsync = promisify(execFile);
const fixturePath = fileURLToPath(new URL(
  "../../../templates/regression-scenarios/scenario-a-simple-local-specialist/analysis-result.json",
  import.meta.url,
));

test("Graph PUT edits only Graph projections, invalidates downstream state, and targets one explicit Codex session", async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), "af-work-item-api-"));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  const workId = "req-scenario-a";
  const store = new ArtifactRootStore({ repoRoot });
  await store.createWorkItem(workId);
  const analysis = await readFile(fixturePath, "utf8");
  const originalAnalysis = JSON.parse(analysis);
  await store.writeArtifact(workId, "analysis-result.json", analysis, null);
  await approveComposition(store, workId);
  await writeFile(join(repoRoot, ".gitignore"), ".agent-factory/\n", "utf8");
  await git(repoRoot, ["init"]);
  await git(repoRoot, ["config", "user.email", "work-item@example.invalid"]);
  await git(repoRoot, ["config", "user.name", "Work Item Test"]);
  await git(repoRoot, ["add", "."]);
  await git(repoRoot, ["commit", "-m", "fixture"]);

  const bridge = await startCodexBridgeServer({ repoRoot, codexVersion: "test" });
  t.after(() => bridge.close().catch(() => undefined));
  await bridge.store.handleHook({
    session_id: "session-exact",
    transcript_path: null,
    cwd: repoRoot,
    hook_event_name: "SessionStart",
    model: "gpt-test",
    permission_mode: "default",
    source: "startup",
  });
  await bridge.store.handleHook({
    session_id: "session-other",
    transcript_path: null,
    cwd: repoRoot,
    hook_event_name: "SessionStart",
    model: "gpt-test",
    permission_mode: "default",
    source: "startup",
  });

  const middleware = createWorkItemMiddleware(repoRoot);
  const server = createServer((request, response) => {
    void middleware(request, response, (error) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : "middleware failure");
    });
  });
  t.after(() => close(server));
  const origin = await listen(server);

  const currentResponse = await fetch(`${origin}/${workId}/graph`);
  assert.equal(currentResponse.status, 200);
  const current = await currentResponse.json();
  const etag = currentResponse.headers.get("etag");
  assert.ok(etag);
  const nextGraph = structuredClone(current.graph);
  nextGraph.nodes[1].label = "Edited in Workbench";

  let response = await put(origin, workId, nextGraph, etag, "");
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "target_session_required");

  response = await put(origin, workId, nextGraph, "stale-etag", "session-exact");
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "etag_conflict");

  response = await put(origin, workId, nextGraph, etag, "session-exact");
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.graph.nodes[1].label, "Edited in Workbench");
  assert.equal(saved.delivery.target_session_id, "session-exact");
  assert.match(saved.delivery.bundle.user_intent.text, /^graph_change:/);

  const savedAnalysis = JSON.parse((await store.readArtifact(workId, "analysis-result.json")).content);
  const splitGraph = JSON.parse((await store.readArtifact(workId, "graph-ir.json")).content);
  assert.deepEqual(withoutGraph(savedAnalysis), withoutGraph(originalAnalysis));
  assert.deepEqual(splitGraph, savedAnalysis.graph);
  assert.equal(savedAnalysis.graph.nodes[1].label, "Edited in Workbench");

  const workItem = (await store.readWorkItem(workId)).manifest;
  assert.equal(workItem.skills["af-compose-solution"].status, "waiting_for_review");
  assert.equal(workItem.review_gates.composition.status, "pending");
  assert.equal(workItem.skills["af-scaffold-runtime"].status, "not_started");
  assert.equal(workItem.skills["af-verify-runtime"].status, "not_started");
  assert.equal(workItem.verification.outcome, null);

  const snapshot = await bridge.store.snapshot();
  assert.equal(snapshot.deliveries.filter((delivery) => delivery.target_session_id === "session-exact").length, 1);
  assert.equal(snapshot.deliveries.filter((delivery) => delivery.target_session_id === "session-other").length, 0);
});

async function approveComposition(store: ArtifactRootStore, workId: string): Promise<void> {
  const result = await store.readWorkItem(workId);
  const at = "2030-01-01T00:00:00.000Z";
  const complete = (refs: string[]) => ({
    status: "complete" as const,
    input_revision: "input",
    output_revision: "output",
    output_refs: refs,
    blocker_refs: [],
    output_roots: [],
    started_at: at,
    updated_at: at,
    completed_at: at,
  });
  const gate = (etag: string) => ({ status: "approved" as const, artifact_etag: etag, decided_at: at, session_id: "review", turn_id: "turn" });
  const manifest: AfWorkItemManifest = {
    ...result.manifest,
    active_skill: "af-compose-solution",
    skills: {
      ...result.manifest.skills,
      "af-discover-assets": complete(["analysis-result.json"]),
      "af-compose-solution": complete(["analysis-result.json", "graph-ir.json"]),
    },
    review_gates: { discovery: gate("a".repeat(64)), composition: gate("b".repeat(64)) },
  };
  await store.writeWorkItem(workId, manifest, result.etag);
}

async function put(origin: string, workId: string, graph: unknown, etag: string, targetSessionId: string): Promise<Response> {
  return fetch(`${origin}/${workId}/graph`, {
    method: "PUT",
    headers: { "content-type": "application/json", "if-match": etag, origin },
    body: JSON.stringify({ graph, target_session_id: targetSessionId }),
  });
}

async function git(repoRoot: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd: repoRoot, encoding: "utf8" });
}

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => resolveListen());
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function close(server: Server): Promise<void> {
  if (!server.listening) return;
  await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
}

function withoutGraph(value: Record<string, unknown>): Record<string, unknown> {
  const { graph: _graph, ...rest } = value;
  return rest;
}
