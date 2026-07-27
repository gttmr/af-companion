import { McpError, ErrorCode, CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { findProjectContext, TOOL_NAMES, loadContext } from "./context.mjs";

const SERVER_INSTRUCTIONS = "Read Agent Factory evidence before acting. Start with af_get_context, use the returned context_revision for every later call, and stop UNVERIFIED on stale or missing evidence. Historical handoffs are never actionable. af_validate_decision_value is a read-only preview and never persists a canonical Decision. This MCP server does not provide Codex session_id or turn_id; Fresh Context remains Companion Continue.";
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export async function runServer(args, io = {}) {
  const options = parseArgs(args);
  const cwd = options.cwd ?? process.cwd();
  const contextPath = options.projectContext ? await findProjectContext(cwd) : options.context;
  await loadContext(contextPath, cwd);
  const server = createServer(() => loadContext(contextPath, cwd));
  const transport = new StdioServerTransport(io.stdin ?? process.stdin, io.stdout ?? process.stdout);
  await server.connect(transport);
}

export function createServer(contextOrProvider) {
  const server = new Server(
    { name: "agent-factory-context", version: "0.1.0" },
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: toolDefinitions() }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    let context;
    try {
      context = typeof contextOrProvider === "function" ? await contextOrProvider() : contextOrProvider;
    } catch (error) {
      return result({
        tool_outcome: "failed",
        domain_outcome: "unverified",
        status: "UNVERIFIED",
        reason: error instanceof Error ? error.message : "current Agent Factory evidence is unavailable",
      }, true);
    }
    return callTool(context, request.params);
  });
  return server;
}

export function toolDefinitions() {
  const revisionProperty = {
    type: "string",
    pattern: "^[a-f0-9]{64}$",
    description: "Exact context_revision returned by af_get_context. A mismatch fails closed as stale.",
  };
  const readOnlyAnnotations = {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  };
  return [
    {
      name: "af_get_context",
      title: "Get current Agent Factory context",
      description: "Read the current project-scoped Agent Factory context and revision. Returns UNVERIFIED when the exported evidence is not current. Does not infer Codex session or turn provenance.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          expected_context_revision: revisionProperty,
        },
      },
      annotations: readOnlyAnnotations,
    },
    {
      name: "af_get_pending_work",
      title: "Get actionable and historical work",
      description: "Read actionable pending work separately from non-claimable historical handoffs. Never selects or claims a handoff.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["expected_context_revision"],
        properties: { expected_context_revision: revisionProperty },
      },
      annotations: readOnlyAnnotations,
    },
    {
      name: "af_get_asset_or_handbook_context",
      title: "Search bounded Agent Factory evidence",
      description: "Search the bounded Asset Registry cards or Handbook evidence embedded in the current project context. Returns at most 10 items and never reads arbitrary files.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["expected_context_revision", "kind", "query"],
        properties: {
          expected_context_revision: revisionProperty,
          kind: { type: "string", enum: ["asset_registry", "handbook"] },
          query: { type: "string", minLength: 1, maxLength: 200 },
          limit: { type: "integer", minimum: 1, maximum: 10, default: 5 },
        },
      },
      annotations: readOnlyAnnotations,
    },
    {
      name: "af_validate_decision_value",
      title: "Preview an allowed decision value",
      description: "Read-only validation preview for one exact allowed decision value at the current context revision. Never records, selects, or persists a canonical Decision.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["expected_context_revision", "decision_id", "value"],
        properties: {
          expected_context_revision: revisionProperty,
          decision_id: { type: "string", minLength: 1, maxLength: 128 },
          value: { type: "string", minLength: 1, maxLength: 256 },
        },
      },
      annotations: readOnlyAnnotations,
    },
  ];
}

