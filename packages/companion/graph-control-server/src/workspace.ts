import { dirname, resolve } from "node:path";
import type { FSWatcher } from "node:fs";
import {
  finalizeUiContextDocument, serializeUiContextDocument,
  type ApplyGraphOperationsResponse, type CompanionScope, type GraphDraft, type GraphSourceHealth,
  type GraphWorkspaceSnapshot, type RecentGraphChange,
} from "@agent-factory/companion-contracts";
import {
  applyGraphOperations, assertGraph, assertPresentation, assertSelection, createDemoGraph, createDemoPresentation,
  diffGraphs, graphRevision, selectionExists, type GraphEditOperation, type GraphIR, type GraphPresentation,
  type GraphSelection,
} from "@agent-factory/companion-graph-domain";
import { ensureContainedDirectory, readStableContainedFile, SafeFileError, watchDirectory, writeAtomicJson } from "./atomic-files.js";

export const DEFAULT_GRAPH_PATH = ".agent-factory/companion-graph.json";
export const DEFAULT_PRESENTATION_PATH = ".agent-factory/companion-presentation.json";
export const DEFAULT_STATE_PATH = ".agent-factory/companion-workspace-state.json";
export const DEFAULT_CONTEXT_PATH = ".agent-factory/companion-ui-context.json";
const MAX_GRAPH_BYTES = 8 * 1024 * 1024;

export class GraphStaleError extends Error { constructor(readonly currentRevision: string) { super("Graph revision is stale"); this.name = "GraphStaleError"; } }
export class InvalidExternalSourceError extends Error { constructor(readonly health: GraphSourceHealth) { super(health.status === "invalid" ? health.message : "External source is invalid"); this.name = "InvalidExternalSourceError"; } }

export interface WorkspaceEvent {
  type: "workspace_invalidated";
  reason: "selection" | "draft" | "graph_web" | "graph_mcp" | "graph_external" | "presentation" | "source_invalid" | "source_recovered" | "app_switched";
  document_revision: string;
  graph_revision: string;
  discarded_draft_count: number;
  selection_cleared: boolean;
  changed_nodes: string[];
  changed_edges: string[];
  changed_regions: string[];
}

export interface GraphWorkspaceOptions {
  projectRoot: string;
  scope?: CompanionScope;
  graphPath?: string;
  presentationPath?: string;
  statePath?: string;
  contextPath?: string;
  initialGraph?: GraphIR;
  initialPresentation?: GraphPresentation;
  now?: () => Date;
  validateGraph?: (graph: GraphIR) => void;
}

export class GraphControlWorkspace {
  readonly projectRoot: string;
  readonly graphPath: string;
  readonly presentationPath: string;
  readonly statePath: string;
  readonly contextPath: string;
  readonly scope: CompanionScope;
  #graph!: GraphIR;
  #revision = "";
  #presentation!: GraphPresentation;
  #selection: GraphSelection | null = null;
  #draft: GraphDraft | null = null;
  #changes: RecentGraphChange[] = [];
  #health!: GraphSourceHealth;
  #snapshot!: GraphWorkspaceSnapshot;
  #tail = Promise.resolve();
  #listeners = new Set<(event: WorkspaceEvent) => void>();
  #watcher: FSWatcher | null = null;
  #watchTimer: NodeJS.Timeout | null = null;
  #now: () => Date;

  constructor(private readonly options: GraphWorkspaceOptions) {
    this.projectRoot = resolve(options.projectRoot);
    this.graphPath = options.graphPath ?? DEFAULT_GRAPH_PATH;
    this.presentationPath = options.presentationPath ?? DEFAULT_PRESENTATION_PATH;
    this.statePath = options.statePath ?? DEFAULT_STATE_PATH;
    this.contextPath = options.contextPath ?? DEFAULT_CONTEXT_PATH;
    this.scope = options.scope ?? { workspace_id: "workspace.companion-greenfield", application_id: "companion-greenfield", work_id: "document-review-demo" };
    this.#now = options.now ?? (() => new Date());
  }

