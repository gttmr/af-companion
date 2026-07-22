import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CodexCompanionSnapshot, CodexSession, ContextDelivery, SelectionBundleV1 } from "../companion/types";
import {
  CODEX_COMPANION_SNAPSHOT_QUERY_KEY,
  codexCompanionResponseMessage,
  useCodexSessions
} from "./useCodexSessions";

const MAX_CONTEXT_NODES = 20;

export interface QueueCodexContextResult {
  delivery: ContextDelivery;
  bundle: SelectionBundleV1;
  preview: string;
}

interface UseCodexCompanionOptions {
  requirementId: string | undefined;
  expectedGraphEtag: string | null;
  availableNodeIds: readonly string[];
  enabled: boolean;
}

export interface CodexCompanionController {
  modeActive: boolean;
  selectedNodeIds: readonly string[];
  targetSessionId: string;
  userIntent: string;
  expectedGraphEtag: string | null;
  snapshot: CodexCompanionSnapshot | null;
  liveSessions: readonly CodexSession[];
  deliveries: readonly ContextDelivery[];
  snapshotLoading: boolean;
  snapshotError: string | null;
  queuePending: boolean;
  cancelPendingDeliveryId: string | null;
  queueError: string | null;
  cancelError: string | null;
  selectionError: string | null;
  queueResult: QueueCodexContextResult | null;
  setModeActive: (active: boolean) => void;
  toggleNode: (nodeId: string) => void;
  removeNode: (nodeId: string) => void;
  clearNodes: () => void;
  setTargetSessionId: (sessionId: string) => void;
  setUserIntent: (value: string) => void;
  queueContext: () => Promise<void>;
  cancelDelivery: (deliveryId: string) => Promise<void>;
}

export function useCodexCompanion({
  requirementId,
  expectedGraphEtag,
  availableNodeIds,
  enabled
}: UseCodexCompanionOptions): CodexCompanionController {
  const queryClient = useQueryClient();
  const [modeActive, setModeActiveState] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [targetSessionId, setTargetSessionIdState] = useState("");
  const [userIntent, setUserIntentState] = useState("");
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const graphEtagRef = useRef(expectedGraphEtag);
  const targetWasManuallySetRef = useRef(false);
  const sessions = useCodexSessions({ enabled });

  const queueMutation = useMutation<QueueCodexContextResult>({
    mutationFn: async () => {
      if (!requirementId) throw new Error("requirement_id가 없습니다.");
      if (!expectedGraphEtag) throw new Error("projection snapshot이 아직 준비되지 않았습니다.");
      const response = await fetch("/api/codex-companion/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requirement_id: requirementId,
          node_ids: selectedNodeIds,
          target_session_id: targetSessionId,
          user_intent: userIntent.trim() || null,
          expected_graph_etag: expectedGraphEtag
        })
      });
      if (!response.ok) throw new Error(await codexCompanionResponseMessage(response, "CLI Context 첨부 요청에 실패했습니다."));
      return (await response.json()) as QueueCodexContextResult;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CODEX_COMPANION_SNAPSHOT_QUERY_KEY });
    }
  });

  const availableNodeKey = availableNodeIds.join("\u0000");
  useEffect(() => {
    const available = new Set(availableNodeIds);
    setSelectedNodeIds((current) => current.filter((nodeId) => available.has(nodeId)));
  }, [availableNodeKey]);

  useEffect(() => {
    const previous = graphEtagRef.current;
    graphEtagRef.current = expectedGraphEtag;
    if (!previous || !expectedGraphEtag || previous === expectedGraphEtag) return;
    setSelectedNodeIds([]);
    setSelectionError("Graph projection이 갱신되어 CLI Context 선택을 초기화했습니다.");
    queueMutation.reset();
  }, [expectedGraphEtag]);

  const liveSessions = useMemo(
    () => (sessions.snapshot?.sessions ?? []).filter((session) => session.status === "active"),
    [sessions.snapshot?.sessions]
  );

  useEffect(() => {
    if (targetWasManuallySetRef.current || targetSessionId) return;
    const activeDefault = liveSessions.find((session) => session.default_target);
    if (!activeDefault) return;
    setTargetSessionIdState(activeDefault.session_id);
    queueMutation.reset();
  }, [liveSessions, targetSessionId]);

  const resetQueueResult = useCallback(() => queueMutation.reset(), [queueMutation]);
  const setModeActive = useCallback((active: boolean) => {
    setModeActiveState(active);
    setSelectionError(null);
  }, []);
  const toggleNode = useCallback((nodeId: string) => {
    setSelectedNodeIds((current) => {
      const existingIndex = current.indexOf(nodeId);
      if (existingIndex >= 0) {
        setSelectionError(null);
        return current.filter((id) => id !== nodeId);
      }
      if (current.length >= MAX_CONTEXT_NODES) {
        setSelectionError(`CLI Context는 Node를 최대 ${MAX_CONTEXT_NODES}개까지 선택할 수 있습니다.`);
        return current;
      }
      setSelectionError(null);
      return [...current, nodeId];
    });
    resetQueueResult();
  }, [resetQueueResult]);
  const removeNode = useCallback((nodeId: string) => {
    setSelectedNodeIds((current) => current.filter((id) => id !== nodeId));
    setSelectionError(null);
    resetQueueResult();
  }, [resetQueueResult]);
  const clearNodes = useCallback(() => {
    setSelectedNodeIds([]);
    setSelectionError(null);
    resetQueueResult();
  }, [resetQueueResult]);
  const setTargetSessionId = useCallback((sessionId: string) => {
    targetWasManuallySetRef.current = true;
    setTargetSessionIdState(sessionId);
    resetQueueResult();
  }, [resetQueueResult]);
  const setUserIntent = useCallback((value: string) => {
    setUserIntentState(value);
    resetQueueResult();
  }, [resetQueueResult]);
  const queueContext = useCallback(async () => {
    await queueMutation.mutateAsync();
  }, [queueMutation]);
  const cancelDelivery = useCallback(async (deliveryId: string) => {
    await sessions.cancelDelivery(deliveryId);
  }, [sessions.cancelDelivery]);

  const deliveries = useMemo(
    () => (sessions.snapshot?.deliveries ?? []).filter((delivery) =>
      !requirementId
      || delivery.bundle.artifact_root_id === requirementId
      || delivery.bundle.artifact_root_id === `artifacts/af/${requirementId}`
    ),
    [requirementId, sessions.snapshot?.deliveries]
  );

  return {
    modeActive,
    selectedNodeIds,
    targetSessionId,
    userIntent,
    expectedGraphEtag,
    snapshot: sessions.snapshot,
    liveSessions,
    deliveries,
    snapshotLoading: sessions.snapshotLoading,
    snapshotError: sessions.snapshotError,
    queuePending: queueMutation.isPending,
    cancelPendingDeliveryId: sessions.cancelPendingDeliveryId,
    queueError: queueMutation.error instanceof Error ? queueMutation.error.message : null,
    cancelError: sessions.cancelError,
    selectionError,
    queueResult: queueMutation.data ?? null,
    setModeActive,
    toggleNode,
    removeNode,
    clearNodes,
    setTargetSessionId,
    setUserIntent,
    queueContext,
    cancelDelivery
  };
}
