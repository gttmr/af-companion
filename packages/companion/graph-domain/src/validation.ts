import {
  functionRoles, graphChannels, graphControlKinds, graphNodeKinds, graphRegionKinds,
  type GraphIR, type GraphPresentation, type GraphSelection, type GraphValidationIssue,
  type GraphValidationResult,
} from "./types.js";

const NODE_KINDS = new Set<string>(graphNodeKinds);
const CONTROLS = new Set<string>(graphControlKinds);
const CHANNELS = new Set<string>(graphChannels);
const REGIONS = new Set<string>(graphRegionKinds);
const ROLES = new Set<string>(functionRoles);

export class GraphValidationError extends Error {
  constructor(readonly issues: GraphValidationIssue[]) {
    super(issues[0]?.message ?? "Graph validation failed");
    this.name = "GraphValidationError";
  }
}

export function validateGraph(input: unknown): GraphValidationResult {
  const errors: GraphValidationIssue[] = [];
  if (!record(input)) return result([issue("invalid_graph", "graph", "Graph must be an object.", "graph", null)]);
  exact(input, ["graph_id", "source_requirement_id", "workflow_ref", "nodes", "edges", "regions"], "graph", errors);
  required(input.graph_id, "graph.graph_id", errors, "graph", null);
  required(input.source_requirement_id, "graph.source_requirement_id", errors, "graph", null);
  if (input.workflow_ref !== null) required(input.workflow_ref, "graph.workflow_ref", errors, "graph", null);

  const nodeIds = new Set<string>();
  if (!Array.isArray(input.nodes)) errors.push(issue("invalid_nodes", "graph.nodes", "nodes must be an array.", "graph", null));
  else input.nodes.forEach((node, index) => validateNode(node, index, nodeIds, errors));

  const edgeIds = new Set<string>();
  if (!Array.isArray(input.edges)) errors.push(issue("invalid_edges", "graph.edges", "edges must be an array.", "graph", null));
  else input.edges.forEach((edge, index) => validateEdge(edge, index, nodeIds, edgeIds, errors));

  const regionIds = new Set<string>();
  if (!Array.isArray(input.regions)) errors.push(issue("invalid_regions", "graph.regions", "regions must be an array.", "graph", null));
  else {
    input.regions.forEach((region, index) => validateRegion(region, index, nodeIds, regionIds, errors));
    for (const [index, region] of input.regions.entries()) {
      if (record(region) && typeof region.parent_region_id === "string" && !regionIds.has(region.parent_region_id)) {
        errors.push(issue("dangling_parent_region", `graph.regions[${index}].parent_region_id`, "parent Region does not exist.", "region", stringOrNull(region.id)));
      }
    }
    validateRegionCycles(input.regions, errors);
  }
  return result(errors);
}

export function assertGraph(input: unknown): asserts input is GraphIR {
  const validation = validateGraph(input);
  if (!validation.ok) throw new GraphValidationError(validation.errors);
}

export function assertSelection(input: unknown, graph: GraphIR): asserts input is GraphSelection | null {
  if (input === null) return;
  if (!record(input) || !["node", "edge", "region"].includes(String(input.kind)) || typeof input.id !== "string") {
    throw new GraphValidationError([issue("invalid_selection", "selection", "Selection is invalid.", "graph", null)]);
  }
  const list = input.kind === "node" ? graph.nodes : input.kind === "edge" ? graph.edges : graph.regions;
  if (!list.some((entry) => entry.id === input.id)) {
    throw new GraphValidationError([issue("selection_missing", "selection.id", "Selected element does not exist.", input.kind as "node" | "edge" | "region", input.id)]);
  }
}

