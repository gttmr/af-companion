import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CodexCompanionSnapshot,
  CodexSession,
  CodexSessionRole,
  ContextDelivery,
  VscodeLaunchReceipt
} from "../companion/types";

export const CODEX_COMPANION_SNAPSHOT_QUERY_KEY = ["codex-companion", "snapshot"] as const;

interface UseCodexSessionsOptions {
  enabled?: boolean;
}

interface SessionPreferencesInput {
  sessionId: string;
  preferences: {
    alias?: string | null;
    default_target?: boolean;
  };
}

interface SessionAttachmentInput {
  sessionId: string;
  workId: string;
  role: Exclude<CodexSessionRole, "unassigned">;
}

export function useCodexSessions({ enabled = true }: UseCodexSessionsOptions = {}) {
  const queryClient = useQueryClient();
  const snapshotQuery = useQuery<CodexCompanionSnapshot>({
    queryKey: CODEX_COMPANION_SNAPSHOT_QUERY_KEY,
    queryFn: fetchCodexCompanionSnapshot,
    enabled,
    refetchInterval: 2_000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true
  });

  const launchMutation = useMutation<VscodeLaunchReceipt>({
    mutationFn: async () => {
      const response = await fetch("/api/codex-companion/launch-vscode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      if (!response.ok) {
        throw new Error(await codexCompanionResponseMessage(response, "VS Code Worktree 열기 요청에 실패했습니다."));
      }
      return (await response.json()) as VscodeLaunchReceipt;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CODEX_COMPANION_SNAPSHOT_QUERY_KEY });
    }
  });

  const preferencesMutation = useMutation<unknown, Error, SessionPreferencesInput>({
    mutationFn: async ({ sessionId, preferences }) => {
      const response = await fetch(`/api/codex-companion/sessions/${encodeURIComponent(sessionId)}/preferences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences)
      });
      if (!response.ok) {
        throw new Error(await codexCompanionResponseMessage(response, "Codex session 설정을 저장하지 못했습니다."));
      }
      if (response.status === 204) return null;
      return response.json().catch(() => null);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CODEX_COMPANION_SNAPSHOT_QUERY_KEY });
    }
  });

  const cancelMutation = useMutation<{ delivery: ContextDelivery }, Error, string>({
    mutationFn: async (deliveryId) => {
      const response = await fetch(`/api/codex-companion/deliveries/${encodeURIComponent(deliveryId)}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      if (!response.ok) {
        throw new Error(await codexCompanionResponseMessage(response, "대기 중인 Context 전달을 취소하지 못했습니다."));
      }
      return (await response.json()) as { delivery: ContextDelivery };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CODEX_COMPANION_SNAPSHOT_QUERY_KEY });
    }
  });

  const attachmentMutation = useMutation<CodexSession, Error, SessionAttachmentInput>({
    mutationFn: async ({ sessionId, workId, role }) => {
      const response = await fetch("/api/codex-companion/sessions/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, work_id: workId, role })
      });
      if (!response.ok) {
        throw new Error(await codexCompanionResponseMessage(response, "Codex session을 Work Item에 연결하지 못했습니다."));
      }
      return (await response.json()) as CodexSession;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CODEX_COMPANION_SNAPSHOT_QUERY_KEY });
    }
  });

  return {
    snapshot: snapshotQuery.data ?? null,
    snapshotLoading: snapshotQuery.isLoading,
    snapshotRefreshing: snapshotQuery.isFetching,
    snapshotError: snapshotQuery.error instanceof Error ? snapshotQuery.error.message : null,
    launchVscode: () => launchMutation.mutateAsync(),
    launchPending: launchMutation.isPending,
    launchReceipt: launchMutation.data ?? null,
    launchError: launchMutation.error instanceof Error ? launchMutation.error.message : null,
    updatePreferences: (input: SessionPreferencesInput) => preferencesMutation.mutateAsync(input),
    preferencesPending: preferencesMutation.isPending,
    preferencesSessionId: preferencesMutation.variables?.sessionId ?? null,
    preferencesError: preferencesMutation.error instanceof Error ? preferencesMutation.error.message : null,
    cancelDelivery: (deliveryId: string) => cancelMutation.mutateAsync(deliveryId),
    cancelPendingDeliveryId: cancelMutation.isPending ? cancelMutation.variables ?? null : null,
    cancelError: cancelMutation.error instanceof Error ? cancelMutation.error.message : null,
    attachSession: (input: SessionAttachmentInput) => attachmentMutation.mutateAsync(input),
    attachmentPending: attachmentMutation.isPending,
    attachmentError: attachmentMutation.error instanceof Error ? attachmentMutation.error.message : null
  };
}

async function fetchCodexCompanionSnapshot(): Promise<CodexCompanionSnapshot> {
  const response = await fetch("/api/codex-companion/snapshot");
  if (!response.ok) {
    throw new Error(await codexCompanionResponseMessage(response, "Codex session snapshot을 가져오지 못했습니다."));
  }
  return (await response.json()) as CodexCompanionSnapshot;
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
