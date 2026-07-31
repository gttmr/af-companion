---
name: af-scaffold-runtime
description: >-
  Generates a reviewable ADK Runtime Handoff or local source scaffold from the current approved Agent Factory composition, exact Asset bindings, and explicit output roots. Use when composition revisions and user decisions are current; stop on stale gates, unresolved decisions, unsupported lowering, or Registry drift.
---

# AF Scaffold Runtime

## Purpose

Lower the current approved composition into reviewable ADK source or a Runtime Handoff while preserving the user's Solution Control Strategy, Root Executable, and exact Asset dispositions.

```text
Approved current composition -> exact binding -> Scaffold
Raw requirement -> Code is forbidden
```

The output is local implementation material. It is not Registry publication, deployment, credential provisioning, private integration, or production-readiness proof.

## Preconditions

Require all of the following before generation:

- one valid strict-v2 Work Item and unambiguous artifact root;
- current `companion_active` participation, active unexpired lease, canonical cwd, and exact `workspace_id`, `application_id`, `work_id`, `role: materialization` attachment;
- `review_gates.discovery.status` and `review_gates.composition.status` both `approved`;
- the composition gate binding exactly matches current `revisions.discovery`, `graph`, `root_executable`, `runtime_contract`, and `composition`, and its `artifact_etag` matches the current canonical bytes;
- current decision, Asset-decision, and Root Executable revision subjects still hash to the values in `af-work-item.json`;
- `af-compose-solution` is `complete`, with no active invalidation affecting Scaffold and no unresolved required decision;
- a user-selected `solution_control_strategy` and `root_executable` whose Agent or Workflow ref/version is present in the approved scaffold assets;
- exactly one resolved, user-selected `asset_decision` for every scaffold Asset, including an exact positive `asset_version` and a generation disposition;
- a current `revisions.catalog_snapshot` and exact Registry revision for every Registry-backed decision;
- `scaffold-plan.json` has `raw_requirement_to_code=false`, explicit `smoke` or `runnable` mode, explicit authorized output roots, and no generation blocker;
- approved runtime/A2A contracts and installed-package evidence for every emitted ADK symbol.

Do not generate TODO source when any precondition is absent or stale.

## Required reading

1. [Source of Truth](../_shared/source-of-truth.md)
2. [Lifecycle Invariants](../_shared/lifecycle-invariants.md)
3. [Work Item and External Codex](../_shared/work-item-and-external-codex.md)
4. [Companion Session Participation](../_shared/companion-session-participation.md)
5. [Decision Input Adapter](../_shared/decision-input-adapter.md)
6. [Fresh-context Handoff](../_shared/fresh-context-handoff.md)
7. [Session and Work Item Provenance](../_shared/session-and-work-item-provenance.md)
8. [Artifact and Source Generation](references/artifact-and-source-generation.md)
9. [Output Modes and Handoff](references/output-modes-and-handoff.md)
10. [Target Contract v2](../_shared/target-contract-v2.md)

Read only the selected cards in [Runtime Pattern Selection](../_shared/runtime-pattern-selection.md), plus [Generated Output Checks](references/generated-output-checks.md) when generation is in scope. Verify exact ADK symbols through installed source or official documentation as required by [Source of Truth](../_shared/source-of-truth.md).

When available, apply `google-agents-cli-workflow` and `google-agents-cli-adk-code` as the standalone ADK development base. Reuse their API and implementation guidance; the approved Agent Factory composition and scaffold plan already own specification and scaffold authority, so do not start a second `.agents-cli-spec.md` dialogue or `agents-cli scaffold create` unless that exact operation is approved in the plan. This skill adds approved-artifact lowering, exact Asset binding, generator support, and Companion provenance; it must not copy Companion gates into generated application code.

## Exact Asset binding rules

- `reuse_exact`: bind one exact `published` version, or an explicitly accepted `deprecated` version. Import a local Agent, Workflow, or callable Tool from exactly one reviewed `python:module#symbol` source ref. A published local executable contract without that source ref fails closed; never recreate it as a new Agent or stub. MCP Tools and Remote A2A Agents use their reviewed protocol binding instead of a local source ref.
- `reuse_new_version`: implement only the selected exact `draft` or `reviewed` Registry version, and require an earlier Registry version of the same Asset. Never modify or regenerate a published version.
- `create_publish_candidate`: implement only the selected exact `draft` or `reviewed` Registry version. Scaffold does not publish it.
- `create_project_draft`: generate project-local version `1` with no Registry ref.
- `compose_existing`: apply only to the selected project-local Workflow Root at version `1`, with no Registry ref. Preserve at least two exact published or explicitly accepted deprecated component refs, and include each component as its own `reuse_exact` binding.
- `defer` and `exclude`: cannot appear in the scaffold set.

Bind each exact Registry version at most once. Root Executable version, Asset-decision version, Registry record, contract projection, and generated manifest binding must agree.

