# Web Companion Package

## Scope

`packages/web` is the React/Vite live companion for Agent Factory work executed by external Codex CLI or VS Code sessions. It projects strict Target v2 Work Items, artifacts, Git changes, Hook activity, and editor handoff. It may create one unchanged empty v2 ledger through guarded bootstrap; Graph IR and Asset Registry remain its shared canonical edit surfaces.

Asset meanings come from [Taxonomy](../../docs/workbench/taxonomy.md), Graph semantics from [Graph IR](../../docs/workbench/graph-ir.md), and ownership from [Operating Model](../../docs/workbench/operating-model.md).

## Structure

- `src/routes`: home, four Work Skill screens, Connections, and Asset Registry operations.
- `src/layout`: live workspace shell, Work Skill rail, and live activity/Git rail.
- `src/workspace`: projection API types and query/SSE hooks.
- `src/state`: query client, Asset Registry, and Codex session hooks.
- `src/analyzer`: strict Target v2 types, Work Item parser, Graph validation, and scaffold contracts.
- `src/components`: Graph canvas/editor/inspector and shared badges.
- `src/styles`: tokens, primitives, category visuals, Graph feature CSS, and the live route layout.
- `server`: workspace projection, Work Item/Graph API, Asset Registry API, Codex bridge/facade, and VS Code launcher.

## Local rules

- `artifacts/af/<work-id>/af-work-item.json` is the lifecycle ledger; never persist lifecycle truth in browser storage.
- Root Work Item POST is create-only: require loopback, same-origin, JSON ≤4 KiB, explicit path/action confirmation, server-derived contained application root, and all collision checks before writes. Never add application/path binding fields to the ledger.
- Store bootstrap application/path bindings only in ignored mode-`0600` `.agent-factory/applications/registry.json`; this local register is noncanonical and is not enrollment or workspace-eligibility authority.
- The web app does not run Work Skills, change Work Item review gates, generate source, execute runtime behavior, stage, or commit.
- Graph PUT requires loopback, same-origin, current ETag, approved discovery, strict validation, and an explicit active target session.
- Synchronize `analysis-result.json.graph` and `graph-ir.json`, then invalidate composition and downstream evidence.
- Asset Registry mutations require loopback, same-origin, exact `If-Match`, strict contract validation, atomic replacement, and explicit user decision evidence for review, publish, or deprecate transitions.
- Published Registry versions are immutable. Agent, Workflow, and Tool remain the only asset types.
- Keep Hook activity metadata-only; do not persist prompts, transcripts, tool arguments, or outputs.
- VS Code paths must be canonical, repository-contained, and server-derived.
- Do not restore `/api/af`, stage routes, proposal/apply, legacy manifests, or server-owned lifecycle execution.

## When editing

- Read [Design System](../../docs/visualization/design-system.md) before visible changes.
- Keep strict shapes aligned across TypeScript, schemas, validators, templates, tests, and docs.
- Re-read canonical files immediately before a Graph save; do not overwrite concurrent external edits.
- Use fixed port `8890` and verify the exact workspace identity before reusing a server.

## Verification

Before running `npm run test:contracts` or `npm run test:all` for the first time
in a new worktree, verify that the ADK test interpreter exists and matches the
tested runtime baseline:

```bash
test -x .agent-factory/runtime/.venv/bin/python
.agent-factory/runtime/.venv/bin/python -c 'from importlib.metadata import version; assert version("google-adk") == "2.3.0"'
```

Run this preflight from the repository root. If the worktree-local interpreter
is absent, prepare the ignored worktree-local runtime before starting the test
suite, or set `AF_TEST_PYTHON` to an explicitly verified `google-adk==2.3.0`
interpreter for that command. Do not copy a virtual environment from another
checkout; its scripts may contain absolute paths to the source checkout. Runtime
preparation must not modify tracked files.

```bash
cd packages/web
npm run test:contracts
npm run test:companion
npm run build
```

Visible changes require browser verification and a screenshot at `http://127.0.0.1:8890/`.
