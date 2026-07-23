# Live Companion

`WorkspaceProjection` combines canonical workspace identity, Work Item summaries, Git status/diff, filesystem events, and the newest bridge activity. It emits SSE through `/api/workspace/events` and persists a bounded metadata-only activity list.

`LiveRail` shows Activity, Changes, and Codex tabs. Explicit file/diff open is handled by `VscodeWorkspaceLauncher` after path containment checks.

The Codex bridge observes official lifecycle Hooks and stores bounded session, receipt, delivery, and activity metadata. `ConnectionsPage` keeps bridge health, editor capability, Hook session observation, and delivery state distinct.

Source:

- `packages/web/server/workspaceProjection.ts`, `workspaceApi.ts`
- `packages/web/src/layout/LiveRail.tsx`
- `packages/web/server/codexBridgeStore.ts`, `codexCompanionApi.ts`
- `packages/web/src/routes/ConnectionsPage.tsx`
