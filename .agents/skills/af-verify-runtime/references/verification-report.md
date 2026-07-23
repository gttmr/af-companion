# Verification Report

## Purpose

Record current lifecycle integrity, exact Asset/Root preservation, commands, scenarios, failures, session continuity, Registry state, and residual uncertainty in a reproducible form.

## Required record

For each material claim, include:

```text
Claim
Evidence level
Expected invariant
Command or direct inspection
Working directory and Git state/revision
Work Item and Registry revisions
Environment
Input scenario
Files/records read and artifacts written
Exit code
Observed output
Failure, skip, ambiguity, or stale reason
Residual uncertainty
Baseline comparison, when applicable
Owning skill/action when not passed
```

## Required sections

```markdown
# Validation Report

## Scope and Current Revisions
## Review Gates and Decision Preservation
## Root Executable and Generated Symbol
## Exact Asset Bindings and Registry Freshness
## No-Duplicate-Generation Checks
## Commands and Level 1-5 Results
## Runtime and Behavior Scenarios
## Fresh-session Handoff and Claim
## Registry Publication State
## Failures, Invalidation, and Owning Skill
## Residual Uncertainty
## Final Outcome
```

## Decision and binding table

Include one row per scaffold Asset with:

```text
Asset ref/type
User decision ID and disposition
Selected version
Registry/component ref and contract hash
Source ref or protocol binding
Generated manifest action
Runtime/import identity evidence
Duplicate-generation result
Status/warnings
```

Record Solution Control Strategy and Root Executable separately. Prove that manifest `generated_symbol: root_agent` names the exported symbol and that `root_agent` is the exact selected `root_executable` object of the expected Agent/Workflow type.

## Revision and handoff record

Record current top-level discovery, Graph, Root Executable, runtime-contract, composition, Scaffold, verification, and Catalog-snapshot revision digests, plus gate binding results.

When fresh-session materialization was selected or claimed, record the exact `handoff_id`, Work Item, discovery/decision revisions, plan/marker digest result, target skill, expiry, status, claim session/turn/time, cwd/session attachment, first-prompt evidence, and duplicate-claim check. If no such claim was made, say `not_applicable`; do not imply success from an empty record.

## Registry publication record

Do not add a Catalog Proposal section or create `catalog-delta.yaml`. Record one publication state from [Registry Publication and Reuse Evidence](registry-publication.md), the exact Asset/version/status, and current Registry revision. If an explicitly authorized canonical publication mutation ran, include the user decision ref, expected revision, command result, resulting revision, and downstream invalidation/reverification requirement.

## Work Item update

Write the report to `<artifact-root>/validation-report.md`. Set the schema-defined fields:

- `verification.outcome`: `passed`, `failed`, `unverified`, or `stale`;
- `verification.revision`: the current revision object for the verified subjects and Registry snapshot;
- `verification.report_ref`: the report path;
- `verification.evidence_refs`: exact evidence paths;
- `verification.verified_at`: the verification timestamp.

Set `af-verify-runtime` to `complete` only when outcome is `passed`. Otherwise preserve `failed`, `blocked`, `waiting_for_input`, or `stale` as the facts require. The report does not create user decisions or discovery/composition approval.

## Verification

Check that every claim has fresh evidence, every command has an exit code/output summary, every failed/skipped/ambiguous/stale check affects the final outcome, current revisions match the tested tree, exact Asset versions are neither duplicated nor regenerated, and no secret/private output was copied into the report.

## Stop conditions

Stop before claiming success when a required command failed, a required level or binding check was skipped, environment/revision/Registry state is absent, a handoff claim is ambiguous, publication is inferred rather than user-approved, residual uncertainty is omitted, or evidence is stale.

## Checked date

- Checked date: 2026-07-24
- Contract sources: `schemas/af-work-item.schema.json`, `scripts/af.mjs`, generated `workflow_manifest.json`, and the current verification operating model
