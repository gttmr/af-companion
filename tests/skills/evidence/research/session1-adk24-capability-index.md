# Session 1 exact ADK 2.4 capability index

Checked 2026-08-05. The machine-readable authority is [capability-inventory.json](../../adk24/capability-inventory.json); runnable case definitions and expected closure are in [experiment-matrix.json](../../adk24/experiment-matrix.json).

Final commands, consecutive fingerprints, and independent review closure are in
the [Session 1 completion audit](session1-adk24-audit.md).

## Closure summary

| Item | Count |
|---|---:|
| Capability rows | 70 |
| `confirmed` | 48 |
| `corrected` | 12 |
| `unsupported` | 4 |
| `excluded_cloud` | 3 |
| evidence-backed `blocked` | 3 |
| Experiment rows | 64 |
| Exact-runtime cases | 46 |
| Interaction cases | 12 |
| Negative/failure cases | 16 |
| Compound topologies | 5 |
| Source-comparison conflicts | 9 |
| Small-model cases kept blocked | 4 |

No capability remains `unknown` or `unverified`. A blocked model-dependent row retains exact source/symbol evidence but is not counted as runtime PASS.

## Inventory families

| Family | Rows | Representative positive, failure, and interaction evidence |
|---|---:|---|
| Agent topology | 8 | root `BaseAgent`, transfer, `AgentTool`, duplicate/recursive identity guards, coordinator compound |
| Legacy Workflow Agents | 3 | Sequential, Parallel, bounded Loop execution plus deprecation boundary |
| Graph Workflow | 12 | static routes/default, per-trigger fan-in versus Join, routed cycle, dynamic `run_node`, retry/timeout/parallel failure |
| Tool invocation | 8 | fixed/selected Function Tool, stdio/Streamable HTTP/SSE MCP, confirmation replay, local OpenAPI/auth, unavailable/malformed failures |
| State/session/event | 5 | app/user/session/temp scopes, partial/final commit, rewind, parallel collision |
| Artifact/memory | 4 | versioned artifact load/save/missing/concurrency and local memory search |
| Callback/plugin/guardrail | 5 | plugin-before-agent order, short circuit, Tool-error recovery and state commit |
| Pause/resume/failure | 8 | `RequestInput`, confirmation, replay/idempotency, timeout, bounded loop, unsupported cancellation |
| Reuse/protocol | 9 | nested Workflow, local A2A success, input-required/resume, unavailable remote, managed/cloud classifications |
| Model/schema | 8 | `output_schema` with Tools, malformed output contexts, normalization, bounded context, unsupported imports, model blockers |

Every A-H required group has positive and negative/failure evidence. Every executable high-risk `confirmed` or `corrected` row links to an exact-runtime case and an interaction or compound case. Unsupported, excluded, and model-blocked rows carry explicit source or negative evidence instead of synthetic success.

## Five compound topologies

1. `CP-001`: coordinator invokes two specialist `AgentTool` children and aggregates.
2. `CP-002`: Graph fan-out and `Join` feed a consumer that reads state and an artifact.
3. `CP-003`: bounded routed cycle pauses twice and deduplicates side effects per iteration.
4. `CP-004`: parent reuses a nested Workflow and maps local A2A failure to a typed fallback.
5. `CP-005`: dynamic selection produces typed output checked by a deterministic guardrail and terminal.

## Source conflicts closed

| ID | Earlier guidance or ambiguity | Exact 2.4 decision |
|---|---|---|
| `CF-001` | Google Skill says `output_schema` disables Tools | Tools coexist through `set_model_response`; root-chat and graph validation still differ |
| `CF-002` | AF card described multi-incoming as one-shot OR | ordinary sink executes once per trigger; only `Join` is a barrier |
| `CF-003` | unique Agent names appeared framework-enforced | duplicate siblings only log; AF validates unique, one-parent, acyclic topology |
| `CF-004` | confirmation correlation could imply deduplication | replay repeats the side effect; durable application idempotency is required |
| `CF-005` | AF card recorded MCP 1.29.0 | exact baseline is 1.28.1; stdio, Streamable HTTP and SSE all run locally |
| `CF-006` | docs expose cancellation/compaction concepts | Python Runner has no public cancel API; compaction config is a private export |
| `CF-007` | primitive resume envelope was implicit | exact response is `{"result": value}` |
| `CF-008` | legacy Workflow Agent support was unclear | Sequential/Parallel/Loop run but are deprecated in favor of `Workflow` |
| `CF-009` | framework accepts broad `to_a2a` input | AF deliberately permits A2A binding/exposure only for Agent assets |

Framework facts use exact runtime, exact installed source/signatures, ADK Docs MCP, installed Google Skill, then AF card/generator evidence in that order. Product taxonomy and Graph enums remain owned by canonical Agent Factory contracts.

## Skill architecture decision

The five existing entrypoints were not kept as a compatibility requirement. Session 1 audited trigger, primary intent, inputs, outputs, and durable authority:

- `af-workflow`: route/resume one Work Item;
- `af-discover-assets`: evidence and explicit discovery decisions;
- `af-compose-solution`: Graph, Root Executable, bindings, and contracts;
- `af-scaffold-runtime`: approved lowering to source/handoff;
- `af-verify-runtime`: fresh claim-matched verification.

Each remains a single non-overlapping lifecycle intent. Merging would combine durable authorities; adding another would duplicate Google ADK guidance or a shared card. The bundle manifest, not these historical names or the number five, owns membership. A later audit may rename, split, or merge them when it proves overlap, missing ownership, or avoidable context pressure.

Four pinned Google Skills remain the standalone ADK base. AF Skills reference them instead of copying their content. Exact-version corrections and Agent Factory lowering deltas live in concise shared cards; detailed experiment output stays under `tests/skills`.

## Unsupported, excluded, and blocked boundaries

- Unsupported: Workflow as `AgentTool`/LlmAgent sub-agent, task Agent as static graph node, public Python Runner cancellation, public compaction import, Workflow live/bidi, and managed-agent client/MCP Tools.
- Current generator gap: exact ADK runs stdio, SSE, and Streamable HTTP MCP, while current AF lowering accepts only reviewed Streamable HTTP contracts and fails closed for stdio/other transports.
- Product guard: no A2A binding/exposure on a Workflow even where a framework helper accepts a broad input.
- Excluded cloud: deploy, publish, cloud observability, cloud model APIs, managed execution, Pub/Sub/Eventarc, external Web calls, and online installation.
- Blocked: actual qwen local-adapter, context-pressure, bounded-context selection, and model refusal runs under the user-approved absent-model override.

## Reproduction

```bash
/home/ilmaswsl/work/af-companion/.agent-factory/runtime/.venv/bin/python \
  tests/skills/adk24/capability_probe.py

AF_TEST_PYTHON=/home/ilmaswsl/work/af-companion/.agent-factory/runtime/.venv/bin/python \
  node scripts/validate-af-skills-vnext.mjs --runtime

node scripts/af-skills-bundle.mjs verify
node --test scripts/af-skills-bundle.test.mjs
```

The runtime harness uses a deterministic scripted `BaseLlm`, local in-memory services, local subprocesses, and OS-assigned localhost ports only. It does not call a generative model or Internet service.
