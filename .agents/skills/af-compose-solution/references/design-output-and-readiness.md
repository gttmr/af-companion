# Composition Output, Re-entry, and Scaffold Readiness

## Purpose

Define the coherent Compose output set, Work Item v2 revision/cycle updates, Return-to-Discover record, review binding, and Scaffold Readiness gate.

## Canonical output set

Write only under the confirmed Work Item root:

```text
<artifact-root>/analysis-result.json
<artifact-root>/graph-ir.json
<artifact-root>/boundary-design.md
<artifact-root>/scaffold-plan.json
<artifact-root>/af-work-item.json
```

`analysis-result.json.graph` and `graph-ir.json` contain the same Graph value. `scaffold-plan.json.graph` also matches the reviewed Graph. Do not emit proposal directories, run ledgers, legacy manifests, alternate Graph files, or runtime source.

Compose does not revise discovery Asset choices in place. If a candidate, version, disposition, or discovery-owned contract must change, use Return-to-Discover.

## Revision objects

Every Work Item revision is exactly:

```text
digest
subjects[]: { ref, sha256 }
registry_revision: lowercase SHA-256 | null
```

Subjects are non-empty, repository-relative, unique, and sorted by `ref`. All current revision objects use the same `registry_revision` as `revisions.catalog_snapshot`; when a Registry revision is present, the catalog snapshot includes `catalog/asset-registry.json`.

Build revisions with the implemented helper:

```bash
node scripts/af.mjs work revision \
  --registry-revision <lowercase-sha256-or-null> \
  <ref=repository-relative-path>...
```

The command hashes the actual contained files, sorts refs, and returns `{digest, subjects, registry_revision}`. It does not update the Work Item.

Compose maintains current top-level revisions for:

- `graph`;
- `root_executable`;
- `runtime_contract`;
- `composition`.

The composition revision covers the coherent reviewed output set, not only `graph-ir.json`. Skill `output_revision.subjects` includes every path named in Compose `output_refs`.

## Normal composition-cycle update

An active `composition_cycles[]` entry has exactly:

```text
cycle_id
status: active
revision
supersedes_cycle_id
artifact_refs
return_to_discover: null
started_at
completed_at: null
```

Use one active cycle at most. During edits, update that cycle's `revision` and `artifact_refs`. A completed or superseded cycle requires both a non-null revision and `completed_at`.

When outputs are coherent:

- increment `ledger_revision`;
- keep `focus_skill: af-compose-solution`;
- set Compose `status: waiting_for_review`;
- set the matching real Compose run `status: waiting_for_review`;
- set Compose `input_revision` to current `revisions.discovery`;
- set Compose `output_revision` to current `revisions.composition`;
- list exact Compose files in `output_refs`;
- keep `output_roots` empty because Compose writes no source;
- add current output paths to top-level `artifact_refs`;
- keep actual Scaffold-generated roots out of `generated_output_roots` until Scaffold creates them;
- reset the composition gate to a valid pending shape: null binding/decision metadata and empty `stale_reasons`.

Record planned source-root constraints in `boundary-design.md`; do not invent an unsupported field in `scaffold-plan.json`.

## Output content

### `analysis-result.json`

Preserve approved discovery content and update only Compose-owned `graph`, `runtimeContracts`, and `a2aContracts` as required. Do not silently alter selected candidates or user decisions.

### `graph-ir.json`

Store the exact strict v2 Graph. Its typed refs match current selected Asset IDs; exact versions and dispositions are proven by the Work Item Asset decisions.

### `boundary-design.md`

Record:

- discovery input revision and composition cycle;
- exact selected Asset refs, types, versions, dispositions, and decision IDs;
- selected control strategy and Root Executable;
- Graph ownership and Root realization;
- Hybrid fixed-control/delegation boundary;
- Binding, Transport, and Invocation Control;
- runtime/A2A contracts and support boundaries;
- Graph and contract validation findings;
- previous-cycle diff/conflicts on re-entry;
- Return-to-Discover evidence, when present;
- planned source-root constraints;
- Scaffold Readiness conclusion, blockers, warnings, and evidence.

### `scaffold-plan.json`

Use only the active strict v2 schema fields. Preserve:

- `contract_version: "2.0"`;
- `source: "approved_workbench_artifact"`;
- `raw_requirement_to_code: false`;
- explicit `output_mode` of `smoke` or `runnable`;
- exact selected `assets`, approved `runtime_contracts`, `excluded_assets`, and current `graph`;
- `manifest.catalog_bound_assets` and `manifest.new_code_required` consistent with user dispositions;
- `validation.can_generate_source`, `blockers`, and `warnings` that reflect current readiness.

Do not mark `can_generate_source: true` while a required decision, Asset version/disposition, Root/strategy conflict, contract, invalidation, or lowering blocker remains.

## Return-to-Discover record

When composition exposes a missing capability, failed/incompatible Asset, or material contract delta, keep the evidence on the active composition cycle:

```text
return_id: non-empty unique ID
triggering_revision: current composition revision object
missing_capability: non-empty capability/gap statement
failed_asset_refs: exact affected Asset IDs, possibly empty only when no selected Asset failed
required_contract_delta: non-empty current-versus-required contract statement
graph_impact: non-empty topology/control impact
recommended_search_criteria: one or more evidence-based criteria
open_decision_id: open decision ID | null
created_at: date-time
```

The field names and cardinality are fixed by Work Item v2. Do not add a status, recommendation selection, replacement Asset, or legacy stage field to this object.

