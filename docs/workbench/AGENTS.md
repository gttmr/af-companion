# Active Workbench Docs

## Scope

This directory owns current Target v2 concepts and the external-Codex-first operating contract. Current source remains final authority.

## Canonical owners

| Question | Document |
| --- | --- |
| Agent·Workflow·Tool classification | `taxonomy.md` |
| Graph nodes, edges, regions, bindings, invocation control | `graph-ir.md` |
| re-entrant Work Skills, decisions, reviews, Registry, artifact/source ownership, verification | `operating-model.md` |
| Hook bridge, workspace projection, VS Code handoff | `cli-companion.md` |
| discovery procedure | `analysis-guide.md` |
| Workflow necessity | `workflow-decision-guide.md` |
| review decisions | `review-board.md` |
| evidence levels and outcome | `validation.md` |

## Invariants

- `contract_version: "2.0"` only.
- Agent, Workflow, and Tool are the only asset types.
- Graph uses the canonical strict envelope; A2A is an Agent protocol boundary.
- Invocation Control is Workflow or Agent.
- `af-work-item.json` v2 is the revisioned, re-entrant four-skill lifecycle ledger.
- External Codex writes Work Item artifacts/source; web canonical writes are limited to guarded Graph IR and Asset Registry mutations.
- The app has no Stage Runner, `/api/af`, arbitrary artifact/source write, Work Item review mutation, or runtime execution.
- Asset Registry storage is `catalog/asset-registry.json`; Web and CLI share one strict Registry core and published versions are immutable.
- Unsupported input is rejected, not migrated or backfilled.

## Local rules

- Do not duplicate taxonomy or Graph enums in supporting docs.
- Keep Target Contract, Current Implementation, and Blocker claims distinct.
- Reopen every source locator before asserting current behavior.
- Historical reviews, migration notes, follow-ups, archive, and handoff material are not current authority.
- Interface/schema/review/UX decisions require a dated decision-log entry.
- Do not restore retired stage terms as current screen, route, API, or artifact names.

## Verification

For docs changes, run `git diff --check`, validate relative links, and confirm source locators. Contract-sensitive changes also run the relevant schema/validator/build tests.
