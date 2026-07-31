# Agents, Workflows, and Tools

## Problem this pattern solves

Choose the smallest ADK execution unit that implements an approved Agent Factory asset or Graph responsibility. Read this card when the base runtime shape is undecided or when generated output must be checked against installed ADK 2.4.0.

## Evidence for use

- An approved Agent has independent reasoning or selection responsibility.
- An approved Workflow owns sequence, branch, parallelism, repetition, pause/resume, or termination across multiple units.
- An approved Tool has a structured callable contract and result/error boundary.
- A Graph Node references one of those assets or owns a Workflow-private function/control step.

Evidence for several Agents is not, by itself, evidence for a Workflow. Evidence for a multi-step Agent is not, by itself, evidence to split that Agent.

## When not to use

- Do not add a Workflow around one sufficient Agent or Tool.
- Do not turn a resource, dependency, protocol, callback, event loop, or Human Input Node into an asset.
- Do not use ADK class names to override Agent Factory Target classification.
- Do not generate runtime code directly from a raw requirement.
- Do not use `SequentialAgent`, `ParallelAgent`, or `LoopAgent` for Workflow composition. Those classes do exist in installed 2.4.0 (exported from `google.adk.agents`), so their absence here is a deliberate stance, not a version gap; the graph-based `Workflow` is the composition primitive these cards prescribe.
- Do not wrap a `Workflow` in `AgentTool` or attach it as an `LlmAgent` sub-agent. `Workflow` is a `BaseNode`, not a `BaseAgent` (`class Workflow(BaseNode)` in `workflow/_workflow.py`), and `AgentTool` takes a `BaseAgent`.

## Required questions

- Which approved responsibility requires independent judgment?
- Which component owns deterministic flow?
- Which callable capabilities are independent Tool contracts?
- Is Tool Invocation Control Workflow or Agent?
- Which `LlmAgent.mode` does each Agent unit need, and does that mode's conversation visibility match its approved inputs?
- Is the Graph static, dynamic, or unnecessary?
- Which inputs, outputs, state, artifacts, side effects, and failure boundaries are approved?

## Agent Factory representation

Use only Agent, Workflow, and Tool as top-level assets. Keep Graph Nodes separate. A Function Node remains Workflow-private; a Function-bound Tool remains a Tool. Invocation Control is Workflow or Agent only.

Follow `_shared/taxonomy.md`, `_shared/graph-ir.md`, and `_shared/target-contract-v2.md` when those decisions are in scope. Use `_shared/runtime-pattern-selection.md` separately when evidence justifies a runtime pattern.

## Compose Artifact

Record:

- approved asset candidates with responsibility, I/O, owner, business scope, and reuse status;
- standalone-versus-Workflow decision;
- Graph nodes/edges or explicit no-Graph decision;
- Workflow representation and coordination rationale;
- Tool Binding, Transport, and Invocation Control;
- missing information, risks, approvals, and pattern-card links.

## Scaffold Output

Installed imports verified by the package check include:

```python
from google.adk.agents import Agent, BaseAgent
from google.adk.workflow import Workflow
```

Installed `Agent` is an alias of `LlmAgent`; this is an ADK implementation fact, not an Agent Factory subtype. The verified Workflow signature is:

```text
Workflow(*, name, description='', rerun_on_resume=True, wait_for_output=False,
         retry_config=None, timeout=None, input_schema=None, output_schema=None,
         state_schema=None, edges=[], max_concurrency=None, graph=None)
```

Use only reviewed fields. The package evidence did not record a general Agent constructor recipe or Function Tool constructor; inspect installed source before emitting exact parameters beyond the verified surface. Let the repository generator own generated Python when a supported lowering exists.

`LlmAgent.mode` selects the runtime shape of an Agent unit and must be decided alongside the class (`mode: Literal['chat','task','single_turn'] | None` on `LlmAgent`):

```text
mode: Literal['chat', 'task', 'single_turn'] | None = None
```

- `chat`: Standard chat agent reachable via transfer_to_agent.
- `task`: Task agent that chats with the user to accomplish a task.
- `single_turn`: Agents that complete a task without chatting with the user.
- As a sub-agent, the default `mode` is `chat`.
- As a graph/workflow node, the default `mode` is `single_turn`.
- **Always set `mode` explicitly rather than relying on the default** — the default is context-dependent and a wrong default is silent.

Mode also decides what the Agent can read. `single_turn` forces `include_contents='none'` unless `include_contents` is set explicitly (`workflow/_llm_agent_wrapper.py` — sets `agent.include_contents = 'none'` when `mode == 'single_turn'` and the field was not set explicitly), so a `single_turn` node cannot see conversation history at all. `task` and `single_turn` get isolation-scope filtered contents; only `chat` sees the full conversation (`workflow/_llm_agent_wrapper.py`). An Agent whose approved responsibility requires history is a `chat` unit, not a workflow node.

