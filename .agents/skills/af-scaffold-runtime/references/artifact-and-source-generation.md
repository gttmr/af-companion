# Artifact and Source Generation

## Purpose

Define direct external-Codex generation from the current approved composition and exact Asset bindings without a server-run lifecycle.

## Preconditions

Require:

- a valid `af-work-item.json` and strict-v2 artifact root;
- current approved discovery and composition gates;
- a composition binding equal to current discovery, Graph, Root Executable, runtime-contract, and composition revisions;
- current decision, Asset-decision, and Root Executable revision subject hashes;
- no unresolved required `decisions[]` entry and exactly one resolved user `asset_decision` for every scaffold Asset;
- approved `analysis-result.json`, `graph-ir.json`, `boundary-design.md`, and `scaffold-plan.json` with `raw_requirement_to_code=false`;
- an explicit output mode and authorized output roots;
- a current Registry snapshot revision and exact Asset versions for Registry-backed dispositions;
- approved runtime/A2A contracts and installed-package evidence for emitted ADK APIs.

Validate the current Work Item and artifacts instead of accepting an older linear manifest:

```bash
node scripts/af.mjs work validate <work-id-or-path> --root <repo-root>
node scripts/validate-artifacts.mjs <artifact-root>
```

## Revision and gate checks

Before generation, prove all of the following:

- the discovery gate binds current requirement, decision, Asset-decision, discovery, and Catalog-snapshot revisions;
- the composition gate binds current discovery, Graph, Root Executable, runtime-contract, and composition revisions;
- the composition `artifact_etag` is the SHA-256 of current `analysis-result.json` bytes;
- current decision, Asset-decision, and Root Executable revision subjects hash to their current JSON values;
- no active invalidation targets Scaffold or any required input;
- the Registry revision on current Work Item revisions equals the loaded Registry snapshot revision.

A stale or pending gate is not approval. Route Asset/search/version drift to Discover and Graph/root/runtime-contract drift to Compose.

## Binding actions

| Disposition | Required exact state | Scaffold action |
| --- | --- | --- |
| `reuse_exact` | one exact `published` or explicitly accepted `deprecated` Registry version | `reference_existing`; import exactly one reviewed local `python:module#symbol`, or connect a reviewed MCP/A2A protocol binding |
| `reuse_new_version` | exact `draft` or `reviewed` Registry version with a prior version | `implement_registry_version`; never mutate the prior or published version |
| `create_publish_candidate` | exact `draft` or `reviewed` Registry version | `implement_publish_candidate`; publication remains a separate reviewed mutation |
| `create_project_draft` | project-local version `1`, no Registry ref | `implement_project_draft` |
| `compose_existing` | selected project Workflow Root, version `1`, no Registry ref | `compose_references` from at least two exact component refs, each included as `reuse_exact` |

`defer` and `exclude` are not generation dispositions. Fail closed when a local exact reusable Asset has no executable source ref. Do not replace it with generated source. Reject a Registry version bound through more than one scaffold Asset.

## Generation sequence

1. Re-read the Work Item, current composition artifacts, Registry snapshot, and source Git state.
2. Validate current gate/revision bindings and all required user decisions.
3. Resolve each scaffold Asset to one exact binding action and confirm Root ref/type/version consistency.
4. Confirm generator support for every selected Graph/runtime pattern and exact installed ADK symbol.
5. Mark the Scaffold run active in `active_runs` with the current input revision.
6. Run the deterministic generator with both roots explicit:

```bash
node scripts/generate-adk-source.mjs <artifact-root> <output-root>
```

7. Make only the smallest approved source edits needed for contract-backed handoff seams; never infer new behavior from raw requirement prose.
8. Write or refresh `implementation-handoff.md`.
9. Validate generated source, imports, manifest bindings, and agreed smoke/negative scenarios.
10. Record output refs, output roots, current Scaffold revision, and completion evidence in the Work Item.

The generator loads `catalog/asset-registry.json` by default. Do not substitute direct YAML reads or a hand-built Catalog projection.

## Generated manifest contract

Inspect `<generated-package>/workflow_manifest.json` for:

- `solution_control_strategy`;
- `root_executable.asset_type`, `asset_ref`, `asset_version`, `decision_id`, and `generated_symbol: "root_agent"`;
- `asset_registry_revision` equal to the snapshot used for generation;
- one `asset_bindings[]` row per scaffold Asset, preserving disposition, decision ID, exact Registry/component ref, contract hash, source ref, generation action, and warnings.

The generated package must export `root_agent` as the exact selected Root Executable object. A matching manifest row without runtime identity/import evidence is insufficient.

## Write boundary

Canonical artifacts remain under the Work Item root. Source writes are limited to output roots explicitly recorded in `scaffold-plan.json` and `af-work-item.json`. Do not call a workbench generation endpoint, create proposal/apply artifacts, mutate the Registry, or write Catalog YAML.

## Verification

```bash
node scripts/validate-artifacts.mjs <artifact-root>
node scripts/generate-adk-source.mjs <artifact-root> <output-root>
node scripts/validate-generated-runtime.mjs <artifact-root>
git diff --check
```

`validate-generated-runtime.mjs` checks generated tests under `<artifact-root>/runtime-stub`; use it only when that is the approved output root. For another explicit output root, run the compile/import/tests emitted by the generator from that output root and record the exact command.

## Stop conditions

Stop when a gate/revision/Registry snapshot is stale, a required decision is open, an exact Asset version or source/protocol binding is missing, duplicate generation would occur, output roots are ambiguous, generator lowering is unsupported, source ownership conflicts, or generation/validation fails.

## Checked date

- Checked date: 2026-07-24
- Contract sources: `schemas/af-work-item.schema.json`, `scripts/af.mjs`, `scripts/generate-adk-source.mjs`, and `scripts/adk-source/`
