---
name: af-discover-assets
description: >-
  Turns a raw or imported Agent Factory requirement into evidence-backed Agent, Workflow, and Tool candidates, dependencies, risks, and unresolved information inside one Work Item. Use when requirements need discovery before Graph composition; do not use for final topology, runtime source generation, or verification-only work.
---

# AF Discover Assets

## Purpose

Determine what should exist before deciding how it executes. Produce evidence, assumptions, contradictions, Missing Information, Agent·Workflow·Tool candidates, resources, dependencies, reuse signals, and runtime-pattern hints.

Agent, Workflow, and Tool are the only asset types. Resources, dependencies, protocols, callbacks, event loops, and ambient triggers are not asset types.

## Preconditions

- raw requirement or imported source exists;
- repository root is explicit; artifact-writing work also has one explicit Work Item ID/root;
- evidence access and sensitive-data boundaries are known;
- no source generation is requested from unreviewed prose.

If the Work Item is new, create `<artifact-root>/af-work-item.json` from `templates/af-work-item.json` with the actual ID and current timestamps. Never create a legacy manifest or run directory. An explicitly read-only advisory request may explain candidates without a Work Item, but must not imply durable lifecycle progress or write any file.

## Required reading

1. [Source of Truth](../_shared/source-of-truth.md)
2. [Lifecycle Invariants](../_shared/lifecycle-invariants.md)
3. [Work Item and External Codex](../_shared/work-item-and-external-codex.md)
4. [Taxonomy](../_shared/taxonomy.md)
5. [Evidence and Candidate Discovery](references/evidence-and-candidate-discovery.md)
6. [Analysis Result Output](references/analysis-result-output.md)
7. [Target Contract v2](../_shared/target-contract-v2.md), before JSON writes

Read [Missing Information](../_shared/missing-information.md) when any evidence or candidate contract is incomplete. Read [Catalog and Reuse](../_shared/catalog-and-reuse.md) only when Catalog comparison is in scope.

## Inputs

- user-provided requirement and attachments;
- files explicitly placed in scope;
- current Work Item artifacts, when revising discovery;
- current Catalog facts relevant to candidate reuse;
- active schemas, validators, and documentation.

Archive material is historical evidence only. Do not include credentials, private endpoints, real customer data, or organization-specific runtime code.

## Procedure

1. Re-read the Work Item and mark Discover `active` with current input revision and timestamps.
2. Normalize actors, goals, triggers, inputs, outputs, constraints, non-goals, success/failure scenarios, and evidence provenance.
3. Separate observed evidence, assumptions, contradictions, and missing information.
4. Identify the smallest responsibility-aligned Agent, Workflow, and Tool candidates. Do not create a Workflow merely because multiple steps exist.
5. Record Resources and Dependencies outside `assetCandidates`.
6. For each candidate, record identity, responsibility, I/O, side effects, domain, owner, reuse status, risk, data policy, confidence, rationale, and candidate-level missing information.
7. Add only evidence-backed relationship and runtime-pattern hints. Leave final Graph ownership and contracts to Compose.
8. Write the canonical discovery outputs defined in [Analysis Result Output](references/analysis-result-output.md).
9. Validate the Work Item root and inspect the exact diff.
10. Set Discover to `waiting_for_review`, record output refs/revision, and keep the discovery gate pending.

## Review gate

Present the candidate set, assumptions, risks, and unresolved questions. Do not approve the discovery output yourself.

If the user explicitly approves or requests changes in the current Codex session, record the decision using the current `analysis-result.json` SHA-256 plus session/turn provenance. On approval, set Discover `complete`; on changes requested, keep it active or waiting for input and invalidate downstream state.

Without durable session/turn provenance, leave the gate pending.

## Write boundary

Writes are limited to the confirmed Work Item root and the files named in the output reference. Discover never writes runtime source, Catalog seeds, deployment files, or workbench state.

## Verification

```bash
node scripts/validate-artifacts.mjs <artifact-root>
git diff --check
git status --short
```

Confirm the split candidate and normalized requirement files match `analysis-result.json`, Graph remains a conservative draft, and no candidate with hard-gate missing information is described as approved.

## Stop conditions

Stop when Work Item identity is ambiguous, material evidence is inaccessible, a candidate requires invented behavior or contract, strict v2 cannot represent the result, validation fails, a user decision is required, or a write would escape the artifact root.

## Completion report

Report artifacts written, candidate summary, unresolved information, validator evidence, review-gate state, and the exact next action. Discovery is not Compose authorization until the review gate is approved.