## Procedure

1. Confirm current Companion participation/lease, exact application/workspace/work materialization scope, canonical repository root, Work Item root, authorized source roots, observed session/turn, and current Git state. Default/Coding mode or a known session alone is insufficient.
2. Validate the Work Item and artifact root with the current CLI/validator; do not repair rejected legacy shapes.
3. Recompute current review bindings and revision subjects. Route stale discovery or Asset evidence to Discover, structural/Graph/root/runtime-contract drift to Compose, and unsupported generation to Scaffold.
4. Confirm all required decisions are resolved by the user and every scaffold Asset has exactly one current resolved Asset decision.
5. Load the current Asset Registry snapshot. Re-resolve every exact Registry ref/version and compare type, status, contract hash/projection, source ref or protocol binding, and Registry revision.
6. Reject duplicate Registry-version bindings, duplicate generation, project/Registry identity confusion, mutable published versions, or a Root version mismatch.
7. Verify Root Executable consistency with Solution Control Strategy, Graph owner/profile/topology, and the selected Agent or Workflow runtime type. Preserve the ADK-required `root_agent` symbol as a pointer to that exact Root Executable object.
8. Inspect installed ADK imports and signatures required by the approved contracts and confirm deterministic generator coverage for each selected Graph/runtime pattern.
9. Mark the Scaffold run active through `active_runs` only for the enrolled exact-scope materialization session and record its current input revision without changing another run or skill's evidence.
10. Run the repository generator with explicit roots when lowering is supported. Add only the smallest contract-backed seams required by the approved handoff; never derive behavior from raw requirement prose.
11. Preserve user-authored source and unrelated dirty changes. Do not rewrite output roots wholesale unless the approved generator contract requires it.
12. Write/update `implementation-handoff.md` with exact application/workspace/work/session/turn provenance, decision and recommendation revisions, exact Asset bindings, generated symbols, TODOs, non-goals, and manual integration boundaries.
13. Run generated output checks appropriate to the output mode, then inspect the final source diff, output inventory, and prohibited-output scan.
14. Record generated output roots, output refs, current Scaffold revision, evidence, and status in `af-work-item.json`.

## Output modes

- `smoke`: importable structure and explicit TODO seams; it does not claim real external behavior.
- `runnable`: reviewed synthetic/local behavior for the agreed scenarios; it still excludes private production integration.

Do not silently change modes.

## Write boundary

Writes are limited to the Work Item root and source roots explicitly approved in the scaffold plan, from the current exact materialization scope. Never write Registry records, `catalog/*.yaml`, secrets, private endpoints, deployment scripts, real customer data, or unrelated repository files. The workbench observes generation; it does not perform it. Ordinary sessions may inspect but cannot Scaffold or supply durable evidence.

## Verification

Use [Artifact and Source Generation](references/artifact-and-source-generation.md) and [Generated Output Checks](references/generated-output-checks.md). At minimum preserve:

- Work Item and strict-v2 artifact validation;
- current gate/revision and Registry-snapshot checks;
- exact Asset-binding and no-duplicate-generation checks;
- generated file and `workflow_manifest.json` inventory;
- installed package/version and exact import/signature probes;
- Python compile/import, generated tests, and applicable local smoke results;
- exact Git diff and residual uncertainty.

## Stop conditions

Stop when participation, lease, application/workspace/work/materialization scope, session/turn, or authorized roots are absent; any required decision is open; approval or revision is stale; the Registry snapshot changed; an exact version/source/protocol binding is absent; Graph and Root disagree; duplicate generation would occur; lowering is unsupported; source ownership conflicts; or any required validation fails.

**Stopping means generating nothing.** If a precondition cannot be observed, the only permitted outputs are the Missing-Information report and the named product gap — not a prototype "so the work is not wasted", and not a generated tree with the unmet precondition noted afterwards. `companion-session-participation.md` records that the participation fields currently have no read-only command; a strong model met exactly that gap here, dropped the precondition without comment, and produced a complete runtime anyway. Partial compliance with a hard gate is non-compliance, and it is harder to detect than an outright refusal.

The same rule governs step 12 above: if the application/workspace/work/session/turn provenance it requires is unobtainable, do not emit `implementation-handoff.md` with those fields silently missing. Either stop, or write them as explicitly named unknowns. An absent field in a provenance record reads as "not applicable"; it has to read as "could not be observed".

## Completion report

Report generated/edited files, output mode and roots, Work Item/Graph/runtime/composition/Registry revisions, Root Executable and generated symbol, exact Asset binding actions, commands/results, source diff summary, remaining TODOs, and the claims reserved for Verify.
- 2026-07-31: stated that stopping means generating nothing, after a recorded run met an unobservable participation precondition, dropped it without comment, and produced a complete runtime. Step 12 provenance must be emitted as named unknowns rather than silently omitted fields.
