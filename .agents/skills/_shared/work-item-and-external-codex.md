# Work Item and External Codex

## Purpose

Define the canonical lifecycle ledger, write ownership, and review provenance for Agent Factory work performed from an external Codex CLI or VS Code session.

The web workbench is a live projection of that work. It does not run lifecycle stages. Its only canonical artifact edit is Graph IR.

## Canonical root

Use one explicit root:

```text
artifacts/af/<work-id>/
```

The lifecycle ledger is:

```text
artifacts/af/<work-id>/af-work-item.json
```

Do not infer `<work-id>` from the newest directory. Confirm it from the user, the active Codex context, or an existing valid Work Item.

The normal artifact inventory is:

- `af-work-item.json`
- `analysis-result.json`
- `normalized-requirement.json`
- `asset-candidates.json`
- `graph-ir.json`
- `analysis-summary.md`
- `boundary-design.md`
- `scaffold-plan.json`
- `runtime-stub/`
- `implementation-handoff.md`
- `validation-report.md`
- `catalog-delta.yaml`, only when verified reuse feedback exists

Do not recreate `af-run-manifest.json`, `runs/<stage>/`, proposal directories, apply ledgers, or `/api/af` calls.

## Ownership

| Surface | Canonical writer |
| --- | --- |
| Requirement, candidates, contracts, handoff, source, reports | external Codex CLI or VS Code session using the matching Work Skill |
| `af-work-item.json` skill status and evidence refs | the executing external Codex session |
| Discovery or composition review decision | external Codex session, only after an explicit user or reviewer decision in that session |
| Graph IR | Compose skill or the web Graph editor |
| Catalog seeds | separate publication workflow; never a Work Skill |
| Activity, Git state, file inventory | workbench projection; read-only metadata |

The web Graph editor writes both the embedded `analysis-result.json.graph` and `graph-ir.json`, resets composition approval and downstream lifecycle state, and delivers a `graph_change` context item to an explicitly selected live Codex session. The external session must re-read the changed files before continuing.

## Work Item state

`af-work-item.json` has exactly four skill entries:

```text
af-discover-assets
af-compose-solution
af-scaffold-runtime
af-verify-runtime
```

Allowed status values are:

```text
not_started | active | waiting_for_input | waiting_for_review | complete | blocked | failed
```

At skill start:

1. set `active_skill` to the selected skill;
2. set that skill to `active`;
3. record `input_revision`, `started_at`, and `updated_at`;
4. preserve unrelated skill evidence.

At a durable boundary:

- use `waiting_for_input` when a user answer is required;
- use `waiting_for_review` when outputs exist but a review gate is pending;
- use `blocked` for a concrete unresolved contract or environment blocker;
- use `failed` for a failed execution that produced usable diagnostics;
- use `complete` only after required outputs and checks exist.

Record actual relative paths in `output_refs` and authorized source roots in `output_roots`. Record reproducible blocker or report paths in `blocker_refs`. Never mark a later skill started before its predecessor gate is satisfied.

## Review gates

There are two review gates:

- `review_gates.discovery` before Compose;
- `review_gates.composition` before Scaffold.

A skill may prepare review material but must not approve itself. Change a gate from `pending` only when the user or reviewer explicitly approves or requests changes in the current external Codex session.

For a decision, record all of:

- `status` as `approved` or `changes_requested`;
- `artifact_etag` as the SHA-256 of the reviewed canonical `analysis-result.json` bytes;
- `decided_at`;
- the current Codex `session_id` and `turn_id` supplied by the hook/session context.

If session or turn provenance is unavailable, keep the gate pending and report the review decision as not durably recorded. Any relevant artifact change makes the old gate stale; reset the affected gate and downstream evidence instead of retaining approval.

## Write boundary

Before writing, list the exact artifact root and any source output root. Writes are limited to:

- the selected Work Item root;
- explicit output roots approved for scaffolding;
- repository files directly required by the user's implementation request.

Do not write credentials, private endpoints, customer data, deployment scripts, or organization-specific production logic. Do not use the workbench API as a substitute for direct repository edits.

## Verification

At minimum:

```bash
test -f <artifact-root>/af-work-item.json
node scripts/validate-artifacts.mjs <artifact-root>
git status --short
git diff --check
```

Also run the checks required by the selected Work Skill and inspect the exact output inventory.

## Stop conditions

Stop when:

- repository root or Work Item root is ambiguous;
- a predecessor review gate is not approved;
- the selected session cannot be identified for a review decision or Graph-change continuation;
- a write would escape the declared artifact/source roots;
- a requested action would restore Stage Runner, proposal/apply, or legacy manifest behavior;
- proceeding requires invented approval, credentials, private data, or an unsupported contract.

## Sources checked

- [Operating Model](../../../docs/workbench/operating-model.md)
- `schemas/af-work-item.schema.json`
- `packages/web/server/workItemApi.ts`
- `packages/web/server/workspaceProjection.ts`
- official Codex Hooks lifecycle events, checked 2026-07-23

## Checked date

- Checked date: 2026-07-23
