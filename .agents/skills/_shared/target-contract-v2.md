# Target Contract v2

## Purpose

Define the only artifact vocabulary that canonical Agent Factory skills may write or consume.

`contract_version: "2.0"` is required. Do not emit compatibility projections, synthesize retired selectors, or accept pre-v2 artifact shapes.

## When to read

Read before writing, replacing, reviewing, scaffolding from, or verifying:

- canonical `artifacts/af/<work-id>/analysis-result.json`;
- `asset-candidates.json`, `graph-ir.json`, scaffold plans, or versioned Asset Registry contracts.

## Required v2 output

`analysis-result.json` uses these load-bearing terms:

- `contract_version: "2.0"`;
- `normalizedRequirement`;
- `evidence`;
- `assetCandidates`;
- `a2aContracts`;
- `runtimeContracts`;
- `graph`.

Split artifacts use `asset-candidates.json` and `graph-ir.json`. Never write alternate candidate or Graph filenames.

`af-work-item.json`은 `schemas/af-work-item.schema.json`의 별도 lifecycle schema version 2를 사용하며 `contract_version`을 넣지 않는다. `focus_skill`, `active_runs`, 네 Work Skill 상태, revisions, cycles, decisions, invalidations, review provenance, session handoffs, verification outcome을 완전하게 기록한다. 누락값을 default로 보정하지 않으며 current generator input에서는 Work Item이 필수다.

정상 경로의 Discover review → Compose review → Scaffold → Verify gate는 건너뛰지 않지만 Lifecycle Router는 고정된 단방향 순서를 가정하지 않는다. Compose는 Asset 또는 계약 문제를 구조화해 새 Discover cycle로 돌아갈 수 있고 Scaffold/Verify 문제도 Evidence 소유 Skill로 돌아간다. 관련 canonical bytes 또는 Registry revision이 바뀌면 owning review gate를 새 review용 `pending`으로 reset하거나 이전 결정을 `stale`로 표시하고 downstream gate/evidence를 무효화하며 history를 보존한다.

`decisions`와 `asset_decisions`의 required 항목은 사용자 선택 없이 resolved가 될 수 없다. 추천은 selection이 아니며 자동 default를 쓰지 않는다. `solution_control_strategy`와 Agent/Workflow `root_executable`도 현재 사용자 결정과 revision binding을 보존한다.

Each `assetCandidates[]` entry uses exactly one `asset_type`: `agent`, `workflow`, or `tool`. Keep Resource and Dependency records outside the asset list.

Record `domain_scope`, `business_domains`, `owner`, `reuse_status`, and optional `capability_tags`. Record `binding`, `connection`, and `exposure` only when applicable, and `workflow_profile` only for Workflow assets.

A2A never creates an asset type. Represent remote consumption on an Agent with `binding.kind: "a2a"`; represent serving on an Agent with `exposure.protocol: "a2a"`. The binding or exposure stores `contract_ref`; the reviewed task, discovery, auth-reference, lifecycle, timeout, retry, fallback, audit, and data-policy body belongs in top-level `a2aContracts[]`. Write `a2aContracts: []` when no A2A boundary exists.

## Graph contract

`graph.nodes[]` permits only these `node_kind` values:

- `input`
- `agent`
- `tool`
- `function`
- `human_input`
- `subworkflow`
- `join`
- `output`

Use typed references only where an asset is invoked:

- Agent Node: `agent_ref`;
- Tool Node: `tool_ref` plus `invocation_control: "workflow" | "agent"`;
- Subworkflow Node: `workflow_ref`;
- Agent-selected Tools: Agent Node `available_tools[]` entries with `tool_ref` and `invocation_control: "agent"`.

Function, Input, Human Input, Join, and Output Nodes do not bind an asset reference. A2A stays on the referenced Agent contract and may be marked as a protocol boundary; it is not a node kind.

Represent execution decisions under `control`, data and state movement under `channel`, and loop, parallel, or dynamic ownership under `regions`. Do not encode those semantics as additional node kinds or top-level assets.

## Artifact and scaffold implications

- Discover and Compose outputs must parse and pass the active strict v2 validator before review.
- External Codex owns canonical analysis and split artifacts. The web workbench has two canonical write surfaces: Graph IR and the versioned Asset Registry. Graph writes synchronize `analysis-result.json.graph` and `graph-ir.json`; Registry writes go through the shared service with the current optimistic `registry_revision`.
- Changed discovery, decision, Asset selection, or Registry snapshot invalidates Discovery approval and downstream evidence bound to the old revision. Compose-owned Graph, root-executable, runtime-contract, or composition changes preserve the current approved Discovery binding, reset or stale Composition review, and invalidate Scaffold/Verify evidence.
- Compose produces a coherent `analysis-result.json`, `graph-ir.json`, `boundary-design.md`, and `scaffold-plan.json` when readiness is achieved.
- Scaffold consumes reviewed and approved v2 artifacts only.
- Registry entries and versions remain Agent, Workflow, or Tool only. Skills and web/CLI callers never bypass the Asset Registry service by directly editing Registry storage or `catalog/*.yaml`.
- Missing required Target data is a Blocker. Do not repair it by inventing a retired field or selector.

## Verification

For proposed or canonical artifacts:

```bash
node scripts/validate-artifacts.mjs <artifact-root-or-proposed-dir>
```

Also inspect the serialized keys, split filenames, asset types, node kinds, typed references, control, channel, and regions directly.

## Stop conditions

Stop and report a Blocker when:

- `contract_version` is absent or differs from `"2.0"`;
- Work Item schema version 2 is incomplete or relies on legacy projection;
- a Resource or Dependency would have to masquerade as a Tool;
- an A2A Agent lacks its binding or exposure contract;
- an asset-bound node lacks the matching typed reference;
- control, channel, or region semantics are unresolved;
- required approval, graph data, or validation evidence is missing;
- validation fails.

## Sources checked

- [Taxonomy](../../../docs/workbench/taxonomy.md)
- [Graph IR](../../../docs/workbench/graph-ir.md)
- [Operating Model](../../../docs/workbench/operating-model.md)
- `schemas/af-work-item.schema.json`
- `scripts/af.mjs`
- strict cutover contract authorized for the canonical skill tree

## Checked date

- Checked date: 2026-07-24
- Product contract: strict Target Contract v2 only
- Installed package version: `google-adk 2.3.0`
