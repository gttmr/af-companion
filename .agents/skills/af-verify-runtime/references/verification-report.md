# Verification Report

## Purpose

Record commands, environment, scenarios, results, failures, and residual uncertainty in a reproducible form.

## Required record

For each material claim, include:

```text
Claim
Evidence level
Command
Working directory and revision
Environment
Input scenario
Files read and artifacts written
Exit code
Observed output
Failure or skip reason
Residual uncertainty
Baseline comparison, when applicable
```

Suggested sections:

```markdown
# Validation Report

## Scope and Environment
## Commands
## Level 1-5 Results
## Runtime Scenarios
## Failures and Feedback
## Catalog Proposal
## Residual Uncertainty
## Final Claim
```

## Work Item update

Write the report to `<artifact-root>/validation-report.md`. Set `verification.outcome`, `revision`, and `report_ref` from fresh evidence. Set Verify complete only when the final outcome is `passed`; otherwise preserve `failed`, `blocked`, or `waiting_for_input` as appropriate.

The report does not create discovery or composition approval.

## Verification

Check that every command has an exit code and output summary, every failed/skipped check affects the final claim, and no secret/private output was copied into the report.

## Stop conditions

Stop before claiming success when a required command failed, a required level was skipped, environment/revision is absent, residual uncertainty is omitted, or evidence is stale.

## Checked date

- Checked date: 2026-07-23
- Contract sources: verification operating model and Work Item schema
