# Agent Factory Context MCP

This package is the production stdio entrypoint for project-scoped, read-mostly
Agent Factory context in an external application repository. It does not expose
canonical Work Item mutation, infer Codex session or turn identity, select a
handoff, or replace Companion Continue.

Pack the production source into the application project, install that local
artifact, then export current context and the project-local Codex configuration:

```bash
mkdir -p <application-project-root>/vendor

cd packages/agent-factory-context-mcp
npm pack --pack-destination <application-project-root>/vendor

cd <application-project-root>
npm install --save-dev ./vendor/agent-factory-context-mcp-0.1.0.tgz

cd <agent-factory-repository-root>
node scripts/af.mjs mcp export-context <work-id-or-path> \
  --application <application-id> \
  --application-root <application-project-root>
```

The export writes only `.agent-factory/af-context.json` and
`.codex/config.toml` in the named application root. It refuses to replace a
different existing Codex configuration. The generated config launches the
project-local package over stdio through offline `npm exec`; it does not install
from the network at startup. The server finds the exact context/config pair
from the project root or a descendant and exposes exactly four read-only Tools:

- `af_get_context`
- `af_get_pending_work`
- `af_get_asset_or_handbook_context`
- `af_validate_decision_value`

Codex ignores project `.codex` configuration until the workspace is trusted.
MCP approval persistence is a user choice. CLI on WSL and VS Code Remote-WSL
share the project configuration; Native Windows is unsupported.

If startup or current evidence fails, stop as `UNVERIFIED`, fix trust/setup or
refresh the export, and retry. If the model omits a required Tool, name the Tool
and its purpose once and retry once. Canonical lifecycle work remains with the
Agent Factory Work Skills and direct artifact inspection; Fresh Context remains
Companion Continue.
