# Work Item and External Codex

## Purpose

Define the schema-version-2 lifecycle ledger, session/run continuity, write ownership, revision-bound reviews, and re-entrant handoffs for Agent Factory work performed by an external Codex CLI or VS Code session.

Use the sibling canonical references `companion-session-participation.md`, `fresh-context-handoff.md`, and `session-and-work-item-provenance.md` for enrollment, exact-scope, Plan-hash, and provenance gates. This reference describes the Work Item projection and does not make an ordinary session a lifecycle actor.

## Canonical identity

Use one explicit root and ledger:

```text
artifacts/af/<work-id>/
artifacts/af/<work-id>/af-work-item.json
```

Do not infer `<work-id>` from the newest directory, route, first active session, or handoff. Confirm it from the user, an exact marker/session binding, or an existing valid Work Item.

The current canonical artifact inventory may include:

- `analysis-result.json`
- `normalized-requirement.json`
- `asset-candidates.json`
- `graph-ir.json`
- `analysis-summary.md`
- `boundary-design.md`
- `scaffold-plan.json`
- `runtime-stub/`
- `implementation-handoff.md`
- `validation-report.md`

Do not create or read-fallback `af-run-manifest.json`, old stage runs, proposal/apply ledgers, route aliases, compatibility imports, or `/api/af` lifecycle calls.

## Work Item contract

`schemas/af-work-item.schema.json` is the exact shape. The root requires:

- identity: `schema_version: 2`, `work_id`, `artifact_root`, `ledger_revision`;
- routing/execution: `focus_skill`, `active_runs`, exactly four `skills` entries;
- revision history: `revisions`, `discovery_cycles`, `composition_cycles`, `invalidations`;
- user decisions: `decisions`, `asset_decisions`, `solution_control_strategy`, `root_executable`;
- gates/outputs: `review_gates`, `artifact_refs`, `generated_output_roots`, `verification`;
- continuity: `session_handoffs`.

The four skill IDs are exactly:

```text
af-discover-assets
af-compose-solution
af-scaffold-runtime
af-verify-runtime
```

`focus_skill` is the user's current surface and may be null. `active_runs` is the current actor set; its supported roles are `plan`, `planning_subagent`, `materializer`, `compose`, `scaffold`, and `verify`. A planning subagent has a `parent_run_id`; every run records an exact session and input revision.

Skill status is one of:

```text
not_started | active | waiting_for_input | waiting_for_review | complete | blocked | failed | stale
```

At skill start, set only the selected skill/run state to active, record its input revision and timestamps, update `focus_skill` only when the user surface changes, and preserve unrelated runs, outputs, evidence, and history. Use `complete` only for current required outputs and checks. A revision mismatch makes old completion stale.

## Revisions and cycles

A revision contains a digest, one or more `{ ref, sha256 }` subjects, and the exact `registry_revision` or null. Current revision slots are requirement, decision, Asset decision, discovery, Catalog snapshot, Graph, root executable, runtime contract, composition, scaffold, and verification.

Discovery cycles use trigger `initial`, `return_to_discover`, or `invalidation`; discovery and composition cycles use status `active`, `complete`, or `superseded`. Preserve prior cycles and connect replacement cycles with `supersedes_cycle_id`.

A Compose return to Discover records the schema-defined `return_to_discover` fields: triggering revision, missing capability, failed Asset refs, required contract delta, Graph impact, recommended search criteria, optional open decision ID, and creation time. Do not replace that record with prose-only handoff.

An invalidation records source/target skills, triggering and invalidated revisions, reason, affected refs, active/resolved status, and timestamps. Keep old files as historical evidence while the UI distinguishes active from stale revisions.

## Decisions

Required decisions never default. An open `decisions[]` record has null selection/provenance. It becomes resolved only after the user chooses an offered option and the record contains `selected_by: "user"`, a selection reason, session ID, and turn ID. “Use the recommendation” is a valid explicit user choice; model silence or inference is not. **Exception:** recommendation shorthand must never resolve a hard, credential, deployment, security, or irreversible gate — those gates require an explicit named option plus the user's confirmation of the material consequence, not recommendation shorthand.

`asset_decisions[]` follows the same provenance rule and uses only these dispositions:

```text
reuse_exact | reuse_new_version | compose_existing | create_project_draft
create_publish_candidate | defer | exclude
```

`solution_control_strategy` is null until explicitly selected from `single_agent`, `agent_delegation`, `explicit_workflow`, or `hybrid`. `root_executable`, when resolved, points to an exact Agent or Workflow Asset ID/version and its decision ID.

## Revision-bound review gates

There are two gates:

- discovery, before Compose;
- composition, before Scaffold.

Gate status is `pending`, `approved`, `changes_requested`, or `stale`. A pending gate has no binding or decision provenance. Any non-pending gate has a binding plus decision time/session/turn; a stale gate also has non-empty `stale_reasons`.

Discovery approval binds requirement, decision, Asset-decision, discovery, and Catalog-snapshot revisions plus the reviewed artifact hash. Composition approval binds discovery, Graph, root-executable, runtime-contract, and composition revisions plus the reviewed artifact hash.

A skill never self-approves. Before honoring an approval, compare every bound revision subject and Registry revision with current state. New Discover material resets the discovery gate to pending and stales composition/downstream state. New composition material preserves the approved Discovery binding, leaves an undecided Composition gate pending or marks its prior decision stale, then stales Scaffold/Verify. After Compose updates the aggregate, the Discovery artifact hash remains tied to the bound historical discovery revision while the current aggregate bytes are owned by the composition revision and, after review, the Composition artifact hash. Append the owning invalidation and never preserve approval for unreviewed bytes.

