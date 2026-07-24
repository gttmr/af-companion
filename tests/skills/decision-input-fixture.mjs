import assert from "node:assert/strict";

const RECOMMENDATION_ANSWERS = new Set([
  "추천대로",
  "추천대로 진행",
  "use the recommendation",
]);

function validatePrompt(prompt) {
  assert.equal(typeof prompt.decision_id, "string");
  assert.match(prompt.revision, /^[a-f0-9]{64}$/);
  assert.equal(typeof prompt.title, "string");
  assert.equal(typeof prompt.question, "string");
  assert.equal(typeof prompt.required, "boolean");
  assert.equal(typeof prompt.protected_gate, "boolean");
  assert.ok(Array.isArray(prompt.options) && prompt.options.length >= 2 && prompt.options.length <= 4);
  assert.equal(new Set(prompt.options.map((option) => option.id)).size, prompt.options.length);
  for (const option of prompt.options) {
    assert.equal(typeof option.id, "string");
    assert.equal(typeof option.label, "string");
    assert.equal(typeof option.consequences, "string");
  }
  if (prompt.recommendation) {
    assert.ok(prompt.options.some((option) => option.id === prompt.recommendation.option_id));
    assert.match(prompt.recommendation.revision, /^[a-f0-9]{64}$/);
  }
  assert.ok(Array.isArray(prompt.evidence_refs));
}

export function selectDecisionInputMode(callableTools) {
  assert.ok(Array.isArray(callableTools), "current-turn callable tools must be known");
  return callableTools.includes("request_user_input") ? "structured" : "conversational";
}

export function createDecisionTurn(prompt, callableTools) {
  validatePrompt(prompt);
  const mode = selectDecisionInputMode(callableTools);
  const canonical = structuredClone(prompt);
  if (mode === "structured") {
    return {
      mode,
      outcome: "waiting_for_input",
      canonical,
      presentation: {
        tool: "request_user_input",
        questions: [{
          decision_id: prompt.decision_id,
          revision: prompt.revision,
          title: prompt.title,
          question: prompt.question,
          options: structuredClone(prompt.options),
          recommendation: structuredClone(prompt.recommendation),
          evidence_refs: [...prompt.evidence_refs],
        }],
      },
    };
  }

  const optionLines = prompt.options.map((option, index) => {
    const recommendation = option.id === prompt.recommendation?.option_id ? " — 추천" : "";
    return `${String.fromCharCode(65 + index)}. ${option.label}${recommendation}\n   ${option.consequences}`;
  });
  const recommendation = prompt.recommendation
    ? `\n추천 이유 (${prompt.recommendation.revision}): ${prompt.recommendation.reason}\n`
    : "\n";
  return {
    mode,
    outcome: "waiting_for_input",
    canonical,
    presentation: {
      message: [
        `[AF Decision: ${prompt.decision_id} · revision ${prompt.revision}]`,
        prompt.title,
        ...optionLines,
        recommendation,
        prompt.question,
      ].join("\n\n"),
    },
  };
}

function openRecord(prompt) {
  return {
    decision_id: prompt.decision_id,
    topic: prompt.title,
    required: prompt.required,
    options: prompt.options.map((option) => option.id),
    recommended_option: prompt.recommendation?.option_id ?? null,
    selected_option: null,
    selected_by: null,
    selection_reason: null,
    evidence_refs: [...prompt.evidence_refs],
    catalog_refs: [],
    session_id: null,
    turn_id: null,
    status: "open",
    supersedes: null,
  };
}

function unresolved(prompt, reason) {
  return { outcome: "waiting_for_input", reason, record: openRecord(prompt) };
}

export function normalizeDecisionAnswer(prompt, answer, provenance) {
  validatePrompt(prompt);
  assert.equal(typeof answer.text, "string");
  assert.equal(typeof provenance.session_id, "string");
  assert.equal(typeof provenance.turn_id, "string");
  if (answer.displayed_decision_revision !== prompt.revision) return unresolved(prompt, "stale_decision_revision");

  const normalized = answer.text.trim().toLocaleLowerCase("ko-KR");
  const recommendationDelegated = RECOMMENDATION_ANSWERS.has(normalized);
  let selectedOption = null;
  let selectionReason = null;

  if (recommendationDelegated) {
    if (!prompt.recommendation || answer.displayed_recommendation_revision !== prompt.recommendation.revision) {
      return unresolved(prompt, "stale_recommendation_revision");
    }
    if (prompt.protected_gate) return unresolved(prompt, "protected_gate_requires_named_confirmation");
    selectedOption = prompt.recommendation.option_id;
    selectionReason = `User delegated to displayed recommendation ${prompt.recommendation.revision}`;
  } else {
    const directMatches = prompt.options.filter((option, index) => {
      const aliases = [option.id, option.label.toLocaleLowerCase("ko-KR"), String.fromCharCode(97 + index)];
      return aliases.includes(normalized);
    });
    if (directMatches.length !== 1) return unresolved(prompt, "ambiguous_or_out_of_option_answer");
    if (prompt.protected_gate && answer.confirmed_material_consequence !== true) {
      return unresolved(prompt, "protected_gate_requires_named_confirmation");
    }
    selectedOption = directMatches[0].id;
    selectionReason = `User explicitly selected ${selectedOption}`;
  }

  return {
    outcome: "resolved",
    reason: null,
    record: {
      ...openRecord(prompt),
      selected_option: selectedOption,
      selected_by: "user",
      selection_reason: selectionReason,
      session_id: provenance.session_id,
      turn_id: provenance.turn_id,
      status: "resolved",
    },
  };
}
