# Lifecycle Invariants

## Purpose

Keep external Codex work reviewable: discover candidates, compose an execution design, scaffold only from approved artifacts, then verify with fresh evidence.

## When to read

Read this reference at the start of every canonical work skill and after context compaction. Read it again before crossing from one lifecycle phase to the next.

## Decision criteria

Use the canonical sequence:

```text
af-discover-assets
  -> af-compose-solution
  -> af-scaffold-runtime
  -> af-verify-runtime
```

`af-workflow` may inspect state and route to a phase, but it does not create artifacts or change approvals.

Apply these invariants:

- `raw_requirement_to_code=false`.
- Discovery identifies Agent, Workflow, and Tool candidates; it does not finalize Graph topology or runtime APIs.
- Composition decides whether the result is standalone or a Workflow. Do not create a Workflow when one Agent or Tool is sufficient.
- Scaffolding consumes reviewed, approved artifacts only.
- Verification records observed results; it does not create prior-stage approval.
- Each skill maintains its own `af-work-item.json` status and evidence references.
- A review gate changes only after an explicit user or reviewer decision in the current Codex session; a skill never self-approves.
- Runtime Handoff is a local follow-up bundle, not production deployment.
- The workbench projects files, activity, and Git state. It does not execute these skills; Graph IR is its only canonical edit surface.

## Required evidence

Before entering a phase, identify:

- repository root, Work Item root, and current external Codex session;
- current phase outputs and required predecessor artifacts;
- relevant approval gates;
- unresolved requirement-level and candidate-level missing information;
- runtime pattern evidence, if any;
- exact allowed artifact/source write set and verification command.

## Artifact implications

- Discovery preserves evidence, assumptions, contradictions, and missing information separately.
- Composition preserves explicit approve, defer, or reject decisions and Target rationale.
- Open `_shared/work-item-and-external-codex.md` before changing lifecycle state or canonical files.
- Write only named canonical files under one unambiguous Work Item root and explicitly authorized source roots.
- Artifact presence, skill completion, and validation output never substitute for review approval.

## Scaffold implications

- Prefer the repository's deterministic generator when it supports the approved composition.
- Do not hand-author runtime behavior from the raw requirement.
- Keep generated smoke mode to TODO/runtime wiring and runnable mode to reviewed synthetic behavior.
- Preserve generator non-goals: no deploy scripts, private endpoints, credentials, customer data, organization-specific runtime code, or production business logic.

## Verification

Run the phase-specific check and preserve command, exit code, output summary, and residual uncertainty. For artifact-sensitive phases:

```bash
node scripts/validate-artifacts.mjs <artifact-root-or-proposed-dir>
```

Before handoff, inspect the write inventory and confirm no unrelated path changed.

## Stop conditions

Stop when:

- the Work Item root, external Codex session, or selected skill is ambiguous;
- a predecessor artifact or required approval is absent;
- candidate-level missing information remains unresolved;
- a required runtime or A2A contract is not approved;
- the requested action would skip a skill gate, write outside the allowed set, or turn a raw requirement into code;
- the task requires product-code migration that is outside the authorized skill scope.

## Official sources checked

- [Operating Model](../../../docs/workbench/operating-model.md)
- [Taxonomy](../../../docs/workbench/taxonomy.md)
- [Graph IR](../../../docs/workbench/graph-ir.md)
- [Work Item and External Codex](work-item-and-external-codex.md)

## Checked date

- Checked date: 2026-07-23
- Official sources: Agent Factory active workbench documents
- Installed package version: `google-adk 2.3.0`
- Contract note: the four Work Skill IDs are the lifecycle labels; legacy stage labels are retired.
