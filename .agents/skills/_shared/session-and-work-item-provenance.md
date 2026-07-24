# Session and Work Item Provenance

## Purpose

Keep every lifecycle mutation and evidence claim attributable to one current Companion participant, application, workspace, Work Item, role, session, turn, and revision set.

## Exact scope tuple

Use this scope tuple before any lifecycle action:

```text
workspace_id
application_id
work_id
role: plan | materialization
canonical cwd and cwd digest
```

The Work Item root and repository path must belong to that exact application/workspace/work attachment. Similar names, cwd ancestry, one active item, or a previous turn are not substitutes.

## Operation provenance

For each durable write, user decision, review, handoff, Scaffold action, or Verify evidence record, preserve:

- operation and owning Work Skill;
- Companion participation and activation origin;
- lease ID and observed expiry, never the lease token;
- exact scope tuple;
- session ID and turn ID;
- decision-input mode when a question was involved;
- input and output revisions plus Registry revision as applicable;
- timestamp, artifact/evidence refs, and allowed write roots.

Companion-local state owns enrollment, lease, application/workspace scope, and delivery receipts. `af-work-item.json` owns its schema-supported lifecycle refs, runs, decisions, revisions, and handoffs. Correlate both sources; do not invent Work Item fields to mirror local interaction state.

## Durable-write gate

Durable lifecycle writes require `role: materialization`, except that an explicitly supported current contract may durably record Plan/handoff interaction state outside the non-mutating Discover Phase A boundary. The four Work Skills must never attribute durable output to an ordinary session.

Scaffold always requires exact materialization scope before it changes source or Work Item state. Verify requires the same scope before it records evidence or outcome. Read-only inspection from an ordinary session remains ordinary observation and is not imported automatically.

## Return-to-Discover

Return-to-Discover preserves `workspace_id`, `application_id`, `work_id`, artifact root, source revisions, open and resolved decision refs, and the recommendation revision that was shown. It changes the owning lifecycle surface, not the Work Item identity.

Compose records the return evidence without inventing a Discover actor. A later Plan participant must enroll and attach to the same exact scope. A later materializer must receive an exact fresh-context handoff or confirmed attachment before writing. Never auto-merge the prior Graph or reinterpret prior decision shorthand.

## Compaction and fresh sessions

After compaction, confirm the same live lease and scope, then re-read the Work Item and referenced decision/handoff evidence. After a fresh session, require a valid claim or exact confirmed attachment. In either case preserve:

- open decision IDs and their current revisions;
- resolved decision IDs, selected options, and user session/turn provenance;
- displayed recommendation plus recommendation revision;
- current review bindings, invalidations, and Return-to-Discover refs.

Summary text alone is not provenance.

## Verification evidence

Verify records the exact scope and operation provenance with every claim. Evidence produced by an ordinary, stale, revoked, expired, wrong-role, or scope-mismatched session is not auto-imported into `validation-report.md` or Work Item evidence. It may be cited as an external observation only when explicitly identified as unverified and then reproduced by an eligible participant for a passing claim.

## Stop conditions

Stop when application/workspace/work attachment, role, session/turn, lease, revisions, or write roots are missing or inconsistent; when only summary prose survives; or when evidence would be attributed to an ordinary session.

## Sources checked

- `packages/web/src/companion/sessionContract.ts`
- `schemas/af-work-item.schema.json`
- `packages/web/src/analyzer/afWorkItem.ts`

## Checked date

- Checked date: 2026-07-24
- Contract note: interaction-state provenance and Work Item provenance must correlate without changing either parent-owned schema.
