---
name: af-discover-assets
description: >-
  Runs re-entrant Agent Factory discovery in two phases: a non-mutating Plan Mode conversation that explores evidence and the Asset Registry before obtaining explicit user decisions, followed by Default-mode materialization into Work Item v2 and strict discovery artifacts. Use when starting discovery or returning from Compose; do not finalize Graph IR or generate runtime source.
---

# AF Discover Assets

## Purpose

Discover is a re-entrant decision workflow, not a one-pass analyzer:

```text
Phase A — Plan Conversation in actual Plan Mode
  -> explicit user decisions
  -> Discovery Decision Plan and fresh-session marker

Phase B — Materialization in Default/coding mode
  -> Work Item v2 and strict discovery artifacts
  -> discovery review
```

Agent, Workflow, and Tool are the only asset types. Keep Resources, Dependencies, protocols, Human Input, callbacks, and Graph controls outside the asset candidate list. Discover may preserve relationship and runtime-pattern hints, but it does not finalize Graph IR, runtime contracts, or source.

## Required reading

Read these before either phase:

1. [Source of Truth](../_shared/source-of-truth.md)
2. [Lifecycle Invariants](../_shared/lifecycle-invariants.md)
3. [Work Item and External Codex](../_shared/work-item-and-external-codex.md)
4. [Companion Session Participation](../_shared/companion-session-participation.md)
5. [Decision Input Adapter](../_shared/decision-input-adapter.md)
6. [Fresh-context Handoff](../_shared/fresh-context-handoff.md)
7. [Session and Work Item Provenance](../_shared/session-and-work-item-provenance.md)
8. [Taxonomy](../_shared/taxonomy.md)
9. [Evidence and Candidate Discovery](references/evidence-and-candidate-discovery.md)
10. [Analysis Result Output](references/analysis-result-output.md)
11. [Target Contract v2](../_shared/target-contract-v2.md), before any JSON write

Read [Missing Information](../_shared/missing-information.md) when evidence or a candidate contract is incomplete. Read [Catalog and Reuse](../_shared/catalog-and-reuse.md) whenever an Asset disposition is in scope; Registry comparison is part of normal Phase A discovery.

Before Phase B writes, reopen `schemas/af-work-item.schema.json`, `schemas/analysis-result.schema.json`, and `scripts/af.mjs`. The schema and current CLI own exact fields and commands; this skill does not invent a lifecycle or Registry command.

## Mode gate

Determine the active Codex collaboration mode from the current mode indicator or tool context, and separately verify current Companion participation plus exact application/workspace/work attachment. A request containing the word “plan,” an internal task list, or the availability of planning tools is not proof of Plan Mode or enrollment.

- A raw or revised discovery request starts Phase A only when the active collaboration mode is actually Plan and the enrolled session has the exact `plan` scope.
- If Phase A is requested outside Plan Mode, make no repository-tracked write, do not initialize a Work Item, and ask the user to enter Plan Mode. Do not assume the mode can be changed automatically.
- Phase B runs only in Default/coding mode from a complete Discovery Decision Plan, with current `companion_active` participation and exact `materialization` scope plus an exact handoff/revision claim or exact confirmed attachment.
- If a materialization request arrives while still in Plan Mode, make no repository-tracked write and ask the user to continue in Default/coding mode.

## Phase A — Plan Conversation

Phase A is non-mutating exploration. Do not create or update `af-work-item.json`, discovery artifacts, source, Registry records, or any other repository-tracked file.

### 1. Explore before asking

Perform at least one targeted exploration in this order:

1. explicit Work Item and raw requirement, if they already exist;
2. Registry L0 search with deterministic filters;
3. only the top matching Asset cards at L1;
4. only final comparison candidates at L2;
5. relevant Handbook stage/register/locator;
6. current source, schema, contract, and usage evidence needed to resolve repository facts.

Use the actual read-only Asset CLI group from `scripts/af.mjs`:

```bash
node scripts/af.mjs asset search [filters] [--root PATH|--registry PATH]
node scripts/af.mjs asset get <asset-id>@<version> --level 1 [--root PATH|--registry PATH]
node scripts/af.mjs asset get <asset-id>@<version> --level 2 [--root PATH|--registry PATH]
node scripts/af.mjs asset compare <asset-id> <from-version> <to-version> [--root PATH|--registry PATH]
node scripts/af.mjs asset usage <asset-id>@<version> [--root PATH|--registry PATH]
```

Start `asset search` with hard filters such as `--type`, `--required-input`, `--required-output`, `--side-effect-class`, `--domain-scope`, `--business-domain`, `--owner`, `--binding-kind`, `--exposure-protocol`, and `--runtime-requirement` when evidence supports them. Do not load the whole Registry into model context. See [Evidence and Candidate Discovery](references/evidence-and-candidate-discovery.md) for L0→L1→L2 and match grading.

Ask the user only about intent, trade-offs, and decisions that repository evidence cannot answer.

### 2. Optional planning subagent