export function assertPresentation(input: unknown, graph: GraphIR): asserts input is GraphPresentation {
  if (!record(input) || !record(input.positions) || !record(input.viewport)) {
    throw new GraphValidationError([issue("invalid_presentation", "presentation", "Presentation is invalid.", "graph", null)]);
  }
  for (const [id, position] of Object.entries(input.positions)) {
    if (!graph.nodes.some((node) => node.id === id) || !record(position)
      || !finite(position.x) || !finite(position.y) || typeof position.pinned !== "boolean") {
      throw new GraphValidationError([issue("invalid_position", `presentation.positions.${id}`, "Node position is invalid.", "node", id)]);
    }
  }
  if (!finite(input.viewport.x) || !finite(input.viewport.y) || !finite(input.viewport.zoom)
    || Number(input.viewport.zoom) < 0.1 || Number(input.viewport.zoom) > 4) {
    throw new GraphValidationError([issue("invalid_viewport", "presentation.viewport", "Viewport is invalid.", "graph", null)]);
  }
}

function validateNode(value: unknown, index: number, ids: Set<string>, errors: GraphValidationIssue[]): void {
  const path = `graph.nodes[${index}]`;
  if (!record(value)) { errors.push(issue("invalid_node", path, "Node must be an object.", "node", null)); return; }
  const kind = value.node_kind;
  const extra = kind === "agent" ? ["agent_ref", "available_tools"] : kind === "tool" ? ["tool_ref", "invocation_control"]
    : kind === "function" ? ["role"] : kind === "human_input" ? ["human_input_contract"] : kind === "subworkflow" ? ["workflow_ref"] : [];
  exact(value, ["id", "label", "node_kind", ...extra], path, errors, "node", stringOrNull(value.id));
  required(value.id, `${path}.id`, errors, "node", stringOrNull(value.id));
  required(value.label, `${path}.label`, errors, "node", stringOrNull(value.id));
  if (typeof value.id === "string") {
    if (ids.has(value.id)) errors.push(issue("duplicate_node_id", `${path}.id`, "Node ID is duplicated.", "node", value.id));
    ids.add(value.id);
  }
  if (typeof kind !== "string" || !NODE_KINDS.has(kind)) errors.push(issue("invalid_node_kind", `${path}.node_kind`, "Node kind is invalid.", "node", stringOrNull(value.id)));
  if (kind === "agent") {
    required(value.agent_ref, `${path}.agent_ref`, errors, "node", stringOrNull(value.id));
    if (!Array.isArray(value.available_tools)) errors.push(issue("invalid_available_tools", `${path}.available_tools`, "available_tools must be an array.", "node", stringOrNull(value.id)));
    else for (const [toolIndex, tool] of value.available_tools.entries()) {
      const toolPath = `${path}.available_tools[${toolIndex}]`;
      if (!record(tool)) errors.push(issue("invalid_available_tool", toolPath, "Available Tool must be an object.", "node", stringOrNull(value.id)));
      else {
        exact(tool, ["tool_ref", "invocation_control"], toolPath, errors, "node", stringOrNull(value.id));
        required(tool.tool_ref, `${toolPath}.tool_ref`, errors, "node", stringOrNull(value.id));
        if (tool.invocation_control !== "agent") errors.push(issue("invalid_invocation_control", `${toolPath}.invocation_control`, "Agent Tool invocation control must be agent.", "node", stringOrNull(value.id)));
      }
    }
  } else if (kind === "tool") {
    required(value.tool_ref, `${path}.tool_ref`, errors, "node", stringOrNull(value.id));
    if (value.invocation_control !== "workflow") errors.push(issue("invalid_invocation_control", `${path}.invocation_control`, "Tool invocation control must be workflow.", "node", stringOrNull(value.id)));
  } else if (kind === "function" && (typeof value.role !== "string" || !ROLES.has(value.role))) {
    errors.push(issue("invalid_function_role", `${path}.role`, "Function role is invalid.", "node", stringOrNull(value.id)));
  } else if (kind === "subworkflow") required(value.workflow_ref, `${path}.workflow_ref`, errors, "node", stringOrNull(value.id));
  else if (kind === "human_input") validateHuman(value.human_input_contract, `${path}.human_input_contract`, stringOrNull(value.id), errors);
}

