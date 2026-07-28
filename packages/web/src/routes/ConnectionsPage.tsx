import { useEffect, useMemo, useState, type ReactNode } from "react";

import type {
  ActivationOrigin,
  CodexCompanionSnapshotV2,
  CompanionSession,
  HandoffAttachReceipt,
  SessionEnrollmentTicket,
} from "../companion/types";
import { useCodexSessions } from "../state/useCodexSessions";

export default function ConnectionsPage() {
  const codex = useCodexSessions();
  const snapshot = codex.snapshot;
  const [message, setMessage] = useState<string | null>(null);
  const [handoffTargetById, setHandoffTargetById] = useState<Record<string, string>>({});

  const sessions = useMemo(
    () => [...(snapshot?.sessions ?? [])]
      .filter((session) => ["companion_active", "revoked", "expired"].includes(session.participation))
      .sort((left, right) => Date.parse(right.last_seen_at) - Date.parse(left.last_seen_at)),
    [snapshot?.sessions],
  );
  const handoffs = useMemo(
    () => [...(snapshot?.handoffs ?? [])]
      .filter((handoff) => ["ready", "waiting_for_fresh_session"].includes(handoff.status))
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at)),
    [snapshot?.handoffs],
  );
  const deliveries = useMemo(
    () => [...(snapshot?.deliveries ?? [])]
      .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at)),
    [snapshot?.deliveries],
  );
  const pendingTickets = snapshot?.enrollment_tickets.filter((ticket) => ticket.status === "pending") ?? [];
  const actionErrors = [
    codex.preferencesError,
    codex.revokeError,
    codex.attachError,
    codex.cancelHandoffError,
    codex.cancelError,
  ].filter((value): value is string => Boolean(value));

  return (
    <div className="connections-page">
      <header className="standalone-page-header connections-header">
        <div>
          <span>Connections</span>
          <h1>Companion handoff & sessions</h1>
          <p>명시적으로 enrollment된 Codex만 표시합니다. 일반 <code>codex</code> 실행은 Companion 참여와 무관하며 자동 target이 되지 않습니다.</p>
        </div>
        <span className={`connection-v2-state${snapshot ? " is-ready" : ""}`}>
          <i />{snapshot ? "v2 facade" : "v2 unavailable"}
        </span>
      </header>

      {message ? <p className="connection-message" role="status">{message}</p> : null}
      {codex.snapshotError ? <p className="connection-message is-error" role="alert">{codex.snapshotError}</p> : null}
      {actionErrors.map((error, index) => <p key={`${index}-${error}`} className="connection-message is-error" role="alert">{error}</p>)}

      <RegisterSection
        className="companion-session-register"
        eyebrow="01 · Managed participation"
        title="Companion Sessions"
        detail="유효한 enrollment와 lease가 있는 session만 운영 register에 포함합니다."
        count={sessions.length}
      >
        {sessions.length ? (
          <div className="connection-table-scroll">
            <table className="companion-session-table">
              <thead><tr><th>Alias / ID</th><th>Application / scope</th><th>Activation</th><th>Last event</th><th>Lease</th><th>Participation</th><th>Actions</th></tr></thead>
              <tbody>{sessions.map((session) => (
                <CompanionSessionRow
                  key={session.session_id}
                  session={session}
                  renamePending={codex.preferencesPending && codex.preferencesSessionId === session.session_id}
                  revokePending={codex.revokePendingSessionId === session.session_id}
                  onRename={async (alias) => {
                    setMessage(null);
                    try {
                      await codex.updatePreferences({ sessionId: session.session_id, alias });
                      setMessage(`${alias || compactId(session.session_id)} 별칭을 저장했습니다.`);
                    } catch { /* Rendered by mutation state. */ }
                  }}
                  onRevoke={async () => {
                    setMessage(null);
                    try {
                      await codex.revokeSession(session.session_id);
                      setMessage(`${session.alias || compactId(session.session_id)} session을 revoke했습니다.`);
                    } catch { /* Rendered by mutation state. */ }
                  }}
                />
              ))}</tbody>
            </table>
          </div>
        ) : <ConnectionEmpty title="Companion session 없음" detail="ordinary Codex session은 표시하지 않습니다. Home에서 작업을 선택하고 trusted VS Code terminal session을 시작하세요." />}
      </RegisterSection>

      <RegisterSection
        className="companion-handoff-register"
        eyebrow="02 · Fresh-session continuation"
        title="Pending Handoffs"
        detail="Plan revision과 destination을 확인합니다. 이 화면은 exact existing-session Attach와 Cancel만 제공하며 raw Capsule이나 launch command를 표시하지 않습니다."
        count={handoffs.length}
      >
        {codex.attachReceipt ? (
          <TargetedHandoffReceipt receipt={codex.attachReceipt} />
        ) : null}
        {handoffs.length ? (
          <div className="connection-table-scroll">
            <table className="companion-handoff-table">
              <thead><tr><th>Plan source / revision</th><th>Transport</th><th>Status</th><th>Destination</th><th>Expiry</th><th>Actions</th></tr></thead>
              <tbody>{handoffs.map((handoff) => {
                const eligibleTargets = sessions.filter((session) => (
                  session.participation === "companion_active"
                  && session.status === "active"
                  && session.session_id !== handoff.from_session_id
                  && session.workspace_id === handoff.workspace_id
                  && session.application_id === handoff.application_id
                  && session.work_id === handoff.work_id
                  && session.role === "materialization"
                ));
                const selectedTarget = handoffTargetById[handoff.handoff_id] ?? handoff.target_session_id ?? "";
                const persistedTarget = handoff.target_session_id
                  ? sessions.find((session) => session.session_id === handoff.target_session_id)
                  : null;
                const targetIsAttached = Boolean(handoff.target_session_id && selectedTarget === handoff.target_session_id);
                return <tr key={handoff.handoff_id}>
                  <td><strong>{compactId(handoff.from_session_id)} · {compactId(handoff.from_turn_id)}</strong><code title={handoff.discovery_revision}>discovery {compactDigest(handoff.discovery_revision)}</code><code title={handoff.decision_revision}>decision {compactDigest(handoff.decision_revision)}</code><code title={handoff.plan_body_hash}>plan {compactDigest(handoff.plan_body_hash)}</code></td>
                  <td><span className="connection-state-label">{handoff.transport_capability}</span><code>{compactId(handoff.handoff_id)}</code></td>
                  <td><span className={`connection-state-label is-${handoff.status}`}>{handoff.status}</span></td>
                  <td>
                    <strong>{handoff.application_id}/{handoff.work_id}</strong>
                    <code>{persistedTarget ? `attached · ${persistedTarget.alias || compactId(persistedTarget.session_id)}` : "not attached"}</code>
                    <code>{handoff.target_skill}</code>
                  </td>
                  <td><time dateTime={handoff.expires_at}>{formatDateTime(handoff.expires_at)}</time></td>
                  <td><div className="connection-row-actions">
                    <button
                      type="button"
                      className="is-danger"
                      disabled={codex.cancelPendingHandoffId === handoff.handoff_id}
                      onClick={() => void codex.cancelHandoff(handoff.handoff_id).catch(() => undefined)}
                    >{codex.cancelPendingHandoffId === handoff.handoff_id ? "Canceling…" : "Cancel"}</button>
                    <div className="handoff-attach-control">
                      <select
                        aria-label={`${handoff.handoff_id} existing Companion target`}
                        value={selectedTarget}
                        onChange={(event) => {
                          const targetSessionId = event.currentTarget.value;
                          setHandoffTargetById((current) => ({ ...current, [handoff.handoff_id]: targetSessionId }));
                        }}
                      >
                        <option value="">Existing session 선택…</option>
                        {eligibleTargets.map((session) => <option key={session.session_id} value={session.session_id}>{session.alias || compactId(session.session_id)}</option>)}
                      </select>
                      <button
                        type="button"
                        disabled={!selectedTarget || targetIsAttached || codex.attachPendingHandoffId === handoff.handoff_id}
                        onClick={() => void codex.attachHandoff({ handoffId: handoff.handoff_id, targetSessionId: selectedTarget }).catch(() => undefined)}
                      >{codex.attachPendingHandoffId === handoff.handoff_id ? "Attaching…" : targetIsAttached ? "Attached" : "Attach existing"}</button>
                    </div>
                  </div></td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        ) : <ConnectionEmpty title="대기 중인 Handoff 없음" detail="ready 또는 waiting_for_fresh_session 상태의 Handoff만 이 register에 표시합니다. raw marker text는 해석하지 않습니다." />}
      </RegisterSection>

      <RegisterSection
        className="companion-delivery-register"
        eyebrow="03 · Exact next-prompt target"
        title="Deliveries"
        detail="각 delivery의 application, Work Item, 허용 role과 exact target session을 함께 표시합니다."
        count={deliveries.filter((delivery) => delivery.status === "queued").length}
        countLabel="queued"
      >
        {deliveries.length ? (
          <div className="connection-table-scroll">
            <table className="companion-delivery-table">
              <thead><tr><th>Delivery</th><th>Exact work target</th><th>Target session</th><th>Created</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>{deliveries.map((delivery) => (
                <tr key={delivery.delivery_id}>
                  <td><strong>{delivery.bundle.user_intent.text?.startsWith("graph_change:") ? "Graph change" : "Selected context"}</strong><code>{compactId(delivery.delivery_id)}</code></td>
                  <td><strong>{delivery.scope.application_id}/{delivery.scope.work_id}</strong><code>{delivery.scope.workspace_id} · {delivery.scope.allowed_roles.join(", ")}</code></td>
                  <td><code title={delivery.target_session_id}>{compactId(delivery.target_session_id)}</code></td>
                  <td><time dateTime={delivery.created_at}>{formatDateTime(delivery.created_at)}</time></td>
                  <td><span className={`connection-state-label is-${delivery.status}`}>{delivery.status}</span></td>
                  <td>{delivery.status === "queued" ? <button
                    type="button"
                    className="is-danger"
                    disabled={codex.cancelPendingDeliveryId === delivery.delivery_id}
                    onClick={() => void codex.cancelDelivery(delivery.delivery_id).catch(() => undefined)}
                  >{codex.cancelPendingDeliveryId === delivery.delivery_id ? "Canceling…" : "Cancel"}</button> : <span className="connection-no-action">—</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <ConnectionEmpty title="Delivery 없음" detail="Context는 exact companion_active session과 scope가 일치할 때만 next prompt에 queue됩니다." />}
      </RegisterSection>

      <RegisterSection
        className="companion-setup-register"
        eyebrow="04 · Launch diagnostics"
        title="Setup / Diagnostics"
        detail="Home의 automatic VS Code launch와 Hook 상태를 session 참여 증거와 분리해 표시합니다. Browser enrollment와 Capsule copy surface는 제공하지 않습니다."
      >
        <div className="connection-diagnostics-surface">
          <div className="connection-subhead"><span>Hook diagnostics</span><strong>Participation states</strong></div>
          <DiagnosticStates snapshot={snapshot} sessions={sessions} pendingTickets={pendingTickets} />
          <div className="diagnostic-aggregates" aria-label="Hook aggregate diagnostics">
            <DiagnosticAggregate label="Ignored unmanaged hooks" value={snapshot?.diagnostics.ignored_hook_invocations ?? 0} />
            <DiagnosticAggregate label="Invalid activation" value={snapshot?.diagnostics.invalid_activation_attempts ?? 0} />
            <DiagnosticAggregate label="Expired tickets" value={snapshot?.diagnostics.expired_tickets ?? 0} />
          </div>
        </div>

        <div className="connection-capability-strip">
          <Capability label="Bridge" value={snapshot?.capabilities.bridge_available ? "online" : "offline"} tone={snapshot?.capabilities.bridge_available ? "ok" : "warning"} />
          <Capability label="No-hook isolation" value={snapshot?.capabilities.strict_no_hook_mode ?? "unavailable"} />
          <Capability label="CLI enrollment" value={snapshot?.capabilities.cli_environment_enrollment ?? "unavailable"} />
          <Capability label="VS Code enrollment" value={snapshot?.capabilities.vscode_environment_enrollment ?? "unavailable"} />
          <Capability label="Fresh transport" value={snapshot?.capabilities.fresh_context_transport ?? "unavailable"} />
          <Capability label="Editor" value={snapshot?.editor.codex_extension_installed ? snapshot.editor.codex_extension_version ?? "installed" : "not found"} />
        </div>
      </RegisterSection>
    </div>
  );
}

function RegisterSection({ className, eyebrow, title, detail, count, countLabel, children }: {
  className: string;
  eyebrow: string;
  title: string;
  detail: string;
  count?: number;
  countLabel?: string;
  children: ReactNode;
}) {
  return <section className={`connection-register ${className}`}><div className="connection-register-head"><div><span>{eyebrow}</span><h2>{title}</h2></div><p>{detail}</p>{count !== undefined ? <strong>{count}{countLabel ? ` ${countLabel}` : ""}</strong> : null}</div>{children}</section>;
}

function CompanionSessionRow({ session, renamePending, revokePending, onRename, onRevoke }: {
  session: CompanionSession;
  renamePending: boolean;
  revokePending: boolean;
  onRename: (alias: string | null) => Promise<void>;
  onRevoke: () => Promise<void>;
}) {
  const [alias, setAlias] = useState(session.alias ?? "");
  useEffect(() => setAlias(session.alias ?? ""), [session.alias]);
  const aliasChanged = alias.trim() !== (session.alias ?? "");
  const canMutate = session.participation === "companion_active";
  return <tr>
    <td><strong>{session.alias || compactId(session.session_id)}</strong><code title={session.session_id}>{compactId(session.session_id)}</code></td>
    <td><strong>{session.application_id}</strong><code>{session.workspace_id}/{session.work_id}</code><small>{session.role}</small></td>
    <td><strong>{originLabel(session.activation_origin)}</strong><code>{session.hook_mode}</code></td>
    <td><strong>{session.last_event}</strong><small>{formatDateTime(session.last_seen_at)}{session.last_turn_id ? ` · ${compactId(session.last_turn_id)}` : ""}</small></td>
    <td><time dateTime={session.lease_expires_at}>{formatDateTime(session.lease_expires_at)}</time><small>{leaseLabel(session.lease_expires_at)}</small></td>
    <td><span className={`connection-state-label is-${session.participation}`}>{session.participation}</span><small>{session.status}</small></td>
    <td><form className="session-alias-form" onSubmit={(event) => { event.preventDefault(); void onRename(alias.trim() || null); }}><input aria-label={`${session.session_id} alias`} value={alias} placeholder="별칭" disabled={!canMutate} onChange={(event) => setAlias(event.currentTarget.value)} /><div className="connection-row-actions"><button type="submit" disabled={!canMutate || !aliasChanged || renamePending}>{renamePending ? "Saving…" : "Rename"}</button><button type="button" className="is-danger" disabled={!canMutate || revokePending} onClick={() => void onRevoke()}>{revokePending ? "Revoking…" : "Revoke"}</button></div></form></td>
  </tr>;
}

function DiagnosticStates({ snapshot, sessions, pendingTickets }: {
  snapshot: CodexCompanionSnapshotV2 | null;
  sessions: CompanionSession[];
  pendingTickets: SessionEnrollmentTicket[];
}) {
  const active = sessions.filter((session) => session.participation === "companion_active" && Date.parse(session.lease_expires_at) > Date.now()).length;
  const expired = sessions.filter((session) => session.participation === "expired" || Date.parse(session.lease_expires_at) <= Date.now()).length;
  const revoked = sessions.filter((session) => session.participation === "revoked").length;
  const states = [
    { label: "not loaded", value: snapshot?.capabilities.bridge_available ? "not detected" : "bridge offline", tone: snapshot?.capabilities.bridge_available ? "quiet" : "warning" },
    { label: "loaded unmanaged diagnostic only", value: `${snapshot?.diagnostics.ignored_hook_invocations ?? 0} ignored`, tone: "quiet" },
    { label: "enrollment pending", value: String(pendingTickets.length), tone: pendingTickets.length ? "warning" : "quiet" },
    { label: "companion active", value: String(active), tone: active ? "ok" : "quiet" },
    { label: "lease expired", value: String(expired), tone: expired ? "warning" : "quiet" },
    { label: "revoked", value: String(revoked), tone: revoked ? "warning" : "quiet" },
  ];
  return <ol className="diagnostic-state-list">{states.map((state) => <li key={state.label} className={`is-${state.tone}`}><i /><span>{state.label}</span><strong>{state.value}</strong></li>)}</ol>;
}

function TargetedHandoffReceipt({ receipt }: {
  receipt: HandoffAttachReceipt;
}) {
  return <div className="connection-handoff-receipt"><div><span>Existing session attached</span><strong>{receipt.handoff.application_id}/{receipt.handoff.work_id}</strong><code>{receipt.target_session_id}</code></div><p>이 session의 다음 prompt가 exact Handoff context를 한 번 받습니다.</p></div>;
}

function DiagnosticAggregate({ label, value }: { label: string; value: number }) {
  return <div><span>{label}</span><strong>{value}</strong></div>;
}

function Capability({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "ok" | "warning" }) {
  return <div className={`connection-capability is-${tone}`}><span>{label}</span><strong>{value}</strong></div>;
}

function ConnectionEmpty({ title, detail }: { title: string; detail: string }) {
  return <div className="connection-empty"><strong>{title}</strong><p>{detail}</p></div>;
}

function originLabel(origin: ActivationOrigin): string {
  return ({
    af_cli_launch: "AF CLI",
    af_vscode_launch: "VS Code",
    plan_handoff_capsule: "Plan handoff",
    explicit_join_capsule: "Join capsule",
    manual_attach_confirmed: "Manual confirmation",
  } as Record<ActivationOrigin, string>)[origin];
}

function leaseLabel(value: string): string {
  const remaining = Date.parse(value) - Date.now();
  if (!Number.isFinite(remaining)) return "invalid expiry";
  if (remaining <= 0) return "expired";
  const minutes = Math.max(1, Math.round(remaining / 60_000));
  return minutes < 60 ? `${minutes}m remaining` : `${Math.round(minutes / 60)}h remaining`;
}

function compactId(value: string): string {
  return value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

function compactDigest(value: string): string {
  return value.length > 14 ? `${value.slice(0, 12)}…` : value;
}

function formatDateTime(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : value;
}