For a genuinely complex requirement, one narrowly scoped planning subagent may inspect a bounded evidence bundle for one role such as requirement evidence, Registry matches, architecture options, or runtime risk. Give it only relevant refs/cards/locators and a required output shape. It returns evidence and options, never a user decision, and it must be closed after its deliverable is captured. If subagents are unavailable or the request is simple, continue sequentially.

Planning subagents are execution helpers; they do not imply a multi-Agent runtime design.

### 3. Obtain every required decision

For every unresolved decision, use [Decision Input Adapter](../_shared/decision-input-adapter.md). Detect `request_user_input` only from the tools actually callable in the current turn; never guess from version or configuration. Structured and conversational paths present the same `decision_id`, decision/recommendation revision, options, recommendation, evidence, and trade-offs, and normalize to the same Decision Record semantics.

Ask exactly one interactive question per turn. The conversational fallback must emit the question, mark the turn `waiting_for_input`, stop, and perform no materialization or Compose work. Ambiguous, partial, conditional, or contradictory answers require a normalized confirmation as another one-question stopped turn. A recommendation is not a selection, and no required decision has a default or assumption.

Resolve all applicable decisions with explicit user input:

- goal and observable success criteria;
- `solution_control_strategy`: `single_agent`, `agent_delegation`, `explicit_workflow`, or `hybrid`;
- Root Executable: Agent or Workflow plus the exact selected asset ref and version;
- one exact disposition for every required Asset/capability: `reuse_exact`, `reuse_new_version`, `compose_existing`, `create_project_draft`, `create_publish_candidate`, `defer`, or `exclude`;
- project-only versus publish-candidate intent for every created Asset;
- Human Input, approval, interruption, and resume behavior, when applicable;
- local versus Remote A2A boundary, when applicable;
- side-effect, authentication, authorization, and audit choices wherever the selected capability can read protected data, write state, or cause an external action.

“추천대로 진행” counts only for the displayed matching decision and recommendation revision. It never resolves a hard, credential, deployment, security, or irreversible gate; require an explicit named option and consequence confirmation for those. Record a valid resolution with `selected_by: "user"`, selection reason, current enrolled session/turn provenance, and the exact recommended option it accepted. Silence, tool timeout, model preference, and prior defaults do not count. Keep unresolved decisions open and do not complete the plan or emit a handoff marker.

### 4. Produce the Discovery Decision Plan

After every required decision is resolved, return the in-conversation **Discovery Decision Plan** defined in [Analysis Result Output](references/analysis-result-output.md). It must include evidence, Registry search results, selected and rejected alternatives, exact Asset dispositions, Resources/Dependencies, open/resolved decision refs and recommendation revisions, user provenance, Compose handoff constraints, and exact application/workspace/work/revision/target/expiry metadata. It is a decision plan, not a code-change plan.

Canonicalize and hash only the Plan body as specified by [Fresh-context Handoff](../_shared/fresh-context-handoff.md). Exclude the Companion capsule from the Plan body; keep its digest separate. The Companion `plan_body_hash` and Work Item `plan_hash` identify the same canonical bytes.

End the plan with this exact portable marker shape:

```text
AF_WORK_ITEM=<work-id>
AF_HANDOFF=<handoff-id>
AF_DISCOVERY_REVISION=<discovery-revision-digest>
AF_TARGET=materialize-discovery
```

These four keys identify the portable Plan-to-materialization request. Work Item v2 separately serializes `session_handoffs[].target_skill` as `"af-discover-assets.materialize"`; do not copy the portable `AF_TARGET` value into that schema field. If Companion creates a larger signed claim marker, preserve that returned marker byte-for-byte alongside the portable marker; do not reconstruct claim tokens or internal fields.

The marker is a claim request, not proof of attachment. Built-in fresh-context carriage is `unverified` by default. Use Companion Continue, then Copy Capsule, then exact confirmed attach. Automatic continuation is valid only when a fresh session's first prompt claims the explicitly identified handoff and the observed session/turn, application/workspace/work, Plan hash, target, expiry, and revisions match. A fork, resumed Plan session, Bridge health, one pending candidate, or a marker pasted into an unrelated cwd is not a fresh-session claim.

When Companion Continue and Copy Capsule are unavailable or stripped, launch one new explicitly scoped materialization session with the implemented safe command:

```bash
node scripts/af.mjs companion join --application <application-id> --work <work-id> --role materialization [--root PATH]
```

Join never selects the first active session and does not by itself prove Plan/revision identity or claim the handoff. Confirm the newly activated exact session/application/workspace/work/materialization scope and provide the complete Decision Plan plus revisions in that session. There is no current `work attach-session` CLI.

## Phase B — Default-mode materialization

### 1. Verify and claim before writing

Before any write:

1. verify the active mode is Default/coding, not Plan;
2. verify current Companion participation, lease freshness, exact `workspace_id`, `application_id`, `work_id`, `role: materialization`, canonical repository root, and artifact root;
3. read the complete canonical Discovery Decision Plan and compare its handoff ID, discovery/decision revisions, Plan-body hash, open/resolved decision refs, recommendation revisions, selected Asset refs/versions, and Registry snapshot;
4. require an exact fresh-session claim receipt or exact confirmed attachment plus the complete Plan; reject expired, superseded, duplicate, ambiguous, wrong-scope, wrong-cwd, or mismatched claims;
5. re-read an existing Work Item and any `return_to_discover` record; preserve its scope and decision provenance and never choose the newest root by guesswork.

