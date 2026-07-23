---
name: af-workflow
description: >-
  Routes an Agent Factory request to the correct external-Codex Work Skill by inspecting the repository, af-work-item.json, review gates, outputs, and current evidence. Use when starting, resuming, or asking what comes next; use a specific Work Skill directly when the phase is already clear.
---

# AF Workflow

## Purpose

Inspect the current repository and Work Item, then select exactly one of the four canonical Work Skills:

```text
af-discover-assets
  -> af-compose-solution
  -> af-scaffold-runtime
  -> af-verify-runtime
```

This router is read-only. It does not create artifacts, edit Graph IR, change review gates, generate source, or run verification on behalf of a Work Skill.

## Trigger

Use when the user asks to start, resume, or orient an Agent Factory lifecycle, including:

- “Agent Factory로 Agent를 만들고 싶다.”
- “어디까지 했고 다음 단계는?”
- “중단한 작업을 이어서 진행해줘.”
- “요구부터 검증까지 진행해줘.”

Use the matching Work Skill directly for an explicit discovery, composition, scaffold, or verification request.

## Required reading

1. [Source of Truth](../_shared/source-of-truth.md)
2. [Lifecycle Invariants](../_shared/lifecycle-invariants.md)
3. [Work Item and External Codex](../_shared/work-item-and-external-codex.md)
4. [Missing Information](../_shared/missing-information.md), when a gate is open

Read the selected Work Skill in full before executing it.

## Inputs

- user goal and current repository root;
- explicit Work Item ID/root, if supplied;
- `af-work-item.json` and canonical artifacts, if present;
- current Git revision and dirty state;
- active external Codex session context;
- open review gates, blockers, and verification outcome.

Do not choose the newest Work Item by guesswork. If no Work Item exists and the user supplied a clear ID, route to Discover so that skill can create it. If identity is materially ambiguous, ask for the Work Item.

## Routing procedure

1. Confirm the canonical repository root.
2. Locate and parse the explicit `<artifact-root>/af-work-item.json`, if it exists.
3. Reconcile manifest refs with actual files and current Git state. Report drift; do not repair it here.
4. Check gates and blockers in lifecycle order.
5. Select the earliest skill whose required outcome is absent, stale, or explicitly requested.

Use these rules:

| Observed state | Route |
| --- | --- |
| no valid discovery output | `af-discover-assets` |
| Discover waiting for review | remain at `af-discover-assets`; request an explicit review decision |
| discovery approved, composition absent/stale | `af-compose-solution` |
| Compose waiting for review | remain at `af-compose-solution`; request an explicit review decision |
| composition approved, source absent/stale | `af-scaffold-runtime` |
| scaffold complete, claims unverified/stale | `af-verify-runtime` |
| Verify failed | `af-verify-runtime` for diagnosis/retest; route backward only when evidence identifies an upstream defect |
| all four current and Verify passed | report lifecycle complete at the recorded revision |

`changes_requested` routes back to the skill owning that gate. `waiting_for_input`, `blocked`, or `failed` stays with the owning skill until its concrete condition changes.

## Continuity

External Codex owns execution. The workbench only projects Hook activity, artifacts, and Git changes. Bridge health alone does not prove that the current prompt reached the intended session; use current session/turn receipts and Work Item state when continuity matters.

If the web Graph editor changed Graph IR, route to Compose even if Scaffold or Verify had previously completed. The Graph write invalidates composition approval and downstream evidence.

## Handoff

Before invoking the selected skill, state:

- repository and Work Item root;
- selected skill and why;
- satisfied predecessor gate;
- open blocker or review decision;
- exact expected write roots;
- checks required before the next transition.

Then load and follow the selected skill. Do not blend two Work Skills into an unreviewed transition.

## Stop conditions

Stop when repository or Work Item identity is ambiguous, manifest parsing fails, recorded review provenance is incomplete, actual files contradict lifecycle state, the requested transition skips a gate, or continuing would require writing artifacts from this router.

## Router verification

Read-only checks may include:

```bash
test -f <artifact-root>/af-work-item.json
node scripts/validate-artifacts.mjs <artifact-root>
git status --short
```

Report these as routing evidence, not as completion of the selected Work Skill.
