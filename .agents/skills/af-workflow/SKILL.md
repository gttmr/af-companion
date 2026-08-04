---
name: af-workflow
description: >-
  Routes an Agent Factory Work Item re-entrantly from current revisions, review gates, invalidations, active runs, and session handoffs. Use when starting, resuming, returning between Discover and Compose, claiming Plan materialization, or deciding which Work Skill owns a failure.
---

# AF Workflow

## Purpose

Bind one explicit application, workspace, repository, Work Item, and currently enrolled Companion session, then select exactly one of the four canonical Work Skills:

```text
af-discover-assets
af-compose-solution
af-scaffold-runtime
af-verify-runtime
```

The normal forward path is Discover → Compose → Scaffold → Verify, but this router is re-entrant. It routes from current evidence and revision ownership; it never assumes that the next action is the next item in a fixed sequence.

The router may inspect state, establish the supported session binding, and record the selected focus/run context. It does not perform a Work Skill's discovery, composition, scaffolding, verification, review decision, or Asset Registry mutation on that skill's behalf.

## Agent Factory scope gate

Activate this router only when the user explicitly invokes Agent Factory work or identifies an Agent Factory Work Item, Target artifact, Graph IR, Asset Registry operation, review gate, or lifecycle continuation. The current repository, presence of `.agents/skills`, or simultaneous visibility of `google-agents-cli-*` and `af-*` skills is not scope evidence.

An ordinary request to design, scaffold, code, test, evaluate, deploy, publish, or observe an ADK project belongs to the standalone `google-agents-cli-*` skill set and requires no Companion enrollment. Do not initialize a Work Item, ask for Agent Factory identity, or impose the lifecycle gates below. When an explicit Agent Factory Work Item does exist, reuse the standalone skills' ADK implementation guidance while treating approved Agent Factory artifacts as the specification/scaffold authority; this tree adds the Agent Factory plus Companion overlay without a duplicate lifecycle.

## Required reading

1. [Source of Truth](../_shared/source-of-truth.md)
2. [Lifecycle Invariants](../_shared/lifecycle-invariants.md)
3. [Work Item and External Codex](../_shared/work-item-and-external-codex.md)
4. [Companion Session Participation](../_shared/companion-session-participation.md)
5. [Decision Input Adapter](../_shared/decision-input-adapter.md)
6. [Fresh-context Handoff](../_shared/fresh-context-handoff.md)
7. [Session and Work Item Provenance](../_shared/session-and-work-item-provenance.md)
8. [Missing Information](../_shared/missing-information.md), when a decision or contract is open

Read the selected Work Skill in full before executing it.

## Identity and mode gate

1. Confirm the canonical repository root plus exact `workspace_id`, `application_id`, and `work_id`; never choose the newest directory, sole pending candidate, default target, or first active session.
2. Require current `companion_active` participation, active status, an unexpired matching lease, canonical cwd digest, and exact application/workspace/work/role attachment. An ordinary session may inspect and report, but it cannot become a lifecycle actor or create durable evidence.
3. Validate `<artifact-root>/af-work-item.json` against the current schema and reconcile its refs with current files, Registry revision, Git state, Companion scope, and Bridge receipts.
4. When a new explicit materialization enrollment is needed, name the exact application/Work Item/role and confirm the resulting Companion state. The implemented safe fallback is:

   ```bash
   node scripts/af.mjs companion join --application <application-id> --work <work-id> --role materialization [--root <path>]
   ```

   The launch request is not activation or attachment proof. Re-read the exact session/application/workspace/work/role and current lease before proceeding. There is no current `work attach-session` CLI.
5. Use `focus_skill` for the user's current Work Skill surface. Add `active_runs` only for enrolled lifecycle actors and preserve unrelated runs.
6. Before Discover Phase A, verify `role: plan`. If it cannot be confirmed, make no repository or Work Item write, explain the required enrollment, and stop.
7. Discover Phase B, Compose, Scaffold, and Verify durable work require `role: materialization` in the exact scope.

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
- open and resolved decision refs plus the displayed recommendation revision;
- actual canonical files, Asset Registry snapshot, Companion participation/lease/scope, Bridge session/turn receipts, and Git state.

Artifact presence is not approval. `complete` is not current when its input/output revision no longer matches the current subjects. A stale gate or downstream state cannot authorize a transition.

## Routing rules

| Current evidence | Route |
| --- | --- |
| initial requirement or invalidated Asset/decision evidence needs exploration | `af-discover-assets` Phase A |
| approved Plan must be written, or a valid fresh-session re-entrant Handoff or pristine Bootstrap Grant was claimed | `af-discover-assets` Phase B materialization |
| required decision or Asset disposition is open | owning skill; use the Decision Input Adapter for one question, then stop `waiting_for_input` |
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

