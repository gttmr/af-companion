import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import type {
  ActivationOrigin,
  CodexCompanionSnapshotV2,
  CompanionSession,
  CompanionSessionRole,
  EnrollmentReceipt,
  EnrollmentRequest,
  HandoffContinueReceipt,
  SessionEnrollmentTicket,
} from "../companion/types";
import { useCodexSessions } from "../state/useCodexSessions";

type EnrollmentLaunchTarget = "cli" | "vscode";

export default function ConnectionsPage() {
  const codex = useCodexSessions();
  const snapshot = codex.snapshot;
  const [message, setMessage] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [applicationId, setApplicationId] = useState("");
  const [workId, setWorkId] = useState("");
  const [role, setRole] = useState<CompanionSessionRole>("materialization");
  const [launchTarget, setLaunchTarget] = useState<EnrollmentLaunchTarget>("cli");

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
  const supportsHandoffCancel = capabilityFlag(snapshot?.capabilities, "handoff_cancel");
  const actionErrors = [
    codex.enrollmentError,
    codex.preferencesError,
    codex.revokeError,
    codex.continueError,
    codex.cancelHandoffError,
    codex.cancelError,
    codex.launchError,
  ].filter((value): value is string => Boolean(value));

  async function createEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const activationOrigin: EnrollmentRequest["activation_origin"] = launchTarget === "cli"
      ? "af_cli_launch"
      : "af_vscode_launch";
    try {
      const receipt = await codex.createEnrollment({
        application_id: applicationId,
        work_id: workId,
        requested_role: role,
        activation_origin: activationOrigin,
        hook_mode: "side_effect_gated",
      });
      setMessage(`${receipt.ticket.application_id}/${receipt.ticket.work_id} enrollment command를 만들었습니다.`);
    } catch {
      // Mutation state renders the facade response without an unhandled promise.
    }
  }

  async function copyText(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyMessage(`${label} 복사됨`);
    } catch {
      setCopyMessage(`${label}을 복사하지 못했습니다. 브라우저 clipboard 권한을 확인하세요.`);
    }
  }

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
      {copyMessage ? <p className="connection-message" role="status">{copyMessage}</p> : null}
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
        ) : <ConnectionEmpty title="Companion session 없음" detail="ordinary Codex session은 표시하지 않습니다. Setup / Diagnostics에서 exact scope enrollment command를 먼저 만드세요." />}
      </RegisterSection>

      <RegisterSection
        className="companion-handoff-register"
        eyebrow="02 · Fresh-session continuation"
        title="Pending Handoffs"
        detail="Plan revision과 capsule transport 상태를 확인한 뒤 새 session command를 명시적으로 생성합니다."
        count={handoffs.length}
      >
        {codex.continueReceipt ? (
          <CommandReceipt
            eyebrow="Returned handoff capsule"
            title={`${codex.continueReceipt.handoff.application_id}/${codex.continueReceipt.handoff.work_id}`}
            receipt={codex.continueReceipt}
            onCopy={copyText}
          />
        ) : null}
        {handoffs.length ? (
          <div className="connection-table-scroll">
            <table className="companion-handoff-table">
              <thead><tr><th>Plan revision / hash</th><th>Transport</th><th>Status</th><th>Destination</th><th>Expiry</th><th>Actions</th></tr></thead>
              <tbody>{handoffs.map((handoff) => (
                <tr key={handoff.handoff_id}>
                  <td><strong>discovery {compactDigest(handoff.discovery_revision)}</strong><code title={handoff.decision_revision}>decision {compactDigest(handoff.decision_revision)}</code><code title={handoff.plan_body_hash}>plan {compactDigest(handoff.plan_body_hash)}</code></td>
                  <td><span className="connection-state-label">{handoff.transport_capability}</span><code>{compactId(handoff.handoff_id)}</code></td>
                  <td><span className={`connection-state-label is-${handoff.status}`}>{handoff.status}</span></td>
                  <td><strong>{handoff.application_id}/{handoff.work_id}</strong><code>{handoff.target_skill}</code></td>
                  <td><time dateTime={handoff.expires_at}>{formatDateTime(handoff.expires_at)}</time></td>
                  <td><div className="connection-row-actions">
                    <button
                      type="button"
                      disabled={codex.continuePendingHandoffId === handoff.handoff_id}
                      onClick={() => void codex.continueHandoff(handoff.handoff_id).catch(() => undefined)}
                    >{codex.continuePendingHandoffId === handoff.handoff_id ? "Preparing…" : "Continue"}</button>
                    {supportsHandoffCancel ? <button
                      type="button"
                      className="is-danger"
                      disabled={codex.cancelPendingHandoffId === handoff.handoff_id}
                      onClick={() => void codex.cancelHandoff(handoff.handoff_id).catch(() => undefined)}
                    >{codex.cancelPendingHandoffId === handoff.handoff_id ? "Canceling…" : "Cancel"}</button> : null}
                  </div></td>
                </tr>
              ))}</tbody>
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
        eyebrow="04 · Explicit activation"
        title="Setup / Diagnostics"
        detail="Hook 상태를 session 참여와 분리해 보고, exact application/work/role enrollment command를 만듭니다."
      >
        <div className="connection-setup-grid">
          <div className="enrollment-setup">
            <div className="connection-subhead"><span>Start flow</span><strong>Enrollment command</strong></div>
            <p>일반 <code>codex</code> 또는 임의 workspace prompt는 이 흐름과 무관합니다. CLI를 우선 사용하고 필요할 때 VS Code fallback을 선택하세요.</p>
            <form onSubmit={createEnrollment}>
              <label><span>Application</span><input required value={applicationId} placeholder="application-id" onChange={(event) => setApplicationId(event.currentTarget.value)} /></label>
              <label><span>Work Item</span><input required value={workId} placeholder="work-item-id" onChange={(event) => setWorkId(event.currentTarget.value)} /></label>
              <label><span>Role</span><select value={role} onChange={(event) => setRole(event.currentTarget.value as CompanionSessionRole)}><option value="materialization">Materialization</option><option value="plan">Plan</option></select></label>
              <label><span>Origin</span><select value={launchTarget} onChange={(event) => setLaunchTarget(event.currentTarget.value as EnrollmentLaunchTarget)}><option value="cli">Codex CLI</option><option value="vscode">VS Code fallback</option></select></label>
              <button type="submit" className="primary-page-action" disabled={!snapshot?.capabilities.session_enrollment || codex.enrollmentPending}>{codex.enrollmentPending ? "Creating…" : "Create enrollment"}</button>
            </form>
            {codex.enrollmentReceipt ? <EnrollmentCommandReceipt receipt={codex.enrollmentReceipt} onCopy={copyText} /> : null}
          </div>

          <div className="hook-diagnostics">
            <div className="connection-subhead"><span>Hook diagnostics</span><strong>Participation states</strong></div>
            <DiagnosticStates snapshot={snapshot} sessions={sessions} pendingTickets={pendingTickets} />
            <div className="diagnostic-aggregates" aria-label="Hook aggregate diagnostics">
              <DiagnosticAggregate label="Ignored unmanaged hooks" value={snapshot?.diagnostics.ignored_hook_invocations ?? 0} />
              <DiagnosticAggregate label="Invalid activation" value={snapshot?.diagnostics.invalid_activation_attempts ?? 0} />
              <DiagnosticAggregate label="Expired tickets" value={snapshot?.diagnostics.expired_tickets ?? 0} />
            </div>
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

function EnrollmentCommandReceipt({ receipt, onCopy }: {
  receipt: EnrollmentReceipt | null;
  onCopy: (value: string, label: string) => Promise<void>;
}) {
  if (!receipt) return null;
  const command = shellCommand(receipt.command);
  return <div className="connection-command-receipt"><div><span>Enrollment ready</span><strong>{receipt.ticket.application_id}/{receipt.ticket.work_id} · {receipt.ticket.requested_role}</strong><code>{receipt.ticket.ticket_id} · expires {formatDateTime(receipt.ticket.expires_at)}</code></div><pre>{command}</pre><div className="connection-row-actions"><button type="button" onClick={() => void onCopy(command, "Command")}>Copy command</button><button type="button" onClick={() => void onCopy(receipt.activation_capsule, "Enrollment capsule")}>Copy capsule</button></div></div>;
}

function CommandReceipt({ eyebrow, title, receipt, onCopy }: {
  eyebrow: string;
  title: string;
  receipt: HandoffContinueReceipt;
  onCopy: (value: string, label: string) => Promise<void>;
}) {
  const command = shellCommand(receipt.command);
  return <div className="connection-command-receipt is-handoff"><div><span>{eyebrow}</span><strong>{title}</strong><code>{receipt.handoff.handoff_id}</code></div><pre>{command}</pre><div className="connection-row-actions"><button type="button" onClick={() => void onCopy(command, "Continue command")}>Copy command</button><button type="button" onClick={() => void onCopy(receipt.activation_capsule, "Handoff capsule")}>Copy capsule</button></div></div>;
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

function capabilityFlag(capabilities: object | null | undefined, key: string): boolean {
  return Boolean(capabilities && (capabilities as Record<string, unknown>)[key] === true);
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

function shellCommand(parts: string[]): string {
  return parts.map((part) => /^[A-Za-z0-9_./:=@+-]+$/.test(part) ? part : `'${part.split("'").join(`'"'"'`)}'`).join(" ");
}
