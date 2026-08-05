# Function and MCP Tools

## Problem this pattern solves

Connect an approved Tool contract through an in-process function or an MCP server while keeping Function Node, Function-bound Tool, Tool Node, Binding, Transport, and Invocation Control distinct.

## Evidence for use

- Use Function Binding when the reviewed Tool executes in-process with a stable callable schema.
- Use MCP Binding when an external Tool server owns discovery/execution or a protocol boundary is required.
- Use Workflow Invocation Control when a Tool Node is a fixed Graph step.
- Use Agent Invocation Control when the Agent may choose among approved available Tools.

## When not to use

- Do not create a Tool for a Workflow-private helper that lacks an independent contract.
- Do not use MCP merely because a Tool is local or reusable.
- Do not expose every discovered MCP Tool to every Agent.
- Do not guess an endpoint, auth scheme, Tool name, schema, or installed API.

## Required questions

- Is this a Function Node or an independent Tool?
- What are the input, output, error, and side-effect schemas?
- Which owner controls the server lifecycle and Tool discovery?
- Which allow-list or filter applies?
- Is Transport in-process, stdio, SSE, or streamable HTTP?
- What auth, timeout, cancellation, cleanup, retry, idempotency, and audit policy applies?
- Does a transport failure raise an exception (which type) or return a degraded payload (which status value)? Is that choice consistent everywhere it is consumed?

## Agent Factory representation

Represent the asset as Tool. Use Binding `function` or `mcp`, Transport separately, and Invocation Control Workflow or Agent. MCP is not an asset type. A Workflow-private deterministic function remains a Function Node.

## Compose Artifact

Record Tool contract, Binding, Transport, server reference, Tool name, schema, auth reference, lifecycle owner, allow-list, side effect, timeout, cancellation, retry, idempotency, error mapping, cleanup, mock, audit, and Invocation Control.

Whichever transport-failure strategy is chosen — propagate an exception or return a degraded payload (e.g. `connection_status: "mcp_degraded"`) — the exact exception type or status value is a downstream contract and must be recorded here. Consumers coded against one strategy break silently if another code path in the same system uses the other.

## Scaffold Output

Exact installed 2.4.0 Function Tool surface:

```text
FunctionTool(func, *, require_confirmation=False)
```

`require_confirmation` accepts a boolean or callable. Treat confirmation as a pause gate, not duplicate-side-effect protection; exact replay testing executed the side effect twice.

Installed MCP imports are:

```python
from google.adk.tools.mcp_tool import (
    McpToolset, SseConnectionParams, StdioConnectionParams,
    StreamableHTTPConnectionParams,
)
from mcp import StdioServerParameters
```

Verified connection surfaces:

- `StdioConnectionParams(*, server_params, timeout=5.0)`
- `SseConnectionParams(*, url, headers=None, timeout=5.0, sse_read_timeout=300.0, httpx_client_factory=...)`
- `StreamableHTTPConnectionParams(*, url, headers=None, timeout=5.0, sse_read_timeout=300.0, terminate_on_close=True, httpx_client_factory=...)`
- `McpToolset(*, connection_params, tool_filter=None, tool_name_prefix=None, ..., require_confirmation=False, ...)`

`tool_filter` accepts a list of names or a predicate over `BaseTool` and optional read-only context. Generic `HttpConnectionParams` is not present in installed `google-adk 2.4.0`; use `StreamableHTTPConnectionParams`. Uppercase `MCPToolset` exists only as a deprecated subclass; use `McpToolset`.

Keep framework capability separate from Current Implementation lowering. Exact ADK 2.4 executes stdio, legacy SSE, and Streamable HTTP locally. The current AF generator accepts only an approved Streamable HTTP MCP runtime contract and rejects stdio or unknown transports instead of silently substituting one. A selected stdio/SSE binding is therefore a Scaffold Blocker or separately approved generator gap, not permission to hand-write around the reviewed artifacts.

Exact 2.4 also exports `OpenAPIToolset(*, spec_dict=None, spec_str=None, spec_str_type='json', auth_scheme=None, auth_credential=None, credential_key=None, tool_filter=None, tool_name_prefix=None, ...)`. A localhost experiment discovered and invoked one operation and supplied a synthetic API-key credential through the declared header; malformed JSON failed before execution. This proves the local parser/call/auth seam, not the safety of an arbitrary API. Keep real credentials in an approved runtime provider, validate the reviewed specification before Tool exposure, and classify backend-dependent built-in Tools separately instead of assuming they are offline.

