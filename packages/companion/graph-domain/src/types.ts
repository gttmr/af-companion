export const graphNodeKinds = [
  "input", "agent", "tool", "function", "human_input", "subworkflow", "join", "output",
] as const;
export const graphControlKinds = [
  "next", "condition", "fan_out", "fan_in", "loop_back", "loop_exit", "retry", "fallback",
  "error", "callback", "resume", "cancel", "timeout",
] as const;
export const graphChannels = ["event", "state", "artifact"] as const;
export const graphRegionKinds = ["parallel", "loop"] as const;
export const functionRoles = ["transform", "validate", "route", "merge", "prepare_input", "format_output"] as const;

export type GraphNodeKind = typeof graphNodeKinds[number];
export type GraphControlKind = typeof graphControlKinds[number];
export type GraphChannel = typeof graphChannels[number];
export type GraphRegionKind = typeof graphRegionKinds[number];
export type FunctionRole = typeof functionRoles[number];

export interface AvailableToolReference {
  tool_ref: string;
  invocation_control: "agent";
}

export interface HumanInputContract {
  message: string;
  payload_schema_ref: string | null;
  response_schema_ref: string | null;
  response_mapping: Record<string, string> | null;
  choice_options?: string[] | null;
  accepted_aliases?: Record<string, string[]> | null;
  default_choice?: string | null;
}

interface GraphNodeBase { id: string; label: string }
export type GraphNode =
  | (GraphNodeBase & { node_kind: "input" | "join" | "output" })
  | (GraphNodeBase & { node_kind: "agent"; agent_ref: string; available_tools: AvailableToolReference[] })
  | (GraphNodeBase & { node_kind: "tool"; tool_ref: string; invocation_control: "workflow" })
  | (GraphNodeBase & { node_kind: "function"; role: FunctionRole })
  | (GraphNodeBase & { node_kind: "human_input"; human_input_contract: HumanInputContract })
  | (GraphNodeBase & { node_kind: "subworkflow"; workflow_ref: string });

export interface GraphEdgeControl {
  kind: GraphControlKind;
  condition: string | null;
  accepted_aliases: string[];
  default: boolean;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  control: GraphEdgeControl;
  channel: GraphChannel | null;
}

export interface GraphRegion {
  id: string;
  kind: GraphRegionKind;
  node_ids: string[];
  entry_node_ids: string[];
  exit_node_ids: string[];
  parent_region_id: string | null;
}

export interface GraphIR {
  graph_id: string;
  source_requirement_id: string;
  workflow_ref: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  regions: GraphRegion[];
}

export type GraphElementKind = "node" | "edge" | "region";
export interface GraphSelection { kind: GraphElementKind; id: string }

export type GraphEditOperation =
  | { op: "add"; target: "node"; value: GraphNode }
  | { op: "replace"; target: "node"; id: string; value: GraphNode }
  | { op: "remove"; target: "node"; id: string }
  | { op: "add"; target: "edge"; value: GraphEdge }
  | { op: "replace"; target: "edge"; id: string; value: GraphEdge }
  | { op: "remove"; target: "edge"; id: string }
  | { op: "add"; target: "region"; value: GraphRegion }
  | { op: "replace"; target: "region"; id: string; value: GraphRegion }
  | { op: "remove"; target: "region"; id: string };

export interface GraphValidationIssue {
  code: string;
  path: string;
  message: string;
  target_kind: GraphElementKind | "graph";
  target_id: string | null;
}

export interface GraphValidationResult { ok: boolean; errors: GraphValidationIssue[] }

export interface GraphDiff {
  changed_nodes: string[];
  changed_edges: string[];
  changed_regions: string[];
  changed_count: number;
}

export interface GraphPosition { x: number; y: number; pinned: boolean }
export interface GraphPresentation {
  positions: Record<string, GraphPosition>;
  viewport: { x: number; y: number; zoom: number };
}
