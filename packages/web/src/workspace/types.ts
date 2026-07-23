import type { AfWorkItemManifest } from "../analyzer/afWorkItem";

export const WORKSPACE_PROJECTION_SCHEMA_VERSION = 1 as const;

export type WorkspaceActivityKind = "codex" | "artifact" | "source" | "git" | "system";
export type WorkspaceChangeStatus = "added" | "modified" | "deleted" | "renamed" | "conflicted" | "unknown";

export interface WorkspaceIdentity {
  workspace_id: string;
  canonical_path: string;
  display_name: string;
  git_head: string | null;
  git_branch: string | null;
}

export interface WorkspaceActivity {
  id: number;
  kind: WorkspaceActivityKind;
  action: string;
  path: string | null;
  work_id: string | null;
  at: string;
}

export interface WorkspaceChange {
  path: string;
  status: WorkspaceChangeStatus;
  index_status: string;
  worktree_status: string;
  previous_path: string | null;
  area: "artifact" | "source" | "documentation" | "configuration" | "other";
}

export interface WorkspaceProjectionSnapshot {
  schema_version: typeof WORKSPACE_PROJECTION_SCHEMA_VERSION;
  sequence: number;
  generated_at: string;
  identity: WorkspaceIdentity;
  work_items: WorkspaceWorkItemSummary[];
  activities: WorkspaceActivity[];
  changes: WorkspaceChange[];
}

export interface WorkspaceWorkItemSummary {
  work_id: string;
  artifact_root: string;
  ledger_revision: number;
  focus_skill: AfWorkItemManifest["focus_skill"];
  active_runs: AfWorkItemManifest["active_runs"];
  skills: AfWorkItemManifest["skills"];
  review_gates: AfWorkItemManifest["review_gates"];
  verification: AfWorkItemManifest["verification"];
  updated_at: string;
}

export interface WorkspaceProjectionEvent {
  sequence: number;
  reason: "connected" | "filesystem" | "codex" | "graph_saved" | "refresh";
  activity: WorkspaceActivity | null;
  at: string;
}

export interface WorkspaceDiff {
  path: string;
  status: WorkspaceChangeStatus;
  diff: string;
  truncated: boolean;
  binary: boolean;
}

export interface EditorOpenReceipt {
  status: "accepted";
  mode: "workspace" | "file" | "diff";
  path: string;
  opened_at: string;
}
