# Asset Registry

## Scope

`catalog` contains the canonical versioned Asset Registry plus supporting domain
owner and risk-gate reference data. The Registry stores only reusable Agent,
Workflow, and Tool contracts.

Asset meanings are canonical in [Taxonomy](../docs/workbench/taxonomy.md).

## Structure

- `asset-registry.json`: strict Registry schema version 1 with immutable published versions and lifecycle decision evidence.
- `domain-owners.yaml`: ownership hints.
- `risk-gates.yaml`: risk signals used by candidates and review.

## Local Rules

- Web and `scripts/af.mjs asset ...` must use `packages/agent-factory-core/src/assetRegistry.ts`; do not add a second parser or writer.
- Every record must use strict fields such as `asset_id`, exact `version`, `status`, `contract_hash`, lifecycle decisions, `asset_type`, I/O, `domain_scope`, `owner`, `reuse_status`, binding, and connection.
- Seed entries are runtime-oriented contracts, not production integrations.
- `runtime_mock` payloads must be deterministic synthetic local smoke data.
- Draft writes require the exact Registry revision; review, publish, and deprecate require explicit user decision evidence. Published contract bytes are immutable.
- Keep fields aligned with the shared Registry core, CLI, API, generator bindings, Mock Lab prefill, and UI.
- Risk signals should line up with `risk-gates.yaml`.

## Anti-Patterns

- Do not restore YAML asset buckets, `catalog-delta.yaml`, or direct file-edit publication.
- Do not create another Registry asset type or project one asset type into another.
- Do not treat A2A as a Registry category; it is an Agent protocol boundary.
- Do not add private endpoints, credentials, deployment scripts, real customer data, or organization-specific business logic.
- Do not repurpose Catalog entries as reviewer approval records; approval lives in artifact roots.

## Verification

```bash
node scripts/af-cli.test.mjs
node scripts/validate-artifacts.mjs
cd packages/web && npm run test:contracts && npm run test:companion
```
