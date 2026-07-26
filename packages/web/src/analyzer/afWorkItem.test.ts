import assert from "node:assert/strict";
import test from "node:test";

import {
  createAfWorkItemManifest,
  parseAfWorkItemManifest,
  serializeAfWorkItemManifest,
  type AfAssetDecisionRecord,
  type AfDecisionRecord,
  type AfRevisionRef,
  type AfSessionHandoff,
  type AfWorkItemManifest,
} from "./afWorkItem.ts";

const at = "2030-01-01T00:00:00.000Z";
const later = "2030-01-02T00:00:00.000Z";

function revision(ref = "analysis-result.json", fill = "a", registryRevision: string | null = null): AfRevisionRef {
  return {
    digest: fill.repeat(64),
    subjects: [{ ref, sha256: fill.repeat(64) }],
    registry_revision: registryRevision,
  };
}

function resolvedDecision(
  decisionId: string,
  topic: string,
  selectedOption: string,
  options = [selectedOption],
): AfDecisionRecord {
  return {
    decision_id: decisionId,
    decision_revision: "1".repeat(64),
    topic,
    required: true,
    options,
    recommended_option: selectedOption,
    recommendation_revision: "2".repeat(64),
    selected_option: selectedOption,
    selected_by: "user",
    selection_source: "explicit_option",
    user_text_summary: `User explicitly selected option ${selectedOption}.`,
    decision_input_mode: "conversational",
    selection_reason: "사용자가 증거를 검토하고 선택함",
    evidence_refs: [],
    catalog_refs: [],
    session_id: "session-review",
    turn_id: `turn-${decisionId}`,
    status: "resolved",
    supersedes: null,
  };
}

function completeSkill(
  manifest: AfWorkItemManifest,
  skillId: keyof AfWorkItemManifest["skills"],
  output: AfRevisionRef,
): void {
  manifest.skills[skillId] = {
    ...manifest.skills[skillId],
    status: "complete",
    input_revision: revision("requirement.md", "1"),
    output_revision: output,
    output_refs: output.subjects.map((subject) => subject.ref),
    started_at: at,
    updated_at: later,
    completed_at: later,
  };
}

function handoff(id: string, markerFill: string): AfSessionHandoff {
  return {
    handoff_id: id,
    work_id: "req-handoff",
    from_session_id: "plan-session",
    from_turn_id: "plan-turn",
    discovery_revision: revision("analysis-result.json", "d"),
    decision_revision: revision("decisions.json", "e"),
    plan_hash: "f".repeat(64),
    target_skill: "af-discover-assets.materialize",
    status: "claimed",
    created_at: at,
    expires_at: later,
    marker_digest: markerFill.repeat(64),
    claimed_by_session_id: "materialize-session",
    claimed_turn_id: "materialize-turn",
    claimed_at: later,
    superseded_by_handoff_id: null,
  };
}

test("blank factory creates strict v2 pending state and roundtrips", () => {
  const manifest = createAfWorkItemManifest("req-live", new Date(at));

  assert.equal(manifest.schema_version, 2);
  assert.equal(manifest.ledger_revision, 0);
  assert.equal(manifest.work_id, "req-live");
  assert.equal(manifest.artifact_root, "artifacts/af/req-live");
  assert.equal(manifest.focus_skill, null);
  assert.deepEqual(manifest.active_runs, []);
  assert.deepEqual(Object.keys(manifest.skills), [
    "af-discover-assets",
    "af-compose-solution",
    "af-scaffold-runtime",
    "af-verify-runtime",
  ]);
  assert.ok(Object.values(manifest.skills).every((skill) => skill.status === "not_started"));
  assert.equal(manifest.review_gates.discovery.status, "pending");
  assert.equal(manifest.review_gates.composition.status, "pending");
  assert.equal(manifest.verification.outcome, null);
  assert.deepEqual(parseAfWorkItemManifest(serializeAfWorkItemManifest(manifest)), manifest);
});

test("rejects v1 and unknown lifecycle fields instead of migrating", () => {
  const manifest = createAfWorkItemManifest("req-v1") as unknown as Record<string, unknown>;
  manifest.schema_version = 1;
  assert.throws(() => parseAfWorkItemManifest(JSON.stringify(manifest)), /schema_version은 2/);

  const unknown = createAfWorkItemManifest("req-legacy") as unknown as Record<string, unknown>;
  unknown.active_skill = "af-discover-assets";
  assert.throws(() => parseAfWorkItemManifest(JSON.stringify(unknown)), /알 수 없는 필드.*active_skill/);
});

