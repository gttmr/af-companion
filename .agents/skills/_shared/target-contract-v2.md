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

`af-work-item.json` uses the separate lifecycle schema version 2 defined in `schemas/af-work-item.schema.json` and does not include `contract_version`. It fully records `focus_skill`, `active_runs`, all four Work Skill states, revisions, cycles, decisions, invalidations, review provenance, session handoffs, and verification outcome. Do not default missing values. A Work Item is required for current generator input.

The normal path's Discover review → Compose review → Scaffold → Verify gates are never skipped, but the Lifecycle Router does not assume a fixed one-way order. Compose can structure an Asset or contract problem and return to a new Discover cycle, and Scaffold/Verify problems also return to the Skill that owns the evidence. When the related canonical bytes or Registry revision change: reset the owning review gate to `pending` for a new review, or mark the prior decision `stale`; invalidate downstream gates/evidence; and preserve history.

Required items in `decisions` and `asset_decisions` must not become `resolved` without an explicit user selection. A recommendation is not a selection, and no automatic default is used. `solution_control_strategy` and the Agent/Workflow `root_executable` must also preserve the current user decision and revision binding.

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
- Compose produces `analysis-result.json`, `graph-ir.json`, `boundary-design.md`, and `scaffold-plan.json` that satisfy both concrete conditions: `node scripts/validate-artifacts.mjs <artifact-root>` exits `0`, and the composition review gate's status is `approved`.
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

- Checked date: 2026-07-29
- Product contract: strict Target Contract v2 only
- Installed package version: `google-adk 2.4.0`
- Compatibility note: the Work Item schema-version-2 rule, the non-linear Lifecycle Router rule, and the decisions/`asset_decisions` no-default rule were translated from Korean to English verbatim (no rule content changed). The Compose readiness gate now names the concrete pass condition (`scripts/validate-artifacts.mjs` exit `0` plus an `approved` composition review gate) instead of "coherent"/"readiness."
