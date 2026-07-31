# Graph and Dynamic Workflows

## Problem this pattern solves

Lower an approved Workflow into a static Graph or a dynamic runtime-selected shape with explicit routes, joins, loop bounds, and resume behavior.

## Evidence for use

- Use a static Graph when nodes and edges are reviewable before execution.
- Use dynamic execution when runtime repetition or node selection cannot be represented safely as a finite static route graph.
- Use Join when fan-in must wait for all required predecessors.
- Use the Human Input card when a node pauses for a response.

## When not to use

- Do not create a Workflow for one sufficient Agent or Tool.
- Do not choose dynamic execution for ordinary conditional routing.
- Do not encode an unbounded loop or recursion without an approved exit and resource bound.
- Do not make router, loop controller, Join, callback, or resume into Catalog assets.
- Do not hand-write ADK graph code from a raw requirement.
- Do not place a `mode='task'` agent as a static graph node. `_validate_no_task_mode_graph_nodes` raises `ValueError` (`workflow/_workflow.py`): on re-entry the scheduler overwrites `node_input` with the latest user message, losing the task brief. The only two legal placements are (a) a sub-agent of a `mode='chat'` coordinator via function-call delegation, or (b) dispatched with `await ctx.run_node(...)` from inside a `FunctionNode`.
- Do not wire a `mode='chat'` graph node anywhere except directly after `START`. `_validate_chat_agent_wiring` raises `ValueError` otherwise (`workflow/utils/_graph_validation.py` — moved out of `_graph.py` in 2.4.0); chat agents rely on session history and cannot consume direct node inputs.
- Do not set `wait_for_output` manually on task/chat nodes; it is applied automatically (`workflow/utils/_workflow_graph_utils.py`). Exception: a `FunctionNode` that wraps a `ctx.run_node` dispatch to a task agent gets no such auto-treatment and must set it by hand — see Scaffold Output.
- Do not treat multiple incoming edges as a barrier. Multiple in-edges are OR: the node fires on the first trigger and runs once. Only `JoinNode` is AND.

## Required questions

- Is a Workflow required, and is its representation static or dynamic?
- Are all nodes reachable from start and able to reach an end or approved pause?
- What are route values, aliases, defaults, and invalid-route behavior?
- Where do fan-out/fan-in and Join occur, and does any node receive both a join-aggregated input and a bypass edge input?
- What bounds, back/exit edges, state, timeout, cancellation, and resume behavior govern loops?
- Which nodes and edges are supported by the current generator?

## Agent Factory representation

Use canonical Graph IR for Agent, Tool, Function, Human Input, Subworkflow, Join, Input, and Output nodes. Represent route and loop through `control`, `channel`, and `regions`. Keep Invocation Control Workflow or Agent.

## Compose Artifact

Record standalone-versus-Workflow decision; representation and coordination; root Workflow; nodes, edges, typed asset references, control, channel, and regions; route/default rules; fan-in; loop bound and exit conditions; channel schemas; Human Input/resume; failure paths; and validation results.

## Scaffold Output

Installed public imports include:

```python
from google.adk.workflow import JoinNode, START, Workflow, node
from google.adk.agents import Context
```

Verified surfaces:

```text
Workflow(*, name, description='', rerun_on_resume=True, wait_for_output=False,
         retry_config=None, timeout=None, input_schema=None, output_schema=None,
         state_schema=None, edges=[], max_concurrency=None, graph=None)
JoinNode(*, name, description='', rerun_on_resume=False, wait_for_output=False,
         retry_config=None, timeout=None, input_schema=None, output_schema=None,
         state_schema=None)
node(node_like=None, *, name=None, rerun_on_resume=None, retry_config=None,
     timeout=None, parallel_worker=False, auth_config=None)
Context.run_node(node, node_input=None, *, use_as_output=False, run_id=None,
                 use_sub_branch=False, override_branch=None,
                 override_isolation_scope=None, raise_on_wait=False)
```

`rerun_on_resume` defaults differ per construct, and the split is not intuitive — an `LlmAgent` placed in a graph defaults to `True` while everything else defaults to `False`:

| Placed in the graph | Default `rerun_on_resume` | Source |
|---|---|---|
| `Workflow` | **`True`** | `workflow/_workflow.py` field default |
| `LlmAgent` | **`True`** | `workflow/utils/_workflow_graph_utils.py` — injects `True` when the caller passes `None` |
| `FunctionNode`, bare callable | `False` | `workflow/_function_node.py`; builder lowers a callable with `rerun_on_resume or False` |
| `BaseTool` → internal tool node | `False` | no such parameter; inherits the `BaseNode` default |
| `JoinNode`, other `BaseAgent` | `False` | `workflow/_base_node.py` field default |