test("accepts Compose to Discover re-entry without a linear gate assumption", () => {
  const manifest = createAfWorkItemManifest("req-reentry", new Date(at));
  manifest.focus_skill = "af-discover-assets";
  manifest.skills["af-compose-solution"] = {
    ...manifest.skills["af-compose-solution"],
    status: "active",
    started_at: at,
    updated_at: at,
  };
  manifest.skills["af-discover-assets"] = {
    ...manifest.skills["af-discover-assets"],
    status: "active",
    started_at: at,
    updated_at: at,
  };
  manifest.active_runs = [
    {
      run_id: "run-compose",
      skill_id: "af-compose-solution",
      role: "compose",
      status: "active",
      session_id: "compose-session",
      parent_run_id: null,
      input_revision: revision("analysis-result.json", "a"),
      started_at: at,
      updated_at: at,
    },
    {
      run_id: "run-discover",
      skill_id: "af-discover-assets",
      role: "plan",
      status: "active",
      session_id: "discover-session",
      parent_run_id: null,
      input_revision: revision("requirement.md", "b"),
      started_at: at,
      updated_at: at,
    },
  ];
  manifest.discovery_cycles = [{
    cycle_id: "discover-2",
    status: "active",
    revision: null,
    supersedes_cycle_id: null,
    trigger: "return_to_discover",
    artifact_refs: [],
    started_at: at,
    completed_at: null,
  }];
  manifest.composition_cycles = [{
    cycle_id: "compose-1",
    status: "active",
    revision: null,
    supersedes_cycle_id: null,
    artifact_refs: [],
    return_to_discover: {
      return_id: "return-1",
      triggering_revision: revision("graph-ir.json", "c"),
      missing_capability: "reviewable approval tool",
      failed_asset_refs: ["tool.old-approval"],
      required_contract_delta: "add resumable approval result",
      graph_impact: "replace approval tool node",
      recommended_search_criteria: ["human approval", "resume"],
      open_decision_id: null,
      created_at: at,
    },
    started_at: at,
    completed_at: null,
  }];

  const parsed = parseAfWorkItemManifest(JSON.stringify(manifest));
  assert.equal(parsed.focus_skill, "af-discover-assets");
  assert.equal(parsed.composition_cycles[0].return_to_discover?.return_id, "return-1");
});

test("resolved decisions require complete user selection metadata", () => {
  const manifest = createAfWorkItemManifest("req-decision");
  manifest.decisions = [{
    ...resolvedDecision("decision.strategy", "solution_control_strategy", "hybrid"),
    selected_by: null,
  }];

  assert.throws(
    () => parseAfWorkItemManifest(JSON.stringify(manifest)),
    /resolved decision에는 user selection, selection_source, user_text_summary, decision_input_mode/,
  );

  manifest.decisions = [resolvedDecision("decision.strategy", "solution_control_strategy", "hybrid")];
  manifest.decisions[0].selection_source = "delegated_recommendation";
  manifest.decisions[0].selected_option = "single_agent";
  manifest.decisions[0].options.push("single_agent");
  assert.throws(
    () => parseAfWorkItemManifest(JSON.stringify(manifest)),
    /delegated_recommendation은 표시된 recommended_option만/,
  );
});

test("superseded selection provenance retains its decision input mode", () => {
  const manifest = createAfWorkItemManifest("req-superseded-decision");
  manifest.decisions = [{
    ...resolvedDecision("decision.superseded", "goal", "approved"),
    decision_input_mode: null,
    status: "superseded",
  }];
  assert.throws(
    () => parseAfWorkItemManifest(JSON.stringify(manifest)),
    /superseded decision의 selection metadata는 decision_input_mode를 포함해 모두 있어야/,
  );

  const assetDecision: AfAssetDecisionRecord = {
    asset_decision_id: "asset-decision.superseded",
    decision_revision: "3".repeat(64),
    asset_ref: "agent.synthetic",
    asset_type: "agent",
    asset_version: 1,
    required: true,
    match_grade: "exact",
    options: ["reuse_exact"],
    recommended_disposition: "reuse_exact",
    recommendation_revision: "4".repeat(64),
    selected_disposition: "reuse_exact",
    selected_by: "user",
    selection_source: "explicit_option",
    user_text_summary: "User explicitly selected disposition reuse_exact.",
    decision_input_mode: null,
    selection_reason: "Synthetic superseded selection.",
    evidence_refs: [],
    catalog_refs: ["agent.synthetic@1"],
    session_id: "session-review",
    turn_id: "turn-asset-superseded",
    status: "superseded",
    supersedes: null,
  };
  manifest.decisions = [];
  manifest.asset_decisions = [assetDecision];
  assert.throws(
    () => parseAfWorkItemManifest(JSON.stringify(manifest)),
    /superseded decision의 selection metadata는 decision_input_mode를 포함해 모두 있어야/,
  );
});

