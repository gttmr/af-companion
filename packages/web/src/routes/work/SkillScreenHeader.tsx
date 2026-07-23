import type { ReactNode } from "react";

import { afWorkSkillLabels, type AfWorkItemManifest, type AfWorkSkillId } from "../../analyzer/afWorkItem";

export function SkillScreenHeader({
  workId,
  skillId,
  manifest,
  children,
}: {
  workId: string;
  skillId: AfWorkSkillId;
  manifest: AfWorkItemManifest | null;
  children?: ReactNode;
}) {
  const state = manifest?.skills[skillId];
  const label = afWorkSkillLabels[skillId];
  return (
    <header className="skill-screen-header">
      <div>
        <div className="skill-breadcrumb"><span>{workId}</span><i>/</i><code>{skillId}</code></div>
        <h1>{label.title}</h1>
        <p>{label.description}</p>
      </div>
      <div className="skill-screen-actions">
        <span className={`skill-status-pill is-${state?.status ?? "not_started"}`}>
          <i />{statusLabel(state?.status ?? "not_started")}
        </span>
        {children}
      </div>
    </header>
  );
}

export function ReviewGateLine({ manifest, gate }: {
  manifest: AfWorkItemManifest | null;
  gate: "discovery" | "composition";
}) {
  const value = manifest?.review_gates[gate];
  return (
    <div className={`review-gate-line is-${value?.status ?? "pending"}`}>
      <span>{gate === "discovery" ? "Discovery review" : "Composition review"}</span>
      <strong>{value?.status ?? "pending"}</strong>
      {value?.artifact_etag ? <code>{value.artifact_etag.slice(0, 12)}</code> : null}
      {value?.decided_at ? <time dateTime={value.decided_at}>{new Date(value.decided_at).toLocaleString()}</time> : null}
    </div>
  );
}

export function ScreenState({ title, detail, tone = "muted" }: {
  title: string;
  detail: string;
  tone?: "muted" | "error" | "warning";
}) {
  return <div className={`screen-state is-${tone}`}><strong>{title}</strong><p>{detail}</p></div>;
}

function statusLabel(status: string): string {
  return ({
    not_started: "Not started",
    active: "Active",
    waiting_for_input: "Input needed",
    waiting_for_review: "Review needed",
    complete: "Complete",
    blocked: "Blocked",
    failed: "Failed",
  } as Record<string, string>)[status] ?? status;
}
