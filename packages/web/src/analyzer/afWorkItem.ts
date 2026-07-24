export const afWorkSkillIds = [
  "af-discover-assets",
  "af-compose-solution",
  "af-scaffold-runtime",
  "af-verify-runtime"
] as const;

export const afWorkSkillStatuses = [
  "not_started",
  "active",
  "waiting_for_input",
  "waiting_for_review",
  "complete",
  "blocked",
  "failed",
  "stale"
] as const;

export const afReviewGateStatuses = ["pending", "approved", "changes_requested", "stale"] as const;
export const afVerificationOutcomes = ["passed", "failed", "unverified", "stale"] as const;
export const afSolutionControlStrategies = [
  "single_agent",
  "agent_delegation",
  "explicit_workflow",
  "hybrid"
] as const;
export const afAssetDispositions = [
  "reuse_exact",
  "reuse_new_version",
  "compose_existing",
  "create_project_draft",
  "create_publish_candidate",
  "defer",
  "exclude"
] as const;
export const afAssetMatchGrades = ["exact", "compatible", "partial", "none"] as const;

export type AfWorkSkillId = (typeof afWorkSkillIds)[number];
export type AfWorkSkillStatus = (typeof afWorkSkillStatuses)[number];
export type AfReviewGateStatus = (typeof afReviewGateStatuses)[number];
export type AfVerificationOutcome = (typeof afVerificationOutcomes)[number];
export type AfSolutionControlStrategy = (typeof afSolutionControlStrategies)[number];
export type AfAssetDisposition = (typeof afAssetDispositions)[number];
export type AfAssetMatchGrade = (typeof afAssetMatchGrades)[number];

export interface AfRevisionSubject {
  ref: string;
  sha256: string;
}

export interface AfRevisionRef {
  digest: string;
  subjects: AfRevisionSubject[];
  registry_revision: string | null;
}

export interface AfWorkSkillState {
  status: AfWorkSkillStatus;
  input_revision: AfRevisionRef | null;
  output_revision: AfRevisionRef | null;
  output_refs: string[];
  blocker_refs: string[];
  output_roots: string[];
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
}

export interface AfActiveRun {
  run_id: string;
  skill_id: AfWorkSkillId;
  role: "plan" | "planning_subagent" | "materializer" | "compose" | "scaffold" | "verify";
  status: "active" | "waiting_for_input" | "waiting_for_review";
  session_id: string;
  parent_run_id: string | null;
  input_revision: AfRevisionRef | null;
  started_at: string;
  updated_at: string;
}

export interface AfDiscoveryCycle {
  cycle_id: string;
  status: "active" | "complete" | "superseded";
  revision: AfRevisionRef | null;
  supersedes_cycle_id: string | null;
  trigger: "initial" | "return_to_discover" | "invalidation";
  artifact_refs: string[];
  started_at: string;
  completed_at: string | null;
}

interface AfCycleBase {
  cycle_id: string;
  status: "active" | "complete" | "superseded";
  revision: AfRevisionRef | null;
  supersedes_cycle_id: string | null;
  artifact_refs: string[];
  started_at: string;
  completed_at: string | null;
}

export interface AfReturnToDiscover {
  return_id: string;
  triggering_revision: AfRevisionRef;
  missing_capability: string;
  failed_asset_refs: string[];
  required_contract_delta: string;
  graph_impact: string;
  recommended_search_criteria: string[];
  open_decision_id: string | null;
  created_at: string;
}

export interface AfCompositionCycle {
  cycle_id: string;
  status: "active" | "complete" | "superseded";
  revision: AfRevisionRef | null;
  supersedes_cycle_id: string | null;
  artifact_refs: string[];
  return_to_discover: AfReturnToDiscover | null;
  started_at: string;
  completed_at: string | null;
}

export interface AfDecisionRecord {
  decision_id: string;
  decision_revision: string;
  topic: string;
  required: boolean;
  options: string[];
  recommended_option: string | null;
  recommendation_revision: string | null;
  selected_option: string | null;
  selected_by: "user" | null;
  selection_source: "explicit_option" | "delegated_recommendation" | null;
  user_text_summary: string | null;
  decision_input_mode: "structured" | "conversational" | null;
  selection_reason: string | null;
  evidence_refs: string[];
  catalog_refs: string[];
  session_id: string | null;
  turn_id: string | null;
  status: "open" | "resolved" | "superseded";
  supersedes: string | null;
}

export interface AfAssetDecisionRecord {
  asset_decision_id: string;
  decision_revision: string;
  asset_ref: string;
  asset_type: "agent" | "workflow" | "tool";
  asset_version: number | null;
  required: boolean;
  match_grade: AfAssetMatchGrade;
  options: AfAssetDisposition[];
  recommended_disposition: AfAssetDisposition | null;
  recommendation_revision: string | null;
  selected_disposition: AfAssetDisposition | null;
  selected_by: "user" | null;
  selection_source: "explicit_option" | "delegated_recommendation" | null;
  user_text_summary: string | null;
  decision_input_mode: "structured" | "conversational" | null;
  selection_reason: string | null;
  evidence_refs: string[];
  catalog_refs: string[];
  session_id: string | null;
  turn_id: string | null;
  status: "open" | "resolved" | "superseded";
  supersedes: string | null;
}

export interface AfRootExecutable {
  asset_type: "agent" | "workflow";
  asset_ref: string;
  asset_version: number;
  decision_id: string;
}

export interface AfDiscoveryGateBinding {
  requirement_revision: AfRevisionRef;
  decision_revision: AfRevisionRef;
  asset_decision_revision: AfRevisionRef;
  discovery_revision: AfRevisionRef;
  catalog_snapshot_revision: AfRevisionRef;
  artifact_etag: string;
}

export interface AfCompositionGateBinding {
  discovery_revision: AfRevisionRef;
  graph_revision: AfRevisionRef;
  root_executable_revision: AfRevisionRef;
  runtime_contract_revision: AfRevisionRef;
  composition_revision: AfRevisionRef;
  artifact_etag: string;
}

export interface AfReviewGate<TBinding> {
  status: AfReviewGateStatus;
  binding: TBinding | null;
  decided_at: string | null;
  session_id: string | null;
  turn_id: string | null;
  stale_reasons: string[];
}

export interface AfInvalidation {
  invalidation_id: string;
  source_skill: AfWorkSkillId;
  target_skill: AfWorkSkillId;
  triggering_revision: AfRevisionRef;
  invalidated_revision: AfRevisionRef;
  reason: string;
  affected_refs: string[];
  status: "active" | "resolved";
  created_at: string;
  resolved_at: string | null;
}

export interface AfSessionHandoff {
  handoff_id: string;
  work_id: string;
  from_session_id: string;
  from_turn_id: string;
  discovery_revision: AfRevisionRef;
  decision_revision: AfRevisionRef;
  plan_hash: string;
  target_skill: "af-discover-assets.materialize";
  status: "pending" | "claimed" | "expired" | "superseded";
  created_at: string;
  expires_at: string;
  marker_digest: string;
  claimed_by_session_id: string | null;
  claimed_turn_id: string | null;
  claimed_at: string | null;
  superseded_by_handoff_id: string | null;
}