If user choice is needed, create one normal open `decisions[]` record with:

- unique `decision_id` matching `open_decision_id`;
- `required: true` when Compose cannot continue without it;
- non-empty `options`;
- optional `recommended_option` that is one of those options;
- `selected_option`, `selected_by`, `selection_reason`, `session_id`, and `turn_id` all null;
- `status: open`;
- a valid `supersedes` link only when replacing a prior decision record.

Recompute `revisions.decision` if the decision set changes. Never mark the decision resolved until the user selects in a real session/turn.

## Invalidation and routing

For each affected existing revision, append an `invalidations[]` record with exactly:

```text
invalidation_id
source_skill: af-compose-solution
target_skill
triggering_revision
invalidated_revision
reason
affected_refs: non-empty
status: active
created_at
resolved_at: null
```

At minimum invalidate the insufficient discovery revision. Also invalidate current composition, Scaffold, and Verify revisions/evidence when they exist and are affected. Preserve old `output_refs`, `output_roots`, report refs, and evidence refs; staleness is not deletion.

Gate transitions follow the schema:

- An affected `approved` or `changes_requested` gate becomes `stale`, keeps its binding plus decision provenance, and receives one or more `stale_reasons`.
- A `pending` gate remains pending because pending requires null binding/provenance, while stale requires complete binding/provenance.
- A new discovery materialization later resets discovery review to pending and binds approval only after explicit review of the new revision.
- Composition review remains stale or pending until a new coherent composition output is ready.

Set `focus_skill` to `af-discover-assets`. The new Discover cycle uses `trigger: return_to_discover`; it preserves the prior cycle and supersedes it only with a real new cycle/revision. Compose does not invent a Discover run/session or select the replacement Asset.

## Re-entry update

After the new discovery cycle is complete and approved:

1. Verify all five discovery gate bindings and `artifact_etag` against current files.
2. Verify all required decisions and exact selected Asset versions/dispositions again.
3. Finalize the returned composition cycle as `superseded` with its revision and `completed_at`.
4. Create a new active composition cycle with `supersedes_cycle_id` pointing to that cycle.
5. Set Compose `input_revision` and any real Compose active run `input_revision` to the new `revisions.discovery`.
6. Compare prior and current discovery, decisions, Assets, Root, Graph, and runtime contracts.
7. Rebuild from current approved inputs. Do not automatically merge the previous Graph.
8. Resolve each invalidation only when replacement evidence exists; set `status: resolved` and `resolved_at` together.

## Scaffold Readiness

Ready requires all of:

- current approved discovery gate and current discovery cycle;
- no unresolved current required decision;
- exact included Asset refs, positive versions, user-selected dispositions, and Registry evidence where applicable;
- exact user-selected strategy and Root Executable, coherent with each other and the Graph;
- strict Graph validity, reachability, terminal/failure/pause paths, control, channel, and regions;
- explicit Hybrid boundary when selected;
- complete Binding, Transport, Invocation Control, runtime/A2A, auth-reference, data, side-effect, timeout, retry, fallback, cancellation, audit, Human Input/resume, duplicate, and restart contracts as applicable;
- testable success and required failure scenarios;
- no active invalidation affecting the composition input/output;
- `scaffold-plan.json.validation.can_generate_source: true`, no blockers, and warnings disclosed;
- artifact and Work Item validation passing;
- planned source-root constraints clear to Scaffold.

Readiness is false if generator/runtime support is unknown. Compose records the blocker; it does not promise that Scaffold will invent unsupported lowering.

## Composition review binding

Before review, `review_gates.composition` is pending with null binding. On an explicit reviewer decision, its binding has exactly:

```text
discovery_revision
graph_revision
root_executable_revision
runtime_contract_revision
composition_revision
artifact_etag
```

Every bound revision digest equals the corresponding current top-level revision digest. `artifact_etag` equals the SHA-256 of current `analysis-result.json` bytes. Non-pending gates also require `decided_at`, current `session_id`, and current `turn_id`; only stale gates have non-empty `stale_reasons`.

Set Compose complete and remove its active run only with an approved current gate. `changes_requested` preserves the reviewed binding/provenance and leaves Compose non-complete.

## Verification

```bash
node scripts/af.mjs work validate <work-id-or-path>
node scripts/validate-artifacts.mjs <artifact-root>
git diff --check
```

Also verify:

- embedded, split, and scaffold-plan Graph equality;
- revision digest/subject/Registry coherence;
- gate binding and analysis byte hash;
- one active cycle at most per cycle type;
- Return-to-Discover `open_decision_id` points to an open decision when non-null;
- invalidation records have existing revisions and non-empty affected refs;
- exact selected Asset versions/dispositions and Root reference;
- no Catalog or source path changed.

## Stop conditions

Stop when any current revision/gate check fails, a required decision or Asset selection is unresolved, Root/strategy/Graph conflict remains, Return-to-Discover or invalidation evidence is incomplete, a concurrent Graph change is unreconciled, strict validation fails, or source generation would start.

## Sources checked

- `schemas/af-work-item.schema.json`
- `schemas/scaffold-plan.schema.json`
- `scripts/af.mjs`
- `scripts/validate-artifacts.mjs`
- `packages/web/src/analyzer/afWorkItem.ts`

## Checked date

- Checked date: 2026-07-24
- Contract note: revision-bound re-entry and exact user Asset decisions are required; legacy compatibility is unsupported.
