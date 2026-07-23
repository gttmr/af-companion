# Plan Discovery and Asset Registry Migration Status

Checked 2026-07-24 against the independent `gttmr/af-companion` checkout at
`38baf2706f97ac4e66125ccb838b7f219af439e0`.

This document is implementation evidence, not authority over the active
Workbench contracts. The owning documents remain `docs/workbench/*`, and each
section below must distinguish a verified current behavior from the approved
target.

## Scope resolution

The work order names an older `gttmr/Agent-Factory` snapshot. The requested
working directory and current repository policy identify this independent
`af-companion` repository as the implementation target. No changes are being
replayed into the older checkout.

The isolated implementation branch is
`agent/plan-discovery-asset-registry`, created from the fetched
`origin/main` commit above. The previous Companion cutover was audited over
`130d1b7..38baf27` before new source changes.

## Phase 0 — salvage audit

| Disposition | Current implementation | Reason |
| --- | --- | --- |
| Keep | Agent, Workflow, and Tool taxonomy; strict Graph IR; retired-shape rejection | These already match the target invariants and must not gain compatibility paths. |
| Keep | Worktree observer, Git/file/evidence projection, SSE, and work-ID routes | They provide the required external-Codex-first projection boundary. |
| Keep and refine | Hook adapter, exact-session delivery, prompt receipts, metadata-only persistence | The transport and safety boundary are sound; Work Item, role, handoff, and claim identity are missing. |
| Replace | `af-work-item.json` v1 and its linear lifecycle assertion | `active_skill`, flat stage state, and two unbound gates cannot express re-entry, concurrent runs, revisions, decisions, or handoffs. |
| Replace | Read-only Catalog API and `/assets` screen | The target requires one versioned Registry service shared by Web and CLI with guarded canonical writes. |
| Refine | Catalog parsing and version helpers | Strict parsing and deterministic version selection are reusable, but the current model lacks full contracts, search evidence, lifecycle state, and immutable publication. |
| Refine | Guarded Graph write | Preserve ETag, validation, same-origin loopback, and explicit session targeting; replace destructive downstream reset with revision-bound staleness. |
| Refine | Selection Bundle and generator | Extend the existing bounded transport and deterministic lowerer with Asset/decision/handoff context, explicit root executable, and pinned Asset versions. |
| Replace | Linear Work Skill routing and immediate Discover writes | Discovery must separate Plan conversation from materialization and permit Compose-to-Discover re-entry. |
| Remove | Active documentation and tests that require linear lifecycle, Graph-only app writes, or a permanently read-only Catalog | Historical decision records remain; superseded current-contract assertions do not. |

The baseline before implementation passed:

```text
node scripts/validate-skills.mjs
node scripts/validate-artifacts.mjs
cd packages/web && npm run test:contracts
cd packages/web && npm run test:companion
cd packages/web && npm run build
```

The contract tests use the verified repository ADK environment
(`google-adk 2.3.0`).

## Assumptions that the new design supersedes

- Lifecycle is not a strict one-way four-step pipeline.
- `focus_skill` is UI/routing focus, while `active_runs` records concurrent
  execution; one field does not stand in for both.
- A review gate is valid only for its exact revision inputs.
- Graph changes preserve history and make dependent results stale instead of
  erasing them back to `not_started`.
- Web canonical writes remain limited to Graph IR and Asset Registry. External
  Codex Work Skills continue to own Work Item and source materialization.
- Asset Registry is not a fourth asset category. It stores only Agent,
  Workflow, and Tool assets.
- Solution control strategy and root executable are separate decisions; a
  `hybrid` strategy is never inferred merely from graph shape.

## Phase 1 — installed Codex capability spike

Installed surface:

```text
binary: /home/ilmaswsl/.nvm/versions/node/v24.13.0/bin/codex
version: codex-cli 0.145.0
hooks: stable, enabled
multi_agent: stable, enabled
default_mode_request_user_input: under development, disabled
```

The probe used the installed CLI help/features output, generated experimental
App Server protocol schemas, the official Codex manual snapshot, and the
repository Hook protocol adapter. It did not mutate the repository.

