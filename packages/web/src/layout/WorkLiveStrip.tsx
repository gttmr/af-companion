import { afWorkSkillLabels, type AfWorkItemManifest, type AfWorkSkillId } from "../analyzer/afWorkItem";
import type { CodexCompanionSnapshotV2 } from "../companion/types";
import type { WorkspaceProjectionSnapshot } from "../workspace/types";

export function WorkLiveStrip({
  workId,
  routeSkillId,
  manifest,
  workspace,
  codex,
  live,
}: {
  workId: string;
  routeSkillId: AfWorkSkillId;
  manifest: AfWorkItemManifest | null;
  workspace: WorkspaceProjectionSnapshot | null;
  codex: CodexCompanionSnapshotV2 | null;
  live: "connecting" | "live" | "retrying";
}) {
  const currentSkillId = manifest?.focus_skill ?? routeSkillId;
  const currentSkill = manifest?.skills[currentSkillId];
  const activeSessions = codex?.sessions.filter((session) => (
    session.work_id === workId
    && session.participation === "companion_active"
    && session.status === "active"
  )) ?? [];
  const roles = [...new Set(activeSessions.map((session) => session.role))];
  const latestApplicationSource = findLatestActivity(workspace, workId, "application_source");
  const latestGraphChange = [...(workspace?.activities ?? [])].reverse().find((activity) => (
    activity.work_id === workId
    && activity.kind === "artifact"
    && Boolean(activity.path && /(?:^|\/)(?:analysis-result|graph-ir)\.json$/.test(activity.path))
  ));
  const graphRevision = manifest?.revisions.graph?.digest ?? null;

  return (
    <section className="work-live-strip" aria-label="현재 Work Item live 상태">
      <dl>
        <LiveDatum label="Work Item" value={workId} detail={`ledger r${manifest?.ledger_revision ?? "—"}`} mono />
        <LiveDatum
          label="Companion"
          value={connectionLabel(codex, activeSessions.length, roles)}
          detail={`${liveLabel(live)} projection · exact active ${activeSessions.length}`}
          tone={activeSessions.length ? "success" : codex?.capabilities.bridge_available ? "waiting" : "muted"}
        />
        <LiveDatum
          label="Current Work Skill"
          value={afWorkSkillLabels[currentSkillId].short}
          detail={currentSkill?.status ?? "not_started"}
          tone={currentSkill?.status === "waiting_for_input" ? "waiting" : currentSkill?.status === "active" ? "active" : "muted"}
        />
        <LiveDatum
          label="Graph IR"
          value={graphRevision ? graphRevision.slice(0, 12) : "not created"}
          detail={latestGraphChange ? `${latestGraphChange.action} · ${relativeTime(latestGraphChange.at)}` : "revision evidence waiting"}
          mono={Boolean(graphRevision)}
        />
        <LiveDatum
          label="Application source"
          value={latestApplicationSource?.path ?? "change waiting"}
          detail={latestApplicationSource ? `${latestApplicationSource.action} · ${relativeTime(latestApplicationSource.at)}` : "registered app activity waiting"}
          mono={Boolean(latestApplicationSource)}
        />
      </dl>
    </section>
  );
}

function LiveDatum({ label, value, detail, tone = "muted", mono = false }: {
  label: string;
  value: string;
  detail: string;
  tone?: "muted" | "active" | "waiting" | "success";
  mono?: boolean;
}) {
  return (
    <div className={`is-${tone}`}>
      <dt>{label}</dt>
      <dd className={mono ? "is-mono" : ""}><i />{value}</dd>
      <small>{detail}</small>
    </div>
  );
}

function findLatestActivity(
  workspace: WorkspaceProjectionSnapshot | null,
  workId: string,
  kind: "application_source",
) {
  return [...(workspace?.activities ?? [])].reverse().find((activity) => (
    activity.work_id === workId && activity.kind === kind
  ));
}

function connectionLabel(
  codex: CodexCompanionSnapshotV2 | null,
  count: number,
  roles: string[],
): string {
  if (!codex) return "Bridge checking";
  if (!codex?.capabilities.bridge_available) return "Bridge offline";
  if (!count) return "Session waiting";
  return count === 1 ? `${roles[0] ?? "session"} connected` : `${count} sessions connected`;
}

function liveLabel(live: "connecting" | "live" | "retrying"): string {
  if (live === "live") return "Live";
  if (live === "retrying") return "Retrying";
  return "Connecting";
}

function relativeTime(value: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1_000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}
