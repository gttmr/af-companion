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
  "failed"
] as const;

export const afReviewGateStatuses = ["pending", "approved", "changes_requested"] as const;
export const afVerificationOutcomes = ["passed", "failed", "unverified"] as const;

export type AfWorkSkillId = (typeof afWorkSkillIds)[number];
export type AfWorkSkillStatus = (typeof afWorkSkillStatuses)[number];
export type AfReviewGateStatus = (typeof afReviewGateStatuses)[number];
export type AfVerificationOutcome = (typeof afVerificationOutcomes)[number];

export interface AfWorkSkillState {
  status: AfWorkSkillStatus;
  input_revision: string | null;
  output_revision: string | null;
  output_refs: string[];
  blocker_refs: string[];
  output_roots: string[];
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
}

export interface AfReviewGate {
  status: AfReviewGateStatus;
  artifact_etag: string | null;
  decided_at: string | null;
  session_id: string | null;
  turn_id: string | null;
}

export interface AfWorkItemManifest {
  schema_version: 1;
  work_id: string;
  artifact_root: string;
  active_skill: AfWorkSkillId | null;
  skills: Record<AfWorkSkillId, AfWorkSkillState>;
  review_gates: {
    discovery: AfReviewGate;
    composition: AfReviewGate;
  };
  verification: {
    outcome: AfVerificationOutcome | null;
    revision: string | null;
    report_ref: string | null;
  };
}

