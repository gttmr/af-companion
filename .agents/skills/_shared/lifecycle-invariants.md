# Lifecycle Invariants

## Purpose

Keep external Codex work reviewable in a re-entrant lifecycle: explore and decide in Discover, compose an execution design, scaffold only from current approved artifacts, verify with fresh evidence, and return to the skill that owns any newly exposed defect.

## When to read

Read this reference at the start of every canonical Work Skill, after context compaction, before a gate decision, and before any forward or backward transition.

Apply [Companion Session Participation](companion-session-participation.md), [Decision Input Adapter](decision-input-adapter.md), [Fresh-context Handoff](fresh-context-handoff.md), and [Session and Work Item Provenance](session-and-work-item-provenance.md) at every session, question, handoff, and durable-write boundary.

## State graph

The five canonical skill IDs remain `af-workflow` plus:

```text
af-discover-assets ⇄ af-compose-solution → af-scaffold-runtime → af-verify-runtime
        ↑                     ↑                       │                 │
        └─────────────────────┴───────────────────────┴─────────────────┘
                         route by evidence ownership
```

The arrows do not authorize gate skipping. The normal path still requires current Discover approval before Compose and current composition approval before Scaffold. `af-workflow` chooses the owner from revisions, gates, invalidations, and failure evidence; it never advances a fixed stage counter.

## Core invariants

- `raw_requirement_to_code=false`.
- Discover Phase A requires confirmed Plan Mode and is non-mutating: targeted exploration, Registry search, options, questions, and a Discovery Decision Plan only.
- Discover Phase B runs in Default/Coding mode and materializes an approved Plan into canonical Work Item/artifact state.
- Required decisions and Asset dispositions never default. Structured and conversational paths ask exactly one question per turn and normalize to the same Decision Record semantics. A recommendation is not selected until the user explicitly accepts the displayed matching revision; record session and turn provenance.
- Discovery identifies Agent, Workflow, and Tool candidates. It does not finalize Graph topology or runtime APIs.
- Composition preserves the selected `solution_control_strategy`, chooses an Agent or Workflow `root_executable`, and owns Graph/runtime contracts. It does not silently revise a Discover decision.
- Scaffolding consumes current approved composition artifacts only. Verification records observations and cannot create a prior approval.
- Use `focus_skill` for the current user surface and `active_runs` for concurrent actors. Preserve unrelated active runs.
- Preserve discovery/composition cycles, prior revisions, and invalidation records. Supersede history; do not delete or silently overwrite it.
- Artifact presence, validation success, and skill `complete` never substitute for an explicit current gate decision.
- Runtime Handoff is a local follow-up bundle, not production deployment.
- The workbench projects lifecycle state and may canonically write Graph IR and the versioned Asset Registry only. Registry mutations use the shared service with optimistic `registry_revision` matching.

## Revision-bound transitions

Discovery approval is bound to current requirement, decision, Asset-decision, discovery, Catalog/Registry snapshot revisions, and the reviewed artifact hash. Composition approval is bound to current discovery, Graph, root-executable, runtime-contract, composition revisions, and the reviewed artifact hash.

Before entering a skill, compare the gate binding and the skill's `input_revision`/`output_revision` with the current `revisions` subjects. Any mismatch is stale even if the stored status says `approved` or `complete`.

Changes invalidate by ownership:

- requirement, decision, Asset decision, discovery, or Registry snapshot change → Discovery review `pending`; composition review, Scaffold, and Verify stale;
- Graph, root executable, runtime contract, or composition change → composition review remains `pending` when undecided, otherwise stale; Scaffold and Verify stale;
- Scaffold/source change → Verify stale;
- stale verification revision → verification outcome `stale` until rerun.

Append an `invalidations[]` record with source skill, target skill, triggering and invalidated revisions, reason, affected refs, and timestamps. Do not retain an approval for bytes or Registry state the reviewer did not approve.

## Return ownership

Route backward from concrete evidence:

