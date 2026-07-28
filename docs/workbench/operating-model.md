# Agent Factory Operating Model

Agent Factory work executes in an external Codex CLI or VS Code session. The web product is a live companion: it projects repository state, may create one strict empty Work Item through a guarded create-only bootstrap, and exposes two shared canonical edit surfaces, Graph IR and the Asset Registry. It does not run lifecycle stages, generate source, or execute runtime verification.

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
3. The final Phase A output is a Discovery Decision Plan and an explicit continuity marker, not source code or a final Graph. If the Work Item already has exact discovery/decision revisions, this is a canonical Handoff. If it is still the strict pristine ledger, the Plan CLI may create one local Materialization Bootstrap Grant without writing tracked artifacts or fake revisions.
4. Phase B runs in a distinct explicitly enrolled session, claims that exact Handoff or Grant, reopens current source, verifies revisions and decisions, and materializes Work Item v2 artifacts. Companion Continue is the supported explicit fresh-context transport.

Repository and Registry evidence must be checked before asking the user a question they can answer. Solution Control Strategy (`single_agent`, `agent_delegation`, `explicit_workflow`, or `hybrid`) and Root Executable (exact Agent or Workflow Asset/version) are separate decisions. `hybrid` is never a default inferred from Graph shape.

## 3. Work Item v2 ledger

Every lifecycle has one explicit root:

```text
artifacts/af/<work-id>/
```

`af-work-item.json` with `schema_version: 2` is the lifecycle source of truth. It stores:

- primary `work_id`, monotonically increasing `ledger_revision`, and UI/routing `focus_skill`;
- `normalizedRequirement.id` and downstream `source_requirement_id` values equal that primary `work_id` and use the same lowercase identifier grammar;
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

When an owning input changes, the prior binding is retained but marked `stale`; affected downstream skill/evidence records are also stale. Compose-owned Graph/runtime changes do not invalidate the already approved Discovery inputs. The Discovery artifact ETag remains tied to its bound discovery revision, while the current post-Compose aggregate bytes are covered by the composition revision and Composition review ETag. Validators, file presence, Graph save, bridge health, or successful generation never create approval.

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
| new empty Work Item v2 ledger | guarded Web `POST /api/work-items` or `scripts/af.mjs work init`; create only |
| Graph IR | Compose skill or guarded web Graph editor |
| Asset Registry | shared service through guarded Web/CLI after explicit decision and revision check |
| application-to-path bootstrap binding | ignored local Application Registry; noncanonical and not Session authority |
| generated VS Code session descriptor | guarded Web session launch; ignored local state, no enrollment or canonical authority |
| activity/Git/file projection and enrolled Companion state | bounded workbench metadata stores |

The app does not expose arbitrary artifact PUT, source edit, stage/commit, existing Work Item field/approval mutation outside guarded Graph invalidation, runtime execution, or model-owned publication.

`POST /api/work-items` requires loopback, same origin, `application/json` no larger than 4 KiB, `application_root_confirmed: true`, and `confirmation: "CREATE_WORK_ITEM"`. It creates only the unchanged strict v2 default ledger, then initializes the server-derived application root with `git init` and the existing MCP context export. ID/path collisions and non-empty directories fail before writes unless reuse of that directory is explicit. Explicit `reuse_existing: true` may finish a partial bootstrap without modifying its existing ledger, or recreate the strict empty ledger when the exact local registration remains and no other artifact is present; a nonempty orphaned artifact root fails closed. The application binding is stored in ignored mode-`0600` `.agent-factory/applications/registry.json`; it is not added to the Work Item schema and grants no enrollment or workspace eligibility.

`POST /api/codex-companion/vscode-sessions` resolves that local binding,
verifies the Work Item and live Bridge, generates an ignored private multi-root
descriptor, and invokes `code --new-window` with fixed argv. Plan mode generates
a `folderOpen` Task for `af companion vscode-start`; only that CLI boundary
creates the `af_vscode_launch` ticket and starts interactive Codex from the
factory root with the external app added as a sandbox writable root.
Materialization mode also requires exactly one currently launchable canonical
Handoff or pristine bootstrap Grant. It generates a Task for either
`af companion continue --handoff <id>` or `af companion continue --grant <id>`.
After Workspace Trust, that trusted terminal Task—not the browser—performs the
consume-once claim and starts the fresh Materialization Session. The endpoint
itself creates no enrollment, claim, or Codex turn. The existing contained file
and diff open boundaries are unchanged.

