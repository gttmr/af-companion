# Human Input and Resume

## Problem this pattern solves

Pause an approved Workflow for human input or approval and resume the same logical execution with explicit response mapping and replay/idempotency semantics.

Installed 2.4.0 has two independent pause mechanisms. `RequestInput` is an explicit interrupt for a single structured answer. A `mode='task'` agent is a multi-turn conversational pause: it pauses by producing no output for the turn rather than by raising an interrupt, and resume re-runs the whole calling node. Choose one per pause point; they do not compose into a single mechanism and neither replaces the other.

## Evidence for use

- A person must approve, choose, or supply missing information before flow continues. One structured answer is `RequestInput`; an open-ended multi-turn exchange until a goal is met is a `mode='task'` agent.
- Work must pause rather than poll or fabricate an answer.
- Resume must preserve invocation/task progress and completed results.
- Side-effecting Tools may be re-entered after interruption and need duplicate protection.

## When not to use

- Do not use Human Input as a third Tool Invocation Control value.
- Do not add pause/resume for ordinary conversational clarification that does not preserve a Workflow checkpoint.
- Do not assume every UI or CLI can resume.
- Do not resume a materially changed Workflow definition.
- Do not model a `mode='task'` pause as an interrupt. There is no interrupt ID and no `RequestInput` event; the node simply yields no output until the task finishes.
- Do not rely on `output_key` to carry a task agent's result.

## Required questions

- Is this pause one structured answer (`RequestInput`) or an open-ended exchange (`mode='task'`)?
- What message, payload, allowed response, schema, aliases, and default are presented?
- What stable interrupt/invocation/session identifiers correlate the response?
- Which node reruns, and which completed work is reinstated?
- Which Tools are at-least-once and how are side effects deduplicated?
- What timeout, cancellation, rejection, auth, audit, and abandoned-request policy applies?

## Agent Factory representation

Use a Human Input Node plus pause/resume execution semantics and subsequent Workflow control. The human response influences the Workflow; Invocation Control remains Workflow or Agent for any later Tool call.

## Compose Artifact

Record Human Input message, payload/schema references, response mapping, choice options/aliases/default, checkpoint, interrupt correlation, resume entry, rerun behavior, state/artifact dependencies, timeout/cancel/reject paths, idempotency, audit, and required approvals.

## Scaffold Output

Installed public import and shape:

```python
from google.adk.events import RequestInput
```

`RequestInput` has `interrupt_id: str`, optional `payload`, optional `message`, and optional `response_schema`. When yielded by a Workflow node, installed runtime converts it to a function call named `adk_request_input`, uses `interrupt_id` as the call ID, and marks it long-running.

Resume sends a `google.genai.types.FunctionResponse` with the same ID and name inside `new_message`. Runner forbids mixing that function response with text and matches it to the prior call. The helper `create_request_input_response(interrupt_id, response)` exists only in an internal workflow utility; it is not exported from `google.adk.events` in installed 2.4.0. Build the `types.Part(function_response=...)` directly or consciously isolate internal usage.

Verified Function Node surface:

```text
FunctionNode(*, func, name=None, rerun_on_resume=False, retry_config=None,
             timeout=None, auth_config=None, parameter_binding='state',
             state_schema=None)
```

`rerun_on_resume` changes what resumption *means* for the node, so pick it deliberately rather than copying:

- **`False` — the `FunctionNode` default.** The user's response becomes the node's output directly. The node body does not run again.
- **`True`.** The node reruns from the top with `ctx.resume_inputs` populated. Required for generator-style logic that must re-enter after the response, and required for any node that calls `ctx.run_node`.

**In a loop, give every iteration its own `interrupt_id`** (e.g. `f"review_{count}"`). A reused ID makes a resumed loop match the old interrupt and restart indefinitely. This bites exactly the conditional-cycle shape in `graph-and-dynamic-workflows.md`, where the same pause node is re-entered on each pass.

Preserve valid current-generator lowering during review: it reads the first resume input, yields `RequestInput` when no response exists, returns the mapped human response after resume, and wraps the function with rerun enabled. Current runnable output accepts `response_schema_ref` only when absent/null or `"str"`; numeric choice aliases may intentionally omit the string schema. Reverify the emitter before changing this limit.

### Task-mode pause

A `mode='task'` agent pauses by producing no output for the turn; there is no interrupt event and no correlation ID to match. Resume is the next user message, which re-runs the whole calling node, so the caller must be idempotent in the same way any `rerun_on_resume=True` node is. Dispatch and placement rules, including the mandatory `raise_on_wait=True` and `override_isolation_scope`, live in `graph-and-dynamic-workflows.md`.

