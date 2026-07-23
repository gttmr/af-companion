import { useMemo, useState } from "react";

import type { CodexCompanionSnapshot } from "../companion/types";
import type { WorkspaceProjectionSnapshot } from "../workspace/types";
import { useEditorActions, useWorkspaceDiff } from "../workspace/useWorkspaceProjection";

type LiveTab = "activity" | "changes" | "sessions";

export function LiveRail({
  snapshot,
  codex,
  live,
}: {
  snapshot: WorkspaceProjectionSnapshot | null;
  codex: CodexCompanionSnapshot | null;
  live: "connecting" | "live" | "retrying";
}) {
  const [tab, setTab] = useState<LiveTab>("activity");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const diff = useWorkspaceDiff(tab === "changes" ? selectedPath : null);
  const editor = useEditorActions();
  const activities = useMemo(() => [...(snapshot?.activities ?? [])].reverse().slice(0, 80), [snapshot]);
  const activeSessions = codex?.sessions.filter((session) => session.status === "active") ?? [];
  const queued = codex?.deliveries.filter((delivery) => delivery.status === "queued") ?? [];

  return (
    <aside className="live-rail" aria-label="실시간 Workspace 상태">
      <div className="live-rail-head">
        <div>
          <span className="live-kicker">Live projection</span>
          <strong>Workspace signal</strong>
        </div>
        <span className={`live-connection is-${live}`}><i />{liveLabel(live)}</span>
      </div>
      <div className="live-tabs" role="tablist">
        <LiveTabButton id="activity" active={tab} onSelect={setTab}>Activity</LiveTabButton>
        <LiveTabButton id="changes" active={tab} onSelect={setTab} count={snapshot?.changes.length ?? 0}>Changes</LiveTabButton>
        <LiveTabButton id="sessions" active={tab} onSelect={setTab} count={activeSessions.length}>Codex</LiveTabButton>
      </div>

      <div className="live-rail-body">
        {tab === "activity" ? (
          activities.length ? (
            <ol className="live-activity-list">
              {activities.map((activity) => (
                <li key={activity.id}>
                  <i className={`activity-mark is-${activity.kind}`} />
                  <div>
                    <strong>{activity.action}</strong>
                    <span>{activity.path ?? activity.kind}</span>
                  </div>
                  <time dateTime={activity.at}>{relativeTime(activity.at)}</time>
                </li>
              ))}
            </ol>
          ) : <RailEmpty title="아직 activity가 없습니다" detail="Codex 또는 파일 변경이 감지되면 여기에 표시됩니다." />
        ) : null}

        {tab === "changes" ? (
          <div className="live-changes">
            {(snapshot?.changes.length ?? 0) === 0 ? (
              <RailEmpty title="Working tree clean" detail="Git 변경이 생기면 diff와 함께 표시됩니다." />
            ) : (
              <>
                <ul className="change-list">
                  {snapshot?.changes.map((change) => (
                    <li key={change.path}>
                      <button
                        type="button"
                        className={selectedPath === change.path ? "is-selected" : ""}
                        onClick={() => setSelectedPath(change.path)}
                      >
                        <span className={`change-code is-${change.status}`}>{shortStatus(change.status)}</span>
                        <span title={change.path}>{change.path}</span>
                      </button>
                      <button type="button" className="change-open" onClick={() => void editor.openFile(change.path)} title="VS Code에서 열기">↗</button>
                    </li>
                  ))}
                </ul>
                {selectedPath ? (
                  <section className="diff-peek">
                    <div className="diff-peek-head">
                      <strong>{selectedPath}</strong>
                      <button type="button" onClick={() => void editor.openDiff(selectedPath)}>VS Code Diff</button>
                    </div>
                    {diff.isLoading ? <p>diff 불러오는 중…</p> : diff.error ? (
                      <p className="inline-error">{(diff.error as Error).message}</p>
                    ) : (
                      <pre>{diff.data?.binary ? "Binary change" : diff.data?.diff || "변경 내용 없음"}</pre>
                    )}
                  </section>
                ) : null}
              </>
            )}
          </div>
        ) : null}

        {tab === "sessions" ? (
          <div className="session-projection">
            {!codex?.capabilities.bridge_available ? (
              <RailEmpty title="Codex Bridge offline" detail="외부 CLI 세션을 연결하려면 companion bridge를 시작하세요." />
            ) : (
              <>
                <div className="rail-section-label">Active sessions</div>
                {activeSessions.length ? (
                  <ul className="session-list">
                    {activeSessions.map((session) => (
                      <li key={session.session_id}>
                        <div><strong>{session.alias || compactId(session.session_id)}</strong><span>{session.model}</span></div>
                        <time>{relativeTime(session.last_seen_at)}</time>
                      </li>
                    ))}
                  </ul>
                ) : <RailEmpty title="활성 session 없음" detail="이 workspace에서 Codex CLI 또는 extension prompt를 제출하세요." />}
                <div className="rail-section-label">Queued deliveries · {queued.length}</div>
                <ul className="delivery-list">
                  {queued.slice(0, 12).map((delivery) => (
                    <li key={delivery.delivery_id}>
                      <strong>{delivery.bundle.user_intent.text?.startsWith("graph_change:") ? "Graph change" : "Graph context"}</strong>
                      <span>{compactId(delivery.target_session_id)} · {relativeTime(delivery.created_at)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        ) : null}
        {editor.error ? <p className="inline-error live-editor-error">{editor.error}</p> : null}
      </div>
    </aside>
  );
}

function LiveTabButton({ id, active, onSelect, count, children }: {
  id: LiveTab;
  active: LiveTab;
  onSelect: (id: LiveTab) => void;
  count?: number;
  children: string;
}) {
  return (
    <button type="button" role="tab" aria-selected={active === id} onClick={() => onSelect(id)}>
      {children}{count !== undefined ? <em>{count}</em> : null}
    </button>
  );
}

function RailEmpty({ title, detail }: { title: string; detail: string }) {
  return <div className="rail-empty"><strong>{title}</strong><p>{detail}</p></div>;
}

function liveLabel(status: "connecting" | "live" | "retrying"): string {
  if (status === "live") return "Live";
  if (status === "retrying") return "Retrying";
  return "Connecting";
}

function shortStatus(status: string): string {
  return ({ added: "A", modified: "M", deleted: "D", renamed: "R", conflicted: "!", unknown: "?" } as Record<string, string>)[status] ?? "?";
}

function compactId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}

function relativeTime(value: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 1_000));
  if (seconds < 5) return "now";
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
