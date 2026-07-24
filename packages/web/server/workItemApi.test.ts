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
import { validateCreateEnrollmentInput } from "./codexBridgeStore.ts";
import { createWorkItemMiddleware } from "./workItemApi.ts";
import { createWorkItemRevision } from "./workItemRevision.ts";

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

  const bridge = await startCodexBridgeServer({ repoRoot, codexVersion: "test", port: 0 });
  t.after(() => bridge.close().catch(() => undefined));
  await enrollSession(bridge.store, repoRoot, workId, "session-exact");
  await enrollSession(bridge.store, repoRoot, workId, "session-other");

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
  assert.equal(workItem.review_gates.composition.status, "stale");
  assert.deepEqual(workItem.review_gates.composition.stale_reasons, ["graph_revision_changed"]);
  assert.equal(workItem.skills["af-scaffold-runtime"].status, "stale");
  assert.deepEqual(workItem.skills["af-scaffold-runtime"].output_refs, ["runtime-stub/agent.py"]);
  assert.deepEqual(workItem.skills["af-scaffold-runtime"].output_roots, ["runtime-stub"]);
  assert.equal(workItem.skills["af-verify-runtime"].status, "stale");
  assert.equal(workItem.verification.outcome, "stale");
  assert.deepEqual(workItem.verification.evidence_refs, ["validation-report.md"]);
  assert.equal(workItem.composition_cycles.filter((cycle) => cycle.status === "active").length, 1);
  assert.equal(workItem.composition_cycles.filter((cycle) => cycle.status === "superseded").length, 1);
  assert.deepEqual(
    workItem.invalidations.map((invalidation) => invalidation.target_skill),
    ["af-compose-solution", "af-scaffold-runtime", "af-verify-runtime"],
  );

  const snapshot = await bridge.store.snapshot();
  assert.equal(snapshot.deliveries.filter((delivery) => delivery.target_session_id === "session-exact").length, 1);
  assert.equal(snapshot.deliveries.filter((delivery) => delivery.target_session_id === "session-other").length, 0);
});

async function enrollSession(
  bridgeStore: Awaited<ReturnType<typeof startCodexBridgeServer>>["store"],
  repoRoot: string,
  workId: string,
  sessionId: string,
): Promise<void> {
  const receipt = await bridgeStore.createEnrollment(validateCreateEnrollmentInput({
    application_id: "work-item-api-test",
    work_id: workId,
    requested_role: "materialization",
    activation_origin: "af_cli_launch",
    hook_mode: "side_effect_gated",
  }));
  await bridgeStore.handleHook({
    session_id: sessionId,
    transcript_path: null,
    cwd: repoRoot,
    hook_event_name: "SessionStart",
    model: "gpt-test",
    permission_mode: "default",
    source: "startup",
    companion_proof: { kind: "activation", activation_capsule: receipt.activation_capsule },
  });
}

