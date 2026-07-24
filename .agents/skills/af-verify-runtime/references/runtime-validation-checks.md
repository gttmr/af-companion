# Runtime Validation Checks

## Purpose

Select deterministic checks for the exact generated Runtime Handoff, Root Executable, Asset bindings, and approved runtime patterns.

## When to read

Read only when an explicit generated output exists and Level 3-5 runtime claims are in scope.

## Preconditions

Before runtime execution, prove that the tested tree belongs to the current Work Item/Scaffold revision, its manifest uses the current Registry revision, and all required decisions/gates remain current. A stale tree is not a runtime failure; classify it as stale and route it before testing behavior.

## Root and binding checks

Import the generated package and verify:

- `root_agent is root_executable`;
- the object is the selected Agent or Workflow runtime type;
- Root ref/type/version/decision ID and Solution Control Strategy match the Work Item and manifest;
- every exact Asset binding is present once;
- local `reuse_exact` Agent/Workflow/Tool objects are identical to the reviewed imported `python:module#symbol` object/callable;
- MCP Tool and Remote A2A Agent bindings expose only the reviewed exact contract surface;
- no replacement class, LLM Agent, stub, duplicate Tool, or duplicate Registry-version binding was generated;
- `compose_existing` uses exact included component objects/bindings under the selected project Workflow Root.

## Base commands

For an explicit runtime output root:

```bash
python3 -m compileall <runtime-output-root>
```

When dependencies already exist:

```bash
cd <runtime-output-root>
python3 -m pytest -q
```

For the repository-standard `<artifact-root>/runtime-stub` output:

```bash
node scripts/validate-generated-runtime.mjs <artifact-root>
```

Do not install from the network without user approval.

## Pattern scenarios

| Pattern | Required checks |
| --- | --- |
| Function/MCP Tool | exact Tool ref/name/filter, schema, invalid input, timeout, unavailable server, cleanup |
| A2A | exact Agent ref/version/binding or exposure, discovery, task lifecycle, auth failure, timeout, fallback boundary |
| Callback/Plugin | baseline, Continue, Override, order, exception, duplicate side effect |
| Event Loop | yield, final commit, partial no-commit, failure before commit, resume |
| Ambient | normalization, malformed event, duplicate, retry/DLQ, concurrency, output sink |
| Human Input | pause, stable ID, valid/invalid response, duplicate, expiry/replay, at-most-once side effect |
| State/Artifact | scope, commit, version, missing value, producer conflict |

## Required evidence

For each scenario, record input, deterministic invariant, actual output, exact command/cwd/environment, exit code, tested Work Item/Registry/Git revisions, and residual uncertainty.

Trace every selected scenario to the approved Graph/runtime/A2A contract and exact Asset binding. Do not create source to test an unselected pattern.

Behavior quality is a separate evaluation. Do not use exact natural-language output as the only golden.

## Stop conditions

Stop when output is absent/stale, manifest and Work Item disagree, Root identity/type fails, an exact source/protocol binding is unprovable, dependencies are absent but passing is requested, fixtures drift from the approved contract, a required negative scenario fails, or production access would be required.

## Official sources checked

- `scripts/validate-generated-runtime.mjs`
- `scripts/adk-source/asset-bindings.mjs`
- `scripts/adk-source/root-executable.mjs`
- `scripts/adk-source/support/manifest.mjs`
- `../../_shared/runtime-pattern-selection.md`
- `../../_shared/testing-contract.md`

## Checked date

- Checked date: 2026-07-24
- Runtime evidence is local and synthetic unless separately authorized production evidence exists.
