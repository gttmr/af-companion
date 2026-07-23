# Discovery Decision Plan and Materialization Output

## Contents

- [Purpose](#purpose)
- [Phase A output](#phase-a-output)
- [Fresh-session handoff](#fresh-session-handoff)
- [Phase B preflight](#phase-b-preflight)
- [Canonical materialization outputs](#canonical-materialization-outputs)
- [Work Item v2 mapping](#work-item-v2-mapping)
- [Re-entry and invalidation](#re-entry-and-invalidation)
- [Review gate](#review-gate)
- [Verification](#verification)
- [Stop conditions](#stop-conditions)
- [Sources checked](#sources-checked)
- [Checked date](#checked-date)

## Purpose

Define the two different Discover outputs:

1. Phase A returns a non-persisted Discovery Decision Plan in the Plan conversation.
2. Phase B, in Default/coding mode, materializes that exact plan into strict discovery artifacts and Work Item v2.

Do not blur the boundary. A Plan response is not durable lifecycle progress, and materialized files do not create discovery approval.

## Phase A output

Phase A writes no repository-tracked file. Its final response is a **Discovery Decision Plan** with these sections:

1. **Identity and mode evidence** — repository, proposed/known Work Item, observed Plan Mode, session/turn, and whether this is initial discovery or re-entry.
2. **Goal and success criteria** — explicit user-selected outcome and observable success/failure criteria.
3. **Evidence summary** — observed evidence, assumptions, contradictions, Missing Information, and source locators kept separate.
4. **Selected control strategy** — one user-selected value from `single_agent`, `agent_delegation`, `explicit_workflow`, or `hybrid`, plus considered alternatives and rationale.
5. **Selected Root Executable** — Agent or Workflow, exact Asset ref/version, and decision identity. The ADK symbol name `root_agent` is not an Asset type.
6. **Asset search summary** — Registry snapshot revision, hard filters, bounded candidates, match grades, compatibility facts, and rejection reasons.
7. **Asset disposition table** — every required capability/Asset, exact version when applicable, available options, recommendation, explicit user selection, selection reason, and session/turn provenance.
8. **Candidates** — responsibility-aligned Agent, Workflow, and Tool candidates only.
9. **Resources and Dependencies** — separate non-Asset records.
10. **Human interaction** — user input, approval, interruption/resume, timeout/cancel, and responsibility choices when applicable.
11. **Remote and risk boundaries** — local/Remote A2A, side effect, auth, authorization, audit, and data-policy decisions when applicable.
12. **Runtime-pattern hints** — evidence-backed hints only; Compose owns final contracts.
13. **Rejected alternatives** — explicitly rejected strategy, Root, Asset, remote, or publish choices and reasons.
14. **Open decisions** — must be empty before a handoff marker is emitted.
15. **Compose handoff** — constraints Compose must preserve and questions Compose still owns; no final Graph Node/Edge topology.
16. **Materialization inventory** — exact files Phase B may write and checks it must run.
17. **Work Item/revision/handoff metadata** — Work Item ID/root, requirement/decision/Asset-decision/discovery and Registry revision digests, plan hash, handoff ID, expiry/claim expectations, and target phase.

Recommendations remain distinct from selections. “추천대로 진행” is a valid explicit user selection only for the recommendations presented in that interaction and must carry user session/turn provenance.

If any required choice is unresolved, return the current options and next `request_user_input` question instead of a completed plan. Do not create a handoff marker.

## Fresh-session handoff

For a complete decision set, the Plan emits this exact portable block:

```text
AF_WORK_ITEM=<work-id>
AF_HANDOFF=<handoff-id>
AF_DISCOVERY_REVISION=<discovery-revision-digest>
AF_TARGET=materialize-discovery
```

The portable marker is deliberately short. It identifies the requested continuation but is not itself an authorization or claim receipt.

Current Work Item v2 stores a handoff with `work_id`, source session/turn, structured discovery and decision revisions, plan hash, timestamps, marker digest, claim metadata, and internal `target_skill: "af-discover-assets.materialize"`. The portable `AF_TARGET` and internal `target_skill` are different contract surfaces; preserve each exact value.

If Companion returns a signed marker containing additional decision revision, plan hash, or claim-token lines, copy that complete marker unchanged. Never invent a token, strip signed fields, or derive a claim from the first active session.

An automatic claim is accepted only when all of these match:

- exact Work Item and canonical cwd;
- exact pending handoff ID;
- discovery and decision revisions;
- plan hash and marker digest;
- a distinct fresh session and its first claiming turn;
- unexpired, non-superseded, not-previously-claimed status.

If automatic claim is unavailable, use explicit session attachment:

```bash
node scripts/af.mjs work attach-session --session <session-id> --work-id <work-id> --role materialization [--root PATH]
```

This command attaches only the named session and role. It does not guess a session and does not replace revision/plan verification. The user must provide the complete Decision Plan and marker in the attached session when automatic claim context is absent.

## Phase B preflight

Phase B runs only in Default/coding mode. Before writing:

1. verify mode, repository, Work Item identity, artifact root, and active session/turn;
2. verify the exact claimed or manually attached handoff and complete Decision Plan;
3. compare the plan hash, marker, requirement/decision/Asset-decision/discovery digests, Registry snapshot, Asset refs/versions, strategy, and Root Executable;
4. reject expired, superseded, duplicate, ambiguous, wrong-worktree, or mismatched continuation;
5. re-read `schemas/af-work-item.schema.json`, `schemas/analysis-result.schema.json`, `packages/web/src/analyzer/types.ts`, `scripts/af.mjs`, and `scripts/validate-artifacts.mjs` before serializing exact nested shapes;
6. for re-entry, re-read the current Work Item, previous discovery cycle, current composition cycle, `return_to_discover`, review gates, and invalidations.

For a confirmed new Work Item:

```bash
node scripts/af.mjs work init <work-id> [--root PATH]
```

For an existing Work Item:

```bash
node scripts/af.mjs work validate <work-id-or-path> [--root PATH]
```

Do not create a legacy ledger, copy stale lifecycle state, or initialize a second root for the same plan.

If new evidence requires changing a user choice, stop materialization and return to Phase A with the contradiction and affected decisions. Phase B never silently reopens or replaces choices.

## Canonical materialization outputs

Write only inside the confirmed Work Item root:

```text
<artifact-root>/af-work-item.json
<artifact-root>/analysis-result.json
<artifact-root>/normalized-requirement.json
<artifact-root>/asset-candidates.json
<artifact-root>/analysis-summary.md
```

Do not invent `decisions.json`, `asset-decisions.json`, a legacy manifest, run directories, proposal/apply artifacts, or compatibility projections. Structured decisions and Asset decisions belong in Work Item v2.

`analysis-result.json` remains strict Target Contract v2:

```text
contract_version
normalizedRequirement
evidence
assetCandidates
a2aContracts
runtimeContracts
graph
```

`contract_version` is exactly `"2.0"`. `normalized-requirement.json` and `asset-candidates.json` are faithful projections of the aggregate. Empty contract collections remain arrays.

Discover preserves a schema-valid conservative Graph envelope only when the strict aggregate requires it. It does not decide final topology, Root ownership in Graph, Tool Invocation Control placement, Edge contracts, Regions, or runtime contracts. Compose owns those decisions after discovery approval.

Each candidate preserves the exact active-schema identity, `asset_type`, responsibility, confidence/rationale, I/O and error boundary, reuse evidence, side effect, auth/audit/data-policy fields, risk, status, and Missing Information. A2A stays on an Agent binding/exposure; Resources and Dependencies remain separate evidence/summary records rather than Assets.

## Work Item v2 mapping

Materialize the current `schemas/af-work-item.schema.json` contract, including every required top-level field. The Discover-owned updates are:

| Decision-plan subject | Work Item v2 location |
| --- | --- |
| current UI/routing focus | `focus_skill: "af-discover-assets"` |
| currently active actors | `active_runs[]` with schema-valid `plan`, `planning_subagent`, or `materializer` roles; closed Plan identity remains in the handoff, not as a completed active run |
| materialized hashes | `revisions.requirement`, `decision`, `asset_decision`, `discovery`, and `catalog_snapshot` |
| discovery history | append-only `discovery_cycles[]` with `initial`, `return_to_discover`, or `invalidation` trigger |
| user choices | `decisions[]`; resolved entries require `selected_by: "user"`, reason, session, and turn |
| Asset dispositions | `asset_decisions[]`; resolved entries require one schema disposition and user provenance |
| control decision | `solution_control_strategy` |
| Root decision | `root_executable` with Agent/Workflow type, exact ref, positive version, and decision ID |
| lifecycle state | `skills["af-discover-assets"]`, output refs/revision, timestamps, and status |
| revision gate | `review_gates.discovery`; new bytes remain `pending` until explicit review |
| downstream drift | `invalidations[]`, stale gate/skill/evidence state, and preserved affected refs |
| session continuity | `session_handoffs[]` with exact source/claim identities and internal target skill |

Increment `ledger_revision` for the materialized ledger update. Preserve unrelated current evidence and history.

Revision objects contain `digest`, one or more sorted `subjects` with exact SHA-256 values, and one coherent `registry_revision`. Use the current Registry snapshot on related requirement, decision, Asset-decision, discovery, and Catalog subjects. Do not fake a JSON-pointer subject hash by hashing the whole file under a fragment label.

The current CLI can compute a revision for file-backed subjects:

```bash
node scripts/af.mjs work revision --registry-revision <lowercase-sha256-or-null> <ref=repository-relative-path>... [--root PATH]
```

It prints a revision object; it does not mutate the Work Item. For embedded decision subjects, serialize/hash the schema-owned subdocument according to current repository code and validator behavior rather than inventing a CLI option or standalone artifact.

When materialization succeeds, the current discovery cycle points at the exact artifact refs and revision, Discover becomes `waiting_for_review`, and the discovery gate remains `pending`.

## Re-entry and invalidation

When Compose returns to Discover, consume the schema-owned `composition_cycles[].return_to_discover` record. The new discovery cycle:

- uses trigger `return_to_discover`;
- identifies and supersedes the previous cycle without deleting it;
- refreshes the Registry snapshot and affected decisions;
- records new artifact refs and the new discovery revision;
- keeps unaffected explicit decisions only when current evidence still supports them.

After new discovery bytes are materialized:

- current discovery review is `pending` for the new binding;
- prior composition review becomes `stale` with reasons;
- dependent Compose/Scaffold/Verify skill state and verification evidence become `stale` where applicable;
- append one or more schema-valid `invalidations` with source/target skill, triggering and invalidated revisions, reason, affected refs, and timestamps;
- do not delete generated output or previous verification merely to hide staleness;
- do not merge or rewrite the previous Graph; Compose shows and resolves the later diff/conflict after discovery approval.

## Review gate

Present the normalized requirement, evidence classes, candidates, Resources/Dependencies, exact user decisions, Asset search/dispositions, risks, Missing Information, revisions, and invalidations.

Discover never self-approves. Validator success, file presence, a Plan marker, or a claimed handoff is not review approval.

An explicit current-session approval binds all current discovery inputs required by Work Item v2:

- requirement revision;
- decision revision;
- Asset-decision revision;
- discovery revision;
- Registry snapshot revision;
- SHA-256 of current canonical `analysis-result.json` bytes.

Record reviewer session/turn and decision time. Only a current `approved` binding permits Discover `complete` and Compose entry. Changes requested or changed bytes keep/reopen Discover and invalidate dependent state.

## Verification

Run from the canonical repository:

```bash
node scripts/af.mjs work validate <work-id-or-path> [--root PATH]
node scripts/validate-artifacts.mjs <artifact-root>
git diff --check
git status --short
```

For every exact Registry reuse selection:

```bash
node scripts/af.mjs asset validate <asset-id>@<version> [--root PATH|--registry PATH]
```

Inspect directly that:

- the write inventory is confined to the Work Item root;
- aggregate and split requirement/candidate bytes agree;
- only Agent, Workflow, and Tool appear in `assetCandidates`;
- each required capability has one resolved user disposition or remains an explicit hard gate;
- Root type/ref/version and strategy match the Decision Plan;
- revisions and Registry snapshot match current bytes;
- handoff claim identity is exact and unique;
- re-entry preserves prior cycles and marks downstream state stale;
- Graph topology was not finalized and runtime/source files were not written.

## Stop conditions

Stop before or during materialization when Default/coding mode is absent, exact handoff or revision identity cannot be proven, a required decision is open, a selected Asset/version no longer exists at the claimed Registry revision, a Phase A choice would need silent change, a hard gate is hidden, strict v2 cannot represent the result, revision subjects cannot be computed coherently, validation fails, or any write would escape the Work Item root.

## Sources checked

- `schemas/af-work-item.schema.json`
- `schemas/analysis-result.schema.json`
- `scripts/af.mjs`
- `scripts/validate-artifacts.mjs`
- `packages/web/src/analyzer/afWorkItem.ts`
- `packages/web/server/codexBridgeStore.ts`
- `docs/workbench/operating-model.md`
- `docs/migration/plan-discovery-asset-registry-status.md`

## Checked date

- Checked date: 2026-07-24
- Contract note: Phase A emits only a conversation plan/marker; Phase B claims exact continuity and materializes strict Work Item v2 without finalizing Graph IR.
