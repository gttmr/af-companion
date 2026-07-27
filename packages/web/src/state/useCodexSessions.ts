import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CodexCompanionSnapshotV2,
  HandoffAttachReceipt,
  ScopedContextDelivery,
  VscodeSessionLaunchReceipt,
} from "../companion/types";

export const CODEX_COMPANION_SNAPSHOT_QUERY_KEY = ["codex-companion", "snapshot"] as const;

interface UseCodexSessionsOptions {
  enabled?: boolean;
}

interface SessionPreferencesInput {
  sessionId: string;
  alias: string | null;
}

interface HandoffAttachmentInput {
  handoffId: string;
  targetSessionId: string;
}

export function useCodexSessions({ enabled = true }: UseCodexSessionsOptions = {}) {
  const queryClient = useQueryClient();
  const snapshotQuery = useQuery<CodexCompanionSnapshotV2>({
    queryKey: CODEX_COMPANION_SNAPSHOT_QUERY_KEY,
    queryFn: fetchCodexCompanionSnapshot,
    enabled,
    refetchInterval: 2_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  const invalidateSnapshot = async () => {
    await queryClient.invalidateQueries({ queryKey: CODEX_COMPANION_SNAPSHOT_QUERY_KEY });
  };

  const vscodeSessionMutation = useMutation<VscodeSessionLaunchReceipt, Error, string>({
    mutationFn: (workId) => postCompanion<VscodeSessionLaunchReceipt>(
      "/vscode-sessions",
      { work_id: workId, mode: "plan" },
      "VS Code 작업 session을 시작하지 못했습니다.",
    ),
    onSuccess: invalidateSnapshot,
  });

  const preferencesMutation = useMutation<unknown, Error, SessionPreferencesInput>({
    mutationFn: ({ sessionId, alias }) => postCompanion<unknown>(
      `/sessions/${encodeURIComponent(sessionId)}/preferences`,
      { alias },
      "Companion session 별칭을 저장하지 못했습니다.",
    ),
    onSuccess: invalidateSnapshot,
  });

  const revokeMutation = useMutation<unknown, Error, string>({
    mutationFn: (sessionId) => postCompanion<unknown>(
      `/sessions/${encodeURIComponent(sessionId)}/revoke`,
      {},
      "Companion session을 revoke하지 못했습니다.",
    ),
    onSuccess: invalidateSnapshot,
  });

  const attachHandoffMutation = useMutation<HandoffAttachReceipt, Error, HandoffAttachmentInput>({
    mutationFn: ({ handoffId, targetSessionId }) => postCompanion<HandoffAttachReceipt>(
      `/handoffs/${encodeURIComponent(handoffId)}/attach`,
      { target_session_id: targetSessionId },
      "기존 Companion session에 Plan Handoff를 연결하지 못했습니다.",
    ),
    onSuccess: invalidateSnapshot,
  });

  const cancelHandoffMutation = useMutation<unknown, Error, string>({
    mutationFn: (handoffId) => postCompanion<unknown>(
      `/handoffs/${encodeURIComponent(handoffId)}/cancel`,
      {},
      "Plan Handoff를 취소하지 못했습니다.",
    ),
    onSuccess: invalidateSnapshot,
  });

  const cancelDeliveryMutation = useMutation<{ delivery: ScopedContextDelivery }, Error, string>({
    mutationFn: (deliveryId) => postCompanion<{ delivery: ScopedContextDelivery }>(
      `/deliveries/${encodeURIComponent(deliveryId)}/cancel`,
      {},
      "대기 중인 Context 전달을 취소하지 못했습니다.",
    ),
    onSuccess: invalidateSnapshot,
  });

  return {
    snapshot: snapshotQuery.data ?? null,
    snapshotLoading: snapshotQuery.isLoading,
    snapshotRefreshing: snapshotQuery.isFetching,
    snapshotError: snapshotQuery.error instanceof Error ? snapshotQuery.error.message : null,
    launchVscodeSession: (workId: string) => vscodeSessionMutation.mutateAsync(workId),
    vscodeSessionPending: vscodeSessionMutation.isPending,
    vscodeSessionReceipt: vscodeSessionMutation.data ?? null,
    vscodeSessionError: mutationMessage(vscodeSessionMutation.error),
    updatePreferences: (input: SessionPreferencesInput) => preferencesMutation.mutateAsync(input),
    preferencesPending: preferencesMutation.isPending,
    preferencesSessionId: preferencesMutation.variables?.sessionId ?? null,
    preferencesError: mutationMessage(preferencesMutation.error),
    revokeSession: (sessionId: string) => revokeMutation.mutateAsync(sessionId),
    revokePendingSessionId: revokeMutation.isPending ? revokeMutation.variables ?? null : null,
    revokeError: mutationMessage(revokeMutation.error),
    attachHandoff: (input: HandoffAttachmentInput) => attachHandoffMutation.mutateAsync(input),
    attachPendingHandoffId: attachHandoffMutation.isPending ? attachHandoffMutation.variables?.handoffId ?? null : null,
    attachReceipt: attachHandoffMutation.data ?? null,
    attachError: mutationMessage(attachHandoffMutation.error),
    cancelHandoff: (handoffId: string) => cancelHandoffMutation.mutateAsync(handoffId),
    cancelPendingHandoffId: cancelHandoffMutation.isPending ? cancelHandoffMutation.variables ?? null : null,
    cancelHandoffError: mutationMessage(cancelHandoffMutation.error),
    cancelDelivery: (deliveryId: string) => cancelDeliveryMutation.mutateAsync(deliveryId),
    cancelPendingDeliveryId: cancelDeliveryMutation.isPending ? cancelDeliveryMutation.variables ?? null : null,
    cancelError: mutationMessage(cancelDeliveryMutation.error),
  };
}

async function fetchCodexCompanionSnapshot(): Promise<CodexCompanionSnapshotV2> {
  const response = await fetch("/api/codex-companion/snapshot");
  if (!response.ok) {
    throw new Error(await codexCompanionResponseMessage(response, "Companion snapshot을 가져오지 못했습니다."));
  }
  const snapshot = (await response.json()) as Partial<CodexCompanionSnapshotV2>;
  if (snapshot.schema_version !== 2) {
    throw new Error("Companion facade가 필수 v2 snapshot을 반환하지 않았습니다.");
  }
  return snapshot as CodexCompanionSnapshotV2;
}

async function postCompanion<T>(path: string, body: unknown, fallback: string): Promise<T> {
  const response = await fetch(`/api/codex-companion${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await codexCompanionResponseMessage(response, fallback);
    if ([404, 405, 501].includes(response.status)) {
      throw new Error(`현재 Companion facade에서 이 기능을 지원하지 않습니다 (HTTP ${response.status}). ${detail}`);
    }
    throw new Error(detail);
  }
  if (response.status === 204) return null as T;
  return (await response.json().catch(() => null)) as T;
}

function mutationMessage(error: Error | null): string | null {
  return error?.message ?? null;
}

export async function codexCompanionResponseMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { error?: string | { message?: string }; message?: string };
    if (typeof body.error === "string" && body.error) return body.error;
    if (typeof body.error === "object" && body.error?.message) return body.error.message;
    if (body.message) return body.message;
  } catch {
    // Keep the user-facing fallback for non-JSON bridge failures.
  }
  return fallback;
}
