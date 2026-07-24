# Discover Projection

`DiscoverWorkspace` loads the Work Item, strict `analysis-result.json`, and companion session snapshot. It renders Solution Control Strategy, Root Executable, discovery cycle/revision, open required decisions, per-Asset match/disposition decisions, normalized requirement, evidence, Agent·Workflow·Tool candidates, dependencies, Missing Information, and Plan/materialization sessions plus handoff status.

The screen is read-only for Work Item artifacts. Its file action opens the canonical analysis file in VS Code through `/api/workspace/editor/open`.

Canonical production belongs to external `af-discover-assets`: Phase A is Plan-mode conversation with no tracked writes; a distinct Phase B claims or explicitly attaches the handoff and materializes exact Work Item v2 revisions. Review state is displayed by `SkillScreenHeader`; the app has no discovery approval mutation.

Source:

- `packages/web/src/routes/work/DiscoverWorkspace.tsx` (`DiscoveryLifecycle`, `DecisionRegisters`)
- `packages/web/src/routes/work/SkillScreenHeader.tsx`
- `packages/web/src/state/useCodexSessions.ts`
- `packages/web/src/workspace/useWorkspaceProjection.ts`