Home is the normal browser entrypoint for this pair of guarded operations. It
accepts one new application name or existing Work Item and offers one primary
VS Code start action. A new application path is confirmed before the create
request; Trust and MCP guidance follows launch without treating editor
acceptance as Session proof. On the Discover Plan screen, one primary action
selects the latest launchable exact Plan authority, either a canonical Handoff
or bootstrap Grant, and requests its Materialization descriptor. Browser
components do not call enrollment or fresh-session Continue and do not render
activation Capsules, Plan bytes, or launch commands.

Home classifies launch/recovery UI from stable response codes plus current
snapshot evidence. A pending ticket is remembered only in browser state for the
current launch; increases in the aggregate expired/invalid/ignored diagnostics
then distinguish expiration, ETag-bound activation rejection, and missing Hook
observation without exposing claimed/revoked ticket history. Recovery uses the
existing Work Item bootstrap, VS Code launch, and read/refetch endpoints. The
browser never spawns the Bridge or starts a turn, and stale revisions are
re-read rather than blindly retried.

When Home or a `/work/:workId/*` route selects an exact Work Item, its workspace
SSE includes that Work ID. If its noncanonical Application Registry binding exists,
`WorkspaceProjection` opens one additional watcher only for the registered app
root after realpath containment under the configured applications root. It is
bounded to depth 6, excludes dependency, Git, build, virtual-environment, cache,
and `.agent-factory` trees, and emits only `application_source` metadata with an
app-relative path and Work ID. It does not add external files to factory Git
status/diff or widen editor-open containment.

The Home selection and Work Skill live strips combine that signal with exact
active Companion count, current/focus Skill status, and Graph revision/change.
Home adds a read-only Graph preview and resolved Root/composition/app-source
context; Compose owns the full Graph canvas and Inspector. CLI Question text,
options, answers, and transcript remain CLI-owned and are not Web projection
surfaces. Run/test/eval result projection is not part of this minimal set.

## 7. Graph collaboration and re-entry

`PUT /api/work-items/:workId/graph` requires loopback, same origin, current `If-Match`, approved discovery, strict Target v2 Graph validation, and one explicitly selected active Companion session whose current lease and workspace/application/Work Item/role scope allow the delivery.

The server synchronizes `analysis-result.json.graph` and `graph-ir.json`, creates a new composition cycle/revision, preserves superseded cycles, marks affected composition/Scaffold/Verify evidence stale, records invalidations, and queues compact `graph_change` context to the exact session. A delivery failure is surfaced separately and does not roll back an already committed Graph save.

Compose creates a structured Return-to-Discover when an Asset capability or contract is missing. A new Discover cycle searches the current Registry and gathers new decisions. After approval, Compose receives the new discovery revision and previous composition diff; it does not auto-merge or silently reuse the old Graph.

## 8. Companion participation and fresh-session handoff

Workspace eligibility, Session participation, and Work attachment are independent. A matching `cwd`, Bridge health response, Hook invocation, or editor launch never enrolls a session. A one-time ticket activates one exact session and issues a per-session lease bound to the canonical workspace, application, Work Item, role, and current Bridge instance. Revoked, expired, stale, cross-scope, and pre-restart leases fail closed. Ordinary unmanaged Hook events produce no Agent Factory network or durable Bridge state.

The generated VS Code launch chain preserves that distinction. Browser code
creates and opens only a descriptor; Workspace Trust authorizes VS Code to run
the Task, and the first human prompt supplies the `UserPromptSubmit` event that
may claim the Task-issued ticket. `af_vscode_launch`, a claimed ticket, exact
leased scope, and current prompt receipt are required evidence. The factory cwd
does not load the external app's project MCP configuration; that export remains
for a separate app-rooted client path.

The local bridge can create a pending Plan handoff only from a current leased Plan session and its exact latest turn. Creation names the exact canonical Work Item Handoff ID and marker and supplies the complete canonical Plan body; the Bridge recomputes the hash and rechecks the current Handoff tuple. It returns one signed Capsule containing the exact workspace/application/Work Item scope, handoff identity, discovery and decision revisions, canonical Plan body hash, expiry, and consume-once claim. Capsule bytes are transport metadata and are excluded from the Plan body hash.

