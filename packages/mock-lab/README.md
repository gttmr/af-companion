# Agent Factory Mock Lab

Mock Lab defines, saves, runs, and tests synthetic MCP stdio mock servers from `MockSpec` files. It is a standalone development app at `http://127.0.0.1:8891/`; Agent Factory Companion does not embed or proxy its UI.

These mocks are local MCP test doubles for Tool assets defined by [Taxonomy](../../docs/workbench/taxonomy.md). Catalog prefill is selected with the `tool` query key.

Running mocks are also re-exposed by the standalone package over network MCP (Streamable HTTP) at `/api/mock-lab/mcp/<key>`, with discovery at `/api/mock-lab/mcp-discovery`, so a generated runnable ADK bundle's Tool connection can call them live. See `docs/mock-lab/local-mcp-mock-lab.md`.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:8891/` for the standalone development app. The Companion on port 8890 exposes no Mock Lab route or API.

## Guardrails

- `catalog/asset-registry.json` is the only read-only prefill input. The shared Registry core validates the snapshot, and missing or malformed Registry data fails closed.
- Prefill includes only the latest published Tool version whose binding is MCP over stdio and whose contract is `mock_ready` or has a non-empty `runtime_mock`; Agent, Workflow, and A2A assets are excluded.
- Prefilled `MockSpec.source` records the Registry file, asset ID, and exact asset version while preserving all synthetic-only safety guardrails.
- Canonical specs are saved at `artifacts/mock-lab/<mock-id>/mock-spec.json`.
- Codex draft output is stored separately at `artifacts/mock-lab/<mock-id>/drafts/<draft-id>/draft-spec.json` and must be explicitly loaded into the editor before saving.
- Server start uses the saved `mock-spec.json`; it does not require generated project files.
- Mock responses must stay synthetic and local-only.
- No credentials, private endpoints, deployment scripts, or production business logic.

## Verification

```bash
npm run test
npm run build
node scripts/validate-mock-spec.mjs ../../artifacts/mock-lab/<mock-id>/mock-spec.json
```

`npm run test` starts local saved-spec stdio runtime processes, so it needs an execution environment that allows child process spawning.