export const afRevisionKeys = [
  "requirement",
  "decision",
  "asset_decision",
  "discovery",
  "catalog_snapshot",
  "graph",
  "root_executable",
  "runtime_contract",
  "composition",
  "scaffold",
  "verification"
] as const;

export type AfRevisionKey = (typeof afRevisionKeys)[number];

export interface AfWorkItemManifest {
  schema_version: 2;
  work_id: string;
  artifact_root: string;
  ledger_revision: number;
  focus_skill: AfWorkSkillId | null;
  active_runs: AfActiveRun[];
  skills: Record<AfWorkSkillId, AfWorkSkillState>;
  revisions: Record<AfRevisionKey, AfRevisionRef | null>;
  discovery_cycles: AfDiscoveryCycle[];
  composition_cycles: AfCompositionCycle[];
  decisions: AfDecisionRecord[];
  asset_decisions: AfAssetDecisionRecord[];
  solution_control_strategy: AfSolutionControlStrategy | null;
  root_executable: AfRootExecutable | null;
  review_gates: {
    discovery: AfReviewGate<AfDiscoveryGateBinding>;
    composition: AfReviewGate<AfCompositionGateBinding>;
  };
  artifact_refs: string[];
  generated_output_roots: string[];
  verification: {
    outcome: AfVerificationOutcome | null;
    revision: AfRevisionRef | null;
    report_ref: string | null;
    evidence_refs: string[];
    verified_at: string | null;
  };
  invalidations: AfInvalidation[];
  session_handoffs: AfSessionHandoff[];
}

export interface AfWorkItemSummary {
  work_id: string;
  artifact_root: string;
  ledger_revision: number;
  focus_skill: AfWorkSkillId | null;
  active_runs: AfActiveRun[];
  skills: Record<AfWorkSkillId, AfWorkSkillState>;
  review_gates: AfWorkItemManifest["review_gates"];
  verification: AfWorkItemManifest["verification"];
  updated_at: string;
}

export const afWorkSkillLabels: Record<AfWorkSkillId, { short: string; title: string; description: string }> = {
  "af-discover-assets": {
    short: "Discover",
    title: "요구와 자산 후보",
    description: "Evidence, Agent·Workflow·Tool 후보, 의존성과 미해결 정보를 검토합니다."
  },
  "af-compose-solution": {
    short: "Compose",
    title: "실행 구조",
    description: "Graph IR, Binding, Invocation Control과 Runtime 계약을 검토합니다."
  },
  "af-scaffold-runtime": {
    short: "Scaffold",
    title: "Runtime Source",
    description: "승인된 구조에서 생성된 source, diff, handoff와 smoke 결과를 확인합니다."
  },
  "af-verify-runtime": {
    short: "Verify",
    title: "검증 증거",
    description: "Artifact, code, runtime과 behavior evidence를 현재 revision에서 확인합니다."
  }
};

export function createAfWorkItemManifest(workId: string, now = new Date()): AfWorkItemManifest {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(workId)) {
    throw new Error("work_id는 소문자 영숫자로 시작하는 64자 이하 식별자여야 합니다.");
  }
  const updatedAt = now.toISOString();
  const state = (): AfWorkSkillState => ({
    status: "not_started",
    input_revision: null,
    output_revision: null,
    output_refs: [],
    blocker_refs: [],
    output_roots: [],
    started_at: null,
    updated_at: updatedAt,
    completed_at: null
  });
  const gate = <TBinding>(): AfReviewGate<TBinding> => ({
    status: "pending",
    binding: null,
    decided_at: null,
    session_id: null,
    turn_id: null,
    stale_reasons: []
  });
  return {
    schema_version: 2,
    work_id: workId,
    artifact_root: `artifacts/af/${workId}`,
    ledger_revision: 0,
    focus_skill: null,
    active_runs: [],
    skills: {
      "af-discover-assets": state(),
      "af-compose-solution": state(),
      "af-scaffold-runtime": state(),
      "af-verify-runtime": state()
    },
    revisions: Object.fromEntries(afRevisionKeys.map((key) => [key, null])) as Record<AfRevisionKey, null>,
    discovery_cycles: [],
    composition_cycles: [],
    decisions: [],
    asset_decisions: [],
    solution_control_strategy: null,
    root_executable: null,
    review_gates: {
      discovery: gate<AfDiscoveryGateBinding>(),
      composition: gate<AfCompositionGateBinding>()
    },
    artifact_refs: [],
    generated_output_roots: [],
    verification: {
      outcome: null,
      revision: null,
      report_ref: null,
      evidence_refs: [],
      verified_at: null
    },
    invalidations: [],
    session_handoffs: []
  };
}

