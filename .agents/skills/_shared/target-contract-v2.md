# Target Contract v2

## Purpose

Define the only artifact vocabulary that canonical Agent Factory skills may write or consume.

`contract_version: "2.0"` is required. Do not emit compatibility projections, synthesize retired selectors, or accept pre-v2 artifact shapes.

## When to read

Read before writing, replacing, reviewing, scaffolding from, or verifying:

- canonical `artifacts/af/<work-id>/analysis-result.json`;
- `asset-candidates.json`, `graph-ir.json`, scaffold plans, or Catalog proposals.

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

`af-work-item.json`은 별도 lifecycle schema를 사용하며 `contract_version`을 넣지 않는다. 네 Work Skill 상태, discovery/composition review provenance, verification outcome을 완전하게 기록한다. 누락값을 default로 보정하지 않으며 current generator input에서는 Work Item이 필수다.

Lifecycle은 Discover review → Compose review → Scaffold → Verify 순서를 건너뛰지 않는다. 관련 canonical bytes가 바뀌면 stale review gate와 downstream evidence를 무효화한다.

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
- External Codex owns canonical analysis and split artifacts. The web workbench may update only Graph IR, synchronizing `analysis-result.json.graph` and `graph-ir.json` atomically within its process boundary.
- Changed discovery or composition artifacts invalidate the affected review gate and downstream evidence.
- Compose produces a coherent `analysis-result.json`, `graph-ir.json`, `boundary-design.md`, and `scaffold-plan.json` when readiness is achieved.
- Scaffold consumes reviewed and approved v2 artifacts only.
- Catalog publication proposes Agent, Workflow, or Tool entries; skills never write `catalog/*.yaml` directly.
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
- strict cutover contract authorized for the canonical skill tree

## Checked date

- Checked date: 2026-07-23
- Product contract: strict Target Contract v2 only
- Installed package version: `google-adk 2.3.0`
