import {
  JOURNEY_RECOVERY_COPY,
  type JourneyRecoveryAction,
  type JourneyRecoveryState,
} from "../companion/journeyRecovery";
import { Button } from "../ui/primitives";

interface JourneyRecoveryPanelProps {
  state: JourneyRecoveryState;
  detail?: string | null;
  workspacePath?: string | null;
  actionPending?: boolean;
  retryDelayMs?: number;
  onAction: (action: JourneyRecoveryAction) => void;
}

export function JourneyRecoveryPanel({
  state,
  detail,
  workspacePath,
  actionPending = false,
  retryDelayMs = 0,
  onAction,
}: JourneyRecoveryPanelProps) {
  const copy = JOURNEY_RECOVERY_COPY[state];
  const retryBlocked = copy.action === "retry_launch" && retryDelayMs > 0;
  const retrySeconds = Math.max(1, Math.ceil(retryDelayMs / 1_000));

  return (
    <section className="journey-recovery" data-recovery-state={state} aria-labelledby="journey-recovery-title">
      <div className="journey-recovery-marker" aria-hidden="true"><span>Recovery</span><code>{state}</code></div>
      <div className="journey-recovery-copy">
        <h3 id="journey-recovery-title">{copy.title}</h3>
        <p>{copy.description}</p>
        {detail ? <small>{detail}</small> : null}
        {workspacePath && ["vscode_unavailable", "vscode_launch_failed", "launch_cooldown"].includes(state) ? (
          <div className="journey-recovery-path"><span>Manual workspace</span><code>{workspacePath}</code></div>
        ) : null}
      </div>
      <Button type="button" variant="secondary" disabled={actionPending || retryBlocked} onClick={() => onAction(copy.action)}>
        {actionPending ? "복구 중…" : retryBlocked ? `${retrySeconds}초 후 다시 열기` : copy.actionLabel}
      </Button>
    </section>
  );
}
