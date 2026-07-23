# Generated Output Checks

## Purpose

Prove that the generated Runtime Handoff preserves the current approved decisions, exact Asset bindings, and Root Executable, and that its local source passes claim-matched checks.

## When to read

Read immediately after generation and again before Verify handoff.

## Decision criteria

Always run structural, provenance, and prohibited-output checks. Run import/runtime tests only when the required dependencies are already available or the user authorized installation.

Do not install or upgrade packages over the network without user approval.

## Required evidence

- artifact root, output root, output mode, repository revision, and Work Item revision;
- approved discovery/composition gate bindings and current Graph, Root Executable, runtime-contract, composition, and Registry revisions;
- generated file inventory and `workflow_manifest.json`;
- exact Asset dispositions, versions, Registry/component refs, contract hashes, generation actions, source refs, and warnings;
- Python/runtime version and installed package versions;
- exact commands, cwd, exit codes, and bounded stdout/stderr;
- selected pattern success/failure scenarios;
- skipped checks and reasons;
- prohibited-output scan and residual uncertainty.

## Decision and binding preservation

Check the generated manifest and source together:

- `solution_control_strategy` equals the resolved user decision;
- `root_executable` ref/type/version/decision ID equals the current Work Item;
- generated `root_agent` is the exact `root_executable` object and has the selected Agent or Workflow runtime type;
- `asset_registry_revision` equals the snapshot bound to the current Work Item;
- every scaffold Asset has exactly one manifest binding and no exact Registry version appears twice;
- `reuse_exact` uses `reference_existing`; local source is imported from the reviewed `python:module#symbol`, while MCP/A2A uses its reviewed binding;
- `reuse_new_version` and `create_publish_candidate` remain draft/reviewed implementation actions and do not overwrite published source;
- `create_project_draft` remains local version `1` without a Registry ref;
- `compose_existing` is only the selected project Workflow Root and preserves every exact component as an included `reuse_exact` binding.

A generated class or stub for a `reuse_exact` local Asset is a failure even if compile succeeds.

## Structural and runtime checks

For the approved output root:

```bash
python3 -m compileall <output-root>
```

When dependencies exist:

```bash
cd <output-root>
python3 -m pytest -q
```

When the approved output is `<artifact-root>/runtime-stub`, the repository wrapper is:

```bash
node scripts/validate-generated-runtime.mjs <artifact-root>
```

For each selected pattern, run applicable success, invalid-input, unavailable-dependency, timeout, retry, duplicate-side-effect, resume, or commit-timing scenarios.

## Prohibited output review

Confirm:

- no generation outside authorized roots;
- no secret, credential, private endpoint, real customer data, deployment file, or organization-specific production logic;
- no direct Registry or `catalog/*.yaml` mutation;
- no legacy manifest, stage, proposal/apply, or compatibility output;
- no unselected runtime pattern, Asset, endpoint, dependency, or hook;
- handoff TODOs match every unverified dependency and unsupported boundary.

## Stop conditions

Stop on decision/revision drift, duplicate or regenerated exact Assets, Root symbol/type/identity mismatch, missing source/protocol binding, compile/import failure, failed generated test or required negative scenario, prohibited output, or a dependency absence recorded as passing.

## Official sources checked

- `schemas/af-work-item.schema.json`
- `scripts/generate-adk-source.mjs`
- `scripts/validate-generated-runtime.mjs`
- `scripts/adk-source/asset-bindings.mjs`
- `scripts/adk-source/support/manifest.mjs`
- `../../_shared/testing-contract.md`

## Checked date

- Checked date: 2026-07-24
- Evidence rule: no passing or runnable claim without fresh output from the current generated tree and current exact bindings.
