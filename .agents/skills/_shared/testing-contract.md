# Testing Contract

## Contents

- [Purpose](#purpose)
- [When to read](#when-to-read)
- [Decision criteria](#decision-criteria)
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

Deterministic skill validation should check canonical directories, `SKILL.md`, frontmatter fields and limits, name-folder equality, UTF-8/BOM, relative links, missing/orphan/circular references, line budgets, forbidden active vocabulary, shim constraints, source URLs, and checked dates.

Behavioral evaluation should use fresh sessions, natural user prompts, the same commit and scenario context, and both positive and negative trigger cases. Never disclose expected answers, suspected defects, intended fixes, or scoring rubrics to the test agent. Lifecycle scenarios must exercise re-entry from revision/gate evidence rather than asserting a fixed next-stage answer.

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

Record tool/version, model and fallback, commit, working directory, operating mode, selected references, exact commands, exit codes, bounded output, artifacts created, forbidden outcomes, residual uncertainty, and final pass/fail rationale.

For Plan/handoff runs, also record confirmed collaboration mode, repository-tracked write inventory, Plan hash/marker metadata, source and claimed session/turn IDs, exact Work Item, first-prompt receipt, claim status, and fallback path. Redact Bridge tokens.

For Asset Registry runs, record the query, progressive-disclosure level, Registry revision before/after, expected revision, match grade/evidence, exact Asset version/status, user decision provenance, and conflict result.

Do not store tokens, API keys, private endpoints, customer data, or full private terminal history.

## Artifact implications

- Scenario fixtures should contain `prompt.md`, `context/`, `expected-skill.json`, `expected-artifacts.md`, `forbidden-outcomes.md`, `verification-commands.txt`, and `rubric.md`.
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

The re-entrant lifecycle suite must additionally cover:

- non-Plan Discover Phase A stops without repository/Work Item writes;
- exploration precedes user questions and a required decision never defaults;
- explicit “use the recommendation” records user provenance;
- Plan marker → fresh session → exact same Work Item claim, plus missing marker, mismatched hash, ambiguity, expiry, resume, and duplicate-claim rejection;
- `focus_skill` plus concurrent `active_runs` with no single-stage shortcut;
- Compose `return_to_discover`, superseded history, downstream staleness, new approval, Compose re-entry, and no automatic Graph merge;
- failure ownership routes Asset/requirement, composition, scaffold, and verification defects to the correct skill;
- Registry L0→L1→L2 disclosure, exact/compatible/partial/none, every disposition, deprecated warning, incompatible I/O rejection, and no whole-Registry prompt load;
- draft/update/review/publish/deprecate transitions, immutable published versions, stale `--expected-revision` conflict, and Web/CLI use of the same service;
- decision, Asset version, root executable, and current discovery/composition revisions survive Scaffold and Verify.

## Stop conditions

Stop before claiming completion when any required command was not run, evidence is stale or from a different commit/revision, a test agent saw leaked expectations, a failure is hidden by run completion, Plan Phase A wrote tracked state, a handoff was inferred without an exact claim, a Registry mutation bypassed optimistic revision, a write escaped the scenario boundary, or residual uncertainty is omitted.

## Official sources checked

- Plan-driven lifecycle work order §§5-13 and 15-20
- Codex skill-creator guidance recorded in [r2-official-sources.md](../../../tests/skills/evidence/research/r2-official-sources.md)
- [Operating Model verification and rollback ownership](../../../docs/workbench/operating-model.md#10-verification-and-rollback-ownership)

## Checked date

- Checked date: 2026-07-24
- Official sources: Codex skill-creator, Agent Skills guidance, and Agent Factory Operating Model
- Installed package version: `google-adk 2.3.0`
- Current contract note: re-entrant Work Item schema version 2 and the Asset Registry CLI/service replace legacy stage and read-only Catalog assumptions.
