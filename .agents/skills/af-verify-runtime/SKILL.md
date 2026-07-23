---
name: af-verify-runtime
description: >-
  Verifies Agent Factory artifacts, generated source, runtime connections, and behavior with fresh claim-matched evidence, then records failures and residual uncertainty. Use when a scaffold or focused claim needs current proof; it does not discover, compose, scaffold, self-approve, or publish Catalog entries.
---

# AF Verify Runtime

## Purpose

Verify what the current revision actually does. Separate structure, artifact contract, code correctness, runtime integration, and behavior evaluation; preserve failures and residual uncertainty in a durable report.

## Preconditions

- exact repository, Work Item, target revision, environment, and claims are identified;
- composition approval is current;
- Scaffold is complete for claims about generated source or runtime behavior;
- target output roots and required local dependencies/mocks are known;
- no verification command would expose secrets or real customer data.

A focused Level 1/2 audit may run before Scaffold, but it cannot complete the full lifecycle or claim runtime behavior.

## Required reading

1. [Source of Truth](../_shared/source-of-truth.md)
2. [Lifecycle Invariants](../_shared/lifecycle-invariants.md)
3. [Work Item and External Codex](../_shared/work-item-and-external-codex.md)
4. [Testing Contract](../_shared/testing-contract.md)
5. [Verification Commands](references/verification-commands.md)
6. [Verification Report](references/verification-report.md)

Read [Runtime Validation Checks](references/runtime-validation-checks.md) only for runtime claims, [Catalog Delta Proposal](references/catalog-delta-proposal.md) only for verified reuse feedback, and [Target Contract v2](../_shared/target-contract-v2.md) for artifact-contract judgments.

## Evidence levels

1. **Skill structure** — frontmatter, links, triggers, and instruction coherence.
2. **Artifact contract** — parse, schema, cross-file refs, gates, and provenance.
3. **Code correctness** — build/typecheck/lint where valid, compile/import, unit and generated tests.
4. **Runtime integration** — local smoke, MCP/A2A/callback/event-loop/human-resume connection evidence in the actual environment.
5. **Behavior evaluation** — success, failure, safety, duplicate, timeout, restart, and quality scenarios required by the approved contract.

File existence proves none of Levels 3-5. A build does not prove runtime interoperability. A smoke run does not prove production readiness.

## Procedure

1. Re-read Work Item, approved artifacts, source roots, and Git revision; mark Verify active.
2. Turn each requested claim into the minimum sufficient evidence level and command/scenario.
3. Record baseline behavior before fixing a verification-discovered issue unless the user separately authorized implementation.
4. Execute fresh commands directly in the repository/runtime environment. There is no server command allow-list.
5. Preserve exact cwd, revision, environment facts, command, exit code, concise output, and timestamps.
6. Classify failures as product, artifact, source, runtime/environment, test, or evidence-gap failures. Do not stack speculative fixes.
7. Re-run only after a concrete correction and retain both failure and post-fix evidence.
8. Write `<artifact-root>/validation-report.md` using [Verification Report](references/verification-report.md).
9. Write `catalog-delta.yaml` only when evidence supports reusable feedback; never edit Catalog seeds.
10. Set `verification.outcome` to `passed`, `failed`, or `unverified`, record revision/report ref, and update Verify status accordingly.

## Outcome rules

- `passed`: every required claim has fresh sufficient evidence and no required check failed.
- `failed`: at least one required claim is disproved at the current revision.
- `unverified`: a required claim could not be checked because evidence, dependency, service, credentials, or environment was unavailable.

Only `passed` permits Verify `complete`. A report containing skipped or failed required checks cannot claim completion.

Verification never creates discovery or composition approval and never silently edits implementation source. If evidence identifies an upstream defect, record it and route to the owning Work Skill or a separately authorized implementation task.

## Write boundary

Writes are limited to `af-work-item.json`, `validation-report.md`, and evidence-backed `catalog-delta.yaml` under the Work Item root. Temporary test output must stay in approved ignored locations. Source fixes require separate user authorization.

## Verification of verification

Before finalizing, inspect that every final claim maps to fresh evidence, all failures/skips appear in the report, the recorded revision matches the tested tree, the Catalog diff is empty, and sensitive output is absent.

## Stop conditions

Stop when target/revision is ambiguous, a required predecessor is stale, a command would be destructive or expose private data, the environment cannot support the requested claim, a source fix lacks authorization, or evidence is insufficient for the requested conclusion.

## Completion report

Lead with outcome and revision. Report evidence by level, failed/unverified claims, report path, Catalog proposal state, residual uncertainty, and the exact next action.
