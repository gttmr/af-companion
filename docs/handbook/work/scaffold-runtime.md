# Scaffold Projection

`ScaffoldWorkspace` groups Work Item files into generated source and handoff views, previews bounded text files, and filters the workspace Git projection to scaffold-related changes.

The screen does not generate, edit, stage, or commit. File and diff actions delegate to contained VS Code open operations. Canonical source generation belongs to the external `af-scaffold-runtime` skill and root generator.

Source:

- `packages/web/src/routes/work/ScaffoldWorkspace.tsx`
- `packages/web/server/workItemApi.ts` (`listWorkItemFiles`, `readWorkItemFile`)
- `packages/web/server/workspaceProjection.ts`
- `packages/web/server/vscodeWorkspaceLauncher.ts`
