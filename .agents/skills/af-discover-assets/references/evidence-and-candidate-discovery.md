# Evidence and Candidate Discovery

## Contents

- [Purpose](#purpose)
- [Phase A write boundary](#phase-a-write-boundary)
- [Explore first](#explore-first)
- [Progressive Registry disclosure](#progressive-registry-disclosure)
- [Deterministic search and match grades](#deterministic-search-and-match-grades)
- [Evidence and candidate boundaries](#evidence-and-candidate-boundaries)
- [Required user decisions](#required-user-decisions)
- [Planning subagent](#planning-subagent)
- [Re-entry from Compose](#re-entry-from-compose)
- [Verification](#verification)
- [Stop conditions](#stop-conditions)
- [Sources checked](#sources-checked)
- [Checked date](#checked-date)

## Purpose

Guide non-mutating Phase A exploration from requirement evidence through deterministic Asset Registry comparison and explicit user choices. Phase A ends with a Discovery Decision Plan; it does not materialize repository artifacts.

## Phase A write boundary

Phase A runs only in actual Codex Plan Mode. Confirm mode from the active collaboration-mode signal; do not infer it from the prompt or an internal plan.

During Phase A:

- do not initialize or update a Work Item;
- do not write discovery, decision, candidate, Registry, Graph, or source files;
- do not mutate a Registry draft or publication state;
- do not use a planning subagent to perform writes;
- if Plan Mode cannot be verified, stop before all repository-tracked writes.

Read-only repository and CLI inspection is allowed. The Plan response itself may carry decisions and a handoff marker because it is conversation output, not a tracked artifact.

## Explore first

Before the first user question, inspect enough current evidence to avoid asking for repository facts:

1. explicit Work Item, raw requirement, attachments, and any Compose `return_to_discover` record;
2. Registry L0 search results and snapshot revision;
3. L1 cards for only the strongest matches;
4. L2 contracts for only final comparison candidates;
5. relevant Handbook stage, register, and locator;
6. current schema/source/usage evidence reached from those locators.

Keep the evidence bundle bounded:

```yaml
task: one discovery question
evidence_refs: []
catalog_candidates: []
handbook_refs: []
source_locators: []
open_questions: []
required_output_schema: concise findings/options
```

Handbook locators are navigation only. Reopen current source before treating a locator as evidence.

## Progressive Registry disclosure

Use the actual `asset` command group from `scripts/af.mjs`.

### L0 — deterministic Registry search

```bash
node scripts/af.mjs asset search [filters] [--root PATH|--registry PATH]
```

Search accepts current filters including:

```text
--text
--type agent|workflow|tool
--required-input name:type[:required|optional]
--required-output name:type[:required|optional]
--side-effect-class none|read_only|write|external_action
--domain-scope domain_specific|cross_domain|domain_neutral
--business-domain
--owner
--binding-kind function|mcp|built_in|a2a|unresolved|none
--exposure-protocol a2a|none
--runtime-requirement
--include-deprecated
--limit
```

Use evidence-backed hard filters first. Add `--text` for lexical/tag ranking after structural constraints; do not use semantic similarity to bypass an incompatible I/O, side-effect, security, binding, or runtime boundary.

### L1 — compact Asset card

Read only top candidates:

```bash
node scripts/af.mjs asset get <asset-id>@<version> --level 1 [--root PATH|--registry PATH]
```

L1 should be sufficient for responsibility, version/status, I/O summary, side effect, domain, owner, runtime, binding/exposure, and source/Handbook refs.

### L2 — full contract

Read only finalists:

```bash
node scripts/af.mjs asset get <asset-id>@<version> --level 2 [--root PATH|--registry PATH]
```

Use exact comparisons and usage evidence where they can change the decision:

```bash
node scripts/af.mjs asset compare <asset-id> <from-version> <to-version> [--root PATH|--registry PATH]
node scripts/af.mjs asset usage <asset-id>@<version> [--root PATH|--registry PATH]
```

Never send the full Registry or every L2 contract to the planner or a subagent.

## Deterministic search and match grades

Apply this order:

```text
hard filters
  -> structural compatibility
  -> lexical/tag ranking
  -> optional semantic ranking
  -> model explanation of bounded finalists
  -> explicit user selection
```

Grade each considered candidate using only current evidence:

| Grade | Meaning |
| --- | --- |
| `exact` | Required responsibility and contract match without a contract change. |
| `compatible` | Required contract can be used as-is despite non-load-bearing differences. |
| `partial` | Some responsibility is reusable, but a new version, composition, or contract delta is required. |
| `none` | No acceptable candidate remains after hard filters and structural comparison. |

For every required capability, preserve:

- search text and hard filters;
- Registry snapshot revision;
- Asset IDs and exact versions considered;
- match grade and deterministic compatibility facts;
- rejection reasons and deprecated-version warning, if any;
- recommended disposition and rationale;
- selected disposition, user provenance, and reason.

The model explains matches; it does not search from memory, auto-select an Asset, or auto-publish.

## Evidence and candidate boundaries

Keep four evidence classes separate:

| Class | Rule |
| --- | --- |
| Evidence | Directly observed user statement, file, Registry result, source, schema, or usage record with locator. |
| Assumption | Evidence-backed inference requiring review. Never restate it as observed fact. |
| Contradiction | Two or more sources cannot all be true. Preserve both and request a decision if material. |
| Missing Information | A question whose answer affects requirement, candidate, contract, risk, or decision. |

Classify only responsibilities:

1. independent interpretation/judgment responsibility suggests an Agent candidate;
2. owned ordering, branching, parallelism, iteration, Human Input, pause/resume, or termination suggests a Workflow candidate;
3. a callable structured function with a defined result/error boundary suggests a Tool candidate;
4. data, documents, knowledge, systems, endpoints, and non-callable interfaces are Resources or Dependencies;
5. a private deterministic step inside one Workflow remains a Function Node hint, not an Asset candidate.

Do not create a Workflow merely because prose lists multiple steps. Each candidate needs a stable identity, responsibility evidence, I/O and error boundary, side effect, domain scope, owner, reuse evidence, risk/data policy, confidence/rationale, and candidate-level Missing Information.

Resources and Dependencies stay in separate Plan sections and later evidence/summary projections. They never enter `assetCandidates`.

## Required user decisions

After exploration, use `request_user_input` in small groups for decisions the repository cannot answer. Each question provides evidence, distinct options, consequences, and a recommendation when justified. There are no defaults for required decisions.

The complete decision set covers:

- goal and measurable success;
- one of `single_agent`, `agent_delegation`, `explicit_workflow`, `hybrid`;
- Root Executable type, exact Asset ref, and exact version;
- one disposition for every required Asset/capability: `reuse_exact`, `reuse_new_version`, `compose_existing`, `create_project_draft`, `create_publish_candidate`, `defer`, or `exclude`;
- project-only versus publish-candidate intent for creation;
- applicable Human Input/approval/resume contract;
- applicable local versus Remote A2A boundary;
- applicable side-effect, authentication, authorization, and audit choices.

“추천대로 진행” explicitly selects the recommendations visible in that question. Preserve the accepted option set and current session/turn as user provenance. A missing response leaves the decision open; it does not select the recommendation.

Required decisions may be marked resolved only when `selected_by` is `user` and selection reason plus session/turn provenance are available. Keep candidate/contract Missing Information as a hard gate even if broader requirement uncertainty was accepted.

## Planning subagent

Use at most the narrow assistance justified by complexity. Suitable isolated roles are requirement evidence scout, Registry match scout, architecture-option analyst, or runtime-risk analyst.

The subagent receives a bounded evidence bundle, not the whole repository or Registry. It returns facts, uncertainty, and options only. The main planner verifies its material claims, asks the user, captures the deliverable, and closes the subagent. Subagent use never implies `agent_delegation` or another runtime strategy.

## Re-entry from Compose

On `return_to_discover`, preserve and inspect:

- triggering composition revision;
- missing capability;
- failed Asset refs;
- required contract delta;
- Graph impact;
- recommended search criteria;
- open decision ID.

Refresh the Registry snapshot and repeat Explore-first only for affected capabilities and decisions. Reconfirm existing decisions that the new evidence invalidates; do not silently carry them forward or silently replace them. Preserve the previous discovery cycle for history and propose a new superseding cycle.

Do not edit or merge the prior Graph in Discover. Graph conflict resolution belongs to Compose after the new discovery revision is approved.

## Verification

Before completing Phase A, verify in conversation that:

- actual Plan Mode was observed;
- no repository-tracked file changed because of Phase A;
- Registry search preceded Asset questions;
- only bounded L0/L1/L2 context was read;
- every required decision has explicit user provenance;
- every required capability has one exact disposition;
- Resources/Dependencies remain outside the candidate list;
- no Graph topology or runtime source was finalized.

Phase B performs artifact and Work Item validation; Phase A does not claim those writes or checks.

## Stop conditions

Stop when Plan Mode is absent or unverified, the Work Item or requirement is ambiguous, exploration cannot access material evidence, deterministic compatibility cannot be established, a required decision is unanswered, a hard gate would be hidden as an assumption, a Resource/Dependency would have to masquerade as an Asset, or the next action would write a repository-tracked file.

## Sources checked

- `schemas/af-work-item.schema.json`
- `scripts/af.mjs`
- `packages/agent-factory-core/src/assetRegistry.ts`
- `docs/workbench/taxonomy.md`
- `docs/workbench/graph-ir.md`
- `docs/migration/plan-discovery-asset-registry-status.md`

## Checked date

- Checked date: 2026-07-24
- Contract note: Phase A is Plan Mode only, deterministic Registry exploration precedes questions, and every required Asset disposition is an explicit user decision.
