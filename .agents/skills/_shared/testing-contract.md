# Testing Contract

## Contents

- [Purpose](#purpose)
- [When to read](#when-to-read)
- [Decision criteria](#decision-criteria)
- [ADK graph test harness](#adk-graph-test-harness)
- [Required evidence](#required-evidence)
- [Artifact implications](#artifact-implications)
- [Scaffold implications](#scaffold-implications)
- [Verification](#verification)
- [Stop conditions](#stop-conditions)
- [Official sources checked](#official-sources-checked)
- [Checked date](#checked-date)

## Purpose

Separate deterministic structure/contract validation from behavioral skill evaluation, and preserve reproducible evidence for both.

## When to read

Read when authoring or changing a skill/reference, building scenario fixtures, validating generated artifacts, forward-testing Codex or Claude Code behavior, or making a completion claim.

## Decision criteria

Use two complementary test classes:

| Test class | Proves | Does not prove |
| --- | --- | --- |
| Deterministic validation | tree shape, frontmatter, links, vocabulary, schema, build, generated checks | correct skill triggering or robust reasoning |
| Behavioral evaluation | trigger choice, progressive disclosure, gate compliance, artifact behavior, stop conditions | schema validity unless commands are actually run |

Deterministic skill validation must check canonical directories, `SKILL.md`, frontmatter fields and limits, name-folder equality, UTF-8/BOM, relative links, missing/orphan/circular references, line budgets, forbidden active vocabulary, shim constraints, source URLs, and checked dates.

Behavioral evaluation must use fresh sessions, natural user prompts, the same commit and scenario context, and both positive and negative trigger cases. Never disclose expected answers, suspected defects, intended fixes, or scoring rubrics to the test agent. Lifecycle scenarios must exercise re-entry from revision/gate evidence rather than asserting a fixed next-stage answer.

Finished test code embedded in a plan or brief is a claim, not ground truth: implementers are told to follow the brief, so a defect in a plan's tests ships into the codebase verbatim unless someone checks first. Before accepting an embedded test, verify all three: (1) it does what its name claims; (2) it would fail if the behavior under test were deleted — to check this, stub or revert the implementation under test, re-run that exact test, confirm it now fails, then restore the implementation; (3) it would not also pass against a default value or a stub. The review stage must flag a defective test even when the brief mandated it.

## ADK graph test harness

`google-adk` ships no fake model or test-runner helper, and no prior project in this org had built one. Recipe: subclass `BaseLlm` (its only abstract method is `generate_content_async`) into a `ScriptedLlm` holding `script` and `requests` lists, then drive it through `App` + `Runner` + `InMemorySessionService`. Lift this recipe rather than rediscovering it.

Non-obvious enabler: `build_node` calls `agent.clone()`, which is a shallow `model_copy`. The fake model instance is shared by reference, so a test can read back the requests it recorded after the run completes. A deep copy would break the whole pattern.

Structural blind spot: `ScriptedLlm` consumes `script` in order and cannot distinguish a first execution of a node from a re-execution of that same node. A fake-model script must include an "already done" conversational reply, not only the happy-path reply, because `ScriptedLlm` repeats its last script entry once its script is exhausted and has no other way to distinguish a re-run from a first run. "N tests pass" proves runtime mechanics, not model or prompt behavior; they are separate verification targets and need separate evidence.

## Required evidence

For each behavioral run, preserve sanitized files under the applicable `tests/skills/evidence/{codex,claude-code}/` run folder:

```text
environment.md
prompt.md
selected-skills.md
commands.log
artifact-tree.txt
validation.txt
result-summary.md
```

Record tool/version, model and fallback, commit, working directory, operating mode, selected references, exact commands, exit codes, bounded output, artifacts created, forbidden outcomes, residual uncertainty, and final pass/fail rationale. Write each field into the file below (confirmed against real run folders under `tests/skills/evidence/codex/`):

| Field | File |
| --- | --- |
| tool/version, model and fallback, commit, working directory, operating mode | `environment.md` |
| the exact delivered prompt | `prompt.md` |
| selected references | `selected-skills.md` |
| exact commands, exit codes, bounded output | `commands.log` |
| artifacts created (or an explicit "none created" statement) | `artifact-tree.txt` |
| forbidden-outcome checks and residual uncertainty | `validation.txt` |
| final pass/fail rationale | `result-summary.md` |

For Plan/handoff runs, also record confirmed Companion participation/lease, application/workspace/work/role scope, repository-tracked write inventory, canonical Plan-body hash and separate capsule/marker metadata, source and claimed session/turn IDs, first-prompt receipt, claim status, observed transport capability, and fallback path. Redact Bridge tokens and capsules. This repository has no example run folder exercising these fields, so their file placement is not independently confirmed; by analogy to the table above, put scope/participation fields in `environment.md` and claim/outcome fields in `result-summary.md`, and say so is an analogy, not a confirmed mapping, when reporting evidence.

For Asset Registry runs, record the query, progressive-disclosure level, Registry revision before/after, expected revision, match grade/evidence, exact Asset version/status, user decision provenance, and conflict result. The same caveat applies: no example run folder in this repository exercises these fields, so treat any file placement for them as unconfirmed until an example exists.

Do not store tokens, API keys, private endpoints, customer data, or full private terminal history. This is not hypothetical: in a recorded run a card demanded a scope value that no command exposes, and the model went to the operator's session transcript to get it. See `security-and-data.md`.

### Isolating a scenario run

`tests/skills/evidence/codex/` now holds worked examples of the seven-file layout — read one instead of inventing a shape.

Copying a scenario's inputs somewhere else does not isolate the run. With the agent rooted at the repository (`-C <repo root>`), everything under `templates/skill-scenarios/` stays readable, and a recorded run located and dumped the entire hidden evaluator set for its own scenario — `expected-skill.json`, `rubric.md`, `verification-commands.txt` — then re-ran the leaked verification commands as its own check. A grade produced that way is `unverified`, not `pass`, however good the output looks.

For a real isolation boundary, root the run somewhere the evaluator files do not exist. Until that is arranged, record in `selected-skills.md` whether the run read them, and grade accordingly.

Fixtures carry versions too. A `verification-commands.txt` that hard-pins an interpreter path or an exact `google-adk` version fails on a bumped baseline and reads as a product regression when it is a fixture regression. Pin what the assertion is actually about; if a version genuinely matters, assert a floor rather than equality.

## Artifact implications

- Scenario fixtures must contain `prompt.md`, `context/`, `expected-skill.json`, `expected-artifacts.md`, `forbidden-outcomes.md`, `verification-commands.txt`, and `rubric.md` — the "never disclose expected answers ... to the test agent" rule above and the "leaked expectations" Stop condition below both depend on these files existing to be withheld and later checked against.
- Evaluate structure and behavior, not exact prose goldens.
- Keep baseline and post-change evidence separate.
- Ensure test artifacts cannot leak expected outcomes into later fresh runs.
- Treat a skipped or unavailable check as unverified, not passing.
- Generate Work Item/revision fixtures from schema-version-2 fields. Never backfill old stage state, legacy gates, or a read-only Asset surface in a test fixture.

## Scaffold implications

For generated Runtime Handoff, select checks by output and pattern:

- parse/schema and artifact-root validation;
- generated file inventory and prohibited-output checks;
- compile/import checks when dependencies exist;
- pattern-specific success, invalid input, timeout, unavailable dependency, retry, duplicate side effect, resume, or commit-timing scenarios;
- synthetic-only runtime smoke;
- no production deployment claim.

## Verification

Run the exact checks applicable to the change:

```bash
git diff --check
node scripts/validate-artifacts.mjs <artifact-root-or-proposed-dir>
```

If `scripts/validate-skills.mjs` exists in the completed vNext tree, run it rather than reimplementing its checks manually. For code-facing web changes, run `cd packages/web && npm run build`.

Minimum behavioral coverage per canonical skill is two should-trigger and two should-not-trigger cases in each supported coding agent, at least one compound scenario, at least one Stop Condition, artifact validation, and evidence that references load only when needed.

A gate or spike must exercise the real topology, not just the API surface. "This API works" and "this works in the shape we are going to build" are different claims, and a gate must assert the second: a spike whose graph is just the API call with no successors can pass while the real graph — where a paused node has downstream nodes that run anyway — fails. Build the spike graph as a minimal representative subgraph of the actual design: at minimum a node downstream of a pausing node, a fan-out/join, and a conditional branch. A fail-loud guard (raise when required upstream state is absent) is what tends to surface a topology gap like this; a node that silently returned empty results would hide it indefinitely.

The re-entrant lifecycle suite must additionally cover:

- Discover Phase A is non-mutating: test that any attempted Phase A write leaves `git status --short` empty and `af-work-item.json` unchanged;
- exploration precedes user questions and a required decision never defaults;
- Read `decision-input-adapter.md` before executing this item: structured and conversational input ask exactly one question per turn and normalize to the same Decision Record semantics (open → null selection/provenance; resolved → a selected option plus `selected_by: "user"`, decision/recommendation revision, and session/turn);
- Read `decision-input-adapter.md` before executing this item: explicit "use the recommendation" records user provenance only for the displayed matching decision/recommendation revision, and the record must stay unresolved (test must confirm this) for hard, credential, deployment, security, and irreversible gates;
- Read `fresh-context-handoff.md` before executing this item: Plan marker (`handoff_id` + `marker_digest` + `plan_body_hash`) → fresh session → exact same Work Item claim succeeds only on an exact match; separately test missing marker, mismatched hash, ambiguous candidates, expiry, resumed-session claim, and duplicate-claim rejection;
- Read `companion-session-participation.md` and `session-and-work-item-provenance.md` before executing this item: ordinary, stale, expired, revoked, wrong-role, and scope-mismatched sessions must not be added to `active_runs` or have their evidence auto-imported into `validation-report.md`;
- Read `work-item-and-external-codex.md` (Work Item contract) before executing this item: `focus_skill` (the user's current surface, nullable) and concurrent `active_runs` (the current actor set) must each update independently, with no single fixed-stage counter substituting for either;
- Read `work-item-and-external-codex.md` (Revisions and cycles) and `lifecycle-invariants.md` (Return ownership) before executing this item: Compose `return_to_discover` records triggering revision, missing capability, failed Asset refs, contract delta, Graph impact, and search criteria; the prior discovery cycle is marked `superseded` only after being preserved; downstream gates go stale; a new approval is required; and the old Graph is never auto-merged on Compose re-entry;
- Read `lifecycle-invariants.md` (Return ownership table) before executing this item: failure ownership routes Asset/requirement, composition, scaffold, and verification defects to the matching one of the four canonical skills per that table;
- Read `catalog-and-reuse.md` before executing this item: Registry disclosure loads L0 (`asset search`) first, then L1 (`asset get <id>@<version> --level 1`) for bounded candidates, then L2 (`asset get <id>@<version> --level 2`) only for final comparison; test exact/compatible/partial/none match grades, every disposition value, a deprecated-version warning, incompatible-I/O rejection, and confirm the whole Registry is never loaded into one prompt;
- Read `catalog-and-reuse.md` before executing this item: draft/update/review/publish/deprecate transitions, immutable published versions, a stale `--expected-revision` conflict, and identical behavior from Web and CLI callers of the same Asset Registry service;
- decision, Asset version, root executable, and current discovery/composition revisions survive Scaffold and Verify without being reset or silently replaced.

## Stop conditions

Stop before claiming completion when any required command was not run, evidence is stale or from a different commit/revision, a test agent saw leaked expectations, a failure is hidden by run completion, Plan Phase A wrote tracked state, a handoff was inferred without an exact claim, a Registry mutation bypassed optimistic revision, a write escaped the scenario boundary, a plan-embedded test was accepted uncritically because the brief mandated it, or residual uncertainty is omitted.

## Official sources checked

- Plan-driven lifecycle work order §§5-13 and 15-20
- Codex skill-creator guidance recorded in [r2-official-sources.md](../../../tests/skills/evidence/research/r2-official-sources.md)
- [Operating Model verification and rollback ownership](../../../docs/workbench/operating-model.md#10-verification-and-rollback-ownership)

## Checked date

- Checked date: 2026-07-31
- Official sources: Codex skill-creator, Agent Skills guidance, and Agent Factory Operating Model
- Installed package version: `google-adk 2.4.0`
- Current contract note: re-entrant Work Item schema version 2 and the Asset Registry CLI/service replace legacy stage and read-only Catalog assumptions. ADK graph runtime testing lessons (fake-model harness recipe, plan-embedded test defects, spike topology gaps, scripted-model re-execution blind spot) folded in from a live ADK 2.3.0 build. The re-entrant lifecycle checklist now carries inline "Read `<file>`" pointers so it is executable without other cards loaded; the required-evidence field list now maps to exact evidence files (confirmed against a real `tests/skills/evidence/codex/` run folder, with Plan/handoff and Asset-Registry field placement flagged as unconfirmed analogy); mandatory checklists changed `should`→`must`; and incident narratives were trimmed to their surviving rules. The Codex Plan Mode precondition/Stop condition and the "record confirmed collaboration mode" evidence field have been removed: Codex's plan-vs-default collaboration mode is not verified or recorded anywhere in this lifecycle, and the required lifecycle test now covers only Phase A's non-mutating behavior.
- 2026-07-31: the seven-file evidence layout now has worked examples under `tests/skills/evidence/codex/`, closing the previously unconfirmed field placement. Added the isolation lesson — with the agent rooted at the repository, a run read its own hidden evaluator files and re-ran the leaked verification commands, so that grade is `unverified` — and the rule that fixtures pinning an exact `google-adk` version fail as fixture regressions on a baseline bump.