Use only current Work Item CLI commands:

```bash
node scripts/af.mjs work init <work-id> [--root PATH]
node scripts/af.mjs work validate <work-id-or-path> [--root PATH]
```

Run `work init` only for a confirmed new Work Item. It creates Work Item v2; do not copy a legacy ledger or create compatibility files. For an existing Work Item, validate and update it in place while preserving history and unrelated evidence.

If any claimed decision or revision is missing or changed, stop and return to Phase A. Do not silently reopen, replace, or default a user choice in Phase B.

### 2. Materialize the approved decision set

Materialize the exact Phase A choices using the paths and mappings in [Analysis Result Output](references/analysis-result-output.md):

- requirement evidence into `analysis-result.json.normalizedRequirement`, `evidence`, and `normalized-requirement.json`;
- Agent/Workflow/Tool candidates into `analysis-result.json.assetCandidates` and `asset-candidates.json`;
- structured user decisions into Work Item v2 `decisions`, `solution_control_strategy`, and `root_executable`;
- structured per-Asset dispositions into Work Item v2 `asset_decisions`;
- the discovery aggregate, summary, revision subjects, current Registry revision, discovery cycle, active materializer run, claimed handoff, gate state, and invalidations into their schema-owned fields.

Do not invent separate decision artifact filenames. `root_executable` must identify an Agent or Workflow with exact `asset_ref`, positive `asset_version`, and its `decision_id`. Every resolved `decision` and `assetDecision` records explicit user provenance as required by `schemas/af-work-item.schema.json`.

Resources and Dependencies remain separate evidence/summary records and never enter `assetCandidates`. Preserve evidence, assumptions, contradictions, and Missing Information separately. Candidate hard gates remain `needs_info`; they are not converted into resolved choices.

Write only strict Target Contract v2. Do not restore old manifests, old stage state, aliases, compatibility projections, or read-only/linear lifecycle assumptions.

### 3. Re-entry and invalidation

Initial discovery appends an `initial` discovery cycle. A return from Compose appends a `return_to_discover` cycle, preserves and supersedes the prior cycle, and consumes the exact `composition_cycles[].return_to_discover` evidence: triggering revision, missing capability, failed Asset refs, required contract delta, Graph impact, search criteria, and open decision.

On a changed discovery revision:

- set the current discovery review to `pending` for the new bytes;
- mark prior composition review and dependent Compose/Scaffold/Verify state `stale` as applicable;
- append schema-valid `invalidations` instead of deleting history;
- preserve the previous Graph as stale evidence, but do not merge, rewrite, or finalize it;
- require a new discovery review before Compose re-entry.

Across Return-to-Discover, preserve application/workspace/work identity, artifact root, open and resolved decision refs, and their recommendation revisions. Do not attribute the new cycle to the Compose session; require the current Plan/materialization participant for each corresponding action.

### 4. Validate and request review

Use `node scripts/af.mjs work revision --registry-revision <sha-or-null> <ref=path>... [--root PATH]` only to compute file-backed revision objects. The command prints a revision; it does not update `af-work-item.json`, and it does not hash an invented JSON-pointer projection. Serialize revision subjects exactly as supported by the active schema and current materialized bytes.

Run:

```bash
node scripts/af.mjs work validate <work-id-or-path> [--root PATH]
node scripts/validate-artifacts.mjs <artifact-root>
git diff --check
git status --short
```

Also validate every selected Registry Asset that must exist exactly:

```bash
node scripts/af.mjs asset validate <asset-id>@<version> [--root PATH|--registry PATH]
```

Set Discover to `waiting_for_review` with the current output revision and refs. Keep `review_gates.discovery.status` pending until the user explicitly reviews the current requirement, decision, Asset-decision, discovery, and Registry revisions. Discover never self-approves and never authorizes Compose from file presence or validator success alone.

## Write boundary

Phase A writes no repository-tracked file. Phase B writes only the confirmed Work Item root and only from exact materialization scope. Discover never writes runtime source, Graph topology, Catalog/Registry mutations, deployment files, or workbench state. Ordinary-session observations are not durable lifecycle evidence.

## Stop conditions

Stop when mode, participation, lease, application/workspace/work/role scope, Work Item, handoff, session, turn, Plan hash, recommendation revision, revision, or Registry snapshot is unverified or ambiguous; a required user decision is open; evidence would require invention; a candidate hard gate is hidden; a claim is expired/duplicate/mismatched; strict v2 cannot represent the result; validation fails; or a write would escape the confirmed artifact root.

## Completion report

Report the phase performed, exact Work Item/handoff/revisions, files written, user decisions preserved, candidate and disposition summary, unresolved information, invalidations, review-gate state, verification commands/results, and the exact next action. A Phase A plan is not materialization, and Phase B materialization is not Compose authorization until the revision-bound discovery gate is approved.
