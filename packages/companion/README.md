# Companion Graph collaboration workspace

This is the primary Companion development and acceptance workspace. It
implements bidirectional Graph collaboration between the Companion Web editor
and an external Codex CLI or VS Code extension.

The existing `packages/web` Work Item lifecycle workbench remains a
legacy/reference surface during migration. This package does not import it and
does not claim that its routes have already been replaced.

```text
Web / MCP / validated file import -> Graph Control Server -> Graph + Context v2
```

Packages are `graph-domain`, `contracts`, `graph-control-server`, `mcp-plane`,
`web`, and the independent `app-server-client`. See [ARCHITECTURE.md](ARCHITECTURE.md)
for ownership and failure behavior.

## Run

```bash
npm install
npm run dev
```

The launcher uses Web `8890`, Graph Control `8894`, and a managed App root at
`~/work/af-companion-apps` by default. Set `COMPANION_APPLICATIONS_ROOT` to use
another dedicated managed root. The browser never accepts an arbitrary path.

Create or select one active App in `http://127.0.0.1:8890/`. A new App gets its
own Git repository, Companion manifest, exact Asset binding document, minimal
`Input -> Output` Graph, development lock, empty implementation mapping, and
project-local Codex MCP config. It does not create a Work Item or ADK source
scaffold.

Creation also makes exactly one local baseline commit on `main` with the
message `chore: initialize Companion app workspace`. That commit contains only
`.gitignore`, the App manifest, Asset binding document, Graph, development lock,
and empty implementation mapping. The project-local Codex config and Companion
runtime state remain ignored. The App Manager creates no remote, never pushes,
and makes no later commits; subsequent Graph, Asset, mapping, and runtime-source
history belongs to the user or Codex operating inside that App repository.

After selecting a Node, Edge, or Region, `Codex 개발 작업 만들기` can create or
attach one contained ADK source project, review a deterministic bounded context
capsule, copy its exact prompt, and open the server-derived source cwd. Launch is
a request receipt only; source completion and quality require separate tests,
runtime evidence, implementation mapping, and a user/Codex-owned local commit.

The active App Graph is
`~/work/af-companion-apps/<app-id>/.agent-factory/companion-graph.json`.
Direct editing is supported only as a validated recovery/import path; normal
edits should use Web or MCP operations.

Published Agent, Workflow, and Tool Assets are searched from the canonical
`catalog/asset-registry.json`. Adding one records its exact version and contract
hash in the active App before a typed Graph Node can reference it.

The `Assets` workspace manages the same canonical Registry through the shared
Registry core. It can create and update drafts, record user review decisions,
publish immutable versions, and deprecate published versions. The App Manager
does not gain Registry write authority; it continues to consume published
bindings only. CLI automation remains available through `scripts/af.mjs asset`.

For destructive/manual lifecycle acceptance, point only the server at a copied
fixture with `COMPANION_REGISTRY_PATH=/absolute/path/asset-registry.json`. The
browser cannot provide or change this path. The default remains the repository
`catalog/asset-registry.json`.

## Verify

```bash
npm run typecheck
npm run test
npm run build
```

Then complete [USER-ACCEPTANCE.md](USER-ACCEPTANCE.md). The product direction is
to use this workspace for new Companion work; existing Agent Factory routes
stay available until migration acceptance and a separate removal decision.
