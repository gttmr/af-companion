# Agent Factory Operating Model

Agent Factory work executes in an external Codex CLI or VS Code session. The web product is a live companion: it projects repository state and exposes only two bounded canonical write surfaces, Graph IR and the Asset Registry. It does not run lifecycle stages, generate source, or execute runtime verification.

## 1. Re-entrant lifecycle

```text
Discover Phase A in Plan mode (conversation only)
  -> explicit user decisions
  -> fresh-session Discover materialization
  -> discovery review
  -> Compose
       <-> Return-to-Discover when Asset evidence is insufficient
  -> composition review
  -> Scaffold
  -> Verify
       -> Discover, Compose, or Scaffold according to failure ownership
```

`af-workflow` inspects current revisions, gates, invalidations, cycles, handoffs, and evidence before routing. It does not simply select the next item in a fixed sequence and does not write artifacts.

| Work Skill | Responsibility | Current gate | Durable output |
| --- | --- | --- | --- |
| `af-discover-assets` | Plan conversation, evidence, Registry search, user decisions, normalized requirement, Agent·Workflow·Tool candidates | explicit requirement; Plan mode for Phase A | decision plan, analysis aggregate/splits, discovery cycle/revision |
| `af-compose-solution` | control strategy, Root Executable, Graph IR, Asset dispositions, bindings, runtime contracts, readiness | current approved discovery revision | composition cycle/revision, Graph/contracts, boundary design, scaffold plan |
| `af-scaffold-runtime` | exact approved composition and Asset versions to ADK source or Runtime Handoff | current approved composition revision | source roots, manifest, implementation handoff |
| `af-verify-runtime` | current artifact/code/runtime/behavior proof | claim-matched current scaffold evidence | validation report, evidence, outcome |

Raw requirement to code is forbidden. A Work Skill may stop at `waiting_for_input`, `waiting_for_review`, `blocked`, or `failed`. Earlier cycle artifacts remain history; a new revision supersedes them instead of deleting them.

## 2. Discover Plan and materialization

Discover has two distinct execution phases.

1. Phase A runs in actual Codex Plan mode. It may inspect the repository, Handbook, and bounded Registry results, use a bounded planning subagent, and ask the user questions. It must not write tracked repository artifacts.
2. Required decisions remain open until the user selects an option. A recommendation is evidence, not consent; the model never fills `selected_by: "user"` by itself.
3. The final Phase A output is a Discovery Decision Plan and an explicit handoff marker, not source code or a final Graph.
4. Phase B runs in a distinct explicitly enrolled session, claims the exact handoff Capsule, reopens current source, verifies revisions and decisions, and materializes Work Item v2 artifacts. When built-in fresh-context transport is unavailable or unverified, Companion Continue is the supported transport.

Repository and Registry evidence must be checked before asking the user a question they can answer. Solution Control Strategy (`single_agent`, `agent_delegation`, `explicit_workflow`, or `hybrid`) and Root Executable (exact Agent or Workflow Asset/version) are separate decisions. `hybrid` is never a default inferred from Graph shape.

## 3. Work Item v2 ledger

Every lifecycle has one explicit root:

```text
artifacts/af/<work-id>/
```

`af-work-item.json` with `schema_version: 2` is the lifecycle source of truth. It stores:

- primary `work_id`, monotonically increasing `ledger_revision`, and UI/routing `focus_skill`;
- zero or more `active_runs`, including session and role, rather than overloading focus as execution state;
- four Work Skill states with input/output revisions, output refs/roots, blockers, and timestamps;
- content-addressed revisions for requirement, decisions, Asset decisions, discovery, Registry snapshot, Graph, Root Executable, runtime contracts, composition, scaffold, and verification;
- append-preserved discovery/composition cycles and structured Return-to-Discover records;
- required user decisions and per-Asset dispositions;
- Solution Control Strategy and exact Root Executable;
- revision-bound review gates, invalidations, verification evidence, and session handoffs.

Allowed skill statuses are `not_started`, `active`, `waiting_for_input`, `waiting_for_review`, `complete`, `blocked`, `failed`, and `stale`. A revision includes sorted repository-relative subjects, each SHA-256, and the exact Registry revision when applicable. Missing fields, v1 manifests, ambiguous refs, and digest drift are rejected rather than migrated or backfilled.