function validateHuman(value: unknown, path: string, id: string | null, errors: GraphValidationIssue[]): void {
  if (!record(value)) { errors.push(issue("invalid_human_input_contract", path, "Human input contract is invalid.", "node", id)); return; }
  const keys = ["message", "payload_schema_ref", "response_schema_ref", "response_mapping", "choice_options", "accepted_aliases", "default_choice"];
  exact(value, keys, path, errors, "node", id, ["message", "payload_schema_ref", "response_schema_ref", "response_mapping"]);
  required(value.message, `${path}.message`, errors, "node", id);
  for (const key of ["payload_schema_ref", "response_schema_ref", "default_choice"] as const) {
    if (value[key] !== undefined && value[key] !== null) required(value[key], `${path}.${key}`, errors, "node", id);
  }
  if (value.response_mapping !== null && (!record(value.response_mapping) || Object.values(value.response_mapping).some((entry) => typeof entry !== "string"))) {
    errors.push(issue("invalid_response_mapping", `${path}.response_mapping`, "response_mapping must be a string map or null.", "node", id));
  }
  if (value.choice_options !== undefined && value.choice_options !== null && !strings(value.choice_options)) errors.push(issue("invalid_choices", `${path}.choice_options`, "choice_options must be strings.", "node", id));
  if (value.accepted_aliases !== undefined && value.accepted_aliases !== null && (!record(value.accepted_aliases) || Object.values(value.accepted_aliases).some((entry) => !strings(entry)))) errors.push(issue("invalid_aliases", `${path}.accepted_aliases`, "accepted_aliases must map to string arrays.", "node", id));
}

function validateEdge(value: unknown, index: number, nodeIds: Set<string>, ids: Set<string>, errors: GraphValidationIssue[]): void {
  const path = `graph.edges[${index}]`;
  if (!record(value)) { errors.push(issue("invalid_edge", path, "Edge must be an object.", "edge", null)); return; }
  exact(value, ["id", "from", "to", "control", "channel"], path, errors, "edge", stringOrNull(value.id));
  for (const key of ["id", "from", "to"] as const) required(value[key], `${path}.${key}`, errors, "edge", stringOrNull(value.id));
  if (typeof value.id === "string") { if (ids.has(value.id)) errors.push(issue("duplicate_edge_id", `${path}.id`, "Edge ID is duplicated.", "edge", value.id)); ids.add(value.id); }
  if (typeof value.from === "string" && !nodeIds.has(value.from)) errors.push(issue("dangling_edge_from", `${path}.from`, "Edge source does not exist.", "edge", stringOrNull(value.id)));
  if (typeof value.to === "string" && !nodeIds.has(value.to)) errors.push(issue("dangling_edge_to", `${path}.to`, "Edge target does not exist.", "edge", stringOrNull(value.id)));
  if (!record(value.control)) errors.push(issue("invalid_control", `${path}.control`, "Edge control is invalid.", "edge", stringOrNull(value.id)));
  else {
    exact(value.control, ["kind", "condition", "accepted_aliases", "default"], `${path}.control`, errors, "edge", stringOrNull(value.id));
    if (typeof value.control.kind !== "string" || !CONTROLS.has(value.control.kind)) errors.push(issue("invalid_control_kind", `${path}.control.kind`, "Control kind is invalid.", "edge", stringOrNull(value.id)));
    if (value.control.condition !== null) required(value.control.condition, `${path}.control.condition`, errors, "edge", stringOrNull(value.id));
    if (!strings(value.control.accepted_aliases, true)) errors.push(issue("invalid_accepted_aliases", `${path}.control.accepted_aliases`, "accepted_aliases must be a string array.", "edge", stringOrNull(value.id)));
    if (typeof value.control.default !== "boolean") errors.push(issue("invalid_default", `${path}.control.default`, "default must be boolean.", "edge", stringOrNull(value.id)));
  }
  if (value.channel !== null && (typeof value.channel !== "string" || !CHANNELS.has(value.channel))) errors.push(issue("invalid_channel", `${path}.channel`, "Channel is invalid.", "edge", stringOrNull(value.id)));
}

