---
name: af-scaffold-runtime
description: >-
  Generates a reviewable ADK Runtime Handoff or local source scaffold from an approved Agent Factory composition and explicit output roots. Use when an approved composition is ready for source generation; stop when approval, contracts, or generator support are missing.
---

# AF Scaffold Runtime

## Purpose

Lower an approved composition into reviewable ADK source or a Runtime Handoff.

```text
Approved Contract -> Scaffold
Raw Requirement -> Code is forbidden
```

The output is local implementation material, not deployment, credential provisioning, private integration, or production-readiness proof.

## Preconditions

- valid Work Item and strict v2 composition artifacts exist;
- discovery and composition review gates are approved for current bytes;
- Compose is complete and Scaffold Readiness is supported by evidence;
- `scaffold-plan.json` has `raw_requirement_to_code=false` and explicit output mode/roots;
- runtime/A2A contracts are approved and candidate hard gates are closed;
- required ADK symbols and signatures can be checked against the installed version;
- the source output roots are within user-authorized repository scope.

If any gate or revision is stale, return to the owning skill. Do not create even a TODO scaffold from raw requirements.

## Required reading

1. [Source of Truth](../_shared/source-of-truth.md)
2. [Lifecycle Invariants](../_shared/lifecycle-invariants.md)
3. [Work Item and External Codex](../_shared/work-item-and-external-codex.md)
4. [Artifact and Source Generation](references/artifact-and-source-generation.md)
5. [Output Modes and Handoff](references/output-modes-and-handoff.md)
6. [Target Contract v2](../_shared/target-contract-v2.md)

Read only the selected cards in [Runtime Pattern Selection](../_shared/runtime-pattern-selection.md), plus [Generated Output Checks](references/generated-output-checks.md) when relevant. Verify exact ADK symbols through installed source or official documentation as required by [Source of Truth](../_shared/source-of-truth.md).

## Procedure

1. Re-read the Work Item and approved artifacts; verify review hashes.
2. Mark Scaffold active with the composition input revision and declared output roots.
3. Validate the artifact root before source generation.
4. Inspect installed ADK version, imports, and signatures required by the selected contracts.
5. Confirm deterministic generator coverage for each Graph and runtime pattern.
6. Run the repository generator when supported.
7. Add only contract-backed seams or TODOs required by the approved handoff. Keep framework defaults neutral and avoid domain hard-coding in generators.
8. Preserve user-authored source and unrelated dirty changes. Do not rewrite output roots wholesale unless the approved generator contract requires it.
9. Write/update `implementation-handoff.md` with provenance, TODOs, non-goals, and manual integration boundaries.
10. Run compile/import, generated tests, and the agreed smoke scenario appropriate to the output mode.
11. Inspect the final Git diff and output inventory.
12. Record output refs, output roots, revision, evidence, and Scaffold completion in `af-work-item.json`.

## Output modes

- `smoke`: importable structure and explicit TODO seams; it does not claim real external behavior.
- `runnable`: reviewed synthetic/local behavior for the agreed scenarios; it still excludes private production integration.

Do not silently upgrade one mode to the other.

## Write boundary

Writes are limited to the Work Item root and source roots explicitly approved in the scaffold plan. Never write Catalog seeds, secrets, private endpoints, deployment scripts, or unrelated repository files. The workbench observes these changes; it does not perform generation.

## Verification

Use [Artifact and Source Generation](references/artifact-and-source-generation.md) and [Generated Output Checks](references/generated-output-checks.md). At minimum preserve:

- artifact validation;
- generated file inventory;
- installed package/version probe;
- Python compile and import result;
- generated test and local smoke result;
- exact Git diff and residual uncertainty.

## Stop conditions

Stop when approval is missing/stale, Graph changed after review, output roots are ambiguous, an unsupported lowering is required, installed API evidence is absent, generated/user source ownership conflicts, or any required validation fails.

## Completion report

Report generated/edited files, output mode, commands and results, source diff summary, remaining TODOs, Work Item revision, and the exact claims still reserved for Verify.