export interface AfWorkItemSummary {
  work_id: string;
  artifact_root: string;
  active_skill: AfWorkSkillId | null;
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
  const gate = (): AfReviewGate => ({
    status: "pending",
    artifact_etag: null,
    decided_at: null,
    session_id: null,
    turn_id: null
  });
  return {
    schema_version: 1,
    work_id: workId,
    artifact_root: `artifacts/af/${workId}`,
    active_skill: null,
    skills: {
      "af-discover-assets": state(),
      "af-compose-solution": state(),
      "af-scaffold-runtime": state(),
      "af-verify-runtime": state()
    },
    review_gates: {
      discovery: gate(),
      composition: gate()
    },
    verification: {
      outcome: null,
      revision: null,
      report_ref: null
    }
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
  exactKeys(root, ["schema_version", "work_id", "artifact_root", "active_skill", "skills", "review_gates", "verification"], fileName);
  if (root.schema_version !== 1) throw new Error(`${fileName} schema_version은 1이어야 합니다.`);
  const workId = requiredString(root.work_id, `${fileName}.work_id`);
  const activeSkill = root.active_skill === null
    ? null
    : requiredEnum(root.active_skill, afWorkSkillIds, `${fileName}.active_skill`);
  const skillsRecord = requiredRecord(root.skills, `${fileName}.skills`);
  exactKeys(skillsRecord, afWorkSkillIds, `${fileName}.skills`);
  const skills = Object.fromEntries(
    afWorkSkillIds.map((skillId) => [skillId, parseSkillState(skillsRecord[skillId], `${fileName}.skills.${skillId}`)])
  ) as Record<AfWorkSkillId, AfWorkSkillState>;

  const reviewRecord = requiredRecord(root.review_gates, `${fileName}.review_gates`);
  exactKeys(reviewRecord, ["discovery", "composition"], `${fileName}.review_gates`);
  const reviewGates = {
    discovery: parseReviewGate(reviewRecord.discovery, `${fileName}.review_gates.discovery`),
    composition: parseReviewGate(reviewRecord.composition, `${fileName}.review_gates.composition`)
  };
  if (reviewGates.composition.status === "approved" && reviewGates.discovery.status !== "approved") {
    throw new Error(`${fileName} composition approval에는 approved discovery가 필요합니다.`);
  }

  const verificationRecord = requiredRecord(root.verification, `${fileName}.verification`);
  exactKeys(verificationRecord, ["outcome", "revision", "report_ref"], `${fileName}.verification`);
  const verification = {
    outcome: verificationRecord.outcome === null
      ? null
      : requiredEnum(verificationRecord.outcome, afVerificationOutcomes, `${fileName}.verification.outcome`),
    revision: nullableString(verificationRecord.revision, `${fileName}.verification.revision`),
    report_ref: nullableString(verificationRecord.report_ref, `${fileName}.verification.report_ref`)
  };

  const manifest: AfWorkItemManifest = {
    schema_version: 1,
    work_id: workId,
    artifact_root: requiredString(root.artifact_root, `${fileName}.artifact_root`),
    active_skill: activeSkill,
    skills,
    review_gates: reviewGates,
    verification
  };
  assertLifecycle(manifest, fileName);
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
  return {
    status: requiredEnum(record.status, afWorkSkillStatuses, `${label}.status`),
    input_revision: nullableString(record.input_revision, `${label}.input_revision`),
    output_revision: nullableString(record.output_revision, `${label}.output_revision`),
    output_refs: stringArray(record.output_refs, `${label}.output_refs`),
    blocker_refs: stringArray(record.blocker_refs, `${label}.blocker_refs`),
    output_roots: stringArray(record.output_roots, `${label}.output_roots`),
    started_at: nullableTimestamp(record.started_at, `${label}.started_at`),
    updated_at: timestamp(record.updated_at, `${label}.updated_at`),
    completed_at: nullableTimestamp(record.completed_at, `${label}.completed_at`)
  };
}

function parseReviewGate(value: unknown, label: string): AfReviewGate {
  const record = requiredRecord(value, label);
  exactKeys(record, ["status", "artifact_etag", "decided_at", "session_id", "turn_id"], label);
  const gate: AfReviewGate = {
    status: requiredEnum(record.status, afReviewGateStatuses, `${label}.status`),
    artifact_etag: nullableSha256(record.artifact_etag, `${label}.artifact_etag`),
    decided_at: nullableTimestamp(record.decided_at, `${label}.decided_at`),
    session_id: nullableString(record.session_id, `${label}.session_id`),
    turn_id: nullableString(record.turn_id, `${label}.turn_id`)
  };
  const details = [gate.artifact_etag, gate.decided_at, gate.session_id, gate.turn_id];
  if (gate.status === "pending" && details.some((entry) => entry !== null)) {
    throw new Error(`${label} pending gate에는 decision metadata를 기록할 수 없습니다.`);
  }
  if (gate.status !== "pending" && (!gate.artifact_etag || !gate.decided_at || !gate.session_id || !gate.turn_id)) {
    throw new Error(`${label} 결정에는 artifact_etag, decided_at, session_id, turn_id가 필요합니다.`);
  }
  return gate;
}

function assertLifecycle(manifest: AfWorkItemManifest, fileName: string): void {
  const discoveryApproved = manifest.review_gates.discovery.status === "approved";
  const compositionApproved = manifest.review_gates.composition.status === "approved";
  const started = (skill: AfWorkSkillId) => manifest.skills[skill].status !== "not_started";
  if (discoveryApproved && manifest.skills["af-discover-assets"].status !== "complete") {
    throw new Error(`${fileName} approved discovery에는 complete af-discover-assets가 필요합니다.`);
  }
  if (compositionApproved && manifest.skills["af-compose-solution"].status !== "complete") {
    throw new Error(`${fileName} approved composition에는 complete af-compose-solution이 필요합니다.`);
  }
  if (started("af-compose-solution") && !discoveryApproved) {
    throw new Error(`${fileName} Compose 시작에는 approved discovery가 필요합니다.`);
  }
  if ((started("af-scaffold-runtime") || started("af-verify-runtime")) && !compositionApproved) {
    throw new Error(`${fileName} Scaffold/Verify 시작에는 approved composition이 필요합니다.`);
  }
  if (started("af-verify-runtime") && manifest.skills["af-scaffold-runtime"].status !== "complete") {
    throw new Error(`${fileName} Verify 시작에는 complete af-scaffold-runtime이 필요합니다.`);
  }
  if (manifest.active_skill && manifest.skills[manifest.active_skill].status === "not_started") {
    throw new Error(`${fileName} active_skill은 not_started 상태를 가리킬 수 없습니다.`);
  }
  const verifyComplete = manifest.skills["af-verify-runtime"].status === "complete";
  if (verifyComplete && manifest.verification.outcome !== "passed") {
    throw new Error(`${fileName} complete af-verify-runtime에는 passed verification outcome이 필요합니다.`);
  }
  if (manifest.verification.outcome === "passed" && !verifyComplete) {
    throw new Error(`${fileName} passed verification outcome에는 complete af-verify-runtime이 필요합니다.`);
  }
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}은 객체여야 합니다.`);
  return value as Record<string, unknown>;
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

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requiredString(value, label);
}

function nullableSha256(value: unknown, label: string): string | null {
  if (value === null) return null;
  const text = requiredString(value, label);
  if (!/^[a-f0-9]{64}$/.test(text)) throw new Error(`${label}은 lowercase SHA-256이어야 합니다.`);
  return text;
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string" || !entry.trim())) {
    throw new Error(`${label}은 비어 있지 않은 문자열 배열이어야 합니다.`);
  }
  return [...value];
}

function timestamp(value: unknown, label: string): string {
  const text = requiredString(value, label);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${label}은 ISO timestamp여야 합니다.`);
  return new Date(text).toISOString();
}

function nullableTimestamp(value: unknown, label: string): string | null {
  return value === null ? null : timestamp(value, label);
}

function requiredEnum<const T extends readonly string[]>(value: unknown, values: T, label: string): T[number] {
  if (typeof value !== "string" || !values.includes(value)) {
    throw new Error(`${label} 값이 올바르지 않습니다: ${String(value)}`);
  }
  return value as T[number];
}