function validateRegion(value: unknown, index: number, nodeIds: Set<string>, ids: Set<string>, errors: GraphValidationIssue[]): void {
  const path = `graph.regions[${index}]`;
  if (!record(value)) { errors.push(issue("invalid_region", path, "Region must be an object.", "region", null)); return; }
  exact(value, ["id", "kind", "node_ids", "entry_node_ids", "exit_node_ids", "parent_region_id"], path, errors, "region", stringOrNull(value.id));
  required(value.id, `${path}.id`, errors, "region", stringOrNull(value.id));
  if (typeof value.id === "string") { if (ids.has(value.id)) errors.push(issue("duplicate_region_id", `${path}.id`, "Region ID is duplicated.", "region", value.id)); ids.add(value.id); }
  if (typeof value.kind !== "string" || !REGIONS.has(value.kind)) errors.push(issue("invalid_region_kind", `${path}.kind`, "Region kind is invalid.", "region", stringOrNull(value.id)));
  const members = Array.isArray(value.node_ids) ? new Set(value.node_ids.filter((id): id is string => typeof id === "string")) : new Set<string>();
  for (const key of ["node_ids", "entry_node_ids", "exit_node_ids"] as const) {
    const list = value[key];
    if (!Array.isArray(list) || list.some((id) => typeof id !== "string" || !nodeIds.has(id))) errors.push(issue("invalid_region_nodes", `${path}.${key}`, "Region contains a missing Node.", "region", stringOrNull(value.id)));
    else if (key !== "node_ids" && list.some((id) => !members.has(id))) errors.push(issue("invalid_region_membership", `${path}.${key}`, "Entry and exit Nodes must be Region members.", "region", stringOrNull(value.id)));
  }
  if (value.parent_region_id !== null) required(value.parent_region_id, `${path}.parent_region_id`, errors, "region", stringOrNull(value.id));
}

function validateRegionCycles(regions: unknown[], errors: GraphValidationIssue[]): void {
  const parents = new Map<string, string | null>();
  for (const region of regions) if (record(region) && typeof region.id === "string") parents.set(region.id, typeof region.parent_region_id === "string" ? region.parent_region_id : null);
  for (const id of parents.keys()) {
    const seen = new Set([id]); let parent = parents.get(id) ?? null;
    while (parent) { if (seen.has(parent)) { errors.push(issue("cyclic_parent_region", `regions.${id}.parent_region_id`, "Region parent chain is cyclic.", "region", id)); break; } seen.add(parent); parent = parents.get(parent) ?? null; }
  }
}

function exact(value: Record<string, unknown>, allowed: readonly string[], path: string, errors: GraphValidationIssue[], kind: GraphValidationIssue["target_kind"] = "graph", id: string | null = null, requiredKeys = allowed): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(issue("unknown_field", `${path}.${key}`, "Unknown field.", kind, id));
  for (const key of requiredKeys) if (!(key in value)) errors.push(issue("missing_field", `${path}.${key}`, "Required field is missing.", kind, id));
}
function required(value: unknown, path: string, errors: GraphValidationIssue[], kind: GraphValidationIssue["target_kind"], id: string | null): void { if (typeof value !== "string" || !value.trim() || value.length > 512) errors.push(issue("invalid_string", path, "Expected a non-empty bounded string.", kind, id)); }
function strings(value: unknown, allowEmpty = false): value is string[] { return Array.isArray(value) && value.every((entry) => typeof entry === "string" && (allowEmpty || Boolean(entry.trim()))); }
function finite(value: unknown): boolean { return typeof value === "number" && Number.isFinite(value); }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function stringOrNull(value: unknown): string | null { return typeof value === "string" ? value : null; }
function issue(code: string, path: string, message: string, target_kind: GraphValidationIssue["target_kind"], target_id: string | null): GraphValidationIssue { return { code, path, message, target_kind, target_id }; }
function result(errors: GraphValidationIssue[]): GraphValidationResult { return { ok: errors.length === 0, errors }; }