**Never rely on the default — always set `rerun_on_resume` explicitly on any node that calls `ctx.run_node`.**

The same builder decides two more things from placement alone: an `LlmAgent` with `mode` unset becomes `chat` when it has a parent agent and **`single_turn`** when it is a standalone graph node, and ADK then sets `wait_for_output = True` for `mode in ('task','chat')`. `single_turn` is therefore the default mode of a graph node, not a disabled one.

Await `ctx.run_node(...)` directly. Installed runtime enforces `rerun_on_resume=True` on the calling dynamic node (`agents/context.py` `_run_node_internal`).

Four silent footguns govern every `ctx.run_node` dispatch of a `mode='task'` agent. All four were confirmed by execution or by live-model measurement, and all fail without raising:

- `raise_on_wait=True` is mandatory. The default is `False` (`agents/context.py`, `run_node` signature). Omit it and a paused task agent returns `None`, so the calling `FunctionNode` wrongly completes on its first turn and the pause is lost with no error. ADK's own dispatcher passes it (`workflow/_llm_agent_wrapper.py`, its own dispatch call).
- `override_isolation_scope` is required for the task brief to reach the model, not merely for scoping. Measured A/B: without it the task agent's LLM request contained only the session user message and not `node_input`; with it the request contained exactly the `node_input` brief. The strict-equality scope filter at `flows/llm_flows/contents.py` (isolation-scope filter) drops unscoped session events, so the content builder falls back to `ic.user_content`, which `workflow/_llm_agent_wrapper.py` (`update['user_content'] = _node_input_to_content(node_input)`) populates from `node_input`.
- ★ `wait_for_output = True` must be set by hand on the *dispatching* `FunctionNode`. `ctx.run_node(..., raise_on_wait=True)` raises `NodeInterruptedError` when the task agent pauses, but `workflow/_node_runner.py` swallows that exception without setting the enclosing FunctionNode's `interrupt_ids`, so `workflow/_workflow.py:_handle_completion` marks the node COMPLETED and fires successor nodes while the conversation is still paused. `wait_for_output` is a pydantic field, not a `FunctionNode.__init__` parameter — assign it after construction. This is distinct from the automatic `wait_for_output=True` ADK sets on `mode in ('task','chat')` LlmAgent nodes in `build_node` (`workflow/utils/_workflow_graph_utils.py`, `if agent.mode in ('task','chat'): agent.wait_for_output = True`): that auto-set applies only to an LlmAgent placed directly in the graph. A task agent cannot be a static graph node (see above), so it must be wrapped in a FunctionNode, and the wrapper gets no such auto-treatment — the framework's mandated workaround escapes the framework's own handling.
- ★★ `rerun_on_resume=True`, required on the dispatching node, forces the workflow to re-traverse already-completed nodes on every resumed turn. Traversal cannot be prevented; repeated *work* can and must be. Every side-effecting node reachable after the dispatcher needs an idempotence guard — see Failure / Retry / Timeout.

All five requirements below form one set — any single omission fails silently:

```python
node = FunctionNode(func=_dispatch, name="...", rerun_on_resume=True)  # 1
node.wait_for_output = True                                            # 2 (assign after construction)

async def _dispatch(ctx, node_input=None):
    raw = await ctx.run_node(agent, node_input=brief,
                             raise_on_wait=True,                       # 3
                             override_isolation_scope="unique-name")   # 4
    return MyModel.model_validate(raw).model_dump()                    # 5
```

1. `rerun_on_resume=True` on the dispatching `FunctionNode` — required so the workflow re-traverses this node on resume instead of treating it as stale.
2. `wait_for_output = True` set by hand after construction — `_handle_completion` otherwise marks the node COMPLETED and fires successors while the conversation is still paused.
3. `raise_on_wait=True` — without it a paused task agent returns `None` and the caller wrongly completes on its first turn.
4. `override_isolation_scope` — required for the task brief (`node_input`) to reach the model at all; without it the content builder falls back to `ic.user_content` and drops the brief.
5. `MyModel.model_validate(raw).model_dump()` normalization before returning — `finish_task` discards its own validated/defaulted output and the wrapper reads raw function-call arguments, so an omitted optional field is a missing key or `None`, not its declared default, unless normalized explicitly at this boundary.

Construct the caller as an explicit `FunctionNode`. A bare callable placed in `edges` is lowered by `build_node`, which hardcodes `rerun_on_resume=rerun_on_resume or False` (`workflow/utils/_workflow_graph_utils.py`, the callable branch), so it can never satisfy the `run_node` requirement.

