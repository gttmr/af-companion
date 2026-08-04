import type { Readable, Writable } from "node:stream";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { GraphEditOperation } from "@agent-factory/companion-graph-domain";
import { createGraphControlClient, GraphControlClientError, type GraphControlClient } from "./client.js";

export const GET_GRAPH_WORKSPACE_TOOL = "companion_get_graph_workspace";
export const APPLY_GRAPH_CHANGES_TOOL = "companion_apply_graph_changes";
const INSTRUCTIONS = "For every Graph change, call companion_get_graph_workspace first, compute an explicit operation batch from its current graph_revision, then call companion_apply_graph_changes once. On graph_stale, read again and recompute; never retry blindly. authority none, cwd, and session identifiers do not grant lifecycle authority.";

export function createGraphMcpServer(client: GraphControlClient): Server {
  const server = new Server({ name: "agent-factory-companion-graph", version: "0.2.0" }, { capabilities: { tools: {} }, instructions: INSTRUCTIONS });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions() }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === GET_GRAPH_WORKSPACE_TOOL) {
      const expected = parseGetArguments(request.params.arguments); if ("error" in expected) return failure(expected.error);
      try {
        const workspace = await client.getWorkspace();
        if (expected.expected_application_id && expected.expected_application_id !== workspace.scope.application_id) return failure("application_scope_mismatch");
        if (expected.expected_work_id && expected.expected_work_id !== workspace.scope.work_id) return failure("work_scope_mismatch");
        return success({ status: "VERIFIED", workspace });
      } catch (error) { return clientFailure(error); }
    }
    if (request.params.name === APPLY_GRAPH_CHANGES_TOOL) {
      const parsed = parseApplyArguments(request.params.arguments); if ("error" in parsed) return failure(parsed.error);
      try { const result = await client.applyChanges(parsed); return success({ status: result.outcome, workspace: result.workspace }); }
      catch (error) { return clientFailure(error); }
    }
    throw new McpError(ErrorCode.MethodNotFound, `unknown tool: ${request.params.name}`);
  });
  return server;
}

export async function runStdioServer(input: { projectRoot: string; capabilityPath?: string; stdin?: Readable; stdout?: Writable }): Promise<void> {
  const server = createGraphMcpServer(createGraphControlClient(input)); await server.connect(new StdioServerTransport(input.stdin, input.stdout));
}

export function toolDefinitions(): Array<Record<string, unknown>> { return [
  {
    name: GET_GRAPH_WORKSPACE_TOOL, title: "Get Companion Graph workspace",
    description: "Read the latest canonical Graph, Graph revision, UI selection, active draft, recent changes, and external source health.",
    inputSchema: { type: "object", additionalProperties: false, properties: { expected_application_id: { type: "string", minLength: 1, maxLength: 256 }, expected_work_id: { type: "string", minLength: 1, maxLength: 256 } } },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: APPLY_GRAPH_CHANGES_TOOL, title: "Apply Companion Graph changes",
    description: "Atomically validate and apply an explicit Node, Edge, or Region operation batch against base_graph_revision.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["base_graph_revision", "operations"],
      properties: {
        base_graph_revision: { type: "string", pattern: "^[a-f0-9]{64}$" },
        operations: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: {
            type: "object",
            required: ["op", "target"],
            properties: {
              op: { enum: ["add", "replace", "remove"] },
              target: { enum: ["node", "edge", "region"] },
              id: { type: "string" },
              value: { type: "object" },
            },
          },
        },
      },
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
]; }

function parseGetArguments(value: unknown): { expected_application_id?: string; expected_work_id?: string } | { error: string } { if (value === undefined) return {}; if (!record(value) || Object.keys(value).some((key) => !["expected_application_id", "expected_work_id"].includes(key))) return { error: "invalid_arguments" }; const result: { expected_application_id?: string; expected_work_id?: string } = {}; for (const key of ["expected_application_id", "expected_work_id"] as const) { if (value[key] !== undefined) { if (typeof value[key] !== "string" || !value[key].trim() || value[key].length > 256) return { error: `invalid_${key}` }; result[key] = value[key]; } } return result; }
function parseApplyArguments(value: unknown): { base_graph_revision: string; operations: GraphEditOperation[]; source: "mcp" } | { error: string } { if (!record(value) || Object.keys(value).some((key) => !["base_graph_revision", "operations"].includes(key)) || typeof value.base_graph_revision !== "string" || !/^[a-f0-9]{64}$/u.test(value.base_graph_revision) || !Array.isArray(value.operations) || value.operations.length === 0 || value.operations.length > 100) return { error: "invalid_arguments" }; return { base_graph_revision: value.base_graph_revision, operations: value.operations as GraphEditOperation[], source: "mcp" }; }
function clientFailure(error: unknown): CallToolResult { if (error instanceof GraphControlClientError) return failure(error.code, { status_code: error.status, ...error.details }); return failure("control_unavailable"); }
function success(payload: Record<string, unknown>): CallToolResult { return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload, isError: false }; }
function failure(reason: string, details?: Record<string, unknown>): CallToolResult { const payload = { status: "UNVERIFIED", reasons: [reason], ...details }; return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload, isError: true }; }
function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
