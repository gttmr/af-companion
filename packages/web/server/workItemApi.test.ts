import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

import {
  createAfWorkItemManifest,
  parseAfWorkItemManifest,
  type AfWorkItemManifest,
} from "../src/analyzer/afWorkItem.ts";
import { ArtifactRootStore } from "./artifactRootStore.ts";
import { startCodexBridgeServer } from "./codexBridgeServer.ts";
import { validateCreateEnrollmentInput } from "./codexBridgeStore.ts";
import {
  createWorkItemMiddleware,
  type BootstrapCommandRunner,
} from "./workItemApi.ts";
import { createWorkItemRevision } from "./workItemRevision.ts";

const execFileAsync = promisify(execFile);
const fixturePath = fileURLToPath(new URL(
  "../../../templates/regression-scenarios/scenario-a-simple-local-specialist/analysis-result.json",
  import.meta.url,
));

test("POST /api/work-items creates the exact empty ledger, application git root, MCP export, and private local registry", async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), "af-work-bootstrap-repo-"));
  const applicationsRoot = await mkdtemp(join(tmpdir(), "af-work-bootstrap-apps-"));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  t.after(() => rm(applicationsRoot, { recursive: true, force: true }));
  const commands: CapturedCommand[] = [];
  const middleware = createWorkItemMiddleware(repoRoot, undefined, {
    applicationsRoot,
    commandRunner: testBootstrapCommandRunner(commands),
  });
  const server = bootstrapServer(middleware);
  t.after(() => close(server));
  const origin = await listen(server);

  const response = await postBootstrap(origin, {
    application_name: "Journey Acceptance",
    application_root_confirmed: true,
    confirmation: "CREATE_WORK_ITEM",
  });
  assert.equal(response.status, 201);
  const applicationRoot = join(applicationsRoot, "journey-acceptance");
  assert.deepEqual(await response.json(), {
    work_id: "journey-acceptance",
    artifact_root: "artifacts/af/journey-acceptance",
    application_id: "journey-acceptance",
    application_root: applicationRoot,
    created_application_dir: true,
  });

  const ledgerPath = join(repoRoot, "artifacts/af/journey-acceptance/af-work-item.json");
  const manifest = parseAfWorkItemManifest(await readFile(ledgerPath, "utf8"), ledgerPath);
  const initializedAt = manifest.skills["af-discover-assets"].updated_at;
  assert.deepEqual(manifest, createAfWorkItemManifest("journey-acceptance", new Date(initializedAt)));
  assert.equal("application_id" in manifest, false);
  assert.equal("application_root" in manifest, false);

  assert.equal((await stat(join(applicationRoot, ".git"))).isDirectory(), true);
  assert.equal((await stat(join(applicationRoot, ".codex/config.toml"))).isFile(), true);
  assert.deepEqual(JSON.parse(await readFile(join(applicationRoot, ".agent-factory/af-context.json"), "utf8")), {
    application_id: "journey-acceptance",
    work_id: "journey-acceptance",
  });

  const registryPath = join(repoRoot, ".agent-factory/applications/registry.json");
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  assert.equal((await stat(registryPath)).mode & 0o777, 0o600);
  assert.equal(registry.schema_version, 1);
  assert.equal(registry.applications.length, 1);
  assert.deepEqual(registry.applications[0], {
    application_id: "journey-acceptance",
    application_root: applicationRoot,
    work_id: "journey-acceptance",
    created_at: registry.applications[0].created_at,
  });
  assert.equal(new Date(registry.applications[0].created_at).toISOString(), registry.applications[0].created_at);

  assert.deepEqual(commands.map(({ executable, args }) => ({ executable, args })), [
    {
      executable: "git",
      args: ["init", "--", applicationRoot],
    },
    {
      executable: process.execPath,
      args: [
        join(repoRoot, "scripts/af.mjs"),
        "mcp",
        "export-context",
        "journey-acceptance",
        "--application",
        "journey-acceptance",
        "--application-root",
        applicationRoot,
        "--root",
        repoRoot,
      ],
    },
  ]);
});

