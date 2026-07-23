# Web Catalog Projection

## Scope

This directory parses strict Agent, Workflow, and Tool seed Catalogs for the read-only Assets screen and scaffold contract helpers.

## Local rules

- Accept exactly `agents`, `workflows`, and `tools` buckets and matching `asset_type` values.
- Represent A2A only through Agent binding/exposure and MCP through Tool binding.
- The web app never writes or publishes Catalog entries.
- `catalog-delta.yaml` is external-Codex verification feedback; actual seed changes are a separate reviewed repository workflow.
- Do not restore pin, publish, proposal-editor, or Mock Lab UI behavior.

## Verification

```bash
cd packages/web
npm run test:companion
npm run build
```
