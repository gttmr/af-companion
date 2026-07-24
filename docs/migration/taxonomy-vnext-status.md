# Target Contract v2 Status

Checked 2026-07-24.

## Current

- `contract_version: "2.0"` is the only accepted analysis/scaffold contract.
- Agent, Workflow, and Tool are the only top-level asset types.
- Graph IR uses the canonical eight Node kinds, typed asset refs, `control`, optional `channel`, and `parallel`/`loop` regions.
- Tool Invocation Control is Workflow or Agent.
- A2A is an Agent binding/exposure, not a Catalog bucket or asset type.
- Asset Registry storage is strict `catalog/asset-registry.json`; Web and CLI share one parser/service and no YAML bucket compatibility remains.
- Generator and validators consume Target fields directly; compatibility projection is absent.
- Lifecycle state is re-entrant `af-work-item.json` v2; the previous stage manifest and v1 Work Item are rejected.

## Intentionally unsupported

- retired module/process artifact names and fields;
- Adapter or Remote A2A asset categories;
- alternate Graph envelopes or invocation owners;
- legacy lifecycle manifests, run/proposal/apply directories, and `/api/af`;
- automatic repair, coercion, or backfill of invalid inputs.

Runtime pattern documentation does not imply that every pattern has runnable generator lowering. Unsupported lowering remains a concrete Scaffold blocker and must be verified against the installed ADK version.

Canonical definitions remain in [Taxonomy](../workbench/taxonomy.md), [Graph IR](../workbench/graph-ir.md), and [Operating Model](../workbench/operating-model.md).
