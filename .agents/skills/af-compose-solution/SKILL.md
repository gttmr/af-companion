---
name: af-compose-solution
description: >-
  Composes approved Agent Factory candidates into a standalone design or Workflow Graph IR with invocation control, bindings, runtime contracts, and scaffold readiness. Use after discovery approval; do not discover raw candidates or generate runtime source.
---

# AF Compose Solution

## Purpose

Decide how approved candidates execute. Prefer a standalone Agent or Tool when sufficient; create an owning Workflow only when orchestration semantics require it.

Outputs cover Graph IR, Binding and Transport, Tool Invocation Control, state/artifact channels, A2A binding or exposure, runtime-pattern contracts, and Scaffold Readiness.

## Preconditions

- valid Work Item and canonical discovery outputs exist;
- `review_gates.discovery.status` is `approved` for the current `analysis-result.json` bytes;
- candidate responsibilities, I/O, risk, domain, and owner are reviewable;
- candidate-level hard gates are resolved or the candidate is explicitly deferred;
- the user has not requested source generation before composition review.

Recompute the analysis SHA-256. If it differs from the discovery gate, reset stale review/downstream state and return to Discover.

## Required reading

1. [Source of Truth](../_shared/source-of-truth.md)
2. [Lifecycle Invariants](../_shared/lifecycle-invariants.md)
3. [Work Item and External Codex](../_shared/work-item-and-external-codex.md)
4. [Graph IR](../_shared/graph-ir.md)
5. [Candidate and Graph Review](references/candidate-and-graph-review.md)
6. [Composition Output and Readiness](references/design-output-and-readiness.md)
7. [Target Contract v2](../_shared/target-contract-v2.md)

Read [Runtime Pattern Selection](../_shared/runtime-pattern-selection.md) only for evidence-backed patterns and [Catalog and Reuse](../_shared/catalog-and-reuse.md) only when reuse decisions are needed.

## Procedure

1. Re-read `af-work-item.json`, `analysis-result.json`, and split artifacts; mark Compose active.
2. Decide approve, defer, or reject for each candidate and preserve the rationale.
3. Decide standalone versus owning Workflow. Do not introduce orchestration for visual symmetry.
4. Build the smallest valid Graph using canonical node/edge envelopes, typed refs, control, channel, and regions.
5. Assign Tool Invocation Control to `workflow` or `agent`; never to Model/LLM.
6. Define only required Binding, Transport, Human Input/resume, callback, event-loop, ambient, A2A, auth, timeout, retry, fallback, audit, and data-policy contracts.
7. Check Graph-to-candidate and contract references in both directions.
8. Define success, failure, duplicate, timeout, restart, and side-effect scenarios when the selected pattern requires them.
9. Determine Scaffold Readiness and explicit source output roots.
10. Write the coherent output set from [Composition Output and Readiness](references/design-output-and-readiness.md).
11. Re-read Graph files immediately before validation so a concurrent web edit is not overwritten.
12. Validate and set Compose `waiting_for_review` with output refs/revision.

## Web Graph collaboration

Graph IR is the one shared edit surface. The browser may save a Graph change and queue its context to the selected Codex session. Treat that event as a request to re-open the canonical files, not as permission to overwrite them with an older in-memory Graph.

Any Graph change resets composition approval, Scaffold, and Verify evidence. Reconcile related contracts and boundary notes before review.

## Review gate

Present candidate decisions, Graph, runtime boundaries, risks, and readiness. Never self-approve.

On an explicit current-session reviewer decision, record status, current `analysis-result.json` SHA-256, timestamp, session ID, and turn ID. Set Compose complete only for an approved current revision. Changes requested return Compose to active/waiting state and keep downstream skills not started.

## Write boundary

Writes are limited to the Work Item root. Compose does not generate runtime source, modify Catalog seeds, or call a lifecycle server endpoint.

## Verification

```bash
node scripts/validate-artifacts.mjs <artifact-root>
git diff --check
git status --short
```

Also compare embedded and split Graph IR, inspect typed refs and invocation control, and confirm the review hash matches the final bytes.

## Stop conditions

Stop when discovery approval is absent/stale, a candidate hard gate remains, Graph/runtime semantics are unresolved, a concurrent Graph change is unreconciled, validation fails, reviewer provenance is unavailable, or source generation would begin before approval.

## Completion report

Report topology decision, changed artifacts, validation evidence, unresolved risks, Scaffold Readiness, review-gate state, and the next action.
