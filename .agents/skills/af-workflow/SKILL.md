---
name: af-workflow
description: >-
  Routes an Agent Factory Work Item re-entrantly from current revisions, review gates, invalidations, active runs, and session handoffs. Use when starting, resuming, returning between Discover and Compose, claiming Plan materialization, or deciding which Work Skill owns a failure.
---

# AF Workflow

## Purpose

Bind one explicit repository, Work Item, and external Codex session, then select exactly one of the four canonical Work Skills:

```text
af-discover-assets
af-compose-solution
af-scaffold-runtime
af-verify-runtime
```

The normal forward path is Discover → Compose → Scaffold → Verify, but this router is re-entrant. It routes from current evidence and revision ownership; it never assumes that the next action is the next item in a fixed sequence.

The router may inspect state, establish the supported session binding, and record the selected focus/run context. It does not perform a Work Skill's discovery, composition, scaffolding, verification, review decision, or Asset Registry mutation on that skill's behalf.

## Required reading

1. [Source of Truth](../_shared/source-of-truth.md)
2. [Lifecycle Invariants](../_shared/lifecycle-invariants.md)
3. [Work Item and External Codex](../_shared/work-item-and-external-codex.md)
4. [Missing Information](../_shared/missing-information.md), when a decision or contract is open

Read the selected Work Skill in full before executing it.

## Identity and mode gate

1. Confirm the canonical repository root and one explicit `work_id`; never choose the newest directory or first active session.
2. Validate `<artifact-root>/af-work-item.json` against the current schema and reconcile its refs with current files, Registry revision, Git state, and Bridge receipts.
3. Bind the current session to that Work Item and its role. The supported fallback command is:

   ```bash
   node scripts/af.mjs work attach-session --session <session-id> --work-id <work-id> --role <plan|materialization> [--root <path>]
   ```

4. Use `focus_skill` for the user's current Work Skill surface. Use `active_runs` for live actors and preserve unrelated runs.
5. Before Discover Phase A, verify that the current collaboration mode is Plan. If Plan Mode cannot be confirmed, make no repository or Work Item write, explain how the user can switch modes in the installed Codex surface, and stop. Do not assume the agent can change modes.
6. Discover materialization runs in Default/Coding mode from an approved Discovery Decision Plan; do not require Plan Mode for Phase B.

If the Work Item does not exist, initialize it only for an explicit valid ID and only outside non-mutating Discover Phase A:

```bash
node scripts/af.mjs work init <work-id> [--root <path>]
```

## Evidence-first routing

Read all of these before choosing a route:

- `focus_skill`, `active_runs`, and all four `skills` states;
- current `revisions`, including their subject hashes and `registry_revision`;
- active and superseded `discovery_cycles` and `composition_cycles`;
- open required `decisions` and `asset_decisions`;
- `solution_control_strategy` and `root_executable`;
- discovery and composition gate status plus exact revision bindings;
- active `invalidations`, artifact refs, generated roots, and verification outcome;
- pending, claimed, expired, or superseded `session_handoffs`;
- actual canonical files, Asset Registry snapshot, Bridge session/turn receipts, and Git state.

Artifact presence is not approval. `complete` is not current when its input/output revision no longer matches the current subjects. A stale gate or downstream state cannot authorize a transition.

## Routing rules

| Current evidence | Route |
| --- | --- |
| initial requirement or invalidated Asset/decision evidence needs exploration | `af-discover-assets` Phase A in confirmed Plan Mode |
| approved Plan must be written, or a valid fresh-session handoff was claimed | `af-discover-assets` Phase B materialization |
| required decision or Asset disposition is open | owning `af-discover-assets` cycle; wait for explicit user input |
| Discover output exists but discovery review is pending/changes requested/stale | `af-discover-assets` |
| current discovery gate is approved and composition is absent/stale | `af-compose-solution` |
| Compose records `return_to_discover` for missing capability, contract delta, root-strategy reconsideration, Human Input, remote boundary, owner, or security evidence | start a new `af-discover-assets` cycle with trigger `return_to_discover` |
| composition review is pending/changes requested/stale | `af-compose-solution` |
| current composition is approved and scaffold is absent/stale | `af-scaffold-runtime` |
| source-generation or lowering defect belongs to scaffold logic | `af-scaffold-runtime` |
| runtime claim is absent/stale, or verification itself failed | `af-verify-runtime` |
| Verify exposes an Asset/requirement defect | `af-discover-assets` with an invalidation |
| Verify exposes a topology/root/runtime-contract defect | `af-compose-solution` with an invalidation |
| all current revision bindings are satisfied and verification passed | report complete at the recorded revisions |

`waiting_for_input`, `waiting_for_review`, `blocked`, and `failed` stay with the owning skill until the recorded condition changes. Route backward only from concrete failure ownership, not from convenience.

## Plan-to-materialization handoff

The Plan output must carry one machine-readable marker for one pending handoff with the same `work_id`, discovery revision, decision revision, Plan hash, and target `af-discover-assets.materialize`. The Work Item handoff record follows `schemas/af-work-item.schema.json`; the Bridge owns marker creation and exact first-prompt claim behavior.

On a fresh session:

1. require one unexpired pending handoff and an exact marker digest/field match;
2. reject a same-source-session claim, wrong cwd/work item, stale revisions, changed Plan hash, ambiguous pending records, or duplicate claim;
3. require the first-prompt Bridge receipt to show the new session and turn;
4. accept materialization only after the handoff is `claimed` with complete claim provenance and the session is bound to the same Work Item;
5. re-read current Plan, decisions, Work Item, and Registry revision before writing.

Bridge health alone is not continuity evidence. If automatic claim is unavailable or the marker is missing, use explicit session attachment with `work attach-session`; do not guess a session or claim that the Plan was transferred automatically.

## Invalidation and re-entry

When an input subject changes, append an invalidation from the discovering skill to the owning downstream skill, reset or stale affected state, and preserve the old cycle and files as history. A new Discovery materialization resets discovery review to `pending` and makes composition review, Scaffold, and Verify stale. A Graph/root/runtime-contract change leaves an undecided composition gate pending or makes its prior decision stale, then makes Scaffold and Verify stale.

Compose → Discover creates a new discovery cycle that supersedes, but does not delete, the previous cycle. After the new discovery revision is explicitly approved, Compose receives the new Asset versions/dispositions, decisions, root strategy, previous composition diff, and open conflicts. Never auto-merge the previous Graph.

## Handoff

Before invoking the selected skill, state:

- repository root, Work Item root, `ledger_revision`, and current Registry revision;
- selected skill, phase/run role, and evidence-owned reason;
- current revision inputs and satisfied gate;
- open decisions, invalidations, blockers, or handoff status;
- exact allowed write roots and checks required for the next gate.

## Stop conditions

Stop when identity or mode is ambiguous, Work Item validation fails, a required decision lacks explicit user selection, a gate binding differs from current revisions, a handoff cannot be uniquely and exactly claimed, actual files contradict state, a requested transition skips approval, or continuing would require an unsupported CLI command, legacy parser, compatibility projection, or router-owned Work Skill output.

## Router verification

Use only currently implemented commands:

```bash
node scripts/af.mjs work validate <work-id-or-path> [--root <path>]
node scripts/af.mjs work revision <ref=path>... --registry-revision <sha256|null> [--root <path>]
git status --short
git diff --check
```

`work revision` computes a revision object; it does not mutate the Work Item. Report routing checks as evidence for the selected route, not completion of that Work Skill.
