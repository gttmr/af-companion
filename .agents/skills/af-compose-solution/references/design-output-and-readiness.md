# Composition Output and Readiness

## Purpose

Fix the canonical Compose output set and Scaffold Readiness gate.

## Output paths

Write a coherent set under the confirmed Work Item root:

```text
<artifact-root>/analysis-result.json
<artifact-root>/graph-ir.json
<artifact-root>/boundary-design.md
<artifact-root>/scaffold-plan.json
<artifact-root>/af-work-item.json
```

Update `asset-candidates.json` or other split projections when the composition decision changes their canonical content. Do not emit proposal or run-ledger files.

## Readiness checklist

Confirm all of:

- approved discovery review gate matches the current discovery artifact;
- selected candidate responsibility, input/output, and side-effect contract;
- explicit standalone or owning Workflow decision;
- valid Graph IR including control, channel, and region semantics;
- Binding, Transport, and Tool Invocation Control;
- selected Runtime Pattern contracts and required auth variable names;
- closed candidate-level Missing Information;
- testable success and failure scenarios;
- strict v2 artifact validation;
- explicit output roots suitable for Scaffold.

## Boundary design evidence

`boundary-design.md` records:

- approve, defer, and reject decisions;
- standalone/Workflow rationale;
- Graph changes and validation findings;
- Tool Invocation Control and Binding;
- Runtime Pattern and A2A readiness;
- reuse decisions;
- unresolved gates and blockers;
- Scaffold Readiness conclusion with evidence.

## Work Item update

When outputs are complete and validation passes, set Compose to `waiting_for_review`, record output refs/revision, and leave `review_gates.composition` pending. Set Compose to `complete` only after explicit approval is durably recorded with current session/turn provenance.

The web Graph editor may change Graph IR concurrently with an external session. Before finalizing, re-read `analysis-result.json`, `graph-ir.json`, and `af-work-item.json`. A Graph change resets composition approval and downstream evidence.

## Verification

```bash
node scripts/validate-artifacts.mjs <artifact-root>
git diff --check
```

Directly compare `analysis-result.json.graph` with `graph-ir.json` and inspect the Work Item review revision.

## Stop conditions

Stop when discovery is not approved, candidate hard gates remain, Graph or runtime contracts are unresolved, current files changed since review, validation fails, or source generation is requested before composition approval.

## Checked date

- Checked date: 2026-07-23
- Contract sources: Graph IR, strict v2 validator, and Work Item lifecycle