test("POST /api/work-items rejects unsafe or non-idempotent requests before writing", async (t) => {
  const repoRoot = await mkdtemp(join(tmpdir(), "af-work-bootstrap-negative-repo-"));
  const applicationsRoot = await mkdtemp(join(tmpdir(), "af-work-bootstrap-negative-apps-"));
  t.after(() => rm(repoRoot, { recursive: true, force: true }));
  t.after(() => rm(applicationsRoot, { recursive: true, force: true }));
  const commands: CapturedCommand[] = [];
  const middleware = createWorkItemMiddleware(repoRoot, undefined, {
    applicationsRoot,
    commandRunner: testBootstrapCommandRunner(commands),
  });
  const server = bootstrapServer(middleware);
  t.after(() => close(server));
  const origin = await listen(server);

  let response = await postBootstrap(origin, {
    application_name: "Missing Confirmation",
    application_root_confirmed: true,
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "confirmation_required");

  response = await postBootstrap(origin, validBootstrapBody("../escape"));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "invalid_application_name");

  response = await postBootstrap(origin, validBootstrapBody("Cross Origin"), { origin: "https://evil.example" });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "same_origin_required");

  response = await postBootstrap(origin, validBootstrapBody("Remote Peer"), {
    connection: "close",
    "x-test-remote-address": "203.0.113.8",
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "loopback_required");

  response = await fetch(origin, {
    method: "POST",
    headers: { "content-type": "text/plain", origin },
    body: JSON.stringify(validBootstrapBody("Wrong Content Type")),
  });
  assert.equal(response.status, 415);
  assert.equal((await response.json()).code, "json_content_type_required");

  response = await postBootstrap(origin, {
    ...validBootstrapBody("Body Too Large"),
    padding: "x".repeat(4_096),
  });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, "body_too_large");

  await mkdir(join(applicationsRoot, "occupied"), { recursive: true });
  await writeFile(join(applicationsRoot, "occupied/README.md"), "existing\n", "utf8");
  response = await postBootstrap(origin, validBootstrapBody("Occupied"));
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, "application_directory_not_empty");

  for (const workId of ["missing-confirmation", "escape", "cross-origin", "remote-peer", "wrong-content-type", "body-too-large", "occupied"]) {
    await assert.rejects(stat(join(repoRoot, `artifacts/af/${workId}/af-work-item.json`)), { code: "ENOENT" });
  }
  assert.equal(commands.length, 0);
  await assert.rejects(stat(join(repoRoot, ".agent-factory/applications/registry.json")), { code: "ENOENT" });

  response = await postBootstrap(origin, { ...validBootstrapBody("Occupied"), reuse_existing: true });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).created_application_dir, false);
  assert.equal(await readFile(join(applicationsRoot, "occupied/README.md"), "utf8"), "existing\n");

  response = await postBootstrap(origin, validBootstrapBody("Occupied"));
  assert.equal(response.status, 409);
  const duplicate = await response.json();
  assert.equal(duplicate.code, "identifier_conflict");
  assert.equal(duplicate.suggested_application_id, "occupied-2");
  assert.equal(duplicate.suggested_work_id, "occupied-2");
});

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
    decision_revision: "1".repeat(64),
    topic: "solution_control_strategy",
    required: true,
    options: ["single_agent"],
    recommended_option: "single_agent",
    recommendation_revision: "2".repeat(64),
    selected_option: "single_agent",
    selected_by: "user" as const,
    selection_source: "explicit_option" as const,
    user_text_summary: "User explicitly selected option single_agent.",
    decision_input_mode: "conversational" as const,
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
    decision_revision: "3".repeat(64),
    topic: "root_executable",
    required: true,
    options: ["agent.scenario-a"],
    recommended_option: "agent.scenario-a",
    recommendation_revision: "4".repeat(64),
    selected_option: "agent.scenario-a",
    selected_by: "user" as const,
    selection_source: "explicit_option" as const,
    user_text_summary: "User explicitly selected option agent.scenario-a.",
    decision_input_mode: "conversational" as const,
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

interface CapturedCommand {
  executable: string;
  args: string[];
  cwd: string;
}

function testBootstrapCommandRunner(commands: CapturedCommand[]): BootstrapCommandRunner {
  return async (executable, args, options) => {
    commands.push({ executable, args: [...args], cwd: options.cwd });
    if (executable === "git") {
      await execFileAsync(executable, [...args], { cwd: options.cwd, encoding: "utf8" });
      return;
    }
    const applicationRootIndex = args.indexOf("--application-root");
    assert.notEqual(applicationRootIndex, -1);
    const applicationRoot = args[applicationRootIndex + 1];
    const applicationIndex = args.indexOf("--application");
    assert.notEqual(applicationIndex, -1);
    const applicationId = args[applicationIndex + 1];
    const workId = args[3];
    assert.ok(applicationRoot && applicationId && workId);
    await mkdir(join(applicationRoot, ".codex"), { recursive: true });
    await mkdir(join(applicationRoot, ".agent-factory"), { recursive: true });
    await writeFile(join(applicationRoot, ".codex/config.toml"), "[mcp_servers.agent_factory]\n", "utf8");
    await writeFile(
      join(applicationRoot, ".agent-factory/af-context.json"),
      `${JSON.stringify({ application_id: applicationId, work_id: workId }, null, 2)}\n`,
      "utf8",
    );
  };
}

function bootstrapServer(middleware: ReturnType<typeof createWorkItemMiddleware>): Server {
  return createServer((request, response) => {
    if (request.headers["x-test-remote-address"]) {
      Object.defineProperty(request.socket, "remoteAddress", {
        configurable: true,
        value: request.headers["x-test-remote-address"],
      });
    }
    void middleware(request, response, (error) => {
      response.statusCode = 500;
      response.end(error instanceof Error ? error.message : "middleware failure");
    });
  });
}

function validBootstrapBody(applicationName: string): Record<string, unknown> {
  return {
    application_name: applicationName,
    application_root_confirmed: true,
    confirmation: "CREATE_WORK_ITEM",
  };
}

async function postBootstrap(
  origin: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  return fetch(origin, {
    method: "POST",
    headers: { "content-type": "application/json", origin, ...extraHeaders },
    body: JSON.stringify(body),
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