The canonical Plan body excludes every Companion capsule and marker. After all decisions are resolved, use `companion prepare-materialization`. When real discovery/decision revisions exist, it prepares a re-entrant Handoff in ignored Bridge state, bound to the exact source Work Item ETag, application/workspace/work, source session/latest turn, revisions, Plan hash, target, expiry, and separate marker digest. It does not write a pending Work Item record in Plan mode.

When the Work Item is instead the exact strict default ledger, the same command returns one Materialization Bootstrap Grant. It binds the pristine ETag, scope, hash, target, expiry, and one-time claim without writing the ledger or inventing revisions. It may survive Bridge restart while the preserved source record remains exact and non-revoked; the old source lease need not remain current across restart. An unclaimed re-entrant Handoff does not survive Bridge restart and requires its source Plan lease/session to remain current until claim.

The trusted VS Code Plan Task starts Codex with `workspace-write` plus
per-session `on-request` approval while leaving sandbox network disabled. When
the exact materialization-preparation command must reach the loopback Bridge, request
approval for only that command. Do not enable global or persistent network,
change the global approval policy, use `danger-full-access`, or treat command
approval as lifecycle authority. If the session exposes no approval request
capability, stop and relaunch a fresh trusted Plan Task; the next attempt must
use its new current-prompt session and turn receipt.

Keep four observations separate: host Bridge listener health, Web projection,
Hook reachability, and agent-shell command reachability. A sandboxed
`bridge_unavailable` response proves none of the other three are absent. Do not
recover session, turn, lease, or scope from private Bridge state or historical
transcripts to work around the failure.

On a fresh session:

1. require current Companion enrollment with exact materialization scope;
2. require one explicitly identified unexpired Handoff or Grant and exact marker/Capsule, scope, target, expiry, and Plan-body-hash matches; require unchanged source ETag/current revisions/latest turn for a Handoff or unchanged pristine ETag/source latest turn for a Grant;
3. reject a same-source-session claim, wrong application/workspace/cwd/Work Item, stale revision/ETag/turn, changed Plan hash, ambiguous candidates, or duplicate claim;
4. require the first-prompt Bridge receipt to show the new session and turn;
5. accept materialization only after the Handoff or Grant is `claimed` with complete claim provenance and exact attachment;
6. re-read current Plan, open/resolved decisions, recommendation revision, Work Item, and Registry revision before writing.

For a re-entrant Handoff, use Companion Continue, then Copy Capsule, then exact confirmed attach. Continue a Bootstrap Grant only by exact Grant ID. Bridge health or attachment intent alone is not continuity evidence, and no fallback may auto-claim one candidate or first session. Re-entrant Phase B writes one claimed record with the Handoff's source revisions and complete claim provenance. Bootstrap Phase B writes actual revisions plus one exact claimed record and then requires automatic Grant `finalized` state; it never calls a finalize endpoint.

## Invalidation and re-entry

When an input subject changes, append an invalidation from the discovering skill to the owning downstream skill, reset or stale affected state, and preserve the old cycle and files as history. A new Discovery materialization resets discovery review to `pending` and makes composition review, Scaffold, and Verify stale. A Graph/root/runtime-contract change leaves an undecided composition gate pending or makes its prior decision stale, then makes Scaffold and Verify stale.

Compose → Discover creates a new discovery cycle that supersedes, but does not delete, the previous cycle. After the new discovery revision is explicitly approved, Compose receives the new Asset versions/dispositions, decisions, root strategy, previous composition diff, and open conflicts. Never auto-merge the previous Graph.

Return-to-Discover preserves the exact application/workspace/work scope, artifact root, open and resolved decision refs, and recommendation revision. The next Plan and materialization actors must separately satisfy their role and attachment gates.

## Handoff

Before invoking the selected skill, state:

- application/workspace/work scope, repository root, Work Item root, `ledger_revision`, and current Registry revision;
- Companion participation, role, lease freshness, session/turn, and canonical cwd evidence;
- selected skill, phase/run role, and evidence-owned reason;
- current revision inputs and satisfied gate;
- open decisions, invalidations, blockers, or handoff status;
- exact allowed write roots and checks required for the next gate.

## Stop conditions

Stop when participation, lease, application/workspace/work/role attachment, or identity is ambiguous; Work Item validation fails; a required decision lacks explicit user selection; a gate binding differs from current revisions; a Handoff or Bootstrap Grant cannot be explicitly and exactly claimed; a Handoff's source ETag/revisions/turn drift; a Grant's pristine ETag/source turn drifts or it is requested for a non-pristine ledger; actual files contradict state; a requested transition skips approval; or continuing would require an unsupported CLI command, legacy parser, compatibility projection, or router-owned Work Skill output.

## Router verification

Use only currently implemented commands:

```bash
node scripts/af.mjs work validate <work-id-or-path> [--root <path>]
node scripts/af.mjs work revision <ref=path>... --registry-revision <sha256|null> [--root <path>]
git status --short
git diff --check
```

`work revision` computes a revision object; it does not mutate the Work Item. Report routing checks as evidence for the selected route, not completion of that Work Skill.