Routing out of a `FunctionNode` does **not** require an async generator. A plain `return Event(output=..., route=...)` carries the route: `_to_event` lists `Event` and `RequestInput` as pass-through return types (`workflow/_function_node.py`, `_to_event` docstring), and `Event`'s `route` kwarg is convenience-mapped onto `actions.route` at construction (`events/event.py`), independent of return-versus-yield. Use an async generator only when one node must emit *several* events (e.g. a content event plus the routed output event). Prefer the plain `return` — it is the smaller form and the one both ADK and the official skill document.

Do not promote a local implementation choice into a framework requirement. An earlier revision of this card stated the generator was mandatory; measured against a live model, that single false sentence overrode both the model's own correct prior and a correct counter-example present in the same context, and the model reported no conflict between its sources.

The fallback route literal is `"__DEFAULT__"`, exported as `DEFAULT_ROUTE` from `google.adk.workflow`. At most one default route per node. An edge may also match several route values at once.

A `FunctionNode`'s parameters are resolved by name, not by position: `ctx` receives the Context, `node_input` receives the predecessor's output, and **every other parameter name is looked up in `ctx.state`**. A parameter you meant as an ordinary argument therefore becomes a silent state read. `node_input` accepts a dict or a pydantic model.

`Workflow` does not support live/bidi streaming: it never overrides `_run_live_impl`, so `Runner.run_live` reaches the `BaseAgent` default and raises `NotImplementedError`. Use a plain agent for live flows. The graph runtime also requires Python ≥ 3.11.

Fan-in semantics: multiple incoming edges are OR, so a `FunctionNode` with two in-edges fires on the first trigger and runs once. `JoinNode` is the only AND and requires all predecessors. A join delivers an aggregated dict keyed by predecessor node name, so a node reachable both through a join and through a bypass edge must normalize two different `node_input` shapes. Because the key is a node *name*, not a stable identifier, renaming a node silently breaks downstream parsing; have downstream code identify each entry by a self-describing field inside its payload (e.g. a `capability` field) rather than by the dict key.

Preserve valid lowering knowledge from the current generator: static routes use reviewed route dictionaries; explicit or synthesized `JoinNode` handles fan-in; static runnable graphs must be reachable.

A static graph MAY contain a cycle, provided at least one edge in the cycle is conditional (routed); no dynamic dispatch is required. `_detect_unconditional_cycles` (`workflow/utils/_graph_validation.py` — moved out of `_graph.py` in 2.4.0) rejects only cycles made entirely of unconditional edges — "Cycles must include at least one conditional (routed) edge to avoid infinite loops." The canonical shape is a back-edge out of a routed branch:

```python
(gate, {"need_more": collect, "ready": execute})
```

This is a legal static loop and needs no dynamic dispatch; verified by constructing and running one. Bound it with a counter in state regardless — the validator only prevents *unconditional* infinite loops.

**Known generator gap:** the current AF generator still lowers loop/back-edge shapes to dynamic dispatch instead of emitting this static cycle form. Reverify current generator source before relying on it to emit the static form.

Dynamic selection is signaled by an approved dynamic Workflow or dynamic/loop region. A loop region needs a lowerable body, explicit control with back and exit decisions, and a bounded counter.

## Verification Scenarios

- linear static Graph and terminal reachability;
- route value, alias, default, and invalid result;
- fan-out/fan-in with explicit or synthesized Join;
- unreachable node rejection, and **unconditional** static cycle rejection — a cycle with at least one routed edge must be accepted, not rejected;
- bounded dynamic loop, exit, max-iteration failure, and cancellation;
- direct awaited `run_node` and rerun-on-resume enforcement;
- `mode='task'` node placed statically is rejected, and `mode='chat'` node wired off a non-`START` predecessor is rejected;
- negative case: `ctx.run_node` without `raise_on_wait=True` loses the pause and completes the caller on turn one;
- A/B case: `ctx.run_node` without `override_isolation_scope` omits `node_input` from the task agent's LLM request;
- OR-versus-Join fan-in, including a node that must accept both a join-aggregated dict and a bypass `node_input`;
- renaming a predecessor node does not break a downstream node keyed off a self-describing payload field;
- a paused task-dispatch `FunctionNode` without `wait_for_output=True` lets successors fire while the conversation is still waiting;
- full multi-turn conversation run to completion, then external tool invocations counted from the audit log — each exactly 1;
- routed `FunctionNode` carries its route through a returned `Event(route=..., output=...)`; a generator is exercised only for the multi-event case;
- unsupported node/edge rejection before runnable output;
- state/artifact and Human Input integration through their cards.

## Failure / Retry / Timeout

