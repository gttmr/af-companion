import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { GraphIR } from "../analyzer/types";
import { CODEX_COMPANION_SNAPSHOT_QUERY_KEY } from "../state/useCodexSessions";
import {
  fetchGraphProjection,
  fetchWorkItem,
  fetchWorkItemFile,
  fetchWorkItemFiles,
  fetchWorkspaceDiff,
  fetchWorkspaceSnapshot,
  openInEditor,
  saveGraphProjection,
} from "./api";
import type { WorkspaceProjectionEvent } from "./types";

export const WORKSPACE_SNAPSHOT_KEY = ["workspace", "snapshot"] as const;

export function useWorkspaceProjection(workId?: string) {
  const queryClient = useQueryClient();
  const [live, setLive] = useState<"connecting" | "live" | "retrying">("connecting");
  const query = useQuery({
    queryKey: WORKSPACE_SNAPSHOT_KEY,
    queryFn: fetchWorkspaceSnapshot,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    const query = workId ? `?work_id=${encodeURIComponent(workId)}` : "";
    const source = new EventSource(`/api/workspace/events${query}`);
    source.onopen = () => setLive("live");
    source.onerror = () => setLive("retrying");
    source.addEventListener("workspace", (raw) => {
      const event = JSON.parse((raw as MessageEvent<string>).data) as WorkspaceProjectionEvent;
      setLive("live");
      void queryClient.invalidateQueries({ queryKey: WORKSPACE_SNAPSHOT_KEY });
      if (event.reason === "codex") {
        void queryClient.invalidateQueries({ queryKey: CODEX_COMPANION_SNAPSHOT_QUERY_KEY });
      }
      if (event.activity?.work_id) {
        void queryClient.invalidateQueries({ queryKey: ["work-item", event.activity.work_id] });
      }
    });
    return () => source.close();
  }, [queryClient, workId]);

  return { ...query, live };
}

/** Consume the shared projection cache without opening another EventSource. */
export function useWorkspaceSnapshot() {
  return useQuery({
    queryKey: WORKSPACE_SNAPSHOT_KEY,
    queryFn: fetchWorkspaceSnapshot,
    refetchInterval: 15_000,
    refetchIntervalInBackground: true,
  });
}

export function useWorkItem(workId: string | undefined) {
  return useQuery({
    queryKey: ["work-item", workId, "manifest"] as const,
    queryFn: () => fetchWorkItem(workId!),
    enabled: Boolean(workId),
  });
}

export function useWorkItemFiles(workId: string | undefined) {
  return useQuery({
    queryKey: ["work-item", workId, "files"] as const,
    queryFn: () => fetchWorkItemFiles(workId!),
    enabled: Boolean(workId),
  });
}

export function useWorkItemFile(workId: string | undefined, path: string | null) {
  return useQuery({
    queryKey: ["work-item", workId, "file", path] as const,
    queryFn: () => fetchWorkItemFile(workId!, path!),
    enabled: Boolean(workId && path),
  });
}

export function useGraphProjection(workId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["work-item", workId, "graph"] as const,
    queryFn: () => fetchGraphProjection(workId!),
    enabled: Boolean(workId),
  });
  const save = useMutation({
    mutationFn: (input: { graph: GraphIR; etag: string; targetSessionId: string }) =>
      saveGraphProjection(workId!, input.graph, input.etag, input.targetSessionId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["work-item", workId] }),
        queryClient.invalidateQueries({ queryKey: WORKSPACE_SNAPSHOT_KEY }),
        queryClient.invalidateQueries({ queryKey: CODEX_COMPANION_SNAPSHOT_QUERY_KEY }),
      ]);
    },
  });
  return { ...query, save };
}

export function useWorkspaceDiff(path: string | null) {
  return useQuery({
    queryKey: ["workspace", "diff", path] as const,
    queryFn: () => fetchWorkspaceDiff(path!),
    enabled: Boolean(path),
  });
}

export function useEditorActions() {
  const mutation = useMutation({ mutationFn: openInEditor });
  return useMemo(() => ({
    openFile: (path: string, line?: number) => mutation.mutateAsync({ mode: "file", path, line }),
    openDiff: (path: string) => mutation.mutateAsync({ mode: "diff", path }),
    pending: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : null,
  }), [mutation]);
}