The first eligible prompt in one distinct fresh session claims only that exact Capsule and receives the hash-verified Plan body through Hook context. The body remains encrypted in ignored local state until that claim and is then erased. Claim rejects the source session and wrong-scope, wrong-marker, duplicate, canonical-revision-stale, expired, superseded, ambiguous, or subagent events. Snapshot projection also rechecks active pending authority against the canonical Handoff and fails it closed, erasing the protected body, when that authority is removed or drifts. As a separately confirmed fallback, `/connections` may durably attach the pending Handoff to one explicitly selected, already-enrolled materialization session whose current lease and workspace/application/Work Item scope match. This path returns no raw Capsule or Plan body, stores the exact target, and only that session's next leased prompt can receive it. The Bridge never selects a first active session or infers a claim from one pending candidate.

Automatic built-in fresh-context transport is not assumed. The low-level `node scripts/af.mjs companion continue --handoff <id>` command and Discover's trusted VS Code Task both use the explicit Continue boundary, while `/connections` does not expose a copyable Capsule/launch command. `/connections` exposes durable exact existing-session attachment and pending-handoff cancellation only. If a client strips a low-level Capsule, the handoff remains waiting; it is not silently attached. Revoking a target detaches it; source revocation/staleness, source-turn drift, canonical Work Item revision drift, or Bridge restart closes pending canonical Handoff authority.

For the strict pristine Work Item only, the local Bridge may instead create one
Materialization Bootstrap Grant from the exact enrolled Plan session/latest
turn and canonical Plan body. It requires the unchanged default-ledger shape
and ETag, binds scope/hash/target/expiry, and uses a rotated consume-once claim
for one distinct fresh session. The Plan is temporarily plaintext in ignored
mode-`0600` local state, omitted from public/browser surfaces, and erased on
claim, failure, expiry, or supersession. This reduced design protects a local
single user from accidental wrong-session, stale, or replayed continuation; it
does not add protection from same-user hostile processes.

The Grant survives Bridge/host restart and can be continued while its source
record and exact latest turn remain present and non-revoked, even though the old
source lease cannot remain current across the restart. Phase B must write real
discovery/decision revisions and one exact claimed canonical
`session_handoffs[]` record using the Grant identity and claim provenance.
Snapshot projection automatically marks the Grant finalized only after that
record matches; no browser write or explicit finalize operation exists. All
later transfers use the ordinary canonical Handoff contract above.

Enrollment activation rechecks the exact Work Item ETag captured when its ticket was issued. Queued context delivery likewise rechecks the canonical Work Item and repository/Graph source revision at consume time. Decision and Asset Decision records preserve decision/recommendation revisions, explicit-vs-delegated selection source, bounded answer summary, structured-vs-conversational input mode, and exact session/turn provenance. A superseded record may preserve a selection only as one complete provenance set, including a non-null input mode.

## 9. Scaffold and Runtime Handoff

Scaffold consumes current approved revisions, resolved required decisions, an explicit Root Executable, an approved scaffold plan with `raw_requirement_to_code=false`, and explicit output roots.

Scaffold may write to an artifact-local handoff tree or an explicitly declared external application workspace. Completion requires every declared output root to resolve to a non-empty source or handoff tree; relative roots resolve from the Work Item artifact root, while absolute roots preserve the reviewed external workspace boundary. `runtime-stub/` is one possible output root, not a universal completion requirement.

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
| `/api/workspace` | identity, live snapshot, Git changes/diff, selected-Work-Item SSE with bounded external app activity, VS Code open | contained editor open only |
| `/api/work-items` | Work Item/artifact projection and empty bootstrap | guarded root POST create; Graph GET/PUT |
| `/api/codex-companion` | Plan VS Code descriptor launch, enrollment, leased sessions, Plan Continue/exact attach/claim/cancel, revoke, exact scoped next-prompt queue | ignored launch descriptor or bounded v2 interaction state; browser session launch does not enroll |
| `/api/asset-registry` | L0/L1/L2, search, usage, compare, validate, lifecycle | guarded Registry mutations |

Routes are `/`, `/work/:workId/discover`, `/compose`, `/scaffold`, `/verify`, `/connections`, and `/assets`. `/connections` contains Companion Sessions, Pending Handoffs, Deliveries, and Setup/Diagnostics registers; it does not list ordinary Codex sessions. The browser launch facade accepts one exact Handoff or bootstrap Grant ID for Materialization, while direct Grant creation/Continue remains a local Bridge/CLI boundary. Stage routes, `/api/af`, `/api/catalog`, proposal/apply, old manifest parsers, legacy imports, and compatibility aliases are unsupported.

## 12. Documentation impact

Any change to lifecycle state, decision provenance, Registry contract, review binding, artifact/interface shape, API mutation, or visible screen contract updates this document, the Handbook, relevant schema/validator docs, and `docs/decision-log.md` in the same change set. Source remains final authority.