Omit optional MCP arguments by leaving the key out; do not send `null` or an empty list as a placeholder. Build call arguments with a `_drop_none`-style helper. This is a general MCP calling habit, not specific to any one server.

Attribute the failure correctly. `additionalProperties: false` only rejects keys the schema does not declare — it says nothing about the values of declared ones. Whether an explicit `null` or `[]` is rejected is decided per field by that field's own `type` (a plain `"string"` does not admit `null`; it would have to be `["string","null"]`) and by constraints such as `minItems`. Omitting the key sidesteps all of that, which is why the helper is the robust habit whatever a given server wrote. Read the specific tool's `inputSchema` before concluding why a call was rejected.

## Verification Scenarios

- discovery and allow-list filtering;
- Tool schema and successful call;
- invalid argument and error mapping;
- timeout, cancellation, server unavailable, and auth missing;
- duplicate side effect and cleanup;
- Agent-selected Tool trajectory;
- Workflow-fixed Tool call;
- local deterministic mock;
- optional argument omitted (not sent as `null`) when unset;
- malformed tool response produces the declared failure mode (the recorded exception type or degraded-payload status), not an unhandled exception type.
- local OpenAPI operation discovery/call with synthetic auth, malformed specification rejection, and no credential bytes in generated source or evidence.

## Failure / Retry / Timeout

Define connect, discovery, call, and read timeouts separately where the transport supports them. Close sessions/processes on success, error, and cancellation. Retry only classified transient failures and require idempotency for side effects.

Transport-failure handling is an explicit design decision, not an accident of the fallback path: propagate an exception (and state which type) or return a degraded payload (and state which status value) — do not mix strategies silently within the same codebase. A too-narrow `except` clause breaks when a different path raises a different type (e.g. a `json.JSONDecodeError` fallback is a `ValueError`, not a `RuntimeError`).

A per-operation client timeout (e.g. `httpx.AsyncClient(timeout=30)`) bounds each connect/read/write individually, not total call duration. Streamable HTTP uses `client.stream()`/SSE, so the read timer resets per chunk: a legitimate non-streaming response with no intermediate bytes for >30s aborts, while an SSE session emitting events more often than every 30s runs unbounded overall. "A timeout is set" and "the call is bounded" are different claims. For a true ceiling, wrap the call, e.g. `async with asyncio.timeout(5)`. Pick the value per binding — a RAG lookup and a long-running agentic workflow want different ceilings, so one global constant is usually wrong — and remember an unbounded tool call freezes a chat-facing turn.

A caller-supplied `http_client` is never closed by the MCP client library — only a client the library itself created is entered into its exit stack. If the caller passes its own `http_client`, the caller must close it (e.g. `async with`), or every call leaks a connection.

## Security / Audit

Use approved Tool allow-lists, least-privilege auth references, sanitized schemas, confirmation for sensitive operations, bounded outputs, and audit records for selection, arguments summary, result status, and side effect. Never embed credentials or private endpoints.

## Official sources

- [ADK Function tools](https://adk.dev/tools-custom/function-tools/index.md)
- [ADK MCP tools](https://adk.dev/tools-custom/mcp-tools/index.md)
- Installed signature evidence: [r1-adk-package-check.md](../../../../tests/skills/evidence/research/r1-adk-package-check.md), section D

## Checked date and Package Version

- Checked date: 2026-08-05
- Official sources: ADK Function tools and ADK MCP tools
- Installed package version: `google-adk 2.4.0`, `mcp 1.28.1`
- Known compatibility note: Generic `HttpConnectionParams` is not present; use the installed streamable-HTTP class, and do not rely on deprecated uppercase `MCPToolset`. In exact `mcp 1.28.1`, `streamable_http_client(url, *, http_client=None, terminate_on_close=True)` takes a configured `http_client`; the configured `httpx` timeout still applies per operation rather than as a total-call ceiling, and the raw MCP helper never closes a caller-provided `http_client`.
- Runtime baseline: this card and the generated runtime share the ADK 2.4 compatibility line. `requirements/adk-runtime.txt` constrains generated projects to `>=2.4.0,<2.5.0`, and repository verification uses an exact `google-adk 2.4.0` interpreter. Recheck the installed version and symbol before emitting code after any later dependency move.
- 2026-08-05 runtime extension: local stdio, Streamable HTTP, and legacy SSE MCP calls, unavailable endpoints, local OpenAPI/API-key injection, and malformed OpenAPI rejection are now execution-backed rather than signature-only.