test("revision-bound discovery gate requires complete metadata and current revisions", () => {
  const manifest = createAfWorkItemManifest("req-gate", new Date(at));
  const registryRevision = "f".repeat(64);
  const requirement = revision("requirement.md", "1", registryRevision);
  const decision = revision("decisions.json", "2", registryRevision);
  const assetDecision = revision("asset-decisions.json", "3", registryRevision);
  const discovery = revision("analysis-result.json", "4", registryRevision);
  const catalog = revision("catalog/asset-registry.json", "5", registryRevision);
  Object.assign(manifest.revisions, {
    requirement,
    decision,
    asset_decision: assetDecision,
    discovery,
    catalog_snapshot: catalog,
  });
  completeSkill(manifest, "af-discover-assets", discovery);
  manifest.review_gates.discovery = {
    status: "approved",
    binding: {
      requirement_revision: requirement,
      decision_revision: decision,
      asset_decision_revision: assetDecision,
      discovery_revision: discovery,
      catalog_snapshot_revision: catalog,
      artifact_etag: "4".repeat(64),
    },
    decided_at: later,
    session_id: "review-session",
    turn_id: "review-turn",
    stale_reasons: [],
  };

  assert.equal(parseAfWorkItemManifest(JSON.stringify(manifest)).review_gates.discovery.status, "approved");

  const discoveryBinding = manifest.review_gates.discovery.binding;
  assert.ok(discoveryBinding);
  discoveryBinding.artifact_etag = "6".repeat(64);
  assert.throws(
    () => parseAfWorkItemManifest(JSON.stringify(manifest)),
    /bound discovery_revision의 analysis-result\.json subject/,
  );
  discoveryBinding.artifact_etag = "4".repeat(64);

  manifest.review_gates.discovery.session_id = null;
  assert.throws(
    () => parseAfWorkItemManifest(JSON.stringify(manifest)),
    /non-pending gate에는 binding, decided_at, session_id, turn_id/,
  );
});

test("stale gates retain old bindings without matching current revisions", () => {
  const manifest = createAfWorkItemManifest("req-stale-gate", new Date(at));
  const oldRevision = revision("analysis-result.json", "7");
  const registryRevision = "f".repeat(64);
  const currentRevision = revision("current.json", "8", registryRevision);
  const catalogRevision = revision("catalog/asset-registry.json", "9", registryRevision);
  Object.assign(manifest.revisions, {
    requirement: currentRevision,
    decision: currentRevision,
    asset_decision: currentRevision,
    discovery: currentRevision,
    catalog_snapshot: catalogRevision,
  });
  manifest.review_gates.discovery = {
    status: "stale",
    binding: {
      requirement_revision: oldRevision,
      decision_revision: oldRevision,
      asset_decision_revision: oldRevision,
      discovery_revision: oldRevision,
      catalog_snapshot_revision: oldRevision,
      artifact_etag: "7".repeat(64),
    },
    decided_at: at,
    session_id: "old-review-session",
    turn_id: "old-review-turn",
    stale_reasons: ["requirement revision changed"],
  };

  assert.equal(parseAfWorkItemManifest(JSON.stringify(manifest)).review_gates.discovery.status, "stale");
});

test("rejects duplicate handoff claims and incoherent pending claim metadata", () => {
  const manifest = createAfWorkItemManifest("req-handoff");
  manifest.session_handoffs = [handoff("handoff-1", "1"), handoff("handoff-2", "2")];
  assert.throws(() => parseAfWorkItemManifest(JSON.stringify(manifest)), /중복 claim/);

  const pending = handoff("handoff-pending", "3");
  pending.status = "pending";
  manifest.session_handoffs = [pending];
  assert.throws(() => parseAfWorkItemManifest(JSON.stringify(manifest)), /claimed가 아닌 handoff에는 claim metadata/);

  const wrongTarget = handoff("handoff-target", "4");
  (wrongTarget as unknown as { target_skill: string }).target_skill = "af-compose-solution";
  manifest.session_handoffs = [wrongTarget];
  assert.throws(() => parseAfWorkItemManifest(JSON.stringify(manifest)), /target_skill 값이 올바르지 않습니다/);
});

test("rejects unsorted revision subjects and output refs outside revision coverage", () => {
  const manifest = createAfWorkItemManifest("req-revision", new Date(at));
  manifest.skills["af-discover-assets"] = {
    ...manifest.skills["af-discover-assets"],
    status: "active",
    started_at: at,
    updated_at: at,
    input_revision: {
      digest: "a".repeat(64),
      subjects: [
        { ref: "z.json", sha256: "b".repeat(64) },
        { ref: "a.json", sha256: "c".repeat(64) },
      ],
      registry_revision: null,
    },
  };
  assert.throws(() => parseAfWorkItemManifest(JSON.stringify(manifest)), /subjects는 ref 오름차순/);

  manifest.skills["af-discover-assets"].input_revision = null;
  manifest.skills["af-discover-assets"].output_revision = revision("analysis-result.json", "d");
  manifest.skills["af-discover-assets"].output_refs = ["asset-candidates.json"];
  assert.throws(() => parseAfWorkItemManifest(JSON.stringify(manifest)), /output_revision subjects에 없습니다/);
});