Define node timeout/retry separately from Workflow or loop bounds. Make error, fallback, cancellation, and loop-exhaustion paths explicit. Avoid retrying completed side effects when dynamic nodes rerun on resume.

`rerun_on_resume=True` (required on any `ctx.run_node` caller) is a **graph-wide property, not a per-node-type concern**: every side-effecting node reachable after the dispatcher — not just the dispatcher itself — re-executes on each resumed turn unless guarded. Treating it per-layer misses instances: one project fixed this same class of bug three separate times (conversational node, then a retrieval node, then an analysis node) because each pass only addressed the layer under review. Measured in one live session, before guards → after:

| Node kind | Symptom | Calls before → after |
|---|---|---|
| conversational (task dispatch) | completed agent re-runs, emits chat instead of `finish_task`, graph stalls permanently | stalled → completes |
| RAG retrieval | tool re-invoked every resumed turn | 7 → 1 |
| analysis capability | completed capability re-invoked | 2 → 1 |

Only the conversational case was loud (a permanently stalled graph); the other two were silent and visible only by counting calls in an audit log.

Standard guard: return the stored result immediately if the node's result key is already set in state.

```python
# Guard EVERY node that performs work (LLM call, network call, write).
_MISSING = object()  # module-level sentinel

cached = ctx.state.get("my_result_key", _MISSING)
if cached is not _MISSING:                 # NOT `if cached:`
    return {"my_result_key": cached}
```

Refinement for a node that records a status: cache only successful results, so a failure can be retried on a later turn instead of being permanently cached as a non-result.

```python
previous = (ctx.state.get("analysis_results") or {}).get(capability_id)
if previous and previous.get("status") == "completed":
    return previous
```

## Security / Audit

Audit route inputs/results, selected nodes, loop count, exit reason, Tool side effects, pause/resume, and failures without exposing sensitive payloads. Bound concurrency and repetition to prevent resource abuse.

## Official sources

- [ADK workflows](https://adk.dev/workflows/index.md)
- [ADK graphs](https://adk.dev/graphs/index.md)
- [ADK routes](https://adk.dev/graphs/routes/index.md)
- [ADK dynamic workflows](https://adk.dev/graphs/dynamic/index.md)
- Installed signature evidence: [r1-adk-package-check.md](../../../../tests/skills/evidence/research/r1-adk-package-check.md), section E

## Checked date and Package Version

- Checked date: 2026-07-31
- Official sources: ADK workflows, graphs, routes, and dynamic-workflow documentation
- Installed package version: `google-adk 2.4.0`
- Known compatibility note: `ctx.run_node` requires a rerunnable caller, and current generator node/edge limits are Current Implementation constraints that must be reverified before expansion. `LlmAgent.mode` graph-placement rules and the `ctx.run_node` dispatch requirements (`raise_on_wait`, `override_isolation_scope`) were verified by execution against installed 2.4.0, including a deliberate negative test. The `FunctionNode.wait_for_output` requirement for task-dispatch nodes, the join-aggregate node-name keying, and the `rerun_on_resume` whole-graph re-traversal/idempotence requirement were additionally verified by execution and by live-model measurement against a real running workflow. Additionally verified: conditional-cycle static loops are an ADK 2.4.0 capability (`_detect_unconditional_cycles`), separate from the current AF generator's own choice to still lower loop/back-edge shapes dynamically; the five-step dispatch recipe (including result normalization via `Model.model_validate(raw).model_dump()`) was confirmed against installed source.
- 2026-07-31 re-verification against 2.4.0: every symbol above was re-checked and the behavior is unchanged, but **two of them moved file** — `_validate_chat_agent_wiring` and `_detect_unconditional_cycles` left `workflow/_graph.py` for `workflow/utils/_graph_validation.py`. All private-module line citations in this card were therefore replaced with symbol names: one minor release invalidated every line number while leaving every symbol name intact, so cite symbols first and paths second. Two corrections in the same pass — the `rerun_on_resume` default table was wrong by omission (an `LlmAgent` placed in a graph defaults to `True`), and the claim that routing out of a `FunctionNode` requires an async generator was false (a returned `Event` is a documented pass-through). Added from installed source: `DEFAULT_ROUTE == "__DEFAULT__"`, the `ctx.state` fallback in `FunctionNode` parameter resolution, and the absence of live-streaming support (`Workflow` never overrides `_run_live_impl`, so `Runner.run_live` raises `NotImplementedError`).
- Runtime baseline: this card and the generated runtime share the ADK 2.4 compatibility line. `requirements/adk-runtime.txt` constrains generated projects to `>=2.4.0,<2.5.0`, and repository verification uses an exact `google-adk 2.4.0` interpreter. Recheck the installed version and symbol before emitting code after any later dependency move.