export function parseAfWorkItemManifest(source: string, fileName = "af-work-item.json"): AfWorkItemManifest {
  if (!source.trim()) throw new Error(`${fileName} 파일이 비어 있습니다.`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${fileName} JSON 파싱 실패: ${detail}`);
  }
  const root = requiredRecord(parsed, fileName);
  exactKeys(root, [
    "schema_version", "work_id", "artifact_root", "ledger_revision", "focus_skill", "active_runs", "skills",
    "revisions", "discovery_cycles", "composition_cycles", "decisions", "asset_decisions",
    "solution_control_strategy", "root_executable", "review_gates", "artifact_refs", "generated_output_roots",
    "verification", "invalidations", "session_handoffs"
  ], fileName);
  if (root.schema_version !== 2) throw new Error(`${fileName} schema_version은 2여야 합니다.`);

  const workId = requiredIdentifier(root.work_id, `${fileName}.work_id`);
  const artifactRoot = requiredString(root.artifact_root, `${fileName}.artifact_root`);
  if (artifactRoot !== `artifacts/af/${workId}`) {
    throw new Error(`${fileName}.artifact_root는 work_id와 일치해야 합니다.`);
  }

  const skillsRecord = requiredRecord(root.skills, `${fileName}.skills`);
  exactKeys(skillsRecord, afWorkSkillIds, `${fileName}.skills`);
  const skills = Object.fromEntries(
    afWorkSkillIds.map((skillId) => [skillId, parseSkillState(skillsRecord[skillId], `${fileName}.skills.${skillId}`)])
  ) as Record<AfWorkSkillId, AfWorkSkillState>;

  const revisionsRecord = requiredRecord(root.revisions, `${fileName}.revisions`);
  exactKeys(revisionsRecord, afRevisionKeys, `${fileName}.revisions`);
  const revisions = Object.fromEntries(
    afRevisionKeys.map((key) => [key, parseNullableRevision(revisionsRecord[key], `${fileName}.revisions.${key}`)])
  ) as Record<AfRevisionKey, AfRevisionRef | null>;

  const activeRuns = recordArray(root.active_runs, `${fileName}.active_runs`, parseActiveRun);
  const discoveryCycles = recordArray(root.discovery_cycles, `${fileName}.discovery_cycles`, parseDiscoveryCycle);
  const compositionCycles = recordArray(root.composition_cycles, `${fileName}.composition_cycles`, parseCompositionCycle);
  const decisions = recordArray(root.decisions, `${fileName}.decisions`, parseDecision);
  const assetDecisions = recordArray(root.asset_decisions, `${fileName}.asset_decisions`, parseAssetDecision);

  const reviewRecord = requiredRecord(root.review_gates, `${fileName}.review_gates`);
  exactKeys(reviewRecord, ["discovery", "composition"], `${fileName}.review_gates`);
  const reviewGates = {
    discovery: parseReviewGate(reviewRecord.discovery, `${fileName}.review_gates.discovery`, parseDiscoveryBinding),
    composition: parseReviewGate(reviewRecord.composition, `${fileName}.review_gates.composition`, parseCompositionBinding)
  };

  const verificationRecord = requiredRecord(root.verification, `${fileName}.verification`);
  exactKeys(verificationRecord, ["outcome", "revision", "report_ref", "evidence_refs", "verified_at"], `${fileName}.verification`);
  const verification = {
    outcome: verificationRecord.outcome === null
      ? null
      : requiredEnum(verificationRecord.outcome, afVerificationOutcomes, `${fileName}.verification.outcome`),
    revision: parseNullableRevision(verificationRecord.revision, `${fileName}.verification.revision`),
    report_ref: nullableString(verificationRecord.report_ref, `${fileName}.verification.report_ref`),
    evidence_refs: stringArray(verificationRecord.evidence_refs, `${fileName}.verification.evidence_refs`),
    verified_at: nullableTimestamp(verificationRecord.verified_at, `${fileName}.verification.verified_at`)
  };

  const manifest: AfWorkItemManifest = {
    schema_version: 2,
    work_id: workId,
    artifact_root: artifactRoot,
    ledger_revision: nonNegativeInteger(root.ledger_revision, `${fileName}.ledger_revision`),
    focus_skill: root.focus_skill === null
      ? null
      : requiredEnum(root.focus_skill, afWorkSkillIds, `${fileName}.focus_skill`),
    active_runs: activeRuns,
    skills,
    revisions,
    discovery_cycles: discoveryCycles,
    composition_cycles: compositionCycles,
    decisions,
    asset_decisions: assetDecisions,
    solution_control_strategy: root.solution_control_strategy === null
      ? null
      : requiredEnum(root.solution_control_strategy, afSolutionControlStrategies, `${fileName}.solution_control_strategy`),
    root_executable: root.root_executable === null
      ? null
      : parseRootExecutable(root.root_executable, `${fileName}.root_executable`),
    review_gates: reviewGates,
    artifact_refs: stringArray(root.artifact_refs, `${fileName}.artifact_refs`),
    generated_output_roots: stringArray(root.generated_output_roots, `${fileName}.generated_output_roots`),
    verification,
    invalidations: recordArray(root.invalidations, `${fileName}.invalidations`, parseInvalidation),
    session_handoffs: recordArray(root.session_handoffs, `${fileName}.session_handoffs`, parseSessionHandoff)
  };
  assertCoherent(manifest, fileName);
  return manifest;
}

export function serializeAfWorkItemManifest(manifest: AfWorkItemManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

function parseSkillState(value: unknown, label: string): AfWorkSkillState {
  const record = requiredRecord(value, label);
  exactKeys(record, [
    "status", "input_revision", "output_revision", "output_refs", "blocker_refs", "output_roots",
    "started_at", "updated_at", "completed_at"
  ], label);
  const state: AfWorkSkillState = {
    status: requiredEnum(record.status, afWorkSkillStatuses, `${label}.status`),
    input_revision: parseNullableRevision(record.input_revision, `${label}.input_revision`),
    output_revision: parseNullableRevision(record.output_revision, `${label}.output_revision`),
    output_refs: stringArray(record.output_refs, `${label}.output_refs`),
    blocker_refs: stringArray(record.blocker_refs, `${label}.blocker_refs`),
    output_roots: stringArray(record.output_roots, `${label}.output_roots`),
    started_at: nullableTimestamp(record.started_at, `${label}.started_at`),
    updated_at: timestamp(record.updated_at, `${label}.updated_at`),
    completed_at: nullableTimestamp(record.completed_at, `${label}.completed_at`)
  };
  if (state.output_refs.length && !state.output_revision) {
    throw new Error(`${label}.output_refs에는 output_revision이 필요합니다.`);
  }
  if (state.output_revision) {
    const subjects = new Set(state.output_revision.subjects.map((subject) => subject.ref));
    const uncovered = state.output_refs.filter((ref) => !subjects.has(ref));
    if (uncovered.length) throw new Error(`${label}.output_refs가 output_revision subjects에 없습니다: ${uncovered.join(", ")}`);
  }
  if (state.status === "not_started" && (
    state.input_revision || state.output_revision || state.output_refs.length || state.output_roots.length
    || state.started_at || state.completed_at
  )) {
    throw new Error(`${label} not_started 상태에는 실행 또는 출력 metadata를 기록할 수 없습니다.`);
  }
  if (state.status !== "not_started" && !state.started_at) {
    throw new Error(`${label} 시작된 상태에는 started_at이 필요합니다.`);
  }
  if (state.status === "complete" && (!state.output_revision || !state.completed_at)) {
    throw new Error(`${label} complete 상태에는 output_revision과 completed_at이 필요합니다.`);
  }
  return state;
}

function parseRevision(value: unknown, label: string): AfRevisionRef {
  const record = requiredRecord(value, label);
  exactKeys(record, ["digest", "subjects", "registry_revision"], label);
  const subjects = recordArray(record.subjects, `${label}.subjects`, (entry, entryLabel) => {
    exactKeys(entry, ["ref", "sha256"], entryLabel);
    return {
      ref: requiredString(entry.ref, `${entryLabel}.ref`),
      sha256: sha256(entry.sha256, `${entryLabel}.sha256`)
    };
  });
  if (subjects.length === 0) throw new Error(`${label}.subjects에는 하나 이상의 subject가 필요합니다.`);
  const refs = subjects.map((subject) => subject.ref);
  if (new Set(refs).size !== refs.length) throw new Error(`${label}.subjects ref는 중복될 수 없습니다.`);
  const sorted = [...refs].sort((left, right) => left.localeCompare(right));
  if (refs.some((ref, index) => ref !== sorted[index])) throw new Error(`${label}.subjects는 ref 오름차순이어야 합니다.`);
  return {
    digest: sha256(record.digest, `${label}.digest`),
    subjects,
    registry_revision: nullableSha256(record.registry_revision, `${label}.registry_revision`)
  };
}

function parseNullableRevision(value: unknown, label: string): AfRevisionRef | null {
  return value === null ? null : parseRevision(value, label);
}

function parseActiveRun(record: Record<string, unknown>, label: string): AfActiveRun {
  exactKeys(record, [
    "run_id", "skill_id", "role", "status", "session_id", "parent_run_id", "input_revision", "started_at", "updated_at"
  ], label);
  return {
    run_id: requiredString(record.run_id, `${label}.run_id`),
    skill_id: requiredEnum(record.skill_id, afWorkSkillIds, `${label}.skill_id`),
    role: requiredEnum(record.role, ["plan", "planning_subagent", "materializer", "compose", "scaffold", "verify"] as const, `${label}.role`),
    status: requiredEnum(record.status, ["active", "waiting_for_input", "waiting_for_review"] as const, `${label}.status`),
    session_id: requiredString(record.session_id, `${label}.session_id`),
    parent_run_id: nullableString(record.parent_run_id, `${label}.parent_run_id`),
    input_revision: parseNullableRevision(record.input_revision, `${label}.input_revision`),
    started_at: timestamp(record.started_at, `${label}.started_at`),
    updated_at: timestamp(record.updated_at, `${label}.updated_at`)
  };
}

function parseDiscoveryCycle(record: Record<string, unknown>, label: string): AfDiscoveryCycle {
  exactKeys(record, [
    "cycle_id", "status", "revision", "supersedes_cycle_id", "trigger", "artifact_refs", "started_at", "completed_at"
  ], label);
  return parseCycleBase(record, label, {
    trigger: requiredEnum(record.trigger, ["initial", "return_to_discover", "invalidation"] as const, `${label}.trigger`)
  });
}

function parseCompositionCycle(record: Record<string, unknown>, label: string): AfCompositionCycle {
  exactKeys(record, [
    "cycle_id", "status", "revision", "supersedes_cycle_id", "artifact_refs", "return_to_discover", "started_at", "completed_at"
  ], label);
  return parseCycleBase(record, label, {
    return_to_discover: record.return_to_discover === null
      ? null
      : parseReturnToDiscover(record.return_to_discover, `${label}.return_to_discover`)
  });
}

function parseCycleBase<T extends object>(record: Record<string, unknown>, label: string, extension: T): AfCycleBase & T {
  const status = requiredEnum(record.status, ["active", "complete", "superseded"] as const, `${label}.status`);
  const revision = parseNullableRevision(record.revision, `${label}.revision`);
  const completedAt = nullableTimestamp(record.completed_at, `${label}.completed_at`);
  if (status === "active" && completedAt) throw new Error(`${label} active cycle에는 completed_at을 기록할 수 없습니다.`);
  if (status !== "active" && (!revision || !completedAt)) {
    throw new Error(`${label} 완료 또는 superseded cycle에는 revision과 completed_at이 필요합니다.`);
  }
  return {
    cycle_id: requiredString(record.cycle_id, `${label}.cycle_id`),
    status,
    revision,
    supersedes_cycle_id: nullableString(record.supersedes_cycle_id, `${label}.supersedes_cycle_id`),
    artifact_refs: stringArray(record.artifact_refs, `${label}.artifact_refs`),
    started_at: timestamp(record.started_at, `${label}.started_at`),
    completed_at: completedAt,
    ...extension
  };
}

function parseReturnToDiscover(value: unknown, label: string): AfReturnToDiscover {
  const record = requiredRecord(value, label);
  exactKeys(record, [
    "return_id", "triggering_revision", "missing_capability", "failed_asset_refs", "required_contract_delta",
    "graph_impact", "recommended_search_criteria", "open_decision_id", "created_at"
  ], label);
  return {
    return_id: requiredString(record.return_id, `${label}.return_id`),
    triggering_revision: parseRevision(record.triggering_revision, `${label}.triggering_revision`),
    missing_capability: requiredString(record.missing_capability, `${label}.missing_capability`),
    failed_asset_refs: stringArray(record.failed_asset_refs, `${label}.failed_asset_refs`),
    required_contract_delta: requiredString(record.required_contract_delta, `${label}.required_contract_delta`),
    graph_impact: requiredString(record.graph_impact, `${label}.graph_impact`),
    recommended_search_criteria: nonEmptyStringArray(record.recommended_search_criteria, `${label}.recommended_search_criteria`),
    open_decision_id: nullableString(record.open_decision_id, `${label}.open_decision_id`),
    created_at: timestamp(record.created_at, `${label}.created_at`)
  };
}

function parseDecision(record: Record<string, unknown>, label: string): AfDecisionRecord {
  exactKeys(record, [
    "decision_id", "decision_revision", "topic", "required", "options", "recommended_option", "recommendation_revision", "selected_option", "selected_by",
    "selection_source", "user_text_summary", "decision_input_mode",
    "selection_reason", "evidence_refs", "catalog_refs", "session_id", "turn_id", "status", "supersedes"
  ], label);
  const options = uniqueNonEmptyStringArray(record.options, `${label}.options`);
  const decision: AfDecisionRecord = {
    decision_id: requiredString(record.decision_id, `${label}.decision_id`),
    decision_revision: sha256(record.decision_revision, `${label}.decision_revision`),
    topic: requiredString(record.topic, `${label}.topic`),
    required: requiredBoolean(record.required, `${label}.required`),
    options,
    recommended_option: nullableString(record.recommended_option, `${label}.recommended_option`),
    recommendation_revision: nullableSha256(record.recommendation_revision, `${label}.recommendation_revision`),
    selected_option: nullableString(record.selected_option, `${label}.selected_option`),
    selected_by: record.selected_by === null ? null : requiredEnum(record.selected_by, ["user"] as const, `${label}.selected_by`),
    selection_source: record.selection_source === null ? null : requiredEnum(record.selection_source, ["explicit_option", "delegated_recommendation"] as const, `${label}.selection_source`),
    user_text_summary: boundedNullableString(record.user_text_summary, `${label}.user_text_summary`, 512),
    decision_input_mode: record.decision_input_mode === null ? null : requiredEnum(record.decision_input_mode, ["structured", "conversational"] as const, `${label}.decision_input_mode`),
    selection_reason: nullableString(record.selection_reason, `${label}.selection_reason`),
    evidence_refs: stringArray(record.evidence_refs, `${label}.evidence_refs`),
    catalog_refs: stringArray(record.catalog_refs, `${label}.catalog_refs`),
    session_id: nullableString(record.session_id, `${label}.session_id`),
    turn_id: nullableString(record.turn_id, `${label}.turn_id`),
    status: requiredEnum(record.status, ["open", "resolved", "superseded"] as const, `${label}.status`),
    supersedes: nullableString(record.supersedes, `${label}.supersedes`)
  };
  assertSelection(decision, label, "selected_option");
  if (decision.recommended_option && !options.includes(decision.recommended_option)) {
    throw new Error(`${label}.recommended_option은 options 중 하나여야 합니다.`);
  }
  if ((decision.recommended_option === null) !== (decision.recommendation_revision === null)) {
    throw new Error(`${label}.recommended_option과 recommendation_revision은 함께 있어야 합니다.`);
  }
  if (decision.selection_source === "delegated_recommendation" && decision.selected_option !== decision.recommended_option) {
    throw new Error(`${label}.delegated_recommendation은 표시된 recommended_option만 선택할 수 있습니다.`);
  }
  if (decision.selected_option && !options.includes(decision.selected_option)) {
    throw new Error(`${label}.selected_option은 options 중 하나여야 합니다.`);
  }
  return decision;
}

function parseAssetDecision(record: Record<string, unknown>, label: string): AfAssetDecisionRecord {
  exactKeys(record, [
    "asset_decision_id", "decision_revision", "asset_ref", "asset_type", "asset_version", "required", "match_grade", "options",
    "recommended_disposition", "recommendation_revision", "selected_disposition", "selected_by", "selection_source",
    "user_text_summary", "decision_input_mode", "selection_reason", "evidence_refs",
    "catalog_refs", "session_id", "turn_id", "status", "supersedes"
  ], label);
  const options = uniqueEnumArray(record.options, afAssetDispositions, `${label}.options`);
  const decision: AfAssetDecisionRecord = {
    asset_decision_id: requiredString(record.asset_decision_id, `${label}.asset_decision_id`),
    decision_revision: sha256(record.decision_revision, `${label}.decision_revision`),
    asset_ref: requiredString(record.asset_ref, `${label}.asset_ref`),
    asset_type: requiredEnum(record.asset_type, ["agent", "workflow", "tool"] as const, `${label}.asset_type`),
    asset_version: record.asset_version === null ? null : positiveInteger(record.asset_version, `${label}.asset_version`),
    required: requiredBoolean(record.required, `${label}.required`),
    match_grade: requiredEnum(record.match_grade, afAssetMatchGrades, `${label}.match_grade`),
    options,
    recommended_disposition: record.recommended_disposition === null
      ? null
      : requiredEnum(record.recommended_disposition, afAssetDispositions, `${label}.recommended_disposition`),
    recommendation_revision: nullableSha256(record.recommendation_revision, `${label}.recommendation_revision`),
    selected_disposition: record.selected_disposition === null
      ? null
      : requiredEnum(record.selected_disposition, afAssetDispositions, `${label}.selected_disposition`),
    selected_by: record.selected_by === null ? null : requiredEnum(record.selected_by, ["user"] as const, `${label}.selected_by`),
    selection_source: record.selection_source === null ? null : requiredEnum(record.selection_source, ["explicit_option", "delegated_recommendation"] as const, `${label}.selection_source`),
    user_text_summary: boundedNullableString(record.user_text_summary, `${label}.user_text_summary`, 512),
    decision_input_mode: record.decision_input_mode === null ? null : requiredEnum(record.decision_input_mode, ["structured", "conversational"] as const, `${label}.decision_input_mode`),
    selection_reason: nullableString(record.selection_reason, `${label}.selection_reason`),
    evidence_refs: stringArray(record.evidence_refs, `${label}.evidence_refs`),
    catalog_refs: stringArray(record.catalog_refs, `${label}.catalog_refs`),
    session_id: nullableString(record.session_id, `${label}.session_id`),
    turn_id: nullableString(record.turn_id, `${label}.turn_id`),
    status: requiredEnum(record.status, ["open", "resolved", "superseded"] as const, `${label}.status`),
    supersedes: nullableString(record.supersedes, `${label}.supersedes`)
  };
  assertSelection(decision, label, "selected_disposition");
  if (decision.recommended_disposition && !options.includes(decision.recommended_disposition)) {
    throw new Error(`${label}.recommended_disposition은 options 중 하나여야 합니다.`);
  }
  if ((decision.recommended_disposition === null) !== (decision.recommendation_revision === null)) {
    throw new Error(`${label}.recommended_disposition과 recommendation_revision은 함께 있어야 합니다.`);
  }
  if (decision.selection_source === "delegated_recommendation" && decision.selected_disposition !== decision.recommended_disposition) {
    throw new Error(`${label}.delegated_recommendation은 표시된 recommended_disposition만 선택할 수 있습니다.`);
  }
  if (decision.selected_disposition && !options.includes(decision.selected_disposition)) {
    throw new Error(`${label}.selected_disposition은 options 중 하나여야 합니다.`);
  }
  return decision;
}

function assertSelection(
  decision: AfDecisionRecord | AfAssetDecisionRecord,
  label: string,
  selectedKey: "selected_option" | "selected_disposition"
): void {
  const selected = selectedKey === "selected_option"
    ? (decision as AfDecisionRecord).selected_option
    : (decision as AfAssetDecisionRecord).selected_disposition;
  const details = [
    selected,
    decision.selected_by,
    decision.selection_source,
    decision.user_text_summary,
    decision.selection_reason,
    decision.session_id,
    decision.turn_id,
  ];
  if (decision.status === "open" && details.some((entry) => entry !== null)) {
    throw new Error(`${label} open decision에는 selection metadata를 기록할 수 없습니다.`);
  }
  if (decision.status === "resolved" && (
    !selected || decision.selected_by !== "user" || !decision.selection_source || !decision.user_text_summary
    || !decision.decision_input_mode || !decision.selection_reason || !decision.session_id || !decision.turn_id
  )) {
    throw new Error(`${label} resolved decision에는 user selection, selection_source, user_text_summary, decision_input_mode, reason, session_id, turn_id가 필요합니다.`);
  }
  if (decision.status === "superseded" && details.some((entry) => entry !== null) && details.some((entry) => entry === null)) {
    throw new Error(`${label} superseded decision의 selection metadata는 모두 있거나 모두 없어야 합니다.`);
  }
}

function parseRootExecutable(value: unknown, label: string): AfRootExecutable {
  const record = requiredRecord(value, label);
  exactKeys(record, ["asset_type", "asset_ref", "asset_version", "decision_id"], label);
  return {
    asset_type: requiredEnum(record.asset_type, ["agent", "workflow"] as const, `${label}.asset_type`),
    asset_ref: requiredString(record.asset_ref, `${label}.asset_ref`),
    asset_version: positiveInteger(record.asset_version, `${label}.asset_version`),
    decision_id: requiredString(record.decision_id, `${label}.decision_id`)
  };
}

function parseDiscoveryBinding(value: unknown, label: string): AfDiscoveryGateBinding {
  const record = requiredRecord(value, label);
  exactKeys(record, [
    "requirement_revision", "decision_revision", "asset_decision_revision", "discovery_revision",
    "catalog_snapshot_revision", "artifact_etag"
  ], label);
  return {
    requirement_revision: parseRevision(record.requirement_revision, `${label}.requirement_revision`),
    decision_revision: parseRevision(record.decision_revision, `${label}.decision_revision`),
    asset_decision_revision: parseRevision(record.asset_decision_revision, `${label}.asset_decision_revision`),
    discovery_revision: parseRevision(record.discovery_revision, `${label}.discovery_revision`),
    catalog_snapshot_revision: parseRevision(record.catalog_snapshot_revision, `${label}.catalog_snapshot_revision`),
    artifact_etag: sha256(record.artifact_etag, `${label}.artifact_etag`)
  };
}

function parseCompositionBinding(value: unknown, label: string): AfCompositionGateBinding {
  const record = requiredRecord(value, label);
  exactKeys(record, [
    "discovery_revision", "graph_revision", "root_executable_revision", "runtime_contract_revision",
    "composition_revision", "artifact_etag"
  ], label);
  return {
    discovery_revision: parseRevision(record.discovery_revision, `${label}.discovery_revision`),
    graph_revision: parseRevision(record.graph_revision, `${label}.graph_revision`),
    root_executable_revision: parseRevision(record.root_executable_revision, `${label}.root_executable_revision`),
    runtime_contract_revision: parseRevision(record.runtime_contract_revision, `${label}.runtime_contract_revision`),
    composition_revision: parseRevision(record.composition_revision, `${label}.composition_revision`),
    artifact_etag: sha256(record.artifact_etag, `${label}.artifact_etag`)
  };
}

function parseReviewGate<TBinding>(
  value: unknown,
  label: string,
  parseBinding: (value: unknown, label: string) => TBinding
): AfReviewGate<TBinding> {
  const record = requiredRecord(value, label);
  exactKeys(record, ["status", "binding", "decided_at", "session_id", "turn_id", "stale_reasons"], label);
  const gate: AfReviewGate<TBinding> = {
    status: requiredEnum(record.status, afReviewGateStatuses, `${label}.status`),
    binding: record.binding === null ? null : parseBinding(record.binding, `${label}.binding`),
    decided_at: nullableTimestamp(record.decided_at, `${label}.decided_at`),
    session_id: nullableString(record.session_id, `${label}.session_id`),
    turn_id: nullableString(record.turn_id, `${label}.turn_id`),
    stale_reasons: stringArray(record.stale_reasons, `${label}.stale_reasons`)
  };
  const details = [gate.binding, gate.decided_at, gate.session_id, gate.turn_id];
  if (gate.status === "pending" && (details.some((entry) => entry !== null) || gate.stale_reasons.length)) {
    throw new Error(`${label} pending gate에는 binding 또는 decision metadata를 기록할 수 없습니다.`);
  }
  if (gate.status !== "pending" && details.some((entry) => entry === null)) {
    throw new Error(`${label} non-pending gate에는 binding, decided_at, session_id, turn_id가 필요합니다.`);
  }
  if (gate.status === "stale" && !gate.stale_reasons.length) {
    throw new Error(`${label} stale gate에는 stale_reasons가 필요합니다.`);
  }
  if (gate.status !== "stale" && gate.stale_reasons.length) {
    throw new Error(`${label} stale가 아닌 gate에는 stale_reasons를 기록할 수 없습니다.`);
  }
  return gate;
}

function parseInvalidation(record: Record<string, unknown>, label: string): AfInvalidation {
  exactKeys(record, [
    "invalidation_id", "source_skill", "target_skill", "triggering_revision", "invalidated_revision", "reason",
    "affected_refs", "status", "created_at", "resolved_at"
  ], label);
  const status = requiredEnum(record.status, ["active", "resolved"] as const, `${label}.status`);
  const resolvedAt = nullableTimestamp(record.resolved_at, `${label}.resolved_at`);
  if ((status === "resolved") !== (resolvedAt !== null)) {
    throw new Error(`${label} resolved status와 resolved_at이 일치해야 합니다.`);
  }
  return {
    invalidation_id: requiredString(record.invalidation_id, `${label}.invalidation_id`),
    source_skill: requiredEnum(record.source_skill, afWorkSkillIds, `${label}.source_skill`),
    target_skill: requiredEnum(record.target_skill, afWorkSkillIds, `${label}.target_skill`),
    triggering_revision: parseRevision(record.triggering_revision, `${label}.triggering_revision`),
    invalidated_revision: parseRevision(record.invalidated_revision, `${label}.invalidated_revision`),
    reason: requiredString(record.reason, `${label}.reason`),
    affected_refs: nonEmptyStringArray(record.affected_refs, `${label}.affected_refs`),
    status,
    created_at: timestamp(record.created_at, `${label}.created_at`),
    resolved_at: resolvedAt
  };
}

function parseSessionHandoff(record: Record<string, unknown>, label: string): AfSessionHandoff {
  exactKeys(record, [
    "handoff_id", "work_id", "from_session_id", "from_turn_id", "discovery_revision", "decision_revision",
    "plan_hash", "target_skill", "status", "created_at", "expires_at", "marker_digest", "claimed_by_session_id",
    "claimed_turn_id", "claimed_at", "superseded_by_handoff_id"
  ], label);
  const handoff: AfSessionHandoff = {
    handoff_id: requiredString(record.handoff_id, `${label}.handoff_id`),
    work_id: requiredIdentifier(record.work_id, `${label}.work_id`),
    from_session_id: requiredString(record.from_session_id, `${label}.from_session_id`),
    from_turn_id: requiredString(record.from_turn_id, `${label}.from_turn_id`),
    discovery_revision: parseRevision(record.discovery_revision, `${label}.discovery_revision`),
    decision_revision: parseRevision(record.decision_revision, `${label}.decision_revision`),
    plan_hash: sha256(record.plan_hash, `${label}.plan_hash`),
    target_skill: requiredEnum(
      record.target_skill,
      ["af-discover-assets.materialize"] as const,
      `${label}.target_skill`
    ),
    status: requiredEnum(record.status, ["pending", "claimed", "expired", "superseded"] as const, `${label}.status`),
    created_at: timestamp(record.created_at, `${label}.created_at`),
    expires_at: timestamp(record.expires_at, `${label}.expires_at`),
    marker_digest: sha256(record.marker_digest, `${label}.marker_digest`),
    claimed_by_session_id: nullableString(record.claimed_by_session_id, `${label}.claimed_by_session_id`),
    claimed_turn_id: nullableString(record.claimed_turn_id, `${label}.claimed_turn_id`),
    claimed_at: nullableTimestamp(record.claimed_at, `${label}.claimed_at`),
    superseded_by_handoff_id: nullableString(record.superseded_by_handoff_id, `${label}.superseded_by_handoff_id`)
  };
  if (Date.parse(handoff.expires_at) <= Date.parse(handoff.created_at)) {
    throw new Error(`${label}.expires_at은 created_at 이후여야 합니다.`);
  }
  const claimDetails = [handoff.claimed_by_session_id, handoff.claimed_turn_id, handoff.claimed_at];
  if (handoff.status === "claimed") {
    if (claimDetails.some((entry) => entry === null) || handoff.superseded_by_handoff_id) {
      throw new Error(`${label} claimed handoff에는 완전한 claim metadata만 필요합니다.`);
    }
  } else if (claimDetails.some((entry) => entry !== null)) {
    throw new Error(`${label} claimed가 아닌 handoff에는 claim metadata를 기록할 수 없습니다.`);
  }
  if ((handoff.status === "superseded") !== (handoff.superseded_by_handoff_id !== null)) {
    throw new Error(`${label} superseded status와 superseded_by_handoff_id가 일치해야 합니다.`);
  }
  return handoff;
}

function assertCoherent(manifest: AfWorkItemManifest, fileName: string): void {
  assertUniqueIds(manifest.active_runs, "run_id", `${fileName}.active_runs`);
  assertUniqueIds(manifest.discovery_cycles, "cycle_id", `${fileName}.discovery_cycles`);
  assertUniqueIds(manifest.composition_cycles, "cycle_id", `${fileName}.composition_cycles`);
  assertUniqueIds(manifest.decisions, "decision_id", `${fileName}.decisions`);
  assertUniqueIds(manifest.asset_decisions, "asset_decision_id", `${fileName}.asset_decisions`);
  assertUniqueIds(manifest.invalidations, "invalidation_id", `${fileName}.invalidations`);
  assertUniqueIds(manifest.session_handoffs, "handoff_id", `${fileName}.session_handoffs`);

  assertSingleActiveCycle(manifest.discovery_cycles, `${fileName}.discovery_cycles`);
  assertSingleActiveCycle(manifest.composition_cycles, `${fileName}.composition_cycles`);
  assertCycleLinks(manifest.discovery_cycles, `${fileName}.discovery_cycles`);
  assertCycleLinks(manifest.composition_cycles, `${fileName}.composition_cycles`);

  const catalogSnapshot = manifest.revisions.catalog_snapshot;
  if (catalogSnapshot) {
    if (!catalogSnapshot.registry_revision) {
      throw new Error(`${fileName}.revisions.catalog_snapshot에는 Registry revision이 필요합니다.`);
    }
    if (!catalogSnapshot.subjects.some((subject) => subject.ref === "catalog/asset-registry.json")) {
      throw new Error(`${fileName}.revisions.catalog_snapshot은 catalog/asset-registry.json을 포함해야 합니다.`);
    }
    for (const [key, revision] of Object.entries(manifest.revisions)) {
      if (revision && revision.registry_revision !== catalogSnapshot.registry_revision) {
        throw new Error(`${fileName}.revisions.${key}.registry_revision은 catalog_snapshot과 일치해야 합니다.`);
      }
    }
  } else if (Object.values(manifest.revisions).some((revision) => revision !== null && revision.registry_revision !== null)) {
    throw new Error(`${fileName} Registry revision을 사용하는 현재 revision에는 catalog_snapshot이 필요합니다.`);
  }

  const runIds = new Set(manifest.active_runs.map((run) => run.run_id));
  for (const run of manifest.active_runs) {
    if (run.parent_run_id && (!runIds.has(run.parent_run_id) || run.parent_run_id === run.run_id)) {
      throw new Error(`${fileName}.active_runs parent_run_id는 다른 active run을 가리켜야 합니다.`);
    }
    if (run.role === "planning_subagent" && !run.parent_run_id) {
      throw new Error(`${fileName}.active_runs planning_subagent에는 parent_run_id가 필요합니다.`);
    }
    if (["not_started", "complete", "stale"].includes(manifest.skills[run.skill_id].status)) {
      throw new Error(`${fileName}.active_runs는 현재 실행 가능한 skill 상태만 가리킬 수 있습니다.`);
    }
  }

  assertRecordLinks(manifest.decisions, "decision_id", "supersedes", `${fileName}.decisions`);
  assertRecordLinks(manifest.asset_decisions, "asset_decision_id", "supersedes", `${fileName}.asset_decisions`);

  for (const cycle of manifest.composition_cycles) {
    const openDecisionId = cycle.return_to_discover?.open_decision_id;
    if (openDecisionId && !manifest.decisions.some((decision) => decision.decision_id === openDecisionId && decision.status === "open")) {
      throw new Error(`${fileName}.composition_cycles Return-to-Discover는 open decision을 가리켜야 합니다.`);
    }
  }

  if (manifest.solution_control_strategy) {
    const strategyDecision = manifest.decisions.find((decision) =>
      decision.topic === "solution_control_strategy"
      && decision.status === "resolved"
      && decision.selected_option === manifest.solution_control_strategy
    );
    if (!strategyDecision) throw new Error(`${fileName}.solution_control_strategy에는 일치하는 resolved user decision이 필요합니다.`);
  }
  if (manifest.root_executable) {
    const rootDecision = manifest.decisions.find((decision) =>
      decision.decision_id === manifest.root_executable?.decision_id
      && decision.topic === "root_executable"
      && decision.status === "resolved"
      && decision.selected_option === manifest.root_executable.asset_ref
    );
    if (!rootDecision) {
      throw new Error(`${fileName}.root_executable은 asset_ref를 선택한 resolved root_executable user decision을 가리켜야 합니다.`);
    }
  }

  assertGateBindingMatches(manifest.review_gates.discovery, {
    requirement_revision: manifest.revisions.requirement,
    decision_revision: manifest.revisions.decision,
    asset_decision_revision: manifest.revisions.asset_decision,
    discovery_revision: manifest.revisions.discovery,
    catalog_snapshot_revision: manifest.revisions.catalog_snapshot
  }, `${fileName}.review_gates.discovery`);
  assertGateBindingMatches(manifest.review_gates.composition, {
    discovery_revision: manifest.revisions.discovery,
    graph_revision: manifest.revisions.graph,
    root_executable_revision: manifest.revisions.root_executable,
    runtime_contract_revision: manifest.revisions.runtime_contract,
    composition_revision: manifest.revisions.composition
  }, `${fileName}.review_gates.composition`);

  if (manifest.review_gates.discovery.status === "approved" && manifest.skills["af-discover-assets"].status !== "complete") {
    throw new Error(`${fileName} approved discovery에는 complete af-discover-assets가 필요합니다.`);
  }
  if (manifest.review_gates.composition.status === "approved") {
    if (manifest.review_gates.discovery.status !== "approved") {
      throw new Error(`${fileName} approved composition에는 approved discovery가 필요합니다.`);
    }
    if (manifest.skills["af-compose-solution"].status !== "complete") {
      throw new Error(`${fileName} approved composition에는 complete af-compose-solution이 필요합니다.`);
    }
  }

  const verifyComplete = manifest.skills["af-verify-runtime"].status === "complete";
  if (verifyComplete !== (manifest.verification.outcome === "passed")) {
    throw new Error(`${fileName} passed verification outcome과 complete af-verify-runtime은 함께 있어야 합니다.`);
  }
  const verificationDetails = [
    manifest.verification.revision,
    manifest.verification.verified_at,
    manifest.verification.evidence_refs.length ? manifest.verification.evidence_refs : null
  ];
  if (manifest.verification.outcome === null && (
    verificationDetails.some((entry) => entry !== null) || manifest.verification.report_ref !== null
  )) {
    throw new Error(`${fileName} verification outcome이 없으면 evidence metadata도 없어야 합니다.`);
  }
  if (manifest.verification.outcome !== null && verificationDetails.some((entry) => entry === null)) {
    throw new Error(`${fileName} verification outcome에는 revision, evidence_refs, verified_at이 필요합니다.`);
  }

  const handoffIds = new Set(manifest.session_handoffs.map((handoff) => handoff.handoff_id));
  const markerDigests = new Set<string>();
  const claims = new Set<string>();
  for (const handoff of manifest.session_handoffs) {
    if (handoff.work_id !== manifest.work_id) throw new Error(`${fileName}.session_handoffs work_id가 manifest와 일치해야 합니다.`);
    if (markerDigests.has(handoff.marker_digest)) throw new Error(`${fileName}.session_handoffs marker_digest는 중복될 수 없습니다.`);
    markerDigests.add(handoff.marker_digest);
    if (handoff.status === "claimed") {
      const claim = `${handoff.claimed_by_session_id}\u0000${handoff.claimed_turn_id}`;
      if (claims.has(claim)) throw new Error(`${fileName}.session_handoffs에는 중복 claim이 있습니다.`);
      claims.add(claim);
    }
    if (handoff.superseded_by_handoff_id && (
      !handoffIds.has(handoff.superseded_by_handoff_id) || handoff.superseded_by_handoff_id === handoff.handoff_id
    )) {
      throw new Error(`${fileName}.session_handoffs superseded_by_handoff_id가 올바르지 않습니다.`);
    }
  }
}

function assertGateBindingMatches<TBinding extends object>(
  gate: AfReviewGate<TBinding>,
  expected: Record<string, AfRevisionRef | null>,
  label: string
): void {
  if (!gate.binding || gate.status === "stale") return;
  for (const [key, revision] of Object.entries(expected)) {
    const bound = (gate.binding as Record<string, unknown>)[key] as AfRevisionRef | undefined;
    if (!revision || !bound || revision.digest !== bound.digest) {
      throw new Error(`${label}.binding.${key}은 현재 top-level revision과 일치해야 합니다.`);
    }
  }
}

function assertUniqueIds<T extends object>(records: T[], key: keyof T, label: string): void {
  const values = records.map((record) => String(record[key]));
  if (new Set(values).size !== values.length) throw new Error(`${label}.${String(key)}는 중복될 수 없습니다.`);
}

function assertSingleActiveCycle(records: Array<{ status: string }>, label: string): void {
  if (records.filter((record) => record.status === "active").length > 1) {
    throw new Error(`${label}에는 active cycle이 하나만 있을 수 있습니다.`);
  }
}

function assertCycleLinks(records: Array<{ cycle_id: string; supersedes_cycle_id: string | null }>, label: string): void {
  const ids = new Set(records.map((record) => record.cycle_id));
  for (const record of records) {
    if (record.supersedes_cycle_id && (!ids.has(record.supersedes_cycle_id) || record.supersedes_cycle_id === record.cycle_id)) {
      throw new Error(`${label}.supersedes_cycle_id가 올바르지 않습니다.`);
    }
  }
}

function assertRecordLinks<T extends object>(records: T[], idKey: keyof T, linkKey: keyof T, label: string): void {
  const ids = new Set(records.map((record) => String(record[idKey])));
  for (const record of records) {
    const link = record[linkKey];
    if (link !== null && (!ids.has(String(link)) || String(link) === String(record[idKey]))) {
      throw new Error(`${label}.${String(linkKey)}가 올바르지 않습니다.`);
    }
  }
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}은 객체여야 합니다.`);
  return value as Record<string, unknown>;
}

