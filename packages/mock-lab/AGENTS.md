# Mock Lab Package

## Scope

`packages/mock-lab` is the standalone development package for local MCP test
doubles. It serves Tool assets only and runs independently at
`http://127.0.0.1:5176/`. Agent Factory Companion does not embed or proxy its UI.

Tool and MCP meanings are canonical in [Taxonomy](../../docs/workbench/taxonomy.md)
and [Graph IR](../../docs/workbench/graph-ir.md).

## Structure

- `src`: standalone React app for editing, saving, running, and smoke testing `MockSpec`.
- `server/catalogPrefillLoader.ts`: read-only Asset Registry snapshot prefill adapter.
- `server`: saved-spec runtime, draft generation, API handlers, MCP bridge, and persistence helpers.
- `schemas`: `MockSpec` schema.
- `scripts`: package-local TS loader and validator helpers.
- `public`: static assets for the standalone app.

## Local Rules

- `catalog/asset-registry.json` is the only read-only prefill input; use the shared Registry core for parsing and validation.
- Prefill projects only the latest published Tool version with an MCP binding, stdio transport, and mock-ready contract or non-empty `runtime_mock`.
- Prefill source metadata must preserve the Registry file, `asset_id`, and exact asset version. It never changes the Registry.
- Canonical specs live under ignored `artifacts/mock-lab/<mock-id>/mock-spec.json`.
- Codex draft specs stay under `drafts/<draft-id>/draft-spec.json` until explicitly loaded.
- Server start uses the saved `mock-spec.json`; it should not require generated project files.
- Mock responses must stay synthetic and local-only.
- A2A belongs to an Agent protocol boundary and is outside Mock Lab's Tool-only scope.

## Anti-Patterns

- Do not add non-Tool asset categories or A2A mock servers.
- Do not add alternate Catalog inputs, local Registry parsers, or duplicate Registry validation.
- Do not store credentials, private endpoints, deployment scripts, or production business logic in mock specs.
- Do not make Mock Lab edit the Asset Registry.
- Do not treat `packages/mock-lab/DESIGN.md` as active implementation policy; prefer README, package scripts, server/source, and active docs.

## Verification

```bash
cd packages/mock-lab
npm run test
npm run build
```

Standalone development and browser testing use fixed port 5176. The Companion
on 5173 owns Registry lifecycle operations but does not mount Mock Lab routes or
APIs. Mock Lab itself remains a read-only Registry consumer.
