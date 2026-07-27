import { afWorkSkillLabels, type AfWorkItemManifest } from "../analyzer/afWorkItem";

export function WaitingDecisionStrip({ manifest }: { manifest: AfWorkItemManifest | null }) {
  const waitingQuestion = findWaitingQuestion(manifest);
  if (!waitingQuestion) return null;
  return (
    <div className="work-waiting-question" role="status" aria-live="polite">
      <div>
        <span>Waiting for input · {afWorkSkillLabels[waitingQuestion.run.skill_id].short}</span>
        <strong>{waitingQuestion.decision.topic}</strong>
        <code>{waitingQuestion.decision.decision_id} · {waitingQuestion.run.run_id}</code>
      </div>
      <ul aria-label="선택지">
        {waitingQuestion.decision.options.map((option) => <li key={option}>{option}</li>)}
      </ul>
      <p>VS Code terminal의 현재 질문에 답하면 이 projection이 갱신됩니다.</p>
    </div>
  );
}

function findWaitingQuestion(manifest: AfWorkItemManifest | null) {
  if (!manifest) return null;
  const waitingRuns = manifest.active_runs.filter((run) => run.status === "waiting_for_input");
  const openDecisions = manifest.decisions.filter((decision) => (
    decision.status === "open" && decision.selected_option === null
  ));
  for (const run of waitingRuns) {
    const decision = openDecisions.find((candidate) => candidate.session_id === run.session_id)
      ?? openDecisions.find((candidate) => candidate.session_id === null);
    if (decision) return { run, decision };
  }
  return null;
}