test("requires non-empty revision subjects and one coherent Registry snapshot", () => {
  const manifest = createAfWorkItemManifest("req-registry-revision", new Date(at));
  const registryRevision = "f".repeat(64);
  manifest.revisions.catalog_snapshot = revision("catalog/asset-registry.json", "1", registryRevision);
  manifest.revisions.requirement = revision("requirement.md", "2", "e".repeat(64));
  assert.throws(
    () => parseAfWorkItemManifest(JSON.stringify(manifest)),
    /registry_revision은 catalog_snapshot과 일치/,
  );

  manifest.revisions.requirement = {
    digest: "3".repeat(64),
    subjects: [],
    registry_revision: registryRevision,
  };
  assert.throws(
    () => parseAfWorkItemManifest(JSON.stringify(manifest)),
    /하나 이상의 subject/,
  );
});

test("keeps solution strategy and root executable as separate user decisions", () => {
  const manifest = createAfWorkItemManifest("req-root");
  manifest.decisions = [
    resolvedDecision(
      "decision.strategy",
      "solution_control_strategy",
      "hybrid",
      ["single_agent", "agent_delegation", "explicit_workflow", "hybrid"],
    ),
    resolvedDecision("decision.root", "root_executable", "agent.coordinator"),
  ];
  manifest.solution_control_strategy = "hybrid";
  manifest.root_executable = {
    asset_type: "agent",
    asset_ref: "agent.coordinator",
    asset_version: 3,
    decision_id: "decision.root",
  };

  const parsed = parseAfWorkItemManifest(JSON.stringify(manifest));
  assert.equal(parsed.solution_control_strategy, "hybrid");
  assert.deepEqual(parsed.root_executable, {
    asset_type: "agent",
    asset_ref: "agent.coordinator",
    asset_version: 3,
    decision_id: "decision.root",
  });

  manifest.decisions[1] = resolvedDecision("decision.root", "unrelated_topic", "agent.coordinator");
  assert.throws(
    () => parseAfWorkItemManifest(JSON.stringify(manifest)),
    /resolved root_executable user decision/,
  );
});

test("passed verification exists if and only if Verify is complete", () => {
  const manifest = createAfWorkItemManifest("req-verify", new Date(at));
  const verified = revision("verification-report.json", "9");
  completeSkill(manifest, "af-verify-runtime", verified);

  assert.throws(
    () => parseAfWorkItemManifest(JSON.stringify(manifest)),
    /passed verification outcome과 complete af-verify-runtime은 함께/,
  );

  manifest.verification = {
    outcome: "passed",
    revision: verified,
    report_ref: "verification-report.json",
    evidence_refs: ["verification-report.json"],
    verified_at: later,
  };
  assert.equal(parseAfWorkItemManifest(JSON.stringify(manifest)).verification.outcome, "passed");

  manifest.skills["af-verify-runtime"].status = "stale";
  assert.throws(
    () => parseAfWorkItemManifest(JSON.stringify(manifest)),
    /passed verification outcome과 complete af-verify-runtime은 함께/,
  );
});

test("rejects duplicate IDs and ambiguous active cycles", () => {
  const manifest = createAfWorkItemManifest("req-duplicates", new Date(at));
  const open: AfDecisionRecord = {
    decision_id: "decision.same",
    decision_revision: "5".repeat(64),
    topic: "goal",
    required: true,
    options: ["a", "b"],
    recommended_option: "a",
    recommendation_revision: "6".repeat(64),
    selected_option: null,
    selected_by: null,
    selection_source: null,
    user_text_summary: null,
    decision_input_mode: "structured",
    selection_reason: null,
    evidence_refs: [],
    catalog_refs: [],
    session_id: null,
    turn_id: null,
    status: "open",
    supersedes: null,
  };
  manifest.decisions = [open, { ...open }];
  assert.throws(() => parseAfWorkItemManifest(JSON.stringify(manifest)), /decision_id는 중복/);

  manifest.decisions = [];
  manifest.discovery_cycles = ["discover-1", "discover-2"].map((cycleId) => ({
    cycle_id: cycleId,
    status: "active" as const,
    revision: null,
    supersedes_cycle_id: null,
    trigger: "initial" as const,
    artifact_refs: [],
    started_at: at,
    completed_at: null,
  }));
  assert.throws(() => parseAfWorkItemManifest(JSON.stringify(manifest)), /active cycle이 하나만/);
});
