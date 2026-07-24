# Selected Asset, Root, and Graph Review

## Purpose

Review whether the current approved discovery revision, user decisions, exact Asset versions/dispositions, Root Executable, and Graph form one coherent composition. This review consumes decisions; it does not replace them with Compose recommendations.

## 1. Current input review

Before topology work, build a review table from `af-work-item.json`.

| Surface | Required current evidence |
| --- | --- |
| Discovery cycle | one current non-superseded complete cycle whose revision matches `revisions.discovery` |
| Discovery gate | `approved`; all five bound revisions match current top-level revisions; `artifact_etag` matches current `analysis-result.json` bytes |
| Required decisions | current records are `resolved`, `selected_by: user`, with complete reason/session/turn provenance |
| Control strategy | Work Item value matches the resolved `solution_control_strategy` decision |
| Root Executable | exact Agent/Workflow ref and positive version match the resolved `root_executable` decision |
| Selected Assets | one resolved Asset decision per included Asset with exact ref, type, version, disposition, and provenance |
| Registry evidence | Catalog-backed versions resolve against the gate-bound Registry revision |
| Invalidation | no active invalidation makes an input current only in name |

Do not accept a matching name, latest Registry version, prior cycle approval, recommendation, or old Graph as a substitute for these checks.

## 2. Asset decision review

For every Root, Graph typed ref, Agent available Tool, runtime contract Asset, and A2A contract Agent, trace both directions:

```text
Graph/contract use
  -> asset_ref
  -> current asset_decision
  -> asset_type + asset_version + selected_disposition
  -> discovery candidate/full contract or exact Registry contract
  -> user decision provenance
```

The only disposition values are:

- `reuse_exact`
- `reuse_new_version`
- `compose_existing`
- `create_project_draft`
- `create_publish_candidate`
- `defer`
- `exclude`

Apply these rules:

- Every included Asset has a positive exact version before Compose review.
- `reuse_exact` binds the reviewed exact version; never upgrade it implicitly.
- `reuse_new_version` and `create_publish_candidate` remain distinct from a published existing version.
- `compose_existing` preserves every selected component decision; composition does not collapse them into an invented replacement Asset.
- `create_project_draft` remains project-local.
- `defer` blocks a required capability.
- `exclude` removes the Asset from Root, Graph, available Tools, and runtime/A2A contracts.
- Recommendations explain trade-offs but never populate `selected_disposition`.

For Registry-backed selections, use implemented CLI reads rather than memory:

```bash
node scripts/af.mjs asset get <asset-id>@<version> --level 2
node scripts/af.mjs asset validate <asset-id>@<version>
node scripts/af.mjs asset compare <asset-id> <from-version> <to-version>
```

If an exact version is absent, failed, incompatible, or materially different from the approved evidence, use Return-to-Discover.

## 3. Strategy and Root Executable realization

`solution_control_strategy` and `root_executable` are separate user decisions. The Root object has exactly:

```text
asset_type: agent | workflow
asset_ref: non-empty Asset ID
asset_version: positive integer
decision_id: resolved root_executable decision ID
```

Review against the canonical matrix:

| Selected strategy | Allowed selected Root | Required realization |
| --- | --- | --- |
| `single_agent` | Agent | Input -> Root Agent -> Output; Tools are Agent `available_tools[]` |
| `agent_delegation` | Agent | Root Agent delegates to one or more reviewed Agent refs |
| `explicit_workflow` | Workflow | `graph.workflow_ref` equals the Root Workflow; coordination is explicit |
| `hybrid` | Agent or Workflow | Agent Root owns delegation topology, or Workflow Root owns mixed explicit/delegated control |

The generated Python name `root_agent` is not an Asset type and is not a reason to alter the selected Root.

If the approved requirement cannot be realized by the selected strategy/Root pair, record the conflict and Return to Discover. Compose may recommend reconsideration but may not change either selection.

## 4. Hybrid boundary review

For `hybrid`, write an explicit boundary table:

| Question | Required answer |
| --- | --- |
| Fixed control | Which sequence, condition, approval, retry, loop, or terminal path is owned by the Workflow Graph? |
| Agent discretion | Which delegation or Tool choice is made by which Agent? |
| Transfer | What payload/channel crosses into delegated control? |
| Return | What result/error returns to the explicit flow or Root Agent? |
| Failure owner | Which side owns timeout, retry, fallback, cancellation, and audit? |
| State owner | Which side produces/consumes state or artifact keys? |

