# Current Route and API Index

## Routes

| Route | Purpose | Source |
| --- | --- | --- |
| `/` | New/existing Work Item start, VS Code gate guidance, current focus, and lifecycle map | `packages/web/src/routes/WorkspaceHome.tsx`, `packages/web/src/components/JourneyGuideDialog.tsx` |
| `/work/:workId/discover` | discovery cycles, decisions, Assets, and Plan/materialization handoff projection | `packages/web/src/routes/work/DiscoverWorkspace.tsx` |
| `/work/:workId/compose` | strategy/Root/Asset decisions, Return-to-Discover, invalidations, and Graph edit | `packages/web/src/routes/work/ComposeWorkspace.tsx` |
| `/work/:workId/scaffold` | source/handoff and Git change projection | `packages/web/src/routes/work/ScaffoldWorkspace.tsx` |
| `/work/:workId/verify` | five-level evidence projection | `packages/web/src/routes/work/VerifyWorkspace.tsx` |
| `/connections` | enrolled Companion sessions, pending handoffs, scoped deliveries, and diagnostics without browser enrollment/Capsule copy | `packages/web/src/routes/ConnectionsPage.tsx` |
| `/assets` | Registry browse/search/detail/version/usage and guarded lifecycle operations | `packages/web/src/routes/AssetsPage.tsx` |

Router ownership: `packages/web/src/routes/router.tsx`.
Home's current selection and all `/work/:workId/*` routes receive the shared
current-session, Skill, Graph, application-source, and waiting-Decision
projection from `packages/web/src/layout/WorkLiveStrip.tsx`,
`WaitingDecisionStrip.tsx`, and `routes/work/SkillScreenHeader.tsx`.

## APIs

| Prefix | Methods | Source |
| --- | --- | --- |
| `/api/workspace` | GET identity/snapshot/changes/diff/events, with optional selected `work_id` app watcher; POST contained editor open | `packages/web/server/workspaceApi.ts`, `workspaceProjection.ts` |
| `/api/work-items` | GET Work Items/files/Graph; POST guarded empty Work Item bootstrap; PUT Graph | `packages/web/server/workItemApi.ts`, `applicationRegistryStore.ts` |
| `/api/codex-companion` | GET v2 snapshot; POST Plan multi-root VS Code session descriptor launch, enrollment, preferences, handoff Continue/exact attach/cancel, revoke, scoped queue/delivery cancel, reset, and contained editor launch | `packages/web/server/codexCompanionApi.ts`, `vscodeWorkspaceLauncher.ts` |
| `/api/asset-registry` | GET L0/L1/L2/list/version/usage/compare; POST search/validate/lifecycle; PUT draft | `packages/web/server/assetRegistryApi.ts` |

Registration source: `packages/web/vite.config.ts`. Any route/API absent from that registration is not current behavior.
