import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CodexCompanionSnapshot,
  CodexCompanionSnapshotV2,
  EnrollmentReceipt,
  EnrollmentRequest,
  HandoffContinueReceipt,
  ScopedContextDelivery,
  VscodeLaunchReceipt,
} from "../companion/types";

export const CODEX_COMPANION_SNAPSHOT_QUERY_KEY = ["codex-companion", "snapshot"] as const;

interface UseCodexSessionsOptions {
  enabled?: boolean;
}

interface SessionPreferencesInput {
  sessionId: string;
  alias: string | null;
}

type CompanionSnapshotResponse = CodexCompanionSnapshot | CodexCompanionSnapshotV2;

export function useCodexSessions({ enabled = true }: UseCodexSessionsOptions = {}) {
  const queryClient = useQueryClient();
  const snapshotQuery = useQuery<CompanionSnapshotResponse>({
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

  const launchMutation = useMutation<VscodeLaunchReceipt>({
    mutationFn: () => postCompanion<VscodeLaunchReceipt>(
      "/launch-vscode",
      {},
      "VS Code Worktree 열기 요청에 실패했습니다.",
    ),
    onSuccess: invalidateSnapshot,
  });

  const enrollmentMutation = useMutation<EnrollmentReceipt, Error, EnrollmentRequest>({
    mutationFn: (input) => postCompanion<EnrollmentReceipt>(
      "/enrollments",
      input,
      "Companion enrollment ticket을 만들지 못했습니다.",
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

  const continueHandoffMutation = useMutation<HandoffContinueReceipt, Error, string>({
    mutationFn: (handoffId) => postCompanion<HandoffContinueReceipt>(
      `/handoffs/${encodeURIComponent(handoffId)}/continue`,
      {},
      "Plan Handoff의 fresh-session command를 만들지 못했습니다.",
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

  const responseSnapshot = snapshotQuery.data ?? null;
  const companionSnapshot: CodexCompanionSnapshotV2 | null = isCompanionSnapshotV2(responseSnapshot)
    ? responseSnapshot
    : null;

  return {
    // Unchanged consumers still read the common v1 fields. Parent's facade now returns
    // additive v2 data; the explicit companionSnapshot below owns all v2-only behavior.
    snapshot: responseSnapshot as CodexCompanionSnapshot | null,
    companionSnapshot,
    snapshotLoading: snapshotQuery.isLoading,
    snapshotRefreshing: snapshotQuery.isFetching,
    snapshotError: snapshotQuery.error instanceof Error ? snapshotQuery.error.message : null,
    v2Unavailable: Boolean(responseSnapshot && !companionSnapshot),
    launchVscode: () => launchMutation.mutateAsync(),
    launchPending: launchMutation.isPending,
    launchReceipt: launchMutation.data ?? null,
    launchError: mutationMessage(launchMutation.error),
    createEnrollment: (input: EnrollmentRequest) => enrollmentMutation.mutateAsync(input),
    enrollmentPending: enrollmentMutation.isPending,
    enrollmentReceipt: enrollmentMutation.data ?? null,
    enrollmentError: mutationMessage(enrollmentMutation.error),
    updatePreferences: (input: SessionPreferencesInput) => preferencesMutation.mutateAsync(input),
    preferencesPending: preferencesMutation.isPending,
    preferencesSessionId: preferencesMutation.variables?.sessionId ?? null,
    preferencesError: mutationMessage(preferencesMutation.error),
    revokeSession: (sessionId: string) => revokeMutation.mutateAsync(sessionId),
    revokePendingSessionId: revokeMutation.isPending ? revokeMutation.variables ?? null : null,
    revokeError: mutationMessage(revokeMutation.error),
    continueHandoff: (handoffId: string) => continueHandoffMutation.mutateAsync(handoffId),
    continuePendingHandoffId: continueHandoffMutation.isPending ? continueHandoffMutation.variables ?? null : null,
    continueReceipt: continueHandoffMutation.data ?? null,
    continueError: mutationMessage(continueHandoffMutation.error),
    cancelHandoff: (handoffId: string) => cancelHandoffMutation.mutateAsync(handoffId),
    cancelPendingHandoffId: cancelHandoffMutation.isPending ? cancelHandoffMutation.variables ?? null : null,
    cancelHandoffError: mutationMessage(cancelHandoffMutation.error),
    cancelDelivery: (deliveryId: string) => cancelDeliveryMutation.mutateAsync(deliveryId),
    cancelPendingDeliveryId: cancelDeliveryMutation.isPending ? cancelDeliveryMutation.variables ?? null : null,
    cancelError: mutationMessage(cancelDeliveryMutation.error),
  };
}

async function fetchCodexCompanionSnapshot(): Promise<CompanionSnapshotResponse> {
  const response = await fetch("/api/codex-companion/snapshot");
  if (!response.ok) {
    throw new Error(await codexCompanionResponseMessage(response, "Companion snapshot을 가져오지 못했습니다."));
  }
  return (await response.json()) as CompanionSnapshotResponse;
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

function isCompanionSnapshotV2(snapshot: CompanionSnapshotResponse | null): snapshot is CodexCompanionSnapshotV2 {
  return snapshot?.schema_version === 2;
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
