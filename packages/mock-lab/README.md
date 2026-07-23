# Agent Factory Mock Lab

Mock Lab defines, saves, runs, and tests synthetic MCP stdio mock servers from `MockSpec` files. It is a standalone development app at `http://127.0.0.1:5176/`; Agent Factory Companion does not embed or proxy its UI.

These mocks are local MCP test doubles for Tool assets defined by [Taxonomy](../../docs/workbench/taxonomy.md). Catalog prefill is selected with the `tool` query key.

Running mocks are also re-exposed by the standalone package over network MCP (Streamable HTTP) at `/api/mock-lab/mcp/<key>`, with discovery at `/api/mock-lab/mcp-discovery`, so a generated runnable ADK bundle's Tool connection can call them live. See `docs/mock-lab/local-mcp-mock-lab.md`.

## Run

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5176/` for the standalone development app. The Companion on port 5173 exposes no Mock Lab route or API.

## Guardrails

- `catalog/tools.yaml` is the only read-only Catalog prefill input. Missing or malformed Tool contracts fail closed.
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