  async initialize(): Promise<void> {
    await ensureContainedDirectory(this.projectRoot, dirname(this.graphPath));
    let graph: GraphIR;
    try { graph = await this.#readGraph(); }
    catch (error) {
      if (!isCode(error, "ENOENT")) throw error;
      graph = structuredClone(this.options.initialGraph ?? createDemoGraph()); assertGraph(graph); this.#validateGraph(graph); await writeAtomicJson(this.projectRoot, this.graphPath, graph);
    }
    this.#graph = graph; this.#revision = graphRevision(graph);
    this.#health = { status: "valid", observed_at: this.#iso(), graph_revision: this.#revision };
    this.#presentation = await this.#loadPresentation(this.options.initialPresentation ?? createDemoPresentation());
    await this.#loadState();
    this.#normalizePresentation();
    await this.#publish();
    const watchRoot = resolve(this.projectRoot, dirname(this.graphPath));
    this.#watcher = watchDirectory(watchRoot, () => this.#scheduleReconcile());
  }

  async close(): Promise<void> { if (this.#watchTimer) clearTimeout(this.#watchTimer); this.#watcher?.close(); await this.#tail; }

  subscribe(listener: (event: WorkspaceEvent) => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }

  async snapshot(): Promise<GraphWorkspaceSnapshot> {
    return this.#enqueue(async () => { await this.#reconcile(); return structuredClone(this.#snapshot); });
  }

  async updateSelection(selection: GraphSelection | null): Promise<GraphWorkspaceSnapshot> {
    return this.#enqueue(async () => {
      await this.#reconcile(); this.#assertWritable(); assertSelection(selection, this.#graph);
      this.#selection = selection; await this.#persistState(); await this.#publish(); this.#emit("selection");
      return structuredClone(this.#snapshot);
    });
  }

  async updateDraft(baseRevision: string, operations: GraphEditOperation[]): Promise<GraphWorkspaceSnapshot> {
    return this.#enqueue(async () => {
      await this.#reconcile(); this.#assertWritable(); this.#assertCurrent(baseRevision);
      if (operations.length > 0) applyGraphOperations(this.#graph, operations);
      this.#draft = operations.length === 0 ? null : { base_graph_revision: baseRevision, operations: structuredClone(operations), changed_count: operations.length, updated_at: this.#iso() };
      await this.#persistState(); await this.#publish(); this.#emit("draft");
      return structuredClone(this.#snapshot);
    });
  }

  async apply(baseRevision: string, operations: GraphEditOperation[], source: "web" | "mcp"): Promise<ApplyGraphOperationsResponse> {
    return this.#enqueue(async () => {
      await this.#reconcile(); this.#assertWritable(); this.#assertCurrent(baseRevision);
      const before = this.#graph; const applied = applyGraphOperations(before, operations);
      if (applied.noChange) return { outcome: "NO_CHANGE", workspace: structuredClone(this.#snapshot) };
      this.#validateGraph(applied.graph);
      await writeAtomicJson(this.projectRoot, this.graphPath, applied.graph);
      const readback = await this.#readGraph(); const readbackRevision = graphRevision(readback);
      if (readbackRevision !== applied.revision) throw new Error("Graph readback revision mismatch");
      const discarded = this.#draft?.changed_count ?? 0; const selectionCleared = !selectionExists(readback, this.#selection);
      this.#graph = readback; this.#revision = readbackRevision; this.#draft = null; if (selectionCleared) this.#selection = null;
      this.#health = { status: "valid", observed_at: this.#iso(), graph_revision: readbackRevision };
      const diff = diffGraphs(before, readback); this.#recordChange(source, baseRevision, readbackRevision, diff);
      this.#normalizePresentation(); await this.#persistState(); await this.#persistPresentation(); await this.#publish();
      this.#emit(source === "web" ? "graph_web" : "graph_mcp", discarded, selectionCleared, diff);
      return { outcome: "APPLIED", workspace: structuredClone(this.#snapshot) };
    });
  }

  async updatePresentation(presentation: GraphPresentation): Promise<GraphWorkspaceSnapshot> {
    return this.#enqueue(async () => {
      await this.#reconcile(); this.#assertWritable(); assertPresentation(presentation, this.#graph);
      this.#presentation = structuredClone(presentation); await this.#persistPresentation(); this.#snapshot = { ...this.#snapshot, presentation: structuredClone(this.#presentation) }; this.#emit("presentation");
      return structuredClone(this.#snapshot);
    });
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> { const current = this.#tail.then(operation); this.#tail = current.then(() => undefined, () => undefined); return current; }

  async #reconcile(): Promise<void> {
    let external: GraphIR;
    try { external = await this.#readGraph(); }
    catch (error) {
      const code = error instanceof SafeFileError ? error.code : isCode(error, "ENOENT") ? "source_missing" : error instanceof SyntaxError ? "invalid_json" : error instanceof Error && error.name === "GraphValidationError" ? "invalid_graph" : "source_unreadable";
      const next: GraphSourceHealth = { status: "invalid", observed_at: this.#iso(), code, message: error instanceof Error ? error.message : "Graph source cannot be read" };
      const changed = this.#health.status !== "invalid" || this.#health.code !== next.code || this.#health.message !== next.message;
      this.#health = next; if (changed) { await this.#publish(); this.#emit("source_invalid"); }
      return;
    }
    const revision = graphRevision(external);
    if (revision === this.#revision) {
      if (this.#health.status === "invalid") { this.#health = { status: "valid", observed_at: this.#iso(), graph_revision: revision }; await this.#publish(); this.#emit("source_recovered"); }
      return;
    }
    const before = this.#graph; const discarded = this.#draft?.changed_count ?? 0; const selectionCleared = !selectionExists(external, this.#selection);
    this.#graph = external; const previous = this.#revision; this.#revision = revision; this.#draft = null; if (selectionCleared) this.#selection = null;
    this.#health = { status: "valid", observed_at: this.#iso(), graph_revision: revision };
    const diff = diffGraphs(before, external); this.#recordChange("external", previous, revision, diff); this.#normalizePresentation();
    await this.#persistState(); await this.#persistPresentation(); await this.#publish(); this.#emit("graph_external", discarded, selectionCleared, diff);
  }

  #scheduleReconcile(): void {
    if (this.#watchTimer) clearTimeout(this.#watchTimer);
    this.#watchTimer = setTimeout(() => { this.#watchTimer = null; void this.#enqueue(() => this.#reconcile()); }, 80);
  }

  async #readGraph(): Promise<GraphIR> { const bytes = await readStableContainedFile(this.projectRoot, this.graphPath, MAX_GRAPH_BYTES); const value = JSON.parse(bytes.toString("utf8")) as unknown; assertGraph(value); this.#validateGraph(value); return structuredClone(value); }

  #validateGraph(graph: GraphIR): void { this.options.validateGraph?.(graph); }

  async #loadPresentation(fallback: GraphPresentation): Promise<GraphPresentation> {
    try { const value = JSON.parse((await readStableContainedFile(this.projectRoot, this.presentationPath, 1024 * 1024)).toString("utf8")) as unknown; assertPresentation(value, this.#graph); return structuredClone(value); }
    catch (error) { if (!isCode(error, "ENOENT")) { /* presentation is noncanonical; reset safely */ } const value = structuredClone(fallback); this.#presentation = value; this.#normalizePresentation(); await this.#persistPresentation(); return value; }
  }

  async #loadState(): Promise<void> {
    try {
      const value = JSON.parse((await readStableContainedFile(this.projectRoot, this.statePath, 1024 * 1024)).toString("utf8")) as { selection?: unknown; draft?: GraphDraft | null; recent_changes?: RecentGraphChange[] };
      try { assertSelection(value.selection ?? null, this.#graph); this.#selection = (value.selection ?? null) as GraphSelection | null; } catch { this.#selection = null; }
      if (value.draft?.base_graph_revision === this.#revision) { try { applyGraphOperations(this.#graph, value.draft.operations); this.#draft = value.draft; } catch { this.#draft = null; } }
      if (Array.isArray(value.recent_changes)) this.#changes = value.recent_changes.slice(-20);
    } catch (error) { if (!isCode(error, "ENOENT")) { /* state sidecar is reset */ } }
  }

  #normalizePresentation(): void {
    const next: GraphPresentation["positions"] = {};
    this.#graph.nodes.forEach((node, index) => { next[node.id] = this.#presentation?.positions[node.id] ?? { x: 60 + (index % 4) * 250, y: 80 + Math.floor(index / 4) * 170, pinned: false }; });
    this.#presentation = { positions: next, viewport: this.#presentation?.viewport ?? { x: 0, y: 0, zoom: 1 } };
  }

  #recordChange(source: RecentGraphChange["source"], previous: string, revision: string, diff: RecentGraphChange["diff"]): void { this.#changes = [...this.#changes, { source, previous_graph_revision: previous, graph_revision: revision, diff, changed_at: this.#iso() }].slice(-20); }
  #assertCurrent(base: string): void { if (base !== this.#revision) throw new GraphStaleError(this.#revision); }
  #assertWritable(): void { if (this.#health.status === "invalid") throw new InvalidExternalSourceError(this.#health); }
  #iso(): string { const date = this.#now(); if (!Number.isFinite(date.getTime())) throw new Error("Clock returned an invalid date"); return date.toISOString(); }

  async #persistState(): Promise<void> { await writeAtomicJson(this.projectRoot, this.statePath, { selection: this.#selection, draft: this.#draft, recent_changes: this.#changes }); }
  async #persistPresentation(): Promise<void> { await writeAtomicJson(this.projectRoot, this.presentationPath, this.#presentation); }
  async #publish(): Promise<void> {
    const context = finalizeUiContextDocument({ schema_version: 2, authority: "none", graph_revision: this.#revision, published_at: this.#iso(), scope: this.scope, graph: this.#graph, active_selection: this.#selection, active_draft: this.#draft, recent_changes: this.#changes, source_health: this.#health });
    this.#snapshot = { ...context, presentation: structuredClone(this.#presentation) };
    await writeAtomicJson(this.projectRoot, this.contextPath, JSON.parse(serializeUiContextDocument(context)));
  }

  #emit(reason: WorkspaceEvent["reason"], discarded_draft_count = 0, selection_cleared = false, diff = { changed_nodes: [] as string[], changed_edges: [] as string[], changed_regions: [] as string[] }): void {
    const event: WorkspaceEvent = { type: "workspace_invalidated", reason, document_revision: this.#snapshot.document_revision, graph_revision: this.#revision, discarded_draft_count, selection_cleared, ...diff };
    for (const listener of this.#listeners) listener(structuredClone(event));
  }
}

function isCode(error: unknown, code: string): error is NodeJS.ErrnoException { return error instanceof Error && "code" in error && error.code === code; }