Completion is signalled by the auto-injected `finish_task` tool: `FinishTaskTool` is appended to the agent's tools whenever `mode=='task'` (`agents/llm_agent.py`, the `mode=='task'` branch that appends `FinishTaskTool(self)`). Completion requires the successful `FunctionResponse`, not merely the call. The node's output is the raw `finish_task` arguments **as a dict, not a pydantic instance**.

`output_schema` in task mode is a gate, not a transformer. Verified in `agents/llm/task/_finish_task_tool.py`: the tool validates `finish_task` arguments with `self._adapter.validate_python(...)` and returns an error dict on `ValidationError` so the model retries, but the normalized `validated_output` from `self._adapter.dump_python(...)` is then discarded (`del validated_output`) — the LlmAgent wrapper reads the raw function-call arguments to set `event.output`. Pydantic defaults are never materialized: an omitted `default_factory=list` field is an absent key, not `[]`, so `result["keywords"]` raises `KeyError` and `result.get("keywords")` returns `None`. The API surface gives no hint that validation and normalization are separated. Normalize explicitly at the state boundary — `Model.model_validate(raw).model_dump()` before writing to state — so defaults get materialized and the contract lives in project code, not framework internals.

`output_schema` and `output_key` behave differently in task mode; those agent-configuration rules live in `agents-workflows-tools.md`.

`App(..., resumability_config=ResumabilityConfig(is_resumable=True))` is installed and real: `from google.adk.apps import App, ResumabilityConfig`, and `ResumabilityConfig` carries exactly one field, `is_resumable: bool = False`. Resumption is therefore **off unless the App turns it on** — correctly written pause nodes still will not resume without it. (An earlier revision of this card said the symbol "was not included in the installed package probe"; that was wrong, and this project's own test harness had been importing it the whole time. Do not record a failed probe as a property of the package.) Official docs state ADK Web UI and CLI resume are currently unsupported and Tool execution is at-least-once.

## Verification Scenarios

- initial pause emits the expected request and stable ID;
- valid response maps and resumes the correct node;
- invalid/missing response, wrong ID, and text-plus-response rejection;
- timeout, cancel, reject, and abandoned request;
- completed work reinstatement and incomplete work rerun;
- task-mode pause produces no output and no interrupt, and the next message resumes by re-running the node;
- task completes only on a successful `finish_task` FunctionResponse, and the node output is a plain dict;
- `output_schema` shapes `finish_task` args (with `"result"` wrapping for non-object schemas) and `output_key` is not written;
- a `finish_task` call that omits an optional field still yields that field's declared default downstream, after explicit `Model.model_validate(raw).model_dump()` normalization at the state boundary — not a missing key or `None`;
- duplicate response and at-least-once side-effect protection;
- state/artifact continuity and audit trail;
- supported API-based resume rather than unsupported UI/CLI assumptions.

## Failure / Retry / Timeout

Define expiry, cancellation, duplicate response, and stale invocation behavior. Protect side-effecting Tools with idempotency keys or durable duplicate checks. Do not modify the Workflow between interruption and resume.

## Security / Audit

Authenticate the responder, authorize the decision, minimize payload data, prevent response tampering/replay, and audit prompt, allowed choices, actor, timestamps, correlation IDs, response summary, resume outcome, and redaction.

## Official sources

- [ADK human input](https://adk.dev/graphs/human-input/index.md)
- [ADK resume](https://adk.dev/runtime/resume/index.md)
- Installed RequestInput/resume evidence: [r1-adk-package-check.md](../../../../tests/skills/evidence/research/r1-adk-package-check.md), section B

## Checked date and Package Version

- Checked date: 2026-07-31
- Official sources: ADK human-input and resume documentation
- Installed package version: `google-adk 2.4.0`
- Known compatibility note: The response helper is internal, UI/CLI resume is unsupported, and the official `ResumabilityConfig` surface must be rechecked in the installed package before code emission. `mode='task'` pause/completion semantics and the `ctx.run_node` dispatch requirements were verified by execution against installed 2.4.0. The `output_schema`-as-gate-not-transformer behavior was confirmed by reading `agents/llm/task/_finish_task_tool.py` and live-testing against installed 2.4.0.
- 2026-07-31 re-verification against 2.4.0: `finish_task` still discards its validated output (`del validated_output`), so the normalize-at-the-boundary rule stands. Corrected a false claim that `ResumabilityConfig` "was not included in the installed package probe" — it is installed, has a single `is_resumable: bool = False` field, and this project's own test harness had been importing it all along; resumption is therefore off by default. Added the two `rerun_on_resume` resume semantics (the `False` default makes the user's response the node output) and the per-iteration `interrupt_id` rule for loops.