export function callTool(context, params) {
  const name = params.name;
  const args = isRecord(params.arguments) ? params.arguments : {};
  if (!TOOL_NAMES.includes(name)) throw new McpError(ErrorCode.MethodNotFound, `unknown tool: ${name}`);

  const argumentFailure = checkArguments(name, args);
  if (argumentFailure) return result({
    tool_outcome: "completed",
    domain_outcome: "invalid",
    status: "UNVERIFIED",
    context_revision: context.context_revision,
    reason: argumentFailure,
  }, true);

  const revisionFailure = checkRevision(context, args.expected_context_revision, name !== "af_get_context");
  if (revisionFailure) return result(revisionFailure, true);

  if (name === "af_get_context") {
    if (context.current.evidence_status !== "current") {
      return result({
        tool_outcome: "completed",
        domain_outcome: "unverified",
        status: "UNVERIFIED",
        reason: "current Agent Factory evidence is unavailable; refresh the project context and retry",
        context_revision: context.context_revision,
      }, true);
    }
    return result({
      tool_outcome: "completed",
      domain_outcome: "current",
      status: "VERIFIED",
      context_revision: context.context_revision,
      application_id: context.application_id,
      work_id: context.work_id,
      generated_at: context.generated_at,
      current: context.current,
      support: context.support,
      provenance: { codex_session_id: "not_provided", codex_turn_id: "not_provided" },
    });
  }

  if (name === "af_get_pending_work") {
    return result({
      tool_outcome: "completed",
      domain_outcome: "current",
      context_revision: context.context_revision,
      actionable: context.pending_work.actionable,
      historical_handoffs: context.pending_work.historical_handoffs,
      historical_handoffs_are_claimable: false,
    });
  }

  if (name === "af_get_asset_or_handbook_context") {
    if (!isEvidenceKind(args.kind) || typeof args.query !== "string" || !args.query.trim()) {
      return result({
        tool_outcome: "completed",
        domain_outcome: "invalid",
        status: "UNVERIFIED",
        reason: "kind and non-empty query must match the Tool schema",
        context_revision: context.context_revision,
      }, true);
    }
    const limit = Number.isInteger(args.limit) ? Math.min(Math.max(args.limit, 1), 10) : 5;
    const source = args.kind === "asset_registry" ? context.evidence.assets : context.evidence.handbook;
    const terms = args.query.toLowerCase().split(/\s+/).filter(Boolean);
    const matches = source
      .filter((item) => terms.every((term) => JSON.stringify(item).toLowerCase().includes(term)))
      .slice(0, limit);
    return result({
      tool_outcome: "completed",
      domain_outcome: matches.length > 0 ? "matched" : "no_match",
      context_revision: context.context_revision,
      kind: args.kind,
      query: args.query,
      bounded_limit: limit,
      matches,
    });
  }

  const decision = context.decisions.find((item) => item.decision_id === args.decision_id);
  if (!decision) {
    return result({
      tool_outcome: "completed",
      domain_outcome: "invalid",
      status: "UNVERIFIED",
      context_revision: context.context_revision,
      decision_id: args.decision_id ?? null,
      persisted: false,
      reason: "unknown decision_id",
    }, true);
  }
  const valid = typeof args.value === "string" && decision.allowed_values.includes(args.value);
  return result({
    tool_outcome: "completed",
    domain_outcome: valid ? "valid" : "invalid",
    status: valid ? "VERIFIED" : "UNVERIFIED",
    context_revision: context.context_revision,
    decision_id: decision.decision_id,
    decision_revision: decision.decision_revision,
    value: args.value ?? null,
    allowed_values: decision.allowed_values,
    persisted: false,
    reason: valid ? "value is allowed at the current context revision" : "value is not an exact allowed value",
  }, !valid);
}

function checkRevision(context, expected, required) {
  if (!required && expected === undefined) return null;
  if (typeof expected !== "string" || expected !== context.context_revision) {
    return {
      tool_outcome: "completed",
      domain_outcome: "stale",
      status: "UNVERIFIED",
      expected_context_revision: expected ?? null,
      current_context_revision: context.context_revision,
      reason: "context revision mismatch; call af_get_context and retry once with the current revision",
    };
  }
  return null;
}

function checkArguments(name, args) {
  const allowed = name === "af_get_context"
    ? ["expected_context_revision"]
    : name === "af_get_pending_work"
      ? ["expected_context_revision"]
      : name === "af_get_asset_or_handbook_context"
        ? ["expected_context_revision", "kind", "query", "limit"]
        : ["expected_context_revision", "decision_id", "value"];
  const unknown = Object.keys(args).filter((key) => !allowed.includes(key));
  if (unknown.length) return `unsupported Tool arguments: ${unknown.join(", ")}`;

  const expected = args.expected_context_revision;
  if (expected !== undefined && (typeof expected !== "string" || !SHA256_PATTERN.test(expected))) {
    return "expected_context_revision must be a lowercase SHA-256";
  }
  if (name !== "af_get_context" && expected === undefined) {
    return "expected_context_revision is required";
  }

  if (name === "af_get_asset_or_handbook_context") {
    if (!isEvidenceKind(args.kind)) return "kind must be asset_registry or handbook";
    if (typeof args.query !== "string" || !args.query.trim() || args.query.length > 200) {
      return "query must contain 1 to 200 characters";
    }
    if (args.limit !== undefined && (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 10)) {
      return "limit must be an integer from 1 to 10";
    }
  }

  if (name === "af_validate_decision_value") {
    if (typeof args.decision_id !== "string" || args.decision_id.length < 1 || args.decision_id.length > 128) {
      return "decision_id must contain 1 to 128 characters";
    }
    if (typeof args.value !== "string" || args.value.length < 1 || args.value.length > 256) {
      return "value must contain 1 to 256 characters";
    }
  }
  return null;
}

function result(structuredContent, isError = false) {
  return {
    content: [{ type: "text", text: JSON.stringify(structuredContent) }],
    structuredContent,
    isError,
  };
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index];
    if (token === "--context" || token === "--cwd") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${token} requires a value`);
      options[token.slice(2)] = value;
      index += 1;
      continue;
    }
    if (token === "--project-context") {
      if (options.projectContext) throw new Error("duplicate option: --project-context");
      options.projectContext = true;
      continue;
    }
    throw new Error(`unknown option: ${token}`);
  }
  if (options.projectContext && options.context) throw new Error("use either --project-context or --context");
  return options;
}

function isEvidenceKind(value) {
  return value === "asset_registry" || value === "handbook";
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