async function approveComposition(store: ArtifactRootStore, workId: string): Promise<void> {
  const result = await store.readWorkItem(workId);
  const at = "2030-01-01T00:00:00.000Z";
  const analysis = await store.readArtifact(workId, "analysis-result.json");
  const graphContent = `${JSON.stringify(JSON.parse(analysis.content).graph, null, 2)}\n`;
  await store.writeArtifact(workId, "graph-ir.json", graphContent, null);
  const strategyDecision = {
    decision_id: "decision-control-strategy",
    topic: "solution_control_strategy",
    required: true,
    options: ["single_agent"],
    recommended_option: "single_agent",
    selected_option: "single_agent",
    selected_by: "user" as const,
    selection_reason: "Fixture explicitly approves one local Agent.",
    evidence_refs: ["analysis-result.json"],
    catalog_refs: [],
    session_id: "review",
    turn_id: "turn-strategy",
    status: "resolved" as const,
    supersedes: null,
  };
  const rootDecision = {
    decision_id: "decision-root-executable",
    topic: "root_executable",
    required: true,
    options: ["agent.scenario-a"],
    recommended_option: "agent.scenario-a",
    selected_option: "agent.scenario-a",
    selected_by: "user" as const,
    selection_reason: "Fixture explicitly selects the approved Agent as root.",
    evidence_refs: ["analysis-result.json"],
    catalog_refs: [],
    session_id: "review",
    turn_id: "turn-root",
    status: "resolved" as const,
    supersedes: null,
  };
  const rootExecutable = {
    asset_type: "agent" as const,
    asset_ref: "agent.scenario-a",
    asset_version: 1,
    decision_id: rootDecision.decision_id,
  };
  const registryRevision = "f".repeat(64);
  const revision = (subjects: Parameters<typeof createWorkItemRevision>[0]) =>
    createWorkItemRevision(subjects, registryRevision);
  const revisions = {
    requirement: revision([{ ref: "analysis-result.json", content: analysis.content }]),
    decision: revision([{
      ref: "af-work-item.json#decisions",
      content: JSON.stringify([strategyDecision, rootDecision]),
    }]),
    asset_decision: revision([{ ref: "af-work-item.json#asset_decisions", content: "[]" }]),
    discovery: revision([{ ref: "analysis-result.json", content: analysis.content }]),
    catalog_snapshot: revision([{ ref: "catalog/asset-registry.json", content: "fixture-registry" }]),
    graph: revision([{ ref: "graph-ir.json", content: graphContent }]),
    root_executable: revision([{
      ref: "af-work-item.json#root_executable",
      content: JSON.stringify(rootExecutable),
    }]),
    runtime_contract: revision([{ ref: "analysis-result.json", content: analysis.content }]),
    composition: revision([
      { ref: "analysis-result.json", content: analysis.content },
      { ref: "graph-ir.json", content: graphContent },
    ]),
    scaffold: revision([{ ref: "runtime-stub/agent.py", content: "# generated fixture\n" }]),
    verification: revision([{ ref: "validation-report.md", content: "fixture passed\n" }]),
  };
  const complete = (inputRevision: typeof revisions.discovery, outputRevision: typeof revisions.discovery, refs: string[], roots: string[] = []) => ({
    status: "complete" as const,
    input_revision: inputRevision,
    output_revision: outputRevision,
    output_refs: refs,
    blocker_refs: [],
    output_roots: roots,
    started_at: at,
    updated_at: at,
    completed_at: at,
  });
  const manifest: AfWorkItemManifest = {
    ...result.manifest,
    ledger_revision: 1,
    focus_skill: "af-compose-solution",
    skills: {
      ...result.manifest.skills,
      "af-discover-assets": complete(revisions.requirement, revisions.discovery, ["analysis-result.json"]),
      "af-compose-solution": complete(revisions.discovery, revisions.composition, ["analysis-result.json", "graph-ir.json"]),
      "af-scaffold-runtime": complete(revisions.composition, revisions.scaffold, ["runtime-stub/agent.py"], ["runtime-stub"]),
      "af-verify-runtime": complete(revisions.scaffold, revisions.verification, ["validation-report.md"]),
    },
    revisions,
    discovery_cycles: [{
      cycle_id: "discovery-1",
      status: "complete",
      revision: revisions.discovery,
      supersedes_cycle_id: null,
      trigger: "initial",
      artifact_refs: ["analysis-result.json"],
      started_at: at,
      completed_at: at,
    }],
    composition_cycles: [{
      cycle_id: "composition-1",
      status: "complete",
      revision: revisions.composition,
      supersedes_cycle_id: null,
      artifact_refs: ["analysis-result.json", "graph-ir.json"],
      return_to_discover: null,
      started_at: at,
      completed_at: at,
    }],
    decisions: [strategyDecision, rootDecision],
    solution_control_strategy: "single_agent",
    root_executable: rootExecutable,
    review_gates: {
      discovery: {
        status: "approved",
        binding: {
          requirement_revision: revisions.requirement,
          decision_revision: revisions.decision,
          asset_decision_revision: revisions.asset_decision,
          discovery_revision: revisions.discovery,
          catalog_snapshot_revision: revisions.catalog_snapshot,
          artifact_etag: analysis.etag,
        },
        decided_at: at,
        session_id: "review",
        turn_id: "turn-discovery",
        stale_reasons: [],
      },
      composition: {
        status: "approved",
        binding: {
          discovery_revision: revisions.discovery,
          graph_revision: revisions.graph,
          root_executable_revision: revisions.root_executable,
          runtime_contract_revision: revisions.runtime_contract,
          composition_revision: revisions.composition,
          artifact_etag: analysis.etag,
        },
        decided_at: at,
        session_id: "review",
        turn_id: "turn-composition",
        stale_reasons: [],
      },
    },
    artifact_refs: ["analysis-result.json", "graph-ir.json", "runtime-stub/agent.py", "validation-report.md"],
    generated_output_roots: ["runtime-stub"],
    verification: {
      outcome: "passed",
      revision: revisions.verification,
      report_ref: "validation-report.md",
      evidence_refs: ["validation-report.md"],
      verified_at: at,
    },
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