`mode='task'` agents MUST NOT be used as static graph nodes — `Workflow` raises `ValueError` (`_validate_no_task_mode_graph_nodes`). `mode='chat'` graph nodes MUST have `START` as their only predecessor — `Workflow` raises `ValueError` otherwise (`_validate_chat_agent_wiring`). See `graph-and-dynamic-workflows.md` for the mechanism and the dispatch recipe.

In `task` mode `output_schema` types the auto-injected `finish_task` tool, not the conversational reply (`agents/llm/task/_finish_task_tool.py`, `flows/llm_flows/basic.py`, `flows/llm_flows/_output_schema_processor.py`). It therefore does not disable tools and does not constrain intermediate conversational turns. Object schemas return their fields top-level; non-object schemas such as `list[str]` or `int` are wrapped under the key `"result"` (`workflow/_llm_agent_wrapper.py`).

`output_key` is ignored in `task` mode: `process_llm_agent_output` runs only on the `single_turn` branch (`process_llm_agent_output` in `workflow/_llm_agent_wrapper.py`, called only on the `single_turn` branch). Pass values through the return value instead. Task pause and completion semantics belong to `human-input-and-resume.md`.

`output_schema` and `tools` are **not** mutually exclusive in 2.4.0. The `LlmAgent.output_schema` docstring states it directly: the ADK
"supports using `output_schema` and `tools` together — it works by exposing tools during the thought loop
and enforcing structure only on the" final response. An older ADK restriction where a response schema
disabled tool use no longer applies, so a graph-node agent may both call tools and return a typed result.

The globally installed Google skill still carries the old restriction — `google-agents-cli-adk-code/references/adk-python.md` warns that "Using `output_schema` disables tool calling and delegation." That warning is stale; installed source contradicts it. Do not adopt it, and do not weaken this paragraph to agree with it.

`ManagedAgent` (`google.adk.agents.ManagedAgent`, new in 2.4.0) connects to Google's server-hosted agents: reasoning, tools, and execution all run in Google's managed environment. It is a `BaseAgent`, so it can be a sub-agent or wrapped as `AgentTool`. It is **not** a candidate for this lifecycle's default shapes: client-side tools raise `NotImplementedError`, and that includes both Python callables and client-side `McpToolset` — the two things every Tool asset here is built from. Treat it as a watch item; if a requirement genuinely needs server-side execution, raise it as a decision rather than substituting it for an `LlmAgent`.

## Verification Scenarios

- Single Agent, no Tool, and no forced Workflow.
- Agent mode selection matches approved history visibility (`single_turn` node cannot read prior turns).
- Workflow-controlled Tool call.
- Agent-controlled optional Tool use without a fixed Tool Node in the main flow.
- Function Node versus Function-bound Tool distinction.
- Unsupported or missing approved asset blocks scaffolding.
- Generated import and minimal runtime construction under the installed venv.

## Failure / Retry / Timeout

Assign failure, retry, timeout, and cancellation to the component that owns the execution boundary. Do not place retries around non-idempotent Tools without a duplicate-side-effect contract. Stop if constructor or runtime semantics are unverified.

## Security / Audit

Keep prompts, state, Tool arguments, and outputs within approved data policy. Preserve actor, asset, Tool, side effect, correlation, and outcome in audit evidence. Do not put secrets or private endpoints in generated examples.

## Official sources

- [ADK agents](https://adk.dev/agents/index.md)
- [ADK Agent configuration](https://adk.dev/agents/llm-agents/index.md)
- [ADK workflows](https://adk.dev/workflows/index.md)
- [ADK graphs](https://adk.dev/graphs/index.md)
- Installed signature evidence: [r1-adk-package-check.md](../../../../tests/skills/evidence/research/r1-adk-package-check.md), sections A and E

## Checked date and Package Version

- Checked date: 2026-07-31
- Official sources: ADK agents, Agent configuration, workflows, and graphs
- Installed package version: `google-adk 2.4.0`
- Known compatibility note: ADK `Agent` aliases `LlmAgent` in the installed package; that alias does not alter the Agent Factory Target responsibility or Invocation Control owner. `LlmAgent.mode` semantics and the `ctx.run_node` dispatch requirements were verified by execution against installed 2.4.0, not by documentation alone. The per-context `mode` default (`chat` as sub-agent, `single_turn` as graph node) and the `mode='task'`/`mode='chat'` graph-placement `ValueError` guards were confirmed against installed source; always set `mode` explicitly rather than relying on context-dependent defaults.
- 2026-07-31 re-verification against 2.4.0: `mode` semantics, both graph-placement guards, and the `output_schema`+`tools` compatibility were re-checked in installed source and are unchanged. Line citations were replaced with symbol names after two symbols moved file in this release. Recorded that the globally installed Google skill still carries the stale "`output_schema` disables tool calling" warning, which installed source contradicts. Added `ManagedAgent` (new in 2.4.0) as a watch item only — it rejects client-side callables and `McpToolset`, which is what every Tool asset here uses.
