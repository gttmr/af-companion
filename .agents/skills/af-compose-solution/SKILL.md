---
name: af-compose-solution
description: >-
  Realizes an approved discovery revision as Graph IR, an exact Root Executable, Hybrid boundaries, bindings, runtime contracts, and Scaffold Readiness. Use when user decisions and Asset selections are approved; return to Discover when composition exposes an Asset or contract gap.
---

# AF Compose Solution

## Purpose

Realize the user's approved discovery decisions as an executable design. Compose owns:

- Graph IR and its owning boundary;
- `solution_control_strategy` realization without changing the selected strategy;
- the exact `root_executable` Agent or Workflow;
- the Hybrid boundary between explicit Workflow control and Agent delegation;
- Binding, Transport, and Tool Invocation Control;
- runtime and A2A contracts;
- Scaffold Readiness;
- Return-to-Discover evidence and re-entry when discovery is insufficient.

Compose does not choose Asset dispositions, substitute a recommendation for a user decision, generate runtime source, or preserve legacy lifecycle shapes.

## Required reading

Read all of these before changing an artifact:

1. [Source of Truth](../_shared/source-of-truth.md)
2. [Lifecycle Invariants](../_shared/lifecycle-invariants.md)
3. [Work Item and External Codex](../_shared/work-item-and-external-codex.md)
4. [Companion Session Participation](../_shared/companion-session-participation.md)
5. [Decision Input Adapter](../_shared/decision-input-adapter.md)
6. [Fresh-context Handoff](../_shared/fresh-context-handoff.md)
7. [Session and Work Item Provenance](../_shared/session-and-work-item-provenance.md)
8. [Work Item v2 schema](../../../schemas/af-work-item.schema.json)
9. [AF CLI source](../../../scripts/af.mjs)
10. [Graph IR](../_shared/graph-ir.md)
11. [Candidate and Graph Review](references/candidate-and-graph-review.md)
12. [Composition Output and Readiness](references/design-output-and-readiness.md)
13. [Target Contract v2](../_shared/target-contract-v2.md)
14. [Catalog and Reuse](../_shared/catalog-and-reuse.md)
15. [Runtime Pattern Selection](../_shared/runtime-pattern-selection.md)

For Work Item state, revision, gate, decision, and re-entry fields, the active v2 schema and parser are authoritative. Do not restore `active_skill`, a one-way-only lifecycle, byte-hash-only gates, or any legacy manifest/projection.

## Entry contract

Use one explicit Work Item root and require all of the following:

1. The current session is an enrolled `companion_active` participant with an active unexpired lease and exact `workspace_id`, `application_id`, `work_id`, canonical cwd, and `role: materialization` attachment. Ordinary sessions are not Compose actors.
2. `af-work-item.json` has `schema_version: 2` and parses without repair.
3. `skills.af-discover-assets.status` is `complete`.
4. The current non-superseded discovery cycle is complete, and its `revision.digest` equals `revisions.discovery.digest`.
5. `review_gates.discovery.status` is `approved`.
6. Its binding contains `requirement_revision`, `decision_revision`, `asset_decision_revision`, `discovery_revision`, `catalog_snapshot_revision`, and `artifact_etag`.
7. Every bound revision digest equals the corresponding current top-level revision digest, and `artifact_etag` equals the SHA-256 of the current `analysis-result.json` bytes.
8. Every current required `decisions[]` record is `resolved`, `selected_by` is `user`, and selection reason plus enrolled session/turn provenance are present; recover the matching recommendation revision before interpreting any shorthand.
9. `solution_control_strategy` is non-null and matches a resolved user decision whose `topic` is `solution_control_strategy`.
10. `root_executable` is non-null and its `decision_id` identifies a resolved user decision whose `topic` is `root_executable` and whose `selected_option` equals `root_executable.asset_ref`.
11. Every Asset included in the solution has one current resolved `asset_decisions[]` record with the exact `asset_ref`, `asset_type`, positive `asset_version`, and user-selected `selected_disposition`.
12. No active invalidation or unresolved required decision makes those inputs stale.

The allowed dispositions are exactly `reuse_exact`, `reuse_new_version`, `compose_existing`, `create_project_draft`, `create_publish_candidate`, `defer`, and `exclude`. A required Asset with `defer`, a referenced Asset with `exclude`, or an included Asset without an exact version is not a composable input.

For Registry-backed Assets, resolve the selected version against the gate-bound Registry snapshot. The implemented read commands are:

```bash
node scripts/af.mjs asset get <asset-id>@<version> --level 2
node scripts/af.mjs asset validate <asset-id>@<version>
```

