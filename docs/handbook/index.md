# Current Route and API Index

## Routes

| Route | Purpose | Source |
| --- | --- | --- |
| `/` | Work Item index and lifecycle map | `packages/web/src/routes/WorkspaceHome.tsx` |
| `/work/:workId/discover` | evidence and candidate projection | `packages/web/src/routes/work/DiscoverWorkspace.tsx` |
| `/work/:workId/compose` | Graph IR review/edit and composition contracts | `packages/web/src/routes/work/ComposeWorkspace.tsx` |
| `/work/:workId/scaffold` | source/handoff and Git change projection | `packages/web/src/routes/work/ScaffoldWorkspace.tsx` |
| `/work/:workId/verify` | five-level evidence projection | `packages/web/src/routes/work/VerifyWorkspace.tsx` |
| `/connections` | Hook bridge, sessions, and deliveries | `packages/web/src/routes/ConnectionsPage.tsx` |
| `/assets` | read-only Catalog | `packages/web/src/routes/AssetsPage.tsx` |

Router ownership: `packages/web/src/routes/router.tsx`.

## APIs

| Prefix | Methods | Source |
| --- | --- | --- |
| `/api/workspace` | GET identity/snapshot/changes/diff/events; POST contained editor open | `packages/web/server/workspaceApi.ts` |
| `/api/work-items` | GET Work Items/files/Graph; PUT Graph only | `packages/web/server/workItemApi.ts` |
| `/api/codex-companion` | session/delivery facade and VS Code workspace launch | `packages/web/server/codexCompanionApi.ts` |
| `/api/catalog` | GET only | `packages/web/server/afCatalogApi.ts` |

Registration source: `packages/web/vite.config.ts`. Any route/API absent from that registration is not current behavior.
