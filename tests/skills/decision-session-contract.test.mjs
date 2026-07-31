import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createAfWorkItemManifest,
  parseAfWorkItemManifest,
  serializeAfWorkItemManifest,
} from "../../packages/web/src/analyzer/afWorkItem.ts";
import {
  createDecisionTurn,
  normalizeDecisionAnswer,
  selectDecisionInputMode,
} from "./decision-input-fixture.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const skillsRoot = path.join(root, ".agents", "skills");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

const sharedReferences = [
  "companion-session-participation.md",
  "decision-input-adapter.md",
  "fresh-context-handoff.md",
  "session-and-work-item-provenance.md",
];

const canonicalSkills = [
  "af-workflow",
  "af-discover-assets",
  "af-compose-solution",
  "af-scaffold-runtime",
  "af-verify-runtime",
];

test("canonical session and decision references exist and are linked by every skill", () => {
  for (const reference of sharedReferences) {
    const referencePath = path.join(skillsRoot, "_shared", reference);
    assert.equal(fs.existsSync(referencePath), true, `${reference} must exist`);
    assert.match(fs.readFileSync(referencePath, "utf8"), /Checked date: 20\d{2}-\d{2}-\d{2}/);
  }

  for (const skill of canonicalSkills) {
    const skillText = fs.readFileSync(path.join(skillsRoot, skill, "SKILL.md"), "utf8");
    for (const reference of sharedReferences) {
      assert.match(skillText, new RegExp(`_shared/${reference.replaceAll(".", "\\.")}`), `${skill} must link ${reference}`);
    }
  }
});

test("standalone ADK development stays separate from the Agent Factory Companion overlay", () => {
  const sourceOfTruth = read(".agents/skills/_shared/source-of-truth.md");
  const workflow = read(".agents/skills/af-workflow/SKILL.md");
  const operatingModel = read("docs/workbench/operating-model.md");

  assert.match(sourceOfTruth, /standalone ADK-development base/);
  assert.match(sourceOfTruth, /Repository cwd or simultaneous skill visibility alone does not activate the overlay/);
  assert.match(sourceOfTruth, /do not restart a duplicate `.agents-cli-spec\.md` dialogue/);
  assert.match(workflow, /ordinary request to design, scaffold, code, test, evaluate, deploy, publish, or observe an ADK project/);
  assert.match(workflow, /requires no Companion enrollment/);
  assert.match(operatingModel, /Companion is the connection, handoff, write-authority, and provenance overlay/);
  assert.doesNotMatch(sourceOfTruth, /reason for following the `af-\*` lifecycle over `agents-cli scaffold create`/);
});