Do not use `hybrid` as a default or as a vague label for “several Agents.” Every boundary must be visible in Graph structure and reviewed contracts.

## 5. Graph review

Use only the strict v2 Graph envelope, eight node kinds, canonical edge `control`, optional `channel`, and `parallel`/`loop` regions.

### Root and ownership

- Agent Root: `graph.workflow_ref` is `null`.
- Workflow Root: `graph.workflow_ref` equals `root_executable.asset_ref` and that exact Asset is a Workflow.
- Every asset-bound node ref matches an included current Asset decision.
- Graph refs identify Assets; exact versions/dispositions remain in the Work Item decisions and are checked during every lowering handoff.

### Nodes

Check responsibility, typed ref where allowed, ports, region membership, and contract annotations.

- Agent Node: `agent_ref`; optional `available_tools[]` entries use `invocation_control: agent`.
- Tool Node: `tool_ref` and `invocation_control: workflow`.
- Subworkflow Node: `workflow_ref`.
- Function, Input, Human Input, Join, and Output Nodes do not bind an Asset ref.

Do not turn Function, Human Input, Join, callback, route, loop, A2A, MCP, or ambient behavior into an Asset or extra node kind.

### Edges and regions

Check:

- source/target existence and reachability;
- success, failure, pause, and terminal paths;
- route values, accepted aliases, one default, and invalid-value behavior;
- fan-out/fan-in and Join completeness;
- loop entry, bound, back/exit, timeout, and cancellation;
- producer/consumer ownership for `event`, `state`, and `artifact` channels;
- retry, fallback, error, callback, resume, cancel, and timeout semantics;
- remote boundary and A2A contract alignment.

Static cycles, unbounded loops, ambiguous routes, conflicting channel producers, or unsupported lowering are not review-ready.

## 6. Binding, Invocation Control, and runtime contracts

- Binding and Transport belong to the referenced Asset contract, not the Graph Node.
- Tool Invocation Control is only Workflow or Agent in the canonical serialization positions.
- A2A is an Agent binding/exposure with an exact contract ref, never a node or Asset category.
- Human Input includes payload, response mapping, pause/resume, expiry, duplicate, conflict, restart, and side-effect idempotency behavior when applicable.
- Every runtime contract names its Asset/Graph scope, owner, lifecycle, data, side effect, auth reference, timeout, retry, fallback, cancellation, audit, and support status as applicable.

An approved-looking Graph does not compensate for an unresolved runtime contract.

## 7. Return-to-Discover decision

Return rather than patching the design when review finds:

- no selected Asset for a required capability;
- an exact selected Asset version cannot be resolved;
- selected disposition and intended use conflict;
- I/O, side effect, security, owner, Human Input, A2A, or runtime policy is incompatible;
- a material contract delta changes discovery evidence;
- the selected strategy or Root would need to change.

The active composition cycle records the exact `return_to_discover` object. Create an open user decision only when choice is actually required. Add invalidations for each affected existing revision, preserve old evidence, and route to Discover. Do not search, select, or create the replacement Asset inside Compose.

## Verification

- Recompute current revisions and analysis SHA-256.
- Confirm every included Asset use has one exact current Asset decision.
- Check Root/strategy/Graph consistency.
- Check reachability, terminal paths, routes, joins, loops, and channels.
- Check contract and A2A references in both directions.
- Run `node scripts/validate-artifacts.mjs <artifact-root>`.

## Stop conditions

Stop when any current gate/revision check fails, a required decision is open, an Asset ref/version/disposition is ambiguous, the selected Root/strategy cannot be realized, a Graph/runtime contract is unresolved, or Return-to-Discover evidence has not been durably recorded.

## Sources checked

- `schemas/af-work-item.schema.json`
- `scripts/af.mjs`
- `docs/workbench/taxonomy.md`
- `docs/workbench/graph-ir.md`
- `scripts/validate-artifacts.mjs`

## Checked date

- Checked date: 2026-07-24
- Contract note: Work Item v2 revision-bound re-entry replaces linear candidate approval and standalone/read-only assumptions.
