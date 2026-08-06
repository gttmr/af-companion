import {
  assertGraph,
  semanticRevision,
  type GraphDiff,
  type GraphEditOperation,
  type GraphIR,
  type GraphPresentation,
  type GraphSelection,
} from "@agent-factory/companion-graph-domain";

export const UI_CONTEXT_SCHEMA_VERSION = 2 as const;
export const UI_CONTEXT_MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

export interface CompanionScope {
  workspace_id: string;
  application_id: string;
  work_id: string | null;
}

export type GraphSourceHealth =
  | { status: "valid"; observed_at: string; graph_revision: string }
  | { status: "invalid"; observed_at: string; code: string; message: string };

export interface GraphDraft {
  base_graph_revision: string;
  operations: GraphEditOperation[];
  changed_count: number;
  updated_at: string;
}

export interface RecentGraphChange {
  source: "web" | "mcp" | "external";
  previous_graph_revision: string;
  graph_revision: string;
  diff: GraphDiff;
  changed_at: string;
}

export interface UiContextDocumentV2 {
  schema_version: 2;
  authority: "none";
  document_revision: string;
  graph_revision: string;
  published_at: string;
  scope: CompanionScope;
  graph: GraphIR;
  active_selection: GraphSelection | null;
  active_draft: GraphDraft | null;
  recent_changes: RecentGraphChange[];
  source_health: GraphSourceHealth;
}

export interface GraphWorkspaceSnapshot extends UiContextDocumentV2 {
  presentation: GraphPresentation;
}

export interface SelectionUpdateRequest { selection: GraphSelection | null }
export interface DraftUpdateRequest { base_graph_revision: string; operations: GraphEditOperation[] }
export interface ApplyGraphOperationsRequest { base_graph_revision: string; operations: GraphEditOperation[]; source?: "web" | "mcp" }
export interface PresentationUpdateRequest { presentation: GraphPresentation }
export interface ApplyGraphOperationsResponse {
  outcome: "APPLIED" | "NO_CHANGE";
  workspace: GraphWorkspaceSnapshot;
}

export class UiContextValidationError extends Error {
  constructor(readonly code: string, readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "UiContextValidationError";
  }
}

export function finalizeUiContextDocument(input: Omit<UiContextDocumentV2, "document_revision">): UiContextDocumentV2 {
  const document_revision = semanticRevision(input);
  return { ...structuredClone(input), document_revision };
}

export function serializeUiContextDocument(document: UiContextDocumentV2): string {
  parseUiContextDocument(document);
  return `${JSON.stringify(document, null, 2)}\n`;
}

export function parseUiContextDocument(input: string | unknown): UiContextDocumentV2 {
  let value: unknown = input;
  if (typeof input === "string") {
    if (new TextEncoder().encode(input).byteLength > UI_CONTEXT_MAX_DOCUMENT_BYTES) fail("document_too_large", "document", "document is too large");
    try { value = JSON.parse(input); } catch { fail("invalid_json", "document", "document is not JSON"); }
  }
  if (!record(value)) fail("invalid_document", "document", "expected an object");
  exact(value, ["schema_version", "authority", "document_revision", "graph_revision", "published_at", "scope", "graph", "active_selection", "active_draft", "recent_changes", "source_health"], "document");
  if (value.schema_version !== 2) fail("unsupported_schema_version", "schema_version", "expected 2");
  if (value.authority !== "none") fail("invalid_authority", "authority", "expected none");
  hash(value.document_revision, "document_revision");
  hash(value.graph_revision, "graph_revision");
  timestamp(value.published_at, "published_at");
  scope(value.scope);
  assertGraph(value.graph);
  if (value.active_selection !== null) selection(value.active_selection, value.graph as GraphIR);
  if (value.active_draft !== null) draft(value.active_draft);
  if (!Array.isArray(value.recent_changes) || value.recent_changes.length > 20) fail("invalid_recent_changes", "recent_changes", "expected at most 20 entries");
  value.recent_changes.forEach((entry, index) => change(entry, `recent_changes[${index}]`));
  health(value.source_health);
  const { document_revision: _revision, ...unsigned } = value;
  if (semanticRevision(unsigned) !== value.document_revision) fail("document_revision_mismatch", "document_revision", "revision does not match document content");
  return structuredClone(value) as unknown as UiContextDocumentV2;
}