test("decision adapter is turn-capability based and path independent", () => {
  const adapter = read(".agents/skills/_shared/decision-input-adapter.md");
  const discoveryReference = read(".agents/skills/af-discover-assets/references/evidence-and-candidate-discovery.md");
  assert.match(adapter, /tools actually available in that turn/);
  assert.match(adapter, /Never infer availability from a Codex version/);
  assert.match(adapter, /Ask exactly one interactive question per turn/);
  assert.match(adapter, /mark `waiting_for_input`/);
  assert.match(adapter, /perform no materialization, Compose work/);
  assert.match(adapter, /same schema-valid Decision Record semantics/);
  assert.match(adapter, /never resolves a hard, credential, deployment, security, or irreversible gate/);
  assert.match(adapter, /required decision has no default or assumption path/);
  assert.doesNotMatch(discoveryReference, /request_user_input` in small groups/);
  assert.match(discoveryReference, /Ask exactly one question per turn/);
});

const decisionPrompt = {
  decision_id: "decision.control_strategy",
  revision: "a".repeat(64),
  title: "실행 제어 구조",
  question: "A/B/C 중 하나를 선택하거나 수정 조건을 말씀해 주세요.",
  required: true,
  protected_gate: false,
  options: [
    { id: "single_agent", label: "Single Agent", consequences: "한 Agent가 전체 실행을 소유합니다." },
    { id: "explicit_workflow", label: "Explicit Workflow", consequences: "Workflow가 실행 순서를 소유합니다." },
    { id: "hybrid", label: "Hybrid", consequences: "Workflow와 Agent가 경계를 나눕니다." },
  ],
  recommendation: {
    option_id: "hybrid",
    revision: "b".repeat(64),
    reason: "명시적 흐름과 Agent 자율성을 함께 보존합니다.",
  },
  evidence_refs: ["analysis-result.json#control"],
};

test("structured and conversational turns carry one identical canonical decision", () => {
  assert.equal(selectDecisionInputMode(["request_user_input"]), "structured");
  assert.equal(selectDecisionInputMode(["apply_patch"]), "conversational");
  const structured = createDecisionTurn(decisionPrompt, ["request_user_input"]);
  const conversational = createDecisionTurn(decisionPrompt, ["apply_patch"]);
  assert.deepEqual(structured.canonical, conversational.canonical);
  assert.equal(structured.presentation.questions.length, 1);
  assert.match(conversational.presentation.message, /decision\.control_strategy/);
  assert.match(conversational.presentation.message, new RegExp(decisionPrompt.revision));
  assert.match(conversational.presentation.message, new RegExp(decisionPrompt.recommendation.revision));
  assert.equal(structured.outcome, "waiting_for_input");
  assert.equal(conversational.outcome, "waiting_for_input");
});

test("both paths normalize an exact answer to the same schema-shaped Decision Record", () => {
  const provenance = { session_id: "session-review", turn_id: "turn-answer" };
  const answer = {
    text: "hybrid",
    displayed_decision_revision: decisionPrompt.revision,
    displayed_recommendation_revision: decisionPrompt.recommendation.revision,
  };
  const structuredRecord = normalizeDecisionAnswer(decisionPrompt, answer, { ...provenance, decision_input_mode: "structured" }).record;
  const conversationalRecord = normalizeDecisionAnswer(decisionPrompt, { ...answer, text: "C" }, { ...provenance, decision_input_mode: "conversational" }).record;
  const { decision_input_mode: structuredMode, ...structuredSemantics } = structuredRecord;
  const { decision_input_mode: conversationalMode, ...conversationalSemantics } = conversationalRecord;
  assert.deepEqual(structuredSemantics, conversationalSemantics);
  assert.equal(structuredMode, "structured");
  assert.equal(conversationalMode, "conversational");
  assert.equal(structuredRecord.status, "resolved");
  assert.equal(structuredRecord.selected_option, "hybrid");
  assert.equal(structuredRecord.selected_by, "user");
  assert.equal(structuredRecord.decision_revision, decisionPrompt.revision);
  assert.equal(structuredRecord.recommendation_revision, decisionPrompt.recommendation.revision);
  assert.equal(structuredRecord.selection_source, "explicit_option");
  assert.equal(structuredRecord.user_text_summary, "User explicitly selected option hybrid.");
  assert.equal(structuredRecord.session_id, "session-review");
  assert.equal(structuredRecord.turn_id, "turn-answer");
  for (const record of [structuredRecord, conversationalRecord]) {
    const manifest = createAfWorkItemManifest("decision-parity");
    manifest.decisions.push(record);
    assert.deepEqual(parseAfWorkItemManifest(serializeAfWorkItemManifest(manifest)).decisions, [record]);
  }
});

test("ambiguous, stale recommendation, and protected-gate shorthand remain open", () => {
  const provenance = { session_id: "session-review", turn_id: "turn-answer", decision_input_mode: "conversational" };
  const baseAnswer = {
    displayed_decision_revision: decisionPrompt.revision,
    displayed_recommendation_revision: decisionPrompt.recommendation.revision,
  };
  const ambiguous = normalizeDecisionAnswer(decisionPrompt, { ...baseAnswer, text: "A와 C 중간" }, provenance);
  assert.equal(ambiguous.outcome, "waiting_for_input");
  assert.equal(ambiguous.record.status, "open");

  const stale = normalizeDecisionAnswer(decisionPrompt, {
    ...baseAnswer,
    text: "추천대로",
    displayed_recommendation_revision: "c".repeat(64),
  }, provenance);
  assert.equal(stale.reason, "stale_recommendation_revision");
  assert.equal(stale.record.selected_option, null);

  const protectedPrompt = { ...decisionPrompt, decision_id: "decision.production_deploy", protected_gate: true };
  const delegated = normalizeDecisionAnswer(protectedPrompt, { ...baseAnswer, text: "추천대로" }, provenance);
  assert.equal(delegated.reason, "protected_gate_requires_named_confirmation");
  assert.equal(delegated.record.status, "open");
  const namedWithoutConfirmation = normalizeDecisionAnswer(protectedPrompt, { ...baseAnswer, text: "hybrid" }, provenance);
  assert.equal(namedWithoutConfirmation.record.status, "open");
  const confirmed = normalizeDecisionAnswer(protectedPrompt, {
    ...baseAnswer,
    text: "hybrid",
    confirmed_material_consequence: true,
  }, provenance);
  assert.equal(confirmed.record.status, "resolved");
});

test("delegated recommendation provenance survives strict Work Item roundtrip", () => {
  const result = normalizeDecisionAnswer(decisionPrompt, {
    text: "추천대로",
    displayed_decision_revision: decisionPrompt.revision,
    displayed_recommendation_revision: decisionPrompt.recommendation.revision,
  }, {
    session_id: "session-delegated",
    turn_id: "turn-delegated",
    decision_input_mode: "conversational",
  });
  assert.equal(result.outcome, "resolved");
  assert.equal(result.record.selection_source, "delegated_recommendation");
  assert.equal(result.record.recommendation_revision, decisionPrompt.recommendation.revision);
  assert.equal(result.record.user_text_summary, "User explicitly delegated to the displayed recommendation.");
  const manifest = createAfWorkItemManifest("decision-delegated");
  manifest.decisions.push(result.record);
  const [roundtripped] = parseAfWorkItemManifest(serializeAfWorkItemManifest(manifest)).decisions;
  assert.deepEqual(roundtripped, result.record);
});

test("fresh-context handoff hashes only the canonical Plan body and fails closed", () => {
  const handoff = read(".agents/skills/_shared/fresh-context-handoff.md");
  assert.match(handoff, /canonical Plan body excludes every Companion enrollment or handoff capsule/);
  assert.match(handoff, /`plan_body_hash`/);
  assert.match(handoff, /`session_handoffs\[\]\.plan_hash`/);
  assert.match(handoff, /must equal this Companion `plan_body_hash`/);
  assert.match(handoff, /Companion Continue/);
  assert.match(handoff, /Copy Capsule/);
  assert.match(handoff, /Exact confirmed attach/);
  assert.match(handoff, /built-in fresh-context carriage as `unverified`/);
  assert.match(handoff, /Never auto-claim the sole pending candidate/);
});

test("durable work and evidence require exact enrolled materialization scope", () => {
  const participation = read(".agents/skills/_shared/companion-session-participation.md");
  const provenance = read(".agents/skills/_shared/session-and-work-item-provenance.md");
  const scaffold = read(".agents/skills/af-scaffold-runtime/SKILL.md");
  const verify = read(".agents/skills/af-verify-runtime/SKILL.md");

  assert.match(participation, /Ordinary Codex sessions.*not Agent Factory lifecycle actors/);
  assert.match(participation, /`workspace_id`, `application_id`, and `work_id` exactly match/);
  assert.match(provenance, /Return-to-Discover preserves `workspace_id`, `application_id`, `work_id`/);
  assert.match(provenance, /open and resolved decision refs/);
  assert.match(provenance, /recommendation revision/);
  assert.match(scaffold, /exact `workspace_id`, `application_id`, `work_id`, `role: materialization` attachment/);
  assert.match(verify, /Never auto-import commands, observations, approvals, or evidence from an ordinary/);
});

test("current fallback instructions use scoped Companion commands only", () => {
  const currentInstructions = [
    read(".agents/skills/_shared/work-item-and-external-codex.md"),
    read(".agents/skills/af-workflow/SKILL.md"),
    read(".agents/skills/af-discover-assets/SKILL.md"),
    read(".agents/skills/af-discover-assets/references/analysis-result-output.md"),
    read(".agents/skills/af-verify-runtime/references/verification-commands.md"),
  ].join("\n");
  assert.match(currentInstructions, /companion join --application/);
  assert.doesNotMatch(currentInstructions, /node scripts\/af\.mjs work attach-session/);
});