Do not infer the latest version. If an entry condition is absent or stale before composition begins, stop and route to Discover; do not create a design from unapproved inputs.

## Composition-cycle entry

- Set `focus_skill` to `af-compose-solution`.
- Set the Compose skill state to `active` with `input_revision` equal to the current `revisions.discovery`.
- Add or update an `active_runs[]` record with `role: compose` only for the currently enrolled exact-scope materialization session and observed turn. Never invent run or session provenance or add an ordinary session.
- Maintain at most one active composition cycle.
- Resume the existing active cycle only when its input discovery revision is still current.
- After a Return-to-Discover has been satisfied by a newly approved discovery revision, mark the previous cycle `superseded` with its final revision and `completed_at`, then open a new active cycle whose `supersedes_cycle_id` points to it.
- Preserve old cycles and artifacts as history. Never delete them or automatically merge the previous Graph into the new cycle.

Increment `ledger_revision` on every Work Item write.

## Procedure

1. Re-read `af-work-item.json`, `analysis-result.json`, `asset-candidates.json`, `graph-ir.json`, and the current Registry evidence.
2. Run every entry check and bind the cycle to the current discovery revision.
3. Build an exact Asset table from current `asset_decisions[]`: Asset ref, type, version, selected disposition, decision provenance, contract source, and every Graph/root use.
4. Preserve the user-selected `solution_control_strategy` and `root_executable`. Recommendations remain explanatory evidence only.
5. Realize the strategy/root combination using [Candidate and Graph Review](references/candidate-and-graph-review.md). If the selected combination cannot satisfy the approved requirement, Return to Discover instead of changing it.
6. Build the smallest strict v2 Graph that realizes the selected strategy. Every asset-bound node uses the canonical typed ref; exact versions and dispositions remain bound through the Work Item Asset decisions.
7. Define the Hybrid boundary explicitly: which decisions are fixed by the Workflow Graph, which delegations are made by an Agent, and where control returns across that boundary.
8. Assign Tool Invocation Control only as `workflow` on Tool Nodes or `agent` on Agent `available_tools[]`. Binding and Transport stay on the referenced Asset contract.
9. Define only evidence-backed runtime/A2A contracts, including owner, lifecycle, auth reference, data and side effects, timeout, retry, fallback, cancellation, audit, Human Input/resume, state/artifact channels, and duplicate/restart behavior where applicable.
10. Check Root-to-Graph, Graph-to-Asset, Asset-to-decision, contract-to-Asset, and contract-to-Graph references in both directions.
11. Define success, failure, duplicate, timeout, restart, and side-effect scenarios required by the selected contracts.
12. Determine Scaffold Readiness and write the coherent output set in [Composition Output and Readiness](references/design-output-and-readiness.md).
13. Immediately before finalizing, re-read `analysis-result.json`, `graph-ir.json`, and `af-work-item.json`. Reconcile a concurrent web Graph save; never overwrite it from memory.
14. Validate the current artifact root and Work Item, then either prepare composition review or execute the Return-to-Discover path below.

## Return to Discover

Return when composition exposes any of these:

- a required capability has no selected Asset;
- an exact selected Asset version is missing, failed, deprecated without accepted use, or contract-incompatible;
- a selected disposition cannot realize the approved design;
- a material I/O, side-effect, owner, security, Human Input, remote-boundary, or runtime-contract delta exists;
- satisfying the requirement would require changing the selected strategy or Root Executable.

On return:

1. Materialize the triggering composition revision with current subjects and the current Registry revision.
2. Store that revision and its artifact refs on the active composition cycle, then put one exact `return_to_discover` object on it with `return_id`, `triggering_revision`, `missing_capability`, `failed_asset_refs`, `required_contract_delta`, `graph_impact`, non-empty `recommended_search_criteria`, nullable `open_decision_id`, and `created_at`.
3. Use exact Asset IDs in `failed_asset_refs`; preserve their versions and dispositions in the linked current Asset decisions and triggering revision evidence.
4. If user choice is required, add an open `decisions[]` record. Its selection fields and session/turn fields remain null, and `open_decision_id` must reference that exact open record. Preserve its decision and recommendation revision, then use the Decision Input Adapter: ask exactly one question per turn and stop `waiting_for_input`. A recommendation is not a selection, and `추천대로` is valid only for the displayed matching revision and never for a hard, credential, deployment, security, or irreversible gate.
5. Add one `invalidations[]` record per affected existing revision. Each record has `source_skill: af-compose-solution`, the owning `target_skill`, `triggering_revision`, `invalidated_revision`, a concrete `reason`, non-empty `affected_refs`, `status: active`, `created_at`, and `resolved_at: null`.
6. Mark an already decided affected gate `stale`, retain its binding and decision provenance, and add non-empty `stale_reasons`. A still-pending gate remains pending because v2 forbids stale gates without binding/provenance.
7. Mark affected Compose, Scaffold, Verify, and verification evidence stale when a current revision exists. Preserve refs and output roots as historical evidence.
8. Set `focus_skill` to `af-discover-assets` and hand routing back to `af-workflow`. Preserve exact application/workspace/work scope, artifact root, open/resolved decision refs, and recommendation revision; do not invent a Plan actor or auto-attach a session. The returned composition cycle remains durable evidence until a later approved discovery revision supersedes it.