## 4. Decisions and review gates

Required decision records expose stable decision/option IDs, evidence, and an optional revisioned recommendation. Resolution requires a selected option/disposition, `selected_by: "user"`, a reason, and current session/turn provenance. Work Skills select structured input only when `request_user_input` is exposed in the current turn; otherwise they ask one conversational question, set `waiting_for_input`, and stop. Both adapters normalize to the same decision contract.

“추천대로 진행” is an explicit user selection only when it unambiguously refers to the currently displayed option set and recommendation revision. An ambiguous answer causes one clarification and no write. A recommendation, prior answer, default, or validator result never satisfies a hard gate.

Review is also a human decision, not validator output or skill self-approval.

- Discovery approval binds exact requirement, decision, Asset decision, discovery, and Registry snapshot revisions plus the artifact ETag.
- Composition approval binds exact discovery, Graph, Root Executable, runtime contract, and composition revisions plus the artifact ETag.

When an input changes, the prior binding is retained but marked `stale`; affected downstream skill/evidence records are also stale. Validators, file presence, Graph save, bridge health, or successful generation never create approval.

## 5. Asset Registry

`catalog/asset-registry.json` is the one canonical Registry document. `packages/agent-factory-core/src/assetRegistry.ts` owns strict parsing, contract hashes, deterministic search, lifecycle transitions, locking, revision comparison, and atomic replacement. The web API and `scripts/af.mjs asset ...` use this same service.

Registry invariants:

- Agent, Workflow, and Tool are the only asset types. A2A is an Agent binding/exposure.
- Records are addressed by exact `asset_id@version`; statuses are `draft`, `reviewed`, `published`, and `deprecated`.
- Search applies deterministic type/I/O/side-effect/domain/owner/binding/runtime filters and returns compatibility facts, rejection reasons, match grade, and a bounded result set.
- Progressive disclosure uses L0 identity/summary cards, L1 operational contracts/usage, and L2 full contract/lifecycle details. A model does not receive or rank the full Registry.
- Draft create/update requires the expected Registry revision. Review, publish, and deprecate require explicit decision records; publish also requires owner/domain/reuse confirmation.
- Published contract bytes are immutable. A changed contract becomes a new draft version. Published dependencies must point to exact published versions.
- Web and CLI never bypass the service with direct JSON edits. Revision conflicts require re-read and renewed user review, not blind retry.

Registry search does not select a reuse outcome. Each required Asset receives exactly one user disposition such as `reuse_exact`, `reuse_new_version`, `compose_existing`, `create_project_draft`, `create_publish_candidate`, `defer`, or `exclude`.

## 6. Write ownership

| Content | Writer |
| --- | --- |
| requirement, candidates, contracts, summaries, Work Item state, source, handoff, reports | matching external-Codex Work Skill |
| Work Item review decision | external Codex session after explicit reviewer decision |
| Graph IR | Compose skill or guarded web Graph editor |
| Asset Registry | shared service through guarded Web/CLI after explicit decision and revision check |
| activity/Git/file projection and enrolled Companion state | bounded workbench metadata stores |

The app does not expose arbitrary artifact PUT, source edit, stage/commit, Work Item approval mutation, runtime execution, or model-owned publication.

## 7. Graph collaboration and re-entry

`PUT /api/work-items/:workId/graph` requires loopback, same origin, current `If-Match`, approved discovery, strict Target v2 Graph validation, and one explicitly selected active Companion session whose current lease and workspace/application/Work Item/role scope allow the delivery.

The server synchronizes `analysis-result.json.graph` and `graph-ir.json`, creates a new composition cycle/revision, preserves superseded cycles, marks affected composition/Scaffold/Verify evidence stale, records invalidations, and queues compact `graph_change` context to the exact session. A delivery failure is surfaced separately and does not roll back an already committed Graph save.

Compose creates a structured Return-to-Discover when an Asset capability or contract is missing. A new Discover cycle searches the current Registry and gathers new decisions. After approval, Compose receives the new discovery revision and previous composition diff; it does not auto-merge or silently reuse the old Graph.

## 8. Companion participation and fresh-session handoff