| Problem | Owning skill |
| --- | --- |
| missing/incompatible Asset, changed requirement, unresolved user choice, owner/security boundary | `af-discover-assets` |
| Graph topology, root strategy, invocation/binding, Human Input, or runtime-contract design | `af-compose-solution` |
| source generation, lowering, import, or scaffold implementation | `af-scaffold-runtime` |
| missing/stale proof, scenario failure diagnosis, or retest | `af-verify-runtime` |

Compose returns to Discover by recording the current composition revision, missing capability, failed Asset refs, required contract delta, Graph impact, search criteria, and optional open decision. Start a new discovery cycle with trigger `return_to_discover`; mark the previous cycle superseded only after preserving it. On Compose re-entry, present the previous composition diff and conflicts. Never auto-merge the old Graph.

## Plan and session continuity

- Bind every run to one explicit repository, `workspace_id`, `application_id`, `work_id`, enrolled Companion session, role, and input revision. Ordinary sessions are not lifecycle actors.
- A canonical Plan-to-materialization Handoff targets only `af-discover-assets.materialize` and is bound to the Work Item, Plan hash, actual discovery/decision revisions, marker digest, expiry, and source session/turn.
- Only when the Work Item is the exact strict pristine ledger, a Bootstrap Grant may bridge Phase A to Phase B without fake revisions or a tracked Phase A write. It binds pristine ETag, Plan hash, exact source session/latest turn, target, expiry, and one-time fresh claim; after restart the source record must remain exact and non-revoked even though its old lease is no longer current.
- A fresh session may materialize only after one explicitly identified exact Handoff or Grant is claimed with complete new session/turn provenance. Reject stale, expired, ambiguous, mismatched, same-session, or duplicate claims; never infer identity from a sole pending candidate.
- Bridge health is not delivery proof. Use current first-prompt receipts and Work Item/Bridge authority state. Canonical Handoff fallback is Companion Continue, Copy Capsule, then exact confirmed attachment; a Bootstrap Grant is continued only by exact Grant ID.
- Bootstrap Phase B writes the actual revision objects plus one matching claimed canonical `session_handoffs[]` record, then requires automatic Grant finalization. It never calls a finalize endpoint or reuses the Grant after materialization.
- After compaction or resume, re-read the Work Item, current Plan/decisions, Registry revision, and selected skill before writing.

## Required evidence

Before execution, identify repository and Work Item roots, `ledger_revision`, session/run identity, current revision subjects, Registry revision, predecessor gate, open decisions, active invalidations, allowed write roots, and exact verification commands.

At a durable boundary, use only schema-supported states: `not_started`, `active`, `waiting_for_input`, `waiting_for_review`, `complete`, `blocked`, `failed`, or `stale`. Keep required decisions open and the skill `waiting_for_input` when user selection is absent.

## Verification

Run the phase-specific check and preserve command, cwd, exit code, concise output, bound revision, and residual uncertainty. At minimum for Work Item/artifact-sensitive work:

```bash
node scripts/af.mjs work validate <work-id-or-path> [--root <path>]
node scripts/validate-artifacts.mjs <artifact-root-or-proposed-dir>
git status --short
git diff --check
```

Before handoff, inspect the exact write inventory and confirm that no unrelated path changed.

## Stop conditions

Stop when identity or Plan Mode is ambiguous; a required decision is open; a gate binding is missing or stale; a Handoff or Bootstrap Grant cannot be exactly claimed; a predecessor artifact is absent; candidate contract data remains unresolved; a requested action would skip review, escape write roots, auto-merge stale work, mutate the Registry without expected revision, or restore a legacy stage/manifest/alias/parser.

## Official sources checked

- [Operating Model](../../../docs/workbench/operating-model.md)
- [Taxonomy](../../../docs/workbench/taxonomy.md)
- [Graph IR](../../../docs/workbench/graph-ir.md)
- [Work Item and External Codex](work-item-and-external-codex.md)
- `schemas/af-work-item.schema.json`
- `scripts/af.mjs`

## Checked date

- Checked date: 2026-07-28
- Official sources: Agent Factory active workbench documents and current repository contracts
- Installed package version: `google-adk 2.3.0`
- Contract note: the normal forward order remains gate-protected, but routing is re-entrant and revision-owned.
