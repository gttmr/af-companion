import { useMemo, useState, type FormEvent } from "react";

import { useCodexSessions } from "../state/useCodexSessions";

export default function ConnectionsPage() {
  const codex = useCodexSessions();
  const [message, setMessage] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [workId, setWorkId] = useState("");
  const [role, setRole] = useState<"plan" | "materialization">("materialization");
  const snapshot = codex.snapshot;
  const queued = snapshot?.deliveries.filter((delivery) => delivery.status === "queued") ?? [];
  const activeSessions = useMemo(() => snapshot?.sessions.filter((session) => session.status === "active") ?? [], [snapshot?.sessions]);

  function attachSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    void codex.attachSession({ sessionId, workId, role }).then((session) => {
      setMessage(`${session.alias || compactId(session.session_id)} session을 ${session.work_id}의 ${session.role} actor로 연결했습니다.`);
      setSessionId("");
      setWorkId("");
    });
  }

  return (
    <div className="connections-page">
      <header className="standalone-page-header">
        <div><span>Connections</span><h1>Codex & editor</h1><p>외부 CLI와 VS Code extension의 연결 상태만 투영합니다. prompt, transcript, tool output은 저장하지 않습니다.</p></div>
        <button type="button" className="primary-page-action" disabled={!snapshot?.editor.launch_supported || codex.launchPending} onClick={() => void codex.launchVscode().then(() => setMessage("VS Code workspace open 요청을 보냈습니다."))}>VS Code workspace 열기 ↗</button>
      </header>
      {message ? <p className="connection-message">{message}</p> : null}
      {codex.snapshotError ? <p className="connection-message is-error">{codex.snapshotError}</p> : null}

      <section className="connection-status-grid">
        <ConnectionMetric label="Bridge" value={snapshot?.capabilities.bridge_available ? "online" : "offline"} tone={snapshot?.capabilities.bridge_available ? "ok" : "warning"} />
        <ConnectionMetric label="Codex CLI" value={snapshot?.capabilities.codex_version ?? "unknown"} />
        <ConnectionMetric label="Fresh handoff" value={snapshot?.capabilities.fresh_session_handoff ? "supported" : "unavailable"} tone={snapshot?.capabilities.fresh_session_handoff ? "ok" : "warning"} />
        <ConnectionMetric label="Automatic context" value={snapshot?.capabilities.automatic_fresh_context ? "supported" : "manual marker"} tone={snapshot?.capabilities.automatic_fresh_context ? "ok" : "warning"} />
        <ConnectionMetric label="VS Code" value={snapshot?.editor.code_version ?? "not found"} tone={snapshot?.editor.code_available ? "ok" : "warning"} />
        <ConnectionMetric label="Codex extension" value={snapshot?.editor.codex_extension_version ?? "not found"} tone={snapshot?.editor.codex_extension_installed ? "ok" : "warning"} />
      </section>

      <section className="connection-contract">
        <div className="section-title-line"><div><span>Verified boundary</span><h2>Hook bridge capabilities</h2></div><p>지원하지 않는 private IDE API나 app-server 연결을 추측하지 않습니다.</p></div>
        <dl>
          <div><dt>Session registration</dt><dd>{yesNo(snapshot?.capabilities.session_registration)}</dd></div>
          <div><dt>Next-prompt context</dt><dd>{yesNo(snapshot?.capabilities.next_prompt_context)}</dd></div>
          <div><dt>Delivery acknowledgement</dt><dd>{yesNo(snapshot?.capabilities.delivery_ack)}</dd></div>
          <div><dt>Direct turn start</dt><dd>{yesNo(snapshot?.capabilities.direct_turn_start)}</dd></div>
          <div><dt>In-flight steer</dt><dd>{yesNo(snapshot?.capabilities.inflight_steer)}</dd></div>
          <div><dt>Fresh-session claim</dt><dd>{yesNo(snapshot?.capabilities.fresh_session_handoff)}</dd></div>
          <div><dt>Automatic new context</dt><dd>{yesNo(snapshot?.capabilities.automatic_fresh_context)}</dd></div>
          <div><dt>Session end event</dt><dd>{snapshot?.capabilities.session_end_event ?? "unsupported"}</dd></div>
        </dl>
      </section>

      <section className="session-attachment-panel">
        <div className="section-title-line"><div><span>Fallback</span><h2>Session을 Work Item에 수동 연결</h2></div><p>Marker가 없거나 여러 Handoff가 대기 중일 때만 명시적으로 연결합니다. 첫 Active Session을 자동 선택하지 않습니다.</p></div>
        <form onSubmit={attachSession}>
          <label><span>Active session</span><select required value={sessionId} onChange={(event) => setSessionId(event.currentTarget.value)}><option value="">Session 선택…</option>{activeSessions.map((session) => <option key={session.session_id} value={session.session_id}>{session.alias || compactId(session.session_id)} · {session.model}</option>)}</select></label>
          <label><span>Work Item</span><input required pattern="[a-z0-9][a-z0-9_-]{0,63}" placeholder="work-item-id" value={workId} onChange={(event) => setWorkId(event.currentTarget.value)} /></label>
          <label><span>Role</span><select value={role} onChange={(event) => setRole(event.currentTarget.value as "plan" | "materialization")}><option value="materialization">Materialization</option><option value="plan">Plan</option></select></label>
          <button type="submit" className="primary-page-action" disabled={codex.attachmentPending || !sessionId || !workId}>{codex.attachmentPending ? "연결 중…" : "명시적으로 연결"}</button>
        </form>
        {codex.attachmentError ? <p className="connection-message is-error">{codex.attachmentError}</p> : null}
      </section>

      <section className="connections-split">
        <div className="connections-register">
          <div className="section-title-line compact"><div><span>Sessions</span><h2>Observed Codex sessions</h2></div><strong>{snapshot?.sessions.length ?? 0}</strong></div>
          {(snapshot?.sessions.length ?? 0) ? <table><thead><tr><th>Session</th><th>Work Item / role</th><th>cwd</th><th>Last event</th><th>Status</th></tr></thead><tbody>
            {snapshot?.sessions.map((session) => <tr key={session.session_id}>
              <td><strong>{session.alias || compactId(session.session_id)}</strong><code>{session.session_id}</code></td>
              <td><strong>{session.work_id ?? "unattached"}</strong><small>{session.role} · {session.source} · {session.model}</small></td>
              <td><code title={session.cwd}>{compactPath(session.cwd)}</code></td>
              <td>{session.last_event}<small>{session.last_turn_id ? compactId(session.last_turn_id) : "—"} · {new Date(session.last_seen_at).toLocaleString()}</small></td><td><span className={`session-status is-${session.status}`}>{session.status}</span></td>
            </tr>)}
          </tbody></table> : <ConnectionEmpty title="세션이 아직 관찰되지 않았습니다" detail="이 workspace에서 Codex prompt를 제출한 뒤 새로고침 없이 연결되는지 확인하세요." />}
        </div>
        <div className="delivery-register">
          <div className="section-title-line compact"><div><span>Deliveries</span><h2>Next prompt queue</h2></div><strong>{queued.length}</strong></div>
          {queued.length ? <ol>{queued.map((delivery) => <li key={delivery.delivery_id}>
            <div><strong>{delivery.bundle.user_intent.text?.startsWith("graph_change:") ? "Graph change" : "Selected context"}</strong><code>{delivery.bundle.graph_id}</code></div>
            <span>{compactId(delivery.target_session_id)}</span><time>{new Date(delivery.created_at).toLocaleString()}</time>
          </li>)}</ol> : <ConnectionEmpty title="대기 중인 context 없음" detail="Compose에서 Graph를 저장하면 명시적으로 선택한 session에만 전달됩니다." />}
        </div>
      </section>

      <section className="handoff-register">
        <div className="section-title-line compact"><div><span>Fresh context</span><h2>Plan Handoffs</h2></div><strong>{snapshot?.handoffs.length ?? 0}</strong></div>
        {snapshot?.handoffs.length ? <table><thead><tr><th>Work Item</th><th>Plan session</th><th>Target</th><th>Status</th><th>Claim / expiry</th></tr></thead><tbody>{snapshot.handoffs.map((handoff) => <tr key={handoff.handoff_id}>
          <td><strong>{handoff.work_id}</strong><code>{compactId(handoff.handoff_id)}</code></td>
          <td><code>{compactId(handoff.from_session_id)}</code><small>{compactId(handoff.from_turn_id)}</small></td>
          <td><code>{handoff.target_skill}</code><small>discovery {handoff.discovery_revision.slice(0, 10)}</small></td>
          <td><span className={`handoff-status is-${handoff.status}`}>{handoff.status}</span></td>
          <td>{handoff.claimed_by_session_id ? <><code>{compactId(handoff.claimed_by_session_id)}</code><small>{handoff.claimed_at ? new Date(handoff.claimed_at).toLocaleString() : "—"}</small></> : <><span>unclaimed</span><small>{new Date(handoff.expires_at).toLocaleString()}</small></>}</td>
        </tr>)}</tbody></table> : <ConnectionEmpty title="Plan Handoff 없음" detail="Plan session이 explicit marker를 만들면 pending → claimed 상태와 새 Materialization Session이 여기에 표시됩니다." />}
      </section>
    </div>
  );
}

function ConnectionMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "ok" | "warning" }) {
  return <div className={`connection-metric is-${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function ConnectionEmpty({ title, detail }: { title: string; detail: string }) {
  return <div className="connection-empty"><strong>{title}</strong><p>{detail}</p></div>;
}

function yesNo(value: boolean | undefined): string { return value ? "supported" : "unsupported"; }
function compactId(value: string): string { return value.length > 20 ? `${value.slice(0, 9)}…${value.slice(-7)}` : value; }
function compactPath(value: string): string { return value.length > 34 ? `…${value.slice(-33)}` : value; }
