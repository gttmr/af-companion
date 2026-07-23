# Output Modes and Handoff

## Purpose

Separate supported scaffold modes from Asset lifecycle state, and make the Runtime Handoff preserve exact decisions, revisions, bindings, and non-goals.

## When to read

Read when selecting an output mode and when writing `implementation-handoff.md`.

## Decision criteria

| Concept | Allowed content | Serialized mode |
| --- | --- | --- |
| Skeleton intent | file structure, interfaces, TODO boundaries | `smoke` with explicit TODO/non-goals |
| Smoke | synthetic mock, deterministic local smoke, explicit TODO | `smoke` |
| Runnable prototype | reviewed local ADK wiring and contract-backed mocks | `runnable` |
| Production | production integration or deployment | unsupported |

Only `smoke` and `runnable` are valid current output values. Output mode does not determine whether an Asset is project-local, Registry-backed, reviewed, or published.

## Asset lifecycle distinction

- Project-local output comes only from `create_project_draft` or the selected project Workflow Root using `compose_existing`; it uses version `1` and no Registry ref.
- `reuse_exact` references one exact published or explicitly accepted deprecated Registry version. Local executable Assets are imported; protocol-bound MCP/A2A Assets retain their reviewed binding.
- `reuse_new_version` and `create_publish_candidate` lower only an exact draft/reviewed Registry version. Their generated source is not a published Registry version.
- Publication is a separate user-reviewed Registry mutation. Scaffold never represents generated source as published merely because it is runnable.

## Required handoff record

Record in `implementation-handoff.md`:

- output mode and exact output roots;
- Work Item, discovery, Graph, Root Executable, runtime-contract, composition, Scaffold, and Registry revisions;
- current discovery/composition approval evidence;
- resolved Solution Control Strategy and Root Executable type/ref/version/decision ID;
- one row per Asset with user disposition, version, Registry/component ref, contract hash, source/protocol binding, generation action, and warning;
- generated `root_agent` symbol and its exact-object relationship to the Root Executable;
- generated file/manifest inventory;
- installed package versions and verified API surfaces;
- local mocks and synthetic fixtures;
- completed commands and exit codes;
- TODOs, manual completion boundary, unsupported features, and residual uncertainty;
- `raw_requirement_to_code=false`.

## Scaffold implications

Smoke does not claim implemented business behavior. Runnable covers only approved local wiring and synthetic scenarios. Neither mode includes production endpoints, credentials, deployment, real data, or Registry publication.

Do not hide a missing exact source ref, stale Registry snapshot, unsupported Graph lowering, or unresolved decision inside a TODO. Those are blockers before generation.

## Verification

- compare handoff revisions and bindings with the current Work Item and generated manifest;
- compare handoff inventory with the actual generated tree;
- confirm `root_agent` resolves to the exact selected Root Executable object;
- confirm `.env.example` contains variable names and placeholders only;
- scan for deploy files, secrets, private hosts, customer payloads, direct Registry/YAML mutations, legacy artifacts, and duplicate generated Assets.

## Stop conditions

Stop when a new output-mode literal is required, project and Registry identity are conflated, a published Asset would be mutated or regenerated, approval/source evidence is absent, a production-ready claim is requested, or handoff metadata hides an unverified dependency.

## Contract sources checked

- `schemas/scaffold-plan.schema.json`
- `schemas/af-work-item.schema.json`
- `scripts/adk-source/context.mjs`
- `scripts/adk-source/asset-bindings.mjs`
- `scripts/adk-source/support/manifest.mjs`

## Checked date

- Checked date: 2026-07-24
- Current Product note: `smoke` and `runnable` are the only serialized output modes; Registry lifecycle state is independent.
