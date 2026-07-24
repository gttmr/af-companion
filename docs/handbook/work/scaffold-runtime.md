# Scaffold Projection

`ScaffoldWorkspace` groups Work Item files into generated source and handoff views, previews bounded text files, and filters the workspace Git projection to scaffold-related changes. It does not generate, edit, stage, or commit; file and diff actions delegate to contained VS Code open operations.

Canonical source generation belongs to external `af-scaffold-runtime` and `scripts/generate-adk-source.mjs`. The generator rechecks current approved gate bindings, required user decisions, explicit Solution Control Strategy and Root Executable, exact Registry revision/Asset versions, project-only bindings, source refs, duplicate bindings, and output roots before lowering. `workflow_manifest.json` preserves exact binding and generation actions.

Source:

- `packages/web/src/routes/work/ScaffoldWorkspace.tsx`
- `packages/web/server/workItemApi.ts` (`listWorkItemFiles`, `readWorkItemFile`)
- `packages/web/server/workspaceProjection.ts`
- `scripts/adk-source/context.mjs`, `scripts/adk-source/asset-bindings.mjs`
- `scripts/generate-adk-source.mjs`
