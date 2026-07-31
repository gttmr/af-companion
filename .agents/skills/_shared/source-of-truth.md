# Source of Truth

## Purpose

Use a single evidence hierarchy when Agent Factory Target concepts, current product contracts, ADK documentation, and installed runtime behavior differ. Keep every conclusion labeled as Target Contract, Current Implementation, or Blocker.

## When to read

Read this reference before any other shared reference when a task:

- writes or reviews Agent Factory artifacts;
- selects an ADK runtime pattern;
- finds disagreement between docs, schemas, validators, generated code, or installed APIs;
- must decide whether an observation is a product gap or a skill-authoring error.

## Decision criteria

Use this order, scoped to the question being answered:

1. Active Agent Factory vNext decisions and approved work orders own Target concepts and operating rules.
2. Current repository source, schema, validator, CLI, and tests own Current Implementation behavior.
3. Official ADK documentation owns documented framework semantics.
4. Installed `google-adk` source and execution own version-specific availability and signatures.
5. Local Google Agents CLI skills (globally installed `google-agents-cli-*`) are structural and workflow examples, not Agent Factory authority. **Keep this rule stated explicitly — it is the only thing that resolves the collision.** Both skill families are visible in the same turn: the globally installed Google set and this repository's `af-*` set, and both claim to be the always-active development lifecycle. Measured: a strong model read both, then cited *this line* as its reason for following the `af-*` lifecycle over `agents-cli scaffold create`. Nothing in the runtime ranks repository skills above global ones, so precedence here is established by text and by nothing else. Do not delete or soften this entry as redundant.

   Where the two disagree on framework fact rather than procedure, rules 3 and 4 still decide, and rule 4 outranks both skill sets. The Google skills are not a shortcut around checking installed source, and they carry known stale claims — for example that `output_schema` disables tool calling, which installed source contradicts.
6. Retired or pre-vNext Agent Factory skills are salvage sources only; the canonical five-skill tree is active procedure.
7. Archive and handoff material are historical evidence, never active authority.

## Writing a rule into a card

A false requirement is more dangerous than a false prohibition, and the asymmetry is measured, not assumed. In a controlled run, a card that *forbade* something the model knew worked was silently overridden in every condition; a card that *required* unnecessary ceremony was obeyed in every condition that loaded it — overriding both the model's correct prior and a correct counter-example sitting in the same context, with no report that the sources disagreed.

The reason is mechanical: a prohibition contradicts something the reader can test, so it gets tested. A requirement only costs extra work, so it gets performed.

Therefore, before writing `must`, `requires`, or `always` into a card:

- Confirm the constraint is imposed by the framework, not by the shape of the one implementation you happened to build. Cite the symbol that enforces it.
- If it is a project convention rather than a framework rule, say so in those words.
- State the narrowest condition under which it applies. An unscoped rule gets applied everywhere — the same measured run pulled an entire dynamic-dispatch apparatus into a task that asked for a minimal example.

Prefer "X works; use Y only when Z" over "you must use Y."

Do not use the order to force a false agreement. For this lifecycle, `schemas/af-work-item.schema.json` owns the accepted Work Item shape and `scripts/af.mjs` owns the supported CLI surface. If an active document still assumes a single global skill pointer, fixed one-way routing, Graph-only web writes, read-only Assets, or a command not dispatched by that script, label the document stale and follow current source.

## Required evidence

Record enough evidence for another coding agent to reproduce the decision:

- authority class: Target, Current, or Blocker;
- repository path and stable symbol or schema key for product behavior;
- current Work Item revision subjects and Asset Registry `registry_revision` when lifecycle or reuse depends on them;
- official URL and checked date for framework behavior;
- installed package version and import/signature probe for emitted Python;
- validator, build, test, or runtime command used;
- unresolved disagreement and its affected artifact or scaffold surface.

Do not present inference as verification. A handbook locator is a navigation aid; reopen its current source before relying on it.

## Artifact implications

- Standalone design notes outside validators may use Target vocabulary.
- Canonical analysis artifacts write only strict Target v2 fields from [target-contract-v2.md](target-contract-v2.md); the lifecycle ledger separately follows `schemas/af-work-item.schema.json` schema version 2.
- Reject pre-v2 artifact shapes; there is no read fallback or projection path.
- Record unrepresentable or ambiguous Target data as a Blocker; do not invent an enum or selector.
- Treat Graph IR and the versioned Asset Registry as the web workbench's two canonical write surfaces. Registry reads and writes go through the shared service; direct file mutation is not an alternate contract.
- Use `focus_skill`, `active_runs`, revision-bound gates, cycles, invalidations, and session handoffs exactly as the current Work Item schema defines them. Do not project a single stage counter.

## Scaffold implications

- Generate runtime code only from reviewed and approved artifacts.
- Treat the installed package as a hard availability gate for exact imports and signatures.
- Do not freehand unsupported APIs from official examples or memory.
- Keep generator expansion and runtime deployment outside a skill-only change unless separately authorized.

## Verification

For each material claim, verify the applicable layer:

```bash
node scripts/validate-artifacts.mjs <artifact-root-or-proposed-dir>
```

For Python surface claims, use `.agent-factory/runtime/.venv/bin/python` and inspect the installed source or `inspect.signature`. For documentation-only reference edits, run `git diff --check` and relative-link checks.

## Stop conditions

Stop and report a Blocker when:

- the repository, Work Item root, or artifact target is ambiguous;
- current source and schema disagree on a load-bearing field;
- an exact ADK symbol or signature was not verified in the installed package;
- a Target concept cannot be represented without loss in the strict v2 contract;
- approval, private data, credentials, or deployment authority would need to be invented.

## Official sources checked

- [Agent Factory Taxonomy](../../../docs/workbench/taxonomy.md)
- [Agent Factory Graph IR](../../../docs/workbench/graph-ir.md)
- [Agent Factory Operating Model](../../../docs/workbench/operating-model.md)
- Current Work Item schema: `schemas/af-work-item.schema.json`
- Current CLI dispatcher: `scripts/af.mjs`
- [Google ADK documentation](https://adk.dev/)
- Installed-package evidence: [r1-adk-package-check.md](../../../tests/skills/evidence/research/r1-adk-package-check.md)

## Checked date

- Checked date: 2026-07-31
- Official sources: Agent Factory active docs and `https://adk.dev/`
- Installed package version: `google-adk 2.4.0`
- Contract note: Canonical skills use strict Target Contract v2 artifacts and Work Item schema version 2 without legacy projection.
- 2026-07-31: made the Google-skills-are-not-authority entry load-bearing and explicit. Both skill families are visible in one turn and nothing in the runtime ranks them; a recorded run cited this exact line as its reason for following the `af-*` lifecycle. Added a card-authoring rule from the same experiment: a false requirement is obeyed while a false prohibition is fact-checked, so scope every `must` and cite the symbol that enforces it.
