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

The implemented bridge integration tests now prove two distinct session IDs,
one Work Item, matching Plan hash and revisions, exact first-prompt claim,
Activity continuity, expiry, same-session/subagent rejection, and duplicate
prevention. The implementation still does not claim that the Codex UI copies
the marker automatically; marker carriage is an explicit user/session action.

## Architecture decision

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

## Phase 2 — Work Item v2 evidence

- Schema, TypeScript parser, blank template, root validator, and `scripts/af.mjs`
  accept only breaking `schema_version: 2`.
- `focus_skill`, concurrent `active_runs`, content-addressed revisions,
  discovery/composition cycles, required decisions, Asset dispositions, Root,
  exact gate bindings, invalidations, handoffs, and stale outcomes are explicit.
- Parser tests cover re-entry, stale gates, user provenance, revision ordering,
  duplicate IDs/claims, separate strategy/Root decisions, and Verify coherence.
- v1, `active_skill`, silent backfill, and linear-order compatibility are rejected.

## Phase 3 — fresh-session handoff evidence

- Bridge and facade create a pending handoff only from an observed active
  Plan-mode session and exact latest turn.
- The signed marker binds Work Item, handoff, discovery/decision revisions,
  Plan hash, target, and claim token; it is expiring and consume-once.
- Hook tests prove exact claim in a distinct session and reject missing,
  malformed, ambiguous, mismatched, same-session, subagent, expired, and
  duplicate claims.
- `/connections` and `scripts/af.mjs work attach-session` attach only an
  explicitly named active session.

## Phase 4 — Asset Registry foundation evidence

- `catalog/asset-registry.json` is the only canonical Asset store; migrated
  strict Target assets retain their removed YAML location only as historical
  `git:<commit>:<path>` seed provenance.
- `AssetRegistryService` owns strict contracts, hashes, exact versions,
  deterministic search, L0/L1/L2, usage, compare, draft/review/publish/deprecate,
  process locking, revision conflict, and atomic replacement.
- Published versions are immutable and published dependencies must resolve to
  exact published versions.
- Web API, root CLI, generator, and Mock Lab prefill all use the shared core.

## Phase 5 — Registry and lifecycle UI evidence

- `/assets` browses/searches Agent·Workflow·Tool, exposes compatibility facts,
  exact version detail/usage/compare, validates contracts, and performs guarded
  draft/review/publish/deprecate operations.
- Discover projects cycles, decisions, Asset matches/dispositions, strategy,
  Root, Registry revision, and Plan/materialization handoff.
- Compose projects readiness, Root/Asset decisions, Return-to-Discover, active
  invalidations, and preserves the guarded Graph editor.
- Connections projects capability, Work Item/role/cwd/last-seen, handoffs,
  deliveries, and explicit session attach.
- Fixed-port browser checks covered Discover, Compose, Connections, and narrow
  viewport overflow with zero console errors or warnings.

## Phase 6 — Work Skill evidence

- `af-discover-assets` requires actual Plan mode for Phase A, performs no tracked
  writes there, uses Repository/Handbook/Registry evidence before questions,
  leaves required decisions open, and materializes only in a fresh session.
- `af-compose-solution` consumes exact approved decisions/Assets/Root and owns a
  structured Return-to-Discover instead of deleting or auto-merging history.
- `af-workflow` routes by current evidence, revisions, gates, invalidations, and
  handoffs instead of fixed forward order.
- Scaffold and Verify enforce exact revisions/Assets and route failures by
  evidence ownership. Verify no longer creates a Catalog delta.
- All five skills pass the skill-creator validator and repository skill validator.

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

## Phase 8 — re-entry and invalidation evidence

- Graph saves create a new composition cycle/revision, supersede but preserve
  prior cycles, retain stale gate bindings, mark dependent Scaffold/Verify
  evidence stale, and append structured invalidations.
- New discovery revisions and Return-to-Discover records preserve prior
  discovery/composition history; Compose must compare revisions and does not
  automatically merge an old Graph.
- Work Item tests and web companion tests cover non-linear routing and Graph
  invalidation without a destructive reset to `not_started`.

## Phase 9 — legacy and documentation evidence

- YAML asset buckets, `/api/catalog`, the old Catalog adapter/query/parser/seed
  code, direct Catalog-delta write allowance, and YAML dependencies are removed.
- Rejection tests keep those paths absent; no compatibility parser or alias was
  added.
- Active contributor contracts, Operating Model, taxonomy locators, Companion,
  security/review/validation guides, design system, Mock Lab guide, root status,
  and source-backed Handbook now point at current source.

## Next proof gates

1. Run fresh-context, no-answer-leakage forward tests against all changed Work
   Skill routing/gates and close every subagent.
2. Run the bounded 128k-local-model scenario and record prompt/context size plus
   the L0/L1/L2 reduction evidence.
3. Rerun all root, Web, Mock Lab, skill, artifact, CLI, generator, and browser
   verification gates from the final tree.
4. Complete the legacy/source-locator audit and final Work Order report without
   pushing the branch.