function recordArray<T>(
  value: unknown,
  label: string,
  parser: (record: Record<string, unknown>, label: string) => T
): T[] {
  if (!Array.isArray(value)) throw new Error(`${label}은 배열이어야 합니다.`);
  return value.map((entry, index) => parser(requiredRecord(entry, `${label}[${index}]`), `${label}[${index}]`));
}

function exactKeys(record: Record<string, unknown>, keys: readonly string[], label: string): void {
  const expected = new Set(keys);
  const unknown = Object.keys(record).filter((key) => !expected.has(key));
  const missing = keys.filter((key) => !Object.prototype.hasOwnProperty.call(record, key));
  if (unknown.length) throw new Error(`${label}에 알 수 없는 필드가 있습니다: ${unknown.join(", ")}`);
  if (missing.length) throw new Error(`${label}에 필수 필드가 없습니다: ${missing.join(", ")}`);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label}은 비어 있지 않은 문자열이어야 합니다.`);
  return value;
}

function requiredIdentifier(value: unknown, label: string): string {
  const text = requiredString(value, label);
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(text)) throw new Error(`${label} 형식이 올바르지 않습니다.`);
  return text;
}

function nullableString(value: unknown, label: string): string | null {
  return value === null ? null : requiredString(value, label);
}

function boundedNullableString(value: unknown, label: string, maxLength: number): string | null {
  const text = nullableString(value, label);
  if (text !== null && text.length > maxLength) throw new Error(`${label}은 ${maxLength}자를 초과할 수 없습니다.`);
  return text;
}

function sha256(value: unknown, label: string): string {
  const text = requiredString(value, label);
  if (!/^[a-f0-9]{64}$/.test(text)) throw new Error(`${label}은 lowercase SHA-256이어야 합니다.`);
  return text;
}

function nullableSha256(value: unknown, label: string): string | null {
  return value === null ? null : sha256(value, label);
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error(`${label}은 비어 있지 않은 문자열 배열이어야 합니다.`);
  }
  return [...value];
}

function nonEmptyStringArray(value: unknown, label: string): string[] {
  const result = stringArray(value, label);
  if (!result.length) throw new Error(`${label}에는 하나 이상의 값이 필요합니다.`);
  return result;
}

function uniqueNonEmptyStringArray(value: unknown, label: string): string[] {
  const result = nonEmptyStringArray(value, label);
  if (new Set(result).size !== result.length) throw new Error(`${label} 값은 중복될 수 없습니다.`);
  return result;
}

function uniqueEnumArray<const T extends readonly string[]>(value: unknown, values: T, label: string): T[number][] {
  if (!Array.isArray(value) || !value.length) throw new Error(`${label}에는 하나 이상의 값이 필요합니다.`);
  const result = value.map((entry, index) => requiredEnum(entry, values, `${label}[${index}]`));
  if (new Set(result).size !== result.length) throw new Error(`${label} 값은 중복될 수 없습니다.`);
  return result;
}

function timestamp(value: unknown, label: string): string {
  const text = requiredString(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label}은 ISO timestamp여야 합니다.`);
  return new Date(text).toISOString();
}

function nullableTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : timestamp(value, label);
}

function requiredBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${label}은 boolean이어야 합니다.`);
  return value;
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${label}은 0 이상의 정수여야 합니다.`);
  return value as number;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1) throw new Error(`${label}은 1 이상의 정수여야 합니다.`);
  return value as number;
}

function requiredEnum<const T extends readonly string[]>(value: unknown, values: T, label: string): T[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new Error(`${label} 값이 올바르지 않습니다: ${String(value)}`);
  }
  return value as T[number];
}