| Capability | Verified result | Product consequence |
| --- | --- | --- |
| Plan mode | TUI `/plan` and `plan` collaboration mode exist. Hook input preserves `permission_mode: "plan"`. | Discover Phase A can require observable Plan mode. |
| `request_user_input` | The App Server protocol exposes the request experimentally; `codex exec` does not support it and the default-mode feature is disabled. | Use it when the active surface provides it, but do not make lifecycle correctness depend on it. |
| Planning subagent | Multi-agent lifecycle is enabled and exposes spawn, wait, and close operations. | A bounded planning helper is permitted, with mandatory close tracking. |
| Plan completion | Generic plan-step and turn completion events exist; no dedicated Plan-to-new-thread handoff event exists. | Do not infer a handoff solely from turn completion. |
| Fresh context | `/new` or `thread/start` creates a new context; `/fork` preserves history. | A materialization session must be a distinct session, not a fork advertised as fresh. |
| Hook payload | `SessionStart` exposes the session/source; `UserPromptSubmit` exposes session, turn, prompt, and permission mode. | The first prompt can claim an explicit pending handoff. |
| Marker propagation | Unknown top-level Hook fields are removed. A marker survives in the prompt or returned `additionalContext`; no automatic Plan marker transfer is documented. | Marker carriage must be explicit and machine-readable. |
| Current bridge | Exact-session, next-prompt, consume-once delivery and prompt recovery exist. | Reuse the bridge transport; add Work Item/handoff claim semantics. |

### Feasibility decision

The current Codex version does **not** provide a verified automatic operation
that completes Plan mode, starts a fresh context, and carries arbitrary Plan
metadata into that context. The supported Companion contract is therefore:

1. The Plan result emits a short marker containing `work_id`, `handoff_id`,
   discovery revision, and target materializer.
2. A pending handoff is persisted before leaving the Plan session without
   treating an untracked Session ID as the Work Item identity.
3. The first prompt in a fresh session includes that marker. The
   `UserPromptSubmit` Hook claims only the exact pending handoff for the exact
   workspace and marker digest.
4. Claim changes the session role from Plan to materialization, records the new
   session/turn, and rejects expired or duplicate claims.
5. Missing or ambiguous markers never select the first active session. Web and
   CLI expose an explicit attach fallback.

This path remains **partially verified** until the bridge implementation proves
two distinct session IDs, one Work Item, matching plan hash, Activity
continuity, and duplicate-claim rejection. The spike deliberately does not
claim that the current Codex UI performs the marker copy automatically.

## Architecture decision draft

- Primary identity is `work_id`; sessions are attached actors.
- `af-work-item.json` is a breaking v2 contract. No v1 reader or migration shim
  will be added.
- Discovery and composition are revisioned cycles with append-preserved history.
- Decisions, Asset dispositions, root executable, review gates, invalidation,
  verification, and session handoffs are explicit records.
- Asset Registry uses deterministic hard filters and structural compatibility
  before optional model ranking. Compact L0/L1/L2 disclosure is a product
  contract for 128k local-model operation.
- Web and CLI call one Registry service. Draft writes use ETags and atomic
  replacement; published versions are immutable.
- The five canonical Work Skill IDs remain, but their routing and procedures
  become re-entrant and revision-aware.

## Phase 7 — Scaffold alignment evidence

Current generator behavior now validates and preserves both decision axes.

- `single_agent`, `agent_delegation`, `explicit_workflow`, and `hybrid` are
  checked against the selected Agent/Workflow Root and Graph ownership.
- Generated `root_agent` is object-identical to the selected Root Executable;
  Agent-root delegation uses a local coordinator with reviewed task sub-agents.
- Every included Asset requires one resolved user disposition and exact version.
  Registry-backed decisions are checked against the current Registry revision
  and contract; project drafts remain distinct project-local bindings.
- Decision, Asset Decision, and Root Executable payload hashes are recomputed
  from the current Work Item before lowering, so post-review edits fail closed.
- Local `reuse_exact` records load one reviewed `python:module#symbol` object;
  source-less published contracts fail instead of becoming a new generated
  Agent. MCP and A2A reuse continues through their reviewed bindings.
- `reuse_new_version` and publish candidates accept only mutable Registry
  versions, while `compose_existing` preserves exact component refs.
- `compose_existing` lowers only as the selected project Workflow Root and
  requires every exact component as an included `reuse_exact` binding. Both
  explicit Graph Tool nodes and Agent-owned Python Tools import the reviewed
  callable instead of disappearing or becoming a generated stub.
- Duplicate Registry version bindings, stale Registry revisions, missing
  decisions, and Root/Asset version drift fail before source generation.
- The current 51-test executable matrix covers all four strategies, both Root types,
  both Hybrid Root choices, smoke/runnable output, generated contract tests,
  and the installed `google-adk 2.3.0` runtime types.

## Next proof gates

1. Land the strict Work Item v2 schema, parser, validator, template, and CLI
   helper tests.
2. Implement handoff marker creation, exact claim, manual attach, expiry, and
   duplicate prevention; run the two-session integration probe.
3. Implement the Registry service before rewriting Discover.
4. Update each active owning document and Handbook locator in the same commit
   slice as its source contract.
