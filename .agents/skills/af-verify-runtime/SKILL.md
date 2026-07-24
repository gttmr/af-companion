---
name: af-verify-runtime
description: >-
  Verifies current Agent Factory decisions, revisions, exact Asset bindings, generated source, runtime connections, behavior, and fresh-session continuity with fresh claim-matched evidence. Use when a completed scaffold or focused claim needs current proof; it does not discover, compose, scaffold, self-approve, auto-publish, or preserve stale Catalog-delta workflows.
---

# AF Verify Runtime

## Purpose

Verify what the current Work Item revision actually preserves and does. Separate lifecycle/decision integrity, artifact contract, code correctness, runtime integration, behavior evaluation, and session continuity; retain failures and residual uncertainty in a durable report.

## Preconditions

- exact repository, Work Item, claims, current Git state, environment, and evidence roots are identified;
- current discovery/composition gates and their bound revisions are known;
- Scaffold is complete and current for generated-source or runtime claims;
- target output roots, Registry path/revision, and required local dependencies/mocks are known;
- no command or report would expose secrets or real customer data.

A focused structural/artifact audit may run before Scaffold, but it cannot complete Verify or claim generated/runtime behavior.

## Required reading

1. [Source of Truth](../_shared/source-of-truth.md)
2. [Lifecycle Invariants](../_shared/lifecycle-invariants.md)
3. [Work Item and External Codex](../_shared/work-item-and-external-codex.md)
4. [Testing Contract](../_shared/testing-contract.md)
5. [Verification Commands](references/verification-commands.md)
6. [Verification Report](references/verification-report.md)

Read [Runtime Validation Checks](references/runtime-validation-checks.md) for runtime claims, [Registry Publication and Reuse Evidence](references/registry-publication.md) for Registry-state or publication claims, and [Target Contract v2](../_shared/target-contract-v2.md) for artifact-contract judgments.

## Evidence levels

1. **Skill structure** — frontmatter, links, triggers, and instruction coherence.
2. **Lifecycle and artifact contract** — strict schema, current cycles/revisions/gates, decisions, exact refs, provenance, and session handoff.
3. **Code correctness** — generated manifest/source correspondence, build/typecheck/lint where valid, compile/import, unit and generated tests.
4. **Runtime integration** — exact Root Executable identity and local MCP/A2A/callback/event-loop/human-resume connection evidence in the actual environment.
5. **Behavior evaluation** — success, failure, safety, duplicate, timeout, restart, and quality scenarios required by the approved contract.

File existence proves none of Levels 3-5. A schema pass does not prove decision preservation; a build does not prove runtime interoperability; a smoke run does not prove production readiness.

## Required integrity proofs

For a full Verify result, prove:

- **User decisions:** current `solution_control_strategy`, `root_executable`, and every scaffold Asset disposition/version match resolved user decisions and the generated manifest/source.
- **Root Executable:** the selected Agent or Workflow ref/type/version matches Graph ownership/profile/topology; generated `root_agent` points to the exact `root_executable` object and has the selected runtime type.
- **Exact Asset bindings:** every scaffold Asset has one manifest binding with the exact decision, version, Registry/component ref, contract hash, source/protocol binding, generation action, and warning.
- **No duplicate generation:** no Registry version is bound twice; `reuse_exact` imports/connects the reviewed Asset instead of generating a replacement; project draft and `compose_existing` rules are preserved.
- **Registry freshness:** the loaded Registry revision equals current `revisions.catalog_snapshot` and every applicable current revision; every exact record still has the approved type, status, contract projection/hash, version, and source/protocol binding.
- **Current lifecycle:** discovery and composition gate bindings equal their current top-level revisions and current artifact bytes; Graph, Root Executable, runtime-contract, composition, and Scaffold revisions are not stale or invalidated.
- **Fresh-session continuity:** when a Plan-to-materialization handoff is claimed, verify the exact Work Item, discovery/decision revisions, plan/marker digest, target skill, expiry, unique claim session/turn/time, cwd/session attachment, and first-prompt claim evidence. Absence or ambiguity is not a successful handoff claim.

## Procedure

1. Re-read the current Work Item, canonical artifacts, generated roots/manifest, Registry snapshot, and Git state; identify the exact claims and revision under test.
2. Mark a Verify run in `active_runs` with the current input revision without overwriting other active runs or evidence.
3. Turn each claim into the minimum sufficient evidence level, command, scenario, and expected invariant.
4. Validate the Work Item/artifacts and independently inspect the required integrity proofs above.
5. Record baseline behavior before fixing a verification-discovered issue unless the user separately authorized implementation.
6. Execute fresh commands directly in the repository/runtime environment. There is no server command allow-list.
7. Preserve exact cwd, Git state/revision, Work Item and Registry revisions, environment facts, command, exit code, concise output, and timestamps.
8. Classify failures by owning surface: Asset/search/decision to Discover; Graph/root/runtime contract to Compose; source generation to Scaffold; runtime/environment, test, session continuity, or evidence gap to the corresponding owner. Do not stack speculative fixes.
9. Re-run only after a concrete correction and retain both failure and post-fix evidence.
10. Write `<artifact-root>/validation-report.md` using [Verification Report](references/verification-report.md).
11. Do not create `catalog-delta.yaml`. For reusable-Asset or publication findings, record the exact Registry ref/status/revision and follow [Registry Publication and Reuse Evidence](references/registry-publication.md).
12. Set `verification.outcome` to `passed`, `failed`, `unverified`, or `stale`, record the current verification revision/report/evidence refs/time, and update Verify status consistently.

## Outcome rules

- `passed`: every required claim has fresh sufficient evidence at the current revisions and no required check failed.
- `failed`: at least one required claim is disproved at the tested revision.
- `unverified`: required evidence could not be obtained because a dependency, service, credential boundary, environment, source ref, handoff evidence, or other prerequisite was unavailable.
- `stale`: a relevant Work Item, artifact, generated source, or Registry revision changed after the evidence was captured.

Only `passed` permits Verify `complete`. A report with a failed, skipped, ambiguous, or stale required check cannot claim completion.

Verification never creates discovery/composition approval or silently edits implementation source. Registry publication requires a separate explicit user publish decision and the canonical revision-checked service/CLI; it is never inferred from a passing report.

## Write boundary

Normal Verify writes are limited to `af-work-item.json`, `validation-report.md`, and approved ignored evidence locations. Do not write `catalog-delta.yaml` or edit Registry/YAML directly. A Registry mutation is allowed only when the user separately and explicitly authorizes the exact reviewed Asset/version and current expected Registry revision; use the canonical service/CLI and report the resulting revision/invalidation. Source fixes require separate user authorization.

## Verification of verification

Before finalizing, confirm every final claim maps to fresh evidence, all failures/skips/stale facts affect the outcome, tested revisions match the current Work Item/Registry/generated tree, exact Asset refs are not duplicated or regenerated, handoff claims are uniquely attributable, publication was not inferred, and sensitive output is absent.

## Stop conditions

Stop when target/revision is ambiguous, a predecessor or Registry snapshot is stale, required decision/binding/handoff evidence is absent, a command would be destructive or expose private data, the environment cannot support the claim, a source/Registry mutation lacks authorization, or evidence is insufficient for the requested conclusion.

## Completion report

Lead with outcome and tested Work Item/Registry/Git revisions. Report evidence by level, decision/root/binding preservation, lifecycle freshness, handoff result, failed/unverified/stale claims, report path, Registry publication state, residual uncertainty, and the exact owning-skill next action.
