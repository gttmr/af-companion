# Discover Projection

`DiscoverWorkspace` reads the Work Item file list and `analysis-result.json`, parses strict Target v2, and renders normalized requirement, evidence, Agent·Workflow·Tool candidates, dependencies, and Missing Information.

The screen is read-only. Its only action opens the canonical analysis file in VS Code through `/api/workspace/editor/open`.

Canonical production belongs to the external `af-discover-assets` skill. Review state is displayed by `SkillScreenHeader`; no approval mutation exists in the app.

Source:

- `packages/web/src/routes/work/DiscoverWorkspace.tsx`
- `packages/web/src/routes/work/SkillScreenHeader.tsx`
- `packages/web/src/workspace/useWorkspaceProjection.ts`