Workspace eligibility, Session participation, and Work attachment are independent. A matching `cwd`, Bridge health response, Hook invocation, or editor launch never enrolls a session. A one-time ticket activates one exact session and issues a per-session lease bound to the canonical workspace, application, Work Item, role, and current Bridge instance. Revoked, expired, stale, cross-scope, and pre-restart leases fail closed. Ordinary unmanaged Hook events produce no Agent Factory network or durable Bridge state.

The local bridge can create a pending Plan handoff only from a current leased Plan session and its exact latest turn. It returns one signed Capsule containing the exact workspace/application/Work Item scope, handoff, discovery and decision revisions, canonical Plan body hash, target, expiry, and consume-once claim. Capsule bytes are transport metadata and are excluded from the Plan body hash.

The first eligible prompt in one distinct fresh enrolled session claims only that exact Capsule. Claim rejects the source session and wrong-scope, duplicate, expired, superseded, ambiguous, or subagent events. The Bridge never selects a first active session or infers a claim from one pending candidate.

Automatic client transport is not assumed. `/connections` and `node scripts/af.mjs companion continue --handoff <id>` are the supported fallback and return a copyable Capsule/launch command. If the client strips the Capsule, the handoff remains waiting; it is not silently attached.

## 9. Scaffold and Runtime Handoff

Scaffold consumes current approved revisions, resolved required decisions, an explicit Root Executable, an approved scaffold plan with `raw_requirement_to_code=false`, and explicit output roots.

- `smoke` creates importable review structure and explicit TODO seams.
- `runnable` adds only reviewed synthetic/local behavior for agreed scenarios.

The generator recomputes decision, Asset decision, and Root revision hashes; resolves exact Registry versions at the bound Registry revision; rejects duplicate/version/staleness drift; and preserves project-only Assets separately. Local exact reuse requires one reviewed `python:module#symbol` source reference and imports that object/callable instead of regenerating it. MCP and Remote A2A reuse follows reviewed bindings.

Solution strategy and Root type must agree with Graph ownership. With installed `google-adk 2.3.0`, a Workflow Root is a `google.adk.workflow.Workflow`; an Agent Root is the selected `BaseAgent` object, and generated `root_agent` points to that exact object. Scaffold never changes the strategy or Root to make generation pass.

Neither output mode implies production integration or deployment. Private endpoints, credentials, real customer data, deploy scripts, and organization-specific production logic remain forbidden.

## 10. Verification and rollback ownership

Verification maps each claim to fresh evidence at five levels: skill structure, artifact contract, code correctness, runtime integration, and behavior evaluation. Reports record revision, environment, exact command/cwd, scenario/input, exit code, observed output, failure/skip cause, and residual uncertainty.

Outcomes are `passed`, `failed`, `unverified`, or `stale`. Verify can be complete only with `passed`. A structure/Asset failure routes to Discover, Graph/control/contract failure to Compose, generation failure to Scaffold, and behavior-quality failure to the evidence-owning Discover or Compose decision. Verify does not create `catalog-delta.yaml`; Registry publication is a separate explicitly authorized service/CLI mutation followed by invalidation and re-verification as needed.

## 11. Current routes and APIs

| Prefix | Purpose | Mutation |
| --- | --- | --- |
| `/api/workspace` | identity, live snapshot, Git changes/diff, SSE, VS Code open | contained editor open only |
| `/api/work-items` | Work Item/artifact projection | Graph GET/PUT only |
| `/api/codex-companion` | enrollment, leased sessions, Plan Continue/claim, revoke, exact scoped next-prompt queue | bounded v2 interaction state only |
| `/api/asset-registry` | L0/L1/L2, search, usage, compare, validate, lifecycle | guarded Registry mutations |

Routes are `/`, `/work/:workId/discover`, `/compose`, `/scaffold`, `/verify`, `/connections`, and `/assets`. `/connections` contains Companion Sessions, Pending Handoffs, Deliveries, and Setup/Diagnostics registers; it does not list ordinary Codex sessions. Stage routes, `/api/af`, `/api/catalog`, proposal/apply, old manifest parsers, legacy imports, and compatibility aliases are unsupported.

## 12. Documentation impact

Any change to lifecycle state, decision provenance, Registry contract, review binding, artifact/interface shape, API mutation, or visible screen contract updates this document, the Handbook, relevant schema/validator docs, and `docs/decision-log.md` in the same change set. Source remains final authority.
