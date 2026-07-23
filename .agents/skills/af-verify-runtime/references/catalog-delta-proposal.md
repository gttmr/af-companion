# Catalog Delta Proposal

## Purpose

Record verified reuse feedback without publishing Catalog entries.

## Decision criteria

Create `<artifact-root>/catalog-delta.yaml` only when verification found evidence for one of:

- a reusable Agent, Workflow, or Tool entry;
- a deterministic synthetic `runtime_mock` inside such an entry;
- a registration gap;
- a reviewer note for later Catalog publication.

Similar names are not evidence. Compare responsibility, I/O, side effect, owner, version, security, and runtime contract.

## Required evidence

- candidate and existing Catalog identifiers;
- responsibility and schema comparison;
- owner/version compatibility;
- auth, data, side-effect, timeout, retry, and audit compatibility;
- reuse, publish proposal, project-only, excluded, or unresolved decision;
- divergence and follow-up;
- synthetic mock provenance, when applicable.

## Boundary

Never modify `catalog/*.yaml` from this skill. A delta is review feedback, not publication. The workbench Catalog view is read-only.

## Verification

```bash
git diff --name-only -- catalog
node scripts/validate-artifacts.mjs <artifact-root>
```

The first command must be empty. Inspect the proposal for secrets, private endpoints, customer data, deployment content, and production logic.

## Stop conditions

Stop when reuse compatibility is unproven, publication authority is missing, a direct Catalog edit is requested, or sensitive/private content would enter the proposal.

## Checked date

- Checked date: 2026-07-23
- Contract sources: Taxonomy, Operating Model, and read-only workbench Catalog projection