Discover owns the new search, user decision, Asset disposition, and discovery approval. Compose must not perform those choices on Discover's behalf.

## Re-entry

Re-enter only after a new discovery cycle is complete and its current revision-bound gate is approved. Re-run every entry check, including the exact Asset versions and dispositions.

Reconfirm current Companion participation and the same application/workspace/work materialization scope. Re-read open/resolved decision refs and their recommendation revisions after compaction or fresh-session handoff; never infer them from summary prose.

Compare the new discovery revision with the returned composition evidence and present:

- added, removed, failed, or version-changed Assets;
- disposition changes;
- decision changes and supersession links;
- Root/strategy effects;
- Graph and runtime-contract conflicts.

Do not auto-merge the previous Graph. Start a new composition cycle, rebuild from current approved inputs, and preserve every still-current user decision exactly. Resolve an invalidation only after replacement evidence exists and passes the owning checks; set `status: resolved` and `resolved_at` together.

## Review gate

When the current cycle outputs are coherent and validation passes:

- set Compose to `waiting_for_review`;
- set the matching real Compose run to `waiting_for_review`;
- record current `input_revision`, `output_revision`, and exact `output_refs`;
- preserve the current approved Discovery gate and its reviewed discovery-revision artifact hash; Compose-owned aggregate changes do not make Discovery stale;
- reset `review_gates.composition` to `pending` with null binding/decision metadata and empty `stale_reasons`;
- never self-approve.

After Compose writes `analysis-result.json`, its current bytes are covered by `revisions.composition`. The Discovery gate's `artifact_etag` continues to match the `analysis-result.json` subject in its bound `discovery_revision`; only the Composition gate binds the new current aggregate ETag.

On an explicit decision from the current enrolled exact-scope session, use the Decision Input Adapter when a question is required, then bind the composition gate to the exact current `discovery`, `graph`, `root_executable`, `runtime_contract`, and `composition` revision objects plus the SHA-256 of current `analysis-result.json` bytes. Record `decided_at`, `session_id`, and `turn_id`. An ordinary-session approval is not a gate decision.

Set Compose `complete` and remove its active run only in the same durable update that records an `approved` current composition gate. For `changes_requested`, preserve the bound reviewed revision and provenance, keep Compose non-complete, and revise within the current cycle unless a Discover-owned input changed.

## Write boundary

Writes are limited to the confirmed Work Item root and require current exact materialization scope. Compose does not generate source, mutate the Asset Registry, publish Assets, edit Catalog seeds, call lifecycle server endpoints, or write legacy files.

## Verification

```bash
node scripts/af.mjs work validate <work-id-or-path>
node scripts/validate-artifacts.mjs <artifact-root>
git diff --check
git status --short
```

Use `node scripts/af.mjs work revision --registry-revision <sha256-or-null> <ref=path>...` to build revision objects; the command requires at least one repository-contained subject and a lowercase Registry SHA-256 or `null`.

Also compare embedded and split Graph IR, recompute gate bindings and `artifact_etag`, inspect exact Asset versions/dispositions, and confirm there is at most one active cycle of each kind.

## Stop conditions

Stop when Companion participation, lease, application/workspace/work/materialization scope, or reviewer provenance is absent; the Work Item cannot parse; discovery approval is absent or stale; a required decision is open; an exact selected Asset version/disposition is unresolved; the strategy/root combination is inconsistent; a Graph/runtime contract is unresolved; a concurrent Graph change is unreconciled; validation fails; or source generation would begin.

## Completion report

Report the composition cycle and discovery input revision, preserved strategy and Root Executable, exact selected Asset versions/dispositions, Graph and Hybrid boundary, runtime contracts, changed artifacts, Return-to-Discover state if any, validation evidence, review-gate state, Scaffold Readiness, and residual risk.
