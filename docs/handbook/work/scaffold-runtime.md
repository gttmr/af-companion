# Scaffold Projection

`ScaffoldWorkspace` groups Work Item files into generated source and handoff views, previews bounded text files, and filters the workspace Git projection to scaffold-related changes. It does not generate, edit, stage, or commit; file and diff actions delegate to contained VS Code open operations.

Canonical source generation belongs to external `af-scaffold-runtime` and `scripts/generate-adk-source.mjs`. The generator rechecks current approved gate bindings, required user decisions, explicit Solution Control Strategy and Root Executable, exact Registry revision/Asset versions, project-only bindings, source refs, duplicate bindings, and output roots before lowering. `workflow_manifest.json` preserves exact binding and generation actions.

The root artifact validator keeps schema and internal Graph-reference checks active for every retained Scaffold plan. Cross-file projection checks against the current analysis aggregate remain strict for current or lifecycle-unknown plans, but are skipped when the exact plan SHA-256 is recorded as a stale Compose output or a superseded composition-cycle artifact. This lets Return-to-Discover preserve the old plan as history without treating it as a projection of the new Discovery revision.

The root artifact validator checks each declared Scaffold output root when Scaffold is complete. Relative roots resolve from the Work Item artifact directory; absolute roots may point at a reviewed external application workspace. Each root must contain at least one regular file, so an external application is not required to duplicate its source under artifact-local `runtime-stub/`.

Source:

- `packages/web/src/routes/work/ScaffoldWorkspace.tsx`
- `packages/web/server/workItemApi.ts` (`listWorkItemFiles`, `readWorkItemFile`)
- `packages/web/server/workspaceProjection.ts`
- `scripts/adk-source/context.mjs`, `scripts/adk-source/asset-bindings.mjs`
- `scripts/generate-adk-source.mjs`
- `scripts/validate-artifacts.mjs` (`validateWorkItem`)