## Session and Plan handoff

Discover Phase A makes no repository or Work Item write. It ends with a Discovery Decision Plan and a machine-readable marker. When actual discovery/decision revisions already exist, use the canonical Bridge Handoff path. When the Work Item is still the exact strict default ledger, use one Bootstrap Grant bound to its ETag, exact source session/latest turn, Plan hash, target `af-discover-assets.materialize`, expiry, and marker checksum; do not invent revisions to create a canonical Handoff.

A fresh materialization session must present an exact marker on its first prompt. Claim only one unexpired authority after its exact scope/hash/target/expiry and source match, the new session differs from the Plan session, and it was not already claimed. Canonical Handoffs also require the current revision/marker tuple. Bootstrap Grants require the unchanged pristine ETag and latest source turn, and may survive Bridge restart while the preserved source record remains non-revoked. Duplicate, expired, superseded, ambiguous, stale, wrong-work-item, wrong-cwd, or Plan-hash-mismatched claims stop materialization.

The Bridge's observed authority and the Work Item's durable `session_handoffs` are related evidence, not interchangeable shapes. A Bootstrap Grant claim authorizes Phase B to write the real revisions and exactly one claimed Handoff record with the Grant identity/source/hash/times/claim provenance; the Bridge then auto-finalizes only on an exact match. Re-read both plus the approved Plan before writing. Bridge health alone does not prove first-prompt delivery or claim.

If automatic claim is unavailable, follow the fallback order in `fresh-context-handoff.md`. Exact attachment must be confirmed from current Companion state; never attach the first active session by guesswork.

## Ownership and web write boundary

| Surface | Canonical writer |
| --- | --- |
| Requirement, candidates, decisions, contracts, handoff, source, reports | external Codex session using the owning Work Skill |
| Work Item state, revisions, cycles, invalidations, durable handoff refs | executing external Codex session |
| Discovery/composition review decision | external Codex session after explicit user/reviewer choice |
| Graph IR | Compose skill or web Graph editor |
| Versioned Asset Registry | shared Asset Registry service, called by web or `scripts/af.mjs` |
| Activity, Git state, file inventory | workbench projection metadata |

The web workbench has exactly two canonical write surfaces: Graph IR and the versioned Asset Registry. It does not arbitrarily mutate other Work Item artifacts or source. Graph writes synchronize the embedded and split Graph, then stale composition/downstream state. Registry mutations require the current optimistic `registry_revision`; direct file edits are unsupported.

## Supported Work Item CLI

The complete `work` command set currently dispatched by `scripts/af.mjs` is:

```bash
node scripts/af.mjs work init <work-id> [--root <path>]
node scripts/af.mjs work validate <work-id-or-path> [--root <path>]
node scripts/af.mjs work revision <ref=path>... --registry-revision <sha256|null> [--root <path>]
```

`work init` fails if the Work Item exists. `work revision` requires repository-relative `ref=path` subjects and returns a revision object without mutating the ledger. There is no current `work attach-session` command or CLI subcommand for gate approval, handoff creation/claim, focus change, run change, or generic Work Item mutation; do not invent one.

The separate explicit Companion command set is:

```bash
node scripts/af.mjs companion start --application <id> --work <id> --role <plan|materialization> [--root <path>]
node scripts/af.mjs companion join --application <id> --work <id> --role <plan|materialization> [--root <path>]
printf '%s' "$PLAN_BODY" | node scripts/af.mjs companion prepare-materialization --work <id> --session <id> --turn <id> [--root <path>]
node scripts/af.mjs companion continue --handoff <id> [--root <path>]
node scripts/af.mjs companion continue --grant <id> [--root <path>]
node scripts/af.mjs companion reset --confirm [--root <path>]
```

Start/Join intent is not participation proof. Re-read the activated session, current lease, and exact scope before lifecycle work.

## Verification

```bash
test -f <artifact-root>/af-work-item.json
node scripts/af.mjs work validate <work-id-or-path> [--root <path>]
node scripts/validate-artifacts.mjs <artifact-root>
git status --short
git diff --check
```

Also run the selected skill's checks and inspect the exact output inventory and bound revision subjects.

## Stop conditions

Stop when repository/Work Item/session identity is ambiguous; a required decision is open; a gate binding is stale or incomplete; a Handoff or Bootstrap Grant cannot be exactly claimed; a Bootstrap Grant's pristine ETag/source turn drifts; a write would escape declared roots; Registry mutation lacks expected revision; or proceeding would restore legacy manifests, stages, aliases, APIs, importers, or compatibility projection.

## Sources checked

- `schemas/af-work-item.schema.json`
- `scripts/af.mjs`
- `packages/web/src/analyzer/afWorkItem.ts`
- `packages/web/server/codexBridgeStore.ts`
- `packages/agent-factory-core/src/assetRegistry.ts`
- [Operating Model](../../../docs/workbench/operating-model.md)

## Checked date

- Checked date: 2026-07-31
- Compatibility note: the "use the recommendation" rule now carries an explicit inline carve-out for hard/credential/deployment/security/irreversible gates (matching `decision-input-adapter.md`). The Codex Plan Mode precondition and its Stop condition have been removed: Codex's plan-vs-default collaboration mode is not verified anywhere in this lifecycle, and Discover Phase A's no-write behavior stands on its own without a mode check.
