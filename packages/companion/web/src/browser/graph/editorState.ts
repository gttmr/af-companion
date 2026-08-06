import type { GraphWorkspaceSnapshot } from "@agent-factory/companion-contracts";
import type { GraphEditOperation, GraphIR, GraphSelection } from "@agent-factory/companion-graph-domain";

export interface GraphEditorState {
  phase: "loading" | "ready" | "saving" | "error" | "conflict";
  workspace: GraphWorkspaceSnapshot | null;
  draftGraph: GraphIR | null;
  selection: GraphSelection | null;
  history: GraphEditOperation[][];
  redo: GraphEditOperation[][];
  notice: string | null;
  fieldErrors: Array<{ path: string; message: string }>;
}

export type GraphEditorAction =
  | { type: "loaded"; workspace: GraphWorkspaceSnapshot; notice?: string }
  | { type: "workspaceSynced"; workspace: GraphWorkspaceSnapshot }
  | { type: "loadFailed"; message: string }
  | { type: "select"; selection: GraphSelection | null }
  | { type: "stage"; operations: GraphEditOperation[] }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "saving" }
  | { type: "saveFailed"; message: string; conflict?: boolean; fieldErrors?: Array<{ path: string; message: string }> };

export const initialGraphEditorState: GraphEditorState = { phase: "loading", workspace: null, draftGraph: null, selection: null, history: [], redo: [], notice: null, fieldErrors: [] };

export function graphEditorReducer(state: GraphEditorState, action: GraphEditorAction): GraphEditorState {
  if (action.type === "loaded") {
    const history = action.workspace.active_draft ? [action.workspace.active_draft.operations] : [];
    return { phase: "ready", workspace: action.workspace, draftGraph: rebuild(action.workspace.graph, history), selection: action.workspace.active_selection, history, redo: [], notice: action.notice ?? null, fieldErrors: [] };
  }
  if (action.type === "workspaceSynced") return { ...state, workspace: action.workspace };
  if (action.type === "loadFailed") return { ...state, phase: "error", notice: action.message };
  if (action.type === "select") return { ...state, selection: action.selection, notice: null };
  if (action.type === "stage") {
    if (!state.workspace) return state;
    const history = [...state.history, action.operations];
    return { ...state, phase: "ready", draftGraph: rebuild(state.workspace.graph, history), history, redo: [], fieldErrors: [], notice: "저장 전 변경 공유됨" };
  }
  if (action.type === "undo") {
    if (!state.workspace || state.history.length === 0) return state; const history = state.history.slice(0, -1); const batch = state.history.at(-1)!;
    return { ...state, draftGraph: rebuild(state.workspace.graph, history), history, redo: [batch, ...state.redo], notice: "마지막 변경을 되돌렸습니다." };
  }
  if (action.type === "redo") {
    if (!state.workspace || state.redo.length === 0) return state; const [batch, ...redo] = state.redo; const history = [...state.history, batch!];
    return { ...state, draftGraph: rebuild(state.workspace.graph, history), history, redo, notice: "변경을 다시 적용했습니다." };
  }
  if (action.type === "saving") return { ...state, phase: "saving", notice: "Graph 저장 중…" };
  return { ...state, phase: action.conflict ? "conflict" : "error", notice: action.message, fieldErrors: action.fieldErrors ?? [] };
}

export function pendingOperations(state: GraphEditorState): GraphEditOperation[] { return state.history.flat(); }

function rebuild(base: GraphIR, history: GraphEditOperation[][]): GraphIR {
  const graph = structuredClone(base);
  for (const operation of history.flat()) {
    const list = operation.target === "node" ? graph.nodes : operation.target === "edge" ? graph.edges : graph.regions;
    if (operation.op === "add") (list as Array<typeof operation.value>).push(structuredClone(operation.value));
    else { const index = list.findIndex((entry) => entry.id === operation.id); if (index === -1) continue; if (operation.op === "remove") list.splice(index, 1); else (list as Array<typeof operation.value>)[index] = structuredClone(operation.value); }
  }
  return graph;
}
