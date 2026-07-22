import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { CodexSession, ContextDelivery } from "../companion/types";
import { useCodexSessions } from "../state/useCodexSessions";
import { Button } from "../ui/primitives";

const DELIVERY_LABELS: Record<ContextDelivery["status"], string> = {
  queued: "대기",
  consumed: "사용됨",
  expired: "만료",
  canceled: "취소",
  failed: "실패"
};

export default function CodexSessionsPage() {
  const sessionsState = useCodexSessions();
  const snapshot = sessionsState.snapshot;
  const sessions = useMemo(
    () => [...(snapshot?.sessions ?? [])].sort(compareSessions),
    [snapshot?.sessions]
  );
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const selectedSession = sessions.find((session) => session.session_id === selectedSessionId) ?? null;
  const [aliasDraft, setAliasDraft] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    setAliasDraft(selectedSession?.alias ?? "");
    setActionMessage(null);
  }, [selectedSession?.session_id, selectedSession?.alias]);

  const queuedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const delivery of snapshot?.deliveries ?? []) {
      if (delivery.status !== "queued") continue;
      counts.set(delivery.target_session_id, (counts.get(delivery.target_session_id) ?? 0) + 1);
    }
    return counts;
  }, [snapshot?.deliveries]);

  const selectedDeliveries = useMemo(
    () => (snapshot?.deliveries ?? [])
      .filter((delivery) => delivery.target_session_id === selectedSessionId)
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at)),
    [selectedSessionId, snapshot?.deliveries]
  );

  const hookObserved = sessions.length > 0;
  const statusRail = [
    {
      label: "Bridge",
      state: !snapshot ? "waiting" : snapshot.capabilities.bridge_available ? "ready" : "blocked",
      value: !snapshot ? "확인 중" : snapshot.capabilities.bridge_available ? "연결됨" : "연결 안 됨",
      detail: snapshot
        ? `schema v${snapshot.schema_version} · Codex CLI ${snapshot.capabilities.codex_version || "version 미확인"} · next_prompt ${snapshot.capabilities.next_prompt_context ? "지원" : "미지원"}`
        : "snapshot 확인 중"
    },
    {
      label: "Project Hook observation",
      state: !snapshot ? "waiting" : hookObserved ? "ready" : snapshot.capabilities.session_registration ? "waiting" : "blocked",
      value: !snapshot ? "확인 중" : hookObserved ? `${sessions.length} session 관측` : "아직 관측되지 않음",
      detail: !snapshot
        ? "snapshot 확인 중"
        : snapshot.capabilities.session_registration
        ? "SessionStart / UserPromptSubmit 수신 기준"
        : "Bridge의 session registration 미지원"
    },
    {
      label: "VS Code",
      state: !snapshot ? "waiting" : snapshot.editor.code_available ? "ready" : "blocked",
      value: !snapshot ? "확인 중" : snapshot.editor.code_available ? snapshot.editor.code_version || "설치됨" : "사용 불가",
      detail: !snapshot
        ? "editor capability 확인 중"
        : snapshot.editor.launch_supported
        ? `${snapshot.editor.wsl_environment ? "WSL" : "local"} · Worktree 열기 지원`
        : "이 환경에서는 launch 미지원"
    },
    {
      label: "Codex extension",
      state: !snapshot ? "waiting" : snapshot.editor.codex_extension_installed ? "ready" : "waiting",
      value: !snapshot
        ? "확인 중"
        : snapshot.editor.codex_extension_installed
        ? snapshot.editor.codex_extension_version || "설치됨"
        : "관측되지 않음",
      detail: "설치 상태만 표시 · session 생성/선택 제어 없음"
    }
  ] as const;

  async function saveAlias() {
    if (!selectedSession) return;
    await sessionsState.updatePreferences({
      sessionId: selectedSession.session_id,
      preferences: { alias: aliasDraft.trim() || null }
    });
    setActionMessage("AF alias를 저장했습니다. Codex 자체 session 이름은 변경되지 않습니다.");
  }

  async function toggleDefaultTarget() {
    if (!selectedSession) return;
    await sessionsState.updatePreferences({
      sessionId: selectedSession.session_id,
      preferences: { default_target: !selectedSession.default_target }
    });
    setActionMessage(selectedSession.default_target ? "기본 대상을 해제했습니다." : "active 기본 대상으로 지정했습니다.");
  }

  function selectFromKeyboard(event: KeyboardEvent<HTMLTableRowElement>, sessionId: string) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setSelectedSessionId(sessionId);
  }

  return (
    <div className="codex-sessions-page">
      <header className="codex-sessions-header">
        <div className="codex-sessions-heading">
          <p className="eyebrow">Codex Companion</p>
          <h1>Codex Sessions</h1>
          <p>
            Hook이 이 Worktree에서 관측한 Codex session과 다음 프롬프트 Context 전달을 관리합니다.
            VS Code 열기 요청은 editor launch만 수행하며 Codex session을 만들거나 선택하지 않습니다.
          </p>
        </div>
        <Button
          type="button"
          variant="primary"
          className="codex-sessions-launch"
          disabled={!snapshot?.editor.launch_supported || sessionsState.launchPending}
          title={snapshot?.editor.launch_supported ? undefined : "현재 환경에서 VS Code launch를 지원하지 않습니다."}
          onClick={() => void sessionsState.launchVscode().catch(() => undefined)}
        >
          {sessionsState.launchPending ? "VS Code 요청 중…" : "VS Code에서 Worktree 열기"}
        </Button>
      </header>

      {sessionsState.launchReceipt ? (
        <div className="codex-launch-receipt" role="status">
          <strong>VS Code launch accepted</strong>
          <span>{formatDateTime(sessionsState.launchReceipt.launched_at)} · {sessionsState.launchReceipt.workspace_path}</span>
          <span>
            Codex Session observed by Hook: {hookObserved ? "별도로 관측됨" : "아직 관측되지 않음"}. Codex chat을 열고 prompt를 제출해야 표시됩니다.
          </span>
        </div>
      ) : null}
      {sessionsState.launchError ? <p className="codex-sessions-error" role="alert">{sessionsState.launchError}</p> : null}
      {sessionsState.snapshotError ? <p className="codex-sessions-error" role="alert">{sessionsState.snapshotError}</p> : null}

      <section className="codex-status-rail" aria-label="Codex Companion capability 상태">
        {statusRail.map((item) => (
          <div key={item.label} className={`codex-status-item is-${item.state}`}>
            <div>
              <span className="codex-status-dot" aria-hidden="true" />
              <strong>{item.label}</strong>
            </div>
            <span>{item.value}</span>
            <small>{item.detail}</small>
          </div>
        ))}
      </section>

      <div className="codex-sessions-workspace">
        <section className="codex-session-list" aria-labelledby="codex-session-list-title">
          <div className="codex-session-section-head">
            <div>
              <h2 id="codex-session-list-title">Hook 관측 session</h2>
              <p>2초 polling · {sessionsState.snapshotRefreshing ? "갱신 중" : snapshot?.editor.probed_at ? `editor probe ${formatDateTime(snapshot.editor.probed_at)}` : "snapshot 대기"}</p>
            </div>
            <span>{sessions.length}</span>
          </div>

          {sessionsState.snapshotLoading ? <p className="codex-session-loading">session snapshot을 불러오는 중…</p> : null}
          {!sessionsState.snapshotLoading && sessions.length === 0 ? (
            <div className="codex-sessions-empty">
              <strong>Hook이 관측한 Codex session이 없습니다</strong>
              <ol>
                <li>“VS Code에서 Worktree 열기”로 이 Worktree를 엽니다.</li>
                <li>VS Code에서 이 workspace의 Codex chat을 열거나 새로 만듭니다.</li>
                <li>가능한 환경에서는 <code>/hooks</code>로 project Hook trust 상태를 확인합니다.</li>
                <li>Codex chat에 prompt를 제출합니다.</li>
                <li>Agent Factory polling이 session을 관측할 때까지 잠시 기다립니다.</li>
              </ol>
            </div>
          ) : null}

          {sessions.length ? (
            <div className="codex-session-table-wrap">
              <table className="codex-session-table">
                <thead>
                  <tr>
                    <th>상태</th>
                    <th>AF alias</th>
                    <th>cwd</th>
                    <th>model</th>
                    <th>permission</th>
                    <th>last event / source</th>
                    <th>last seen</th>
                    <th>queued</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr
                      key={session.session_id}
                      tabIndex={0}
                      aria-selected={selectedSessionId === session.session_id}
                      className={selectedSessionId === session.session_id ? "is-selected" : undefined}
                      onClick={() => setSelectedSessionId(session.session_id)}
                      onKeyDown={(event) => selectFromKeyboard(event, session.session_id)}
                    >
                      <td><StatusBadge status={session.status} /></td>
                      <td>
                        <strong>{session.alias || "—"}</strong>
                        {session.default_target ? <span className="codex-default-marker">default</span> : null}
                      </td>
                      <td><code title={session.cwd}>{session.cwd}</code></td>
                      <td>{session.model || "—"}</td>
                      <td>{session.permission_mode || "—"}</td>
                      <td>
                        <strong>{eventLabel(session.last_event)}</strong>
                        <small>{session.source || "unknown"}</small>
                      </td>
                      <td><time dateTime={session.last_seen_at} title={formatDateTime(session.last_seen_at)}>{formatRelativeTime(session.last_seen_at)}</time></td>
                      <td><span className={queuedCounts.get(session.session_id) ? "has-queue" : undefined}>{queuedCounts.get(session.session_id) ?? 0}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <aside className="codex-session-inspector" aria-label="선택한 Codex session 상세">
          {selectedSession ? (
            <>
              <div className="codex-inspector-head">
                <div>
                  <p className="eyebrow">Selected session</p>
                  <h2>{selectedSession.alias || workspaceName(selectedSession.cwd)}</h2>
                </div>
                <StatusBadge status={selectedSession.status} />
              </div>

              <dl className="codex-session-metadata">
                <div><dt>Full session ID</dt><dd><code>{selectedSession.session_id}</code></dd></div>
                <div><dt>cwd</dt><dd><code>{selectedSession.cwd}</code></dd></div>
                <div><dt>started</dt><dd>{formatDateTime(selectedSession.started_at)}</dd></div>
                <div><dt>last event</dt><dd>{eventLabel(selectedSession.last_event)} · {selectedSession.source || "unknown"}</dd></div>
                <div><dt>last turn ID</dt><dd><code>{selectedSession.last_turn_id || "—"}</code></dd></div>
              </dl>

              <form
                className="codex-alias-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveAlias().catch(() => undefined);
                }}
              >
                <label htmlFor="codex-session-alias">AF alias</label>
                <div>
                  <input
                    id="codex-session-alias"
                    value={aliasDraft}
                    maxLength={80}
                    placeholder="예: Graph review"
                    onChange={(event) => setAliasDraft(event.target.value)}
                  />
                  <Button
                    type="submit"
                    disabled={sessionsState.preferencesPending || aliasDraft.trim() === (selectedSession.alias ?? "")}
                  >
                    저장
                  </Button>
                </div>
                <small>alias는 Agent Factory에만 저장되며 Codex session 자체 이름을 바꾸지 않습니다.</small>
              </form>

              <div className="codex-default-action">
                <div>
                  <strong>Graph drawer 기본 대상</strong>
                  <small>active default target만 drawer에서 최초 자동 선택됩니다.</small>
                </div>
                <Button
                  type="button"
                  variant={selectedSession.default_target ? "secondary" : "primary"}
                  disabled={sessionsState.preferencesPending || (selectedSession.status !== "active" && !selectedSession.default_target)}
                  onClick={() => void toggleDefaultTarget().catch(() => undefined)}
                >
                  {selectedSession.default_target ? "기본 대상 해제" : "기본 대상으로 지정"}
                </Button>
              </div>

              {actionMessage ? <p className="codex-sessions-success" role="status">{actionMessage}</p> : null}
              {sessionsState.preferencesError ? <p className="codex-sessions-error" role="alert">{sessionsState.preferencesError}</p> : null}

              <section className="codex-inspector-deliveries" aria-labelledby="codex-inspector-deliveries-title">
                <div className="codex-session-section-head">
                  <div>
                    <h3 id="codex-inspector-deliveries-title">Delivery history</h3>
                    <p>next Codex prompt · once</p>
                  </div>
                  <span>{selectedDeliveries.length}</span>
                </div>
                {selectedDeliveries.length ? (
                  <ul>
                    {selectedDeliveries.map((delivery) => (
                      <li key={delivery.delivery_id}>
                        <span className={`codex-delivery-state is-${delivery.status}`}>{DELIVERY_LABELS[delivery.status]}</span>
                        <span>
                          <strong>{delivery.bundle.selected_objects.length} nodes</strong>
                          <small>{formatDateTime(delivery.created_at)} · {shortId(delivery.delivery_id)}</small>
                        </span>
                        {delivery.status === "queued" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={sessionsState.cancelPendingDeliveryId === delivery.delivery_id}
                            onClick={() => void sessionsState.cancelDelivery(delivery.delivery_id).catch(() => undefined)}
                          >
                            {sessionsState.cancelPendingDeliveryId === delivery.delivery_id ? "취소 중…" : "전달 취소"}
                          </Button>
                        ) : null}
                        {delivery.error ? <small className="codex-delivery-error">{delivery.error}</small> : null}
                      </li>
                    ))}
                  </ul>
                ) : <p className="codex-inspector-empty">이 session의 전달 기록이 없습니다.</p>}
                {sessionsState.cancelError ? <p className="codex-sessions-error" role="alert">{sessionsState.cancelError}</p> : null}
              </section>
            </>
          ) : (
            <div className="codex-inspector-empty-state">
              <p className="eyebrow">Session Inspector</p>
              <strong>표에서 session을 선택하세요</strong>
              <span>full ID, AF alias, default target, delivery history를 확인할 수 있습니다.</span>
              <small>Session은 SessionStart 또는 UserPromptSubmit Hook이 관측한 뒤에만 나타납니다.</small>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: CodexSession["status"] }) {
  return <span className={`codex-session-status is-${status}`}><span aria-hidden="true" />{status}</span>;
}

function compareSessions(left: CodexSession, right: CodexSession): number {
  if (left.status !== right.status) return left.status === "active" ? -1 : 1;
  if (left.default_target !== right.default_target) return left.default_target ? -1 : 1;
  return Date.parse(right.last_seen_at) - Date.parse(left.last_seen_at);
}

function eventLabel(event: CodexSession["last_event"]): string {
  return event === "prompt_submit" ? "UserPromptSubmit" : "SessionStart";
}

function workspaceName(cwd: string): string {
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

function formatDateTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(timestamp);
}

function formatRelativeTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1_000));
  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}
