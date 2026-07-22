import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { GraphIR } from "../analyzer/types";
import type { ContextDelivery } from "./types";
import type { CodexCompanionController } from "../state/useCodexCompanion";
import { Button, TextareaField } from "../ui/primitives";

interface CodexContextDrawerProps {
  graphIR: GraphIR;
  companion: CodexCompanionController;
}

const DELIVERY_LABELS: Record<ContextDelivery["status"], string> = {
  queued: "대기",
  consumed: "사용됨",
  expired: "만료",
  canceled: "취소",
  failed: "실패"
};

export function CodexContextDrawer({ graphIR, companion }: CodexContextDrawerProps) {
  const nodeById = useMemo(() => new Map(graphIR.nodes.map((node) => [node.id, node])), [graphIR.nodes]);
  const selectedNodes = companion.selectedNodeIds.flatMap((nodeId) => {
    const node = nodeById.get(nodeId);
    return node ? [node] : [];
  });
  const snapshotSessions = companion.snapshot?.sessions ?? [];
  const selectedTarget = snapshotSessions.find((session) => session.session_id === companion.targetSessionId);
  const targetIsLive = selectedTarget?.status === "active";
  const targetIsMissing = Boolean(companion.targetSessionId) && !selectedTarget;
  const capabilityReady = companion.snapshot?.capabilities.next_prompt_context !== false;
  const disabledReason = !companion.expectedGraphEtag
    ? "projection snapshot이 아직 준비되지 않아 첨부할 수 없습니다."
    : selectedNodes.length === 0
      ? "Graph에서 Node를 하나 이상 선택하세요."
      : !targetIsLive
        ? companion.targetSessionId
          ? "선택한 Codex session이 stale 상태이거나 snapshot에서 사라졌습니다. Sessions에서 대상을 확인하세요."
          : "활성 Codex session을 명시적으로 선택하세요."
        : !capabilityReady
          ? "현재 bridge는 다음 프롬프트 Context 전달을 지원하지 않습니다."
          : null;
  const currentPreview = selectedNodes.length
    ? [
        `선택 Node ${selectedNodes.length}개`,
        ...selectedNodes.map((node, index) => `${index + 1}. ${node.label} (${node.node_kind} · ${node.id})`),
        `사용자 의도: ${companion.userIntent.trim() || "없음"}`
      ].join("\n")
    : "CLI Context 모드에서 Graph Node를 선택하면 순서대로 미리보기에 표시됩니다.";
  const recentDeliveries = [...companion.deliveries]
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at))
    .slice(0, 8);

  return (
    <aside className="af-drawer codex-context-drawer" aria-label="CLI Context 운영 drawer">
      <header className="af-drawer-header">
        <div>
          <p className="eyebrow">Codex Companion</p>
          <h2>CLI Context</h2>
        </div>
        <button
          type="button"
          className="codex-context-close"
          aria-label="CLI Context 닫기"
          onClick={() => companion.setModeActive(false)}
        >
          ×
        </button>
      </header>

      <div className="af-drawer-body codex-context-body">
        <section className="codex-context-section" aria-labelledby="codex-context-selection-title">
          <div className="codex-context-section-head">
            <h3 id="codex-context-selection-title">선택 Node</h3>
            <span>{selectedNodes.length}/20</span>
          </div>
          {selectedNodes.length ? (
            <ol className="codex-context-selection-list">
              {selectedNodes.map((node, index) => (
                <li key={node.id}>
                  <span className="codex-context-order">{index + 1}</span>
                  <span className="codex-context-selection-copy">
                    <strong>{node.label}</strong>
                    <code>{node.node_kind} · {node.id}</code>
                  </span>
                  <button type="button" aria-label={`${node.label} 선택 해제`} onClick={() => companion.removeNode(node.id)}>×</button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="codex-context-empty">Canvas에서 전달할 Node를 클릭하세요. Edge는 MVP 선택 대상이 아닙니다.</p>
          )}
          {selectedNodes.length ? (
            <button type="button" className="codex-context-clear" onClick={companion.clearNodes}>선택 비우기</button>
          ) : null}
        </section>

        <section className="codex-context-section" aria-labelledby="codex-context-preview-title">
          <div className="codex-context-section-head">
            <h3 id="codex-context-preview-title">첨부 미리보기</h3>
            <span>next prompt</span>
          </div>
          <pre className="codex-context-preview">{companion.queueResult?.preview ?? currentPreview}</pre>
        </section>

        <section className="codex-context-section" aria-labelledby="codex-context-intent-title">
          <h3 id="codex-context-intent-title">사용자 의도</h3>
          <TextareaField
            label="Codex (CLI/IDE)에 함께 전달할 요청"
            value={companion.userIntent}
            rows={3}
            maxLength={4_000}
            placeholder="예: Codex에서 선택한 Agent와 Tool의 연결 계약을 검토해 줘"
            onChange={(event) => companion.setUserIntent(event.target.value)}
          />
        </section>

        <section className="codex-context-section" aria-labelledby="codex-context-target-title">
          <div className="codex-context-section-head">
            <h3 id="codex-context-target-title">대상 Codex session</h3>
            <Link to="/sessions">Sessions에서 관리</Link>
          </div>
          <label className="codex-context-target">
            <span>다음 Codex 프롬프트 대상 (CLI/IDE)</span>
            <select
              value={companion.targetSessionId}
              onChange={(event) => companion.setTargetSessionId(event.target.value)}
            >
              <option value="">대상 session을 선택하세요</option>
              {targetIsMissing ? (
                <option value={companion.targetSessionId}>snapshot에 없는 대상 · {shortId(companion.targetSessionId)}</option>
              ) : null}
              {snapshotSessions.map((session) => (
                <option key={session.session_id} value={session.session_id}>
                  {session.alias || sessionName(session.cwd)}
                  {session.default_target ? " · default" : ""}
                  {session.status === "stale" ? " · stale" : ""}
                  {` · ${session.model} · ${shortId(session.session_id)}`}
                </option>
              ))}
            </select>
          </label>
          <p className="codex-context-muted">
            active default target만 최초 자동 선택합니다. 직접 고른 stale/missing target은 유지되며 자동으로 다른 session에 연결하지 않습니다.
          </p>
          {companion.snapshotLoading ? <p className="codex-context-muted">Codex session 확인 중...</p> : null}
          {companion.snapshotError ? <p className="codex-context-error" role="alert">{companion.snapshotError}</p> : null}
        </section>

        <section className="codex-context-section" aria-labelledby="codex-context-delivery-title">
          <div className="codex-context-section-head">
            <h3 id="codex-context-delivery-title">전달 기록</h3>
            <span>{recentDeliveries.length}</span>
          </div>
          {recentDeliveries.length ? (
            <ul className="codex-delivery-list">
              {recentDeliveries.map((delivery) => (
                <li key={delivery.delivery_id}>
                  <span className={`codex-delivery-state is-${delivery.status}`}>{DELIVERY_LABELS[delivery.status]}</span>
                  <span>
                    <strong>{delivery.bundle.selected_objects.length} nodes · {shortId(delivery.target_session_id)}</strong>
                    <time dateTime={delivery.created_at}>{formatTime(delivery.created_at)}</time>
                  </span>
                  {delivery.status === "queued" ? (
                    <button
                      type="button"
                      className="codex-delivery-cancel"
                      disabled={companion.cancelPendingDeliveryId === delivery.delivery_id}
                      onClick={() => void companion.cancelDelivery(delivery.delivery_id).catch(() => undefined)}
                    >
                      {companion.cancelPendingDeliveryId === delivery.delivery_id ? "취소 중…" : "취소"}
                    </button>
                  ) : null}
                  {delivery.error ? <small title={delivery.error}>{delivery.error}</small> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="codex-context-empty">이 requirement의 전달 기록이 없습니다.</p>
          )}
        </section>

        {companion.selectionError ? <p className="codex-context-error" role="alert">{companion.selectionError}</p> : null}
        {companion.queueError ? <p className="codex-context-error" role="alert">{companion.queueError}</p> : null}
        {companion.cancelError ? <p className="codex-context-error" role="alert">{companion.cancelError}</p> : null}
        {companion.queueResult ? (
          <p className="codex-context-success" role="status">다음 Codex 프롬프트(CLI/IDE)에 Context를 대기열로 첨부했습니다.</p>
        ) : null}
      </div>

      <footer className="af-drawer-footer codex-context-footer">
        <p>{disabledReason ?? "현재 turn을 시작하지 않고, 선택한 session의 다음 Codex 프롬프트(CLI/IDE)에 한 번만 첨부합니다."}</p>
        <Button
          type="button"
          variant="primary"
          className="codex-context-queue"
          disabled={Boolean(disabledReason) || companion.queuePending}
          onClick={() => void companion.queueContext().catch(() => undefined)}
        >
          {companion.queuePending ? "첨부 중..." : "다음 Codex 프롬프트에 첨부"}
        </Button>
      </footer>
    </aside>
  );
}

function sessionName(cwd: string): string {
  const parts = cwd.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? cwd;
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

function formatTime(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return value;
  return new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(timestamp);
}