function scope(value: unknown): void {
  if (!record(value)) fail("invalid_scope", "scope", "expected an object");
  exact(value, ["workspace_id", "application_id", "work_id"], "scope");
  bounded(value.workspace_id, "scope.workspace_id");
  bounded(value.application_id, "scope.application_id");
  if (value.work_id !== null) bounded(value.work_id, "scope.work_id");
}

function selection(value: unknown, graph: GraphIR): void {
  if (!record(value)) fail("invalid_selection", "active_selection", "expected an object or null");
  exact(value, ["kind", "id"], "active_selection");
  if (!['node', 'edge', 'region'].includes(String(value.kind)) || typeof value.id !== "string") fail("invalid_selection", "active_selection", "invalid selection");
  const list = value.kind === "node" ? graph.nodes : value.kind === "edge" ? graph.edges : graph.regions;
  if (!list.some((entry) => entry.id === value.id)) fail("selection_missing", "active_selection.id", "element does not exist");
}

function draft(value: unknown): void {
  if (!record(value)) fail("invalid_draft", "active_draft", "expected an object or null");
  exact(value, ["base_graph_revision", "operations", "changed_count", "updated_at"], "active_draft");
  hash(value.base_graph_revision, "active_draft.base_graph_revision");
  if (!Array.isArray(value.operations) || value.operations.length === 0 || value.operations.length > 100) fail("invalid_draft", "active_draft.operations", "expected 1 to 100 operations");
  if (value.changed_count !== value.operations.length) fail("invalid_draft", "active_draft.changed_count", "must match operations length");
  timestamp(value.updated_at, "active_draft.updated_at");
}

function change(value: unknown, path: string): void {
  if (!record(value)) fail("invalid_change", path, "expected an object");
  exact(value, ["source", "previous_graph_revision", "graph_revision", "diff", "changed_at"], path);
  if (!['web', 'mcp', 'external'].includes(String(value.source))) fail("invalid_change", `${path}.source`, "invalid source");
  hash(value.previous_graph_revision, `${path}.previous_graph_revision`); hash(value.graph_revision, `${path}.graph_revision`);
  timestamp(value.changed_at, `${path}.changed_at`);
  if (!record(value.diff) || !Array.isArray(value.diff.changed_nodes) || !Array.isArray(value.diff.changed_edges) || !Array.isArray(value.diff.changed_regions) || !Number.isInteger(value.diff.changed_count)) fail("invalid_change", `${path}.diff`, "invalid diff");
}

function health(value: unknown): void {
  if (!record(value) || !['valid', 'invalid'].includes(String(value.status))) fail("invalid_source_health", "source_health", "invalid health");
  timestamp(value.observed_at, "source_health.observed_at");
  if (value.status === "valid") hash(value.graph_revision, "source_health.graph_revision");
  else { bounded(value.code, "source_health.code"); bounded(value.message, "source_health.message"); }
}

function exact(value: Record<string, unknown>, keys: readonly string[], path: string): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) fail("unknown_field", `${path}.${key}`, "unknown field");
  for (const key of keys) if (!(key in value)) fail("missing_field", `${path}.${key}`, "required field is missing");
}
function bounded(value: unknown, path: string): void { if (typeof value !== "string" || !value.trim() || value.length > 512) fail("invalid_string", path, "expected a bounded non-empty string"); }
function hash(value: unknown, path: string): void { if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) fail("invalid_revision", path, "expected sha256"); }
function timestamp(value: unknown, path: string): void { if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail("invalid_timestamp", path, "expected ISO timestamp"); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function fail(code: string, path: string, message: string): never { throw new UiContextValidationError(code, path, message); }
