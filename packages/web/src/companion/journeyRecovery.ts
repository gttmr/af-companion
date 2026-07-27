import type { CodexCompanionSnapshotV2, CompanionDiagnostics } from "./types";

export type JourneyRecoveryState =
  | "bridge_down"
  | "work_item_missing"
  | "vscode_unavailable"
  | "vscode_launch_failed"
  | "launch_cooldown"
  | "enrollment_unclaimed"
  | "enrollment_expired"
  | "hook_not_observed"
  | "activation_rejected"
  | "stale_revision"
  | "mcp_export_failed";

export type JourneyRecoveryAction =
  | "bridge_guide"
  | "recover_work_item"
  | "retry_launch"
  | "terminal_guide"
  | "trust_guide"
  | "refresh_latest"
  | "retry_context_export";

export interface JourneyRecoveryCopy {
  title: string;
  description: string;
  action: JourneyRecoveryAction;
  actionLabel: string;
}

export const JOURNEY_RECOVERY_COPY: Record<JourneyRecoveryState, JourneyRecoveryCopy> = {
  bridge_down: {
    title: "Codex Bridge가 멈춰 있습니다",
    description: "Companion snapshot을 읽을 수 없습니다. Bridge를 다시 시작한 뒤 같은 화면에서 연결 상태를 확인하세요.",
    action: "bridge_guide",
    actionLabel: "Bridge 재시작 안내",
  },
  work_item_missing: {
    title: "선택한 Work Item을 찾을 수 없습니다",
    description: "등록된 application은 유지하고 strict v2 빈 ledger만 같은 ID로 다시 만듭니다.",
    action: "recover_work_item",
    actionLabel: "Work Item 다시 만들기",
  },
  vscode_unavailable: {
    title: "신뢰할 수 있는 VS Code 실행 파일이 없습니다",
    description: "WSL에서 host `code` 실행 파일을 확인한 뒤 생성된 workspace를 다시 여세요.",
    action: "retry_launch",
    actionLabel: "다시 열기",
  },
  vscode_launch_failed: {
    title: "VS Code workspace를 열지 못했습니다",
    description: "workspace descriptor는 보존됩니다. VS Code 상태를 확인한 뒤 다시 열거나 표시된 경로를 수동으로 여세요.",
    action: "retry_launch",
    actionLabel: "다시 열기",
  },
  launch_cooldown: {
    title: "VS Code를 연 직후입니다",
    description: "중복 창을 막는 2.5초 cooldown이 끝나면 같은 workspace를 다시 열 수 있습니다.",
    action: "retry_launch",
    actionLabel: "다시 열기",
  },
  enrollment_unclaimed: {
    title: "VS Code terminal의 Session 시작을 기다립니다",
    description: "Enrollment ticket은 발급됐지만 이 Work Item의 Session이 아직 연결되지 않았습니다.",
    action: "terminal_guide",
    actionLabel: "Start AF Session 안내",
  },
  enrollment_expired: {
    title: "Session 시작 ticket이 만료됐습니다",
    description: "같은 workspace를 다시 열면 terminal Task가 새 ticket을 발급합니다.",
    action: "retry_launch",
    actionLabel: "다시 열기",
  },
  hook_not_observed: {
    title: "첫 prompt Hook이 아직 관찰되지 않았습니다",
    description: "Session 시작은 확인됐지만 UserPromptSubmit receipt가 없습니다. Hook 설정과 Workspace Trust를 확인하세요.",
    action: "trust_guide",
    actionLabel: "Hook · Trust 확인",
  },
  activation_rejected: {
    title: "Work Item 변경으로 Session activation이 거절됐습니다",
    description: "Ticket 발급 뒤 canonical Work Item이 변경되어 기존 activation 권한이 철회됐습니다.",
    action: "retry_launch",
    actionLabel: "세션 다시 시작",
  },
  stale_revision: {
    title: "화면의 revision이 최신 상태가 아닙니다",
    description: "자동 재시도하지 않습니다. canonical Work Item과 Graph를 다시 읽은 뒤 현재 상태에서 이어가세요.",
    action: "refresh_latest",
    actionLabel: "최신 상태 다시 불러오기",
  },
  mcp_export_failed: {
    title: "Application Context를 내보내지 못했습니다",
    description: "생성된 Work Item과 application directory를 보존한 채 같은 bootstrap endpoint로 export를 이어갑니다.",
    action: "retry_context_export",
    actionLabel: "Context 다시 내보내기",
  },
};

export interface JourneyRecoveryObservation {
  snapshot: CodexCompanionSnapshotV2 | null;
  errorCode: string | null;
  workId: string | null;
  launchedAt: string | null;
  diagnosticBaseline: CompanionDiagnostics | null;
  observedPendingTicket: boolean;
}

const ERROR_STATES: Readonly<Record<string, JourneyRecoveryState>> = {
  bridge_unavailable: "bridge_down",
  invalid_bridge_endpoint: "bridge_down",
  work_item_missing: "work_item_missing",
  code_unavailable: "vscode_unavailable",
  code_launch_failed: "vscode_launch_failed",
  workspace_generation_failed: "vscode_launch_failed",
  launch_cooldown: "launch_cooldown",
  ticket_expired: "enrollment_expired",
  invalid_activation: "activation_rejected",
  stale_selection: "stale_revision",
  stale_revision: "stale_revision",
  etag_conflict: "stale_revision",
  graph_revision_changed: "stale_revision",
  canonical_handoff_stale: "stale_revision",
  source_turn_stale: "stale_revision",
  source_revision_unavailable: "stale_revision",
  mcp_export_failed: "mcp_export_failed",
};

export function recoveryStateFromErrorCode(code: string | null): JourneyRecoveryState | null {
  return code ? ERROR_STATES[code] ?? null : null;
}

export function classifyJourneyRecovery(observation: JourneyRecoveryObservation): JourneyRecoveryState | null {
  const fromError = recoveryStateFromErrorCode(observation.errorCode);
  if (fromError) return fromError;

  const { snapshot, workId, launchedAt, diagnosticBaseline, observedPendingTicket } = observation;
  if (snapshot && !snapshot.capabilities.bridge_available) return "bridge_down";
  if (!snapshot || !workId || !launchedAt) return null;

  const exactSessions = snapshot.sessions.filter((session) => (
    session.work_id === workId
    && session.role === "plan"
    && session.activation_origin === "af_vscode_launch"
    && session.participation === "companion_active"
    && Date.parse(session.started_at) >= Date.parse(launchedAt) - 5_000
  ));
  const pendingTicket = snapshot.enrollment_tickets.some((ticket) => (
    ticket.work_id === workId
    && ticket.requested_role === "plan"
    && ticket.activation_origin === "af_vscode_launch"
    && ticket.status === "pending"
    && Date.parse(ticket.issued_at) >= Date.parse(launchedAt) - 5_000
  ));

  if (diagnosticBaseline && observedPendingTicket) {
    if (snapshot.diagnostics.invalid_activation_attempts > diagnosticBaseline.invalid_activation_attempts) {
      return "activation_rejected";
    }
    if (snapshot.diagnostics.expired_tickets > diagnosticBaseline.expired_tickets) {
      return "enrollment_expired";
    }
    if (snapshot.diagnostics.ignored_hook_invocations > diagnosticBaseline.ignored_hook_invocations) {
      return "hook_not_observed";
    }
  }

  if (exactSessions.some((session) => session.last_turn_id === null)) return "hook_not_observed";
  if (pendingTicket && exactSessions.length === 0) return "enrollment_unclaimed";
  return null;
}
