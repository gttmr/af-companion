# Web Server Middleware

## Scope

`packages/web/server` exposes local filesystem projections and narrowly scoped companion actions. It does not execute Agent Factory lifecycle stages.

## Where to look

| Task | Files |
| --- | --- |
| Work Item store and ETags | `artifactRootStore.ts` |
| Work Item reads and Graph-only write | `workItemApi.ts` |
| Git/files/activity/SSE projection | `workspaceProjection.ts`, `workspaceApi.ts` |
| Codex sessions and delivery facade | `codexBridgeStore.ts`, `codexCompanionApi.ts` |
| Bridge process | `codexBridgeServer.ts`, `codexBridgeMain.ts` |
| VS Code workspace/file/diff handoff | `vscodeWorkspaceLauncher.ts` |
| Read-only Catalog | `afCatalogApi.ts` |

## Local rules

- Validate exact Work Item and Target v2 shapes; do not migrate or backfill rejected input.
- Every API is loopback-only. Mutations also require same-origin and server-validated input.
- Graph writes require `If-Match`, approved discovery, a strict Target Graph, and one explicit active Codex session.
- Keep Graph write scope to `analysis-result.json`, `graph-ir.json`, lifecycle invalidation, and exact-session context delivery.
- File and diff reads must stay within the canonical repository/Work Item root, reject symlinks that escape it, and cap size/count.
- Editor launch uses fixed argv with a trusted host executable. Never execute client-supplied commands.
- Persist only bounded Hook/session/activity metadata with restrictive permissions. Never persist prompt, transcript, tool input, or tool output.
- Catalog middleware is GET-only.
- Do not add stage runners, direct analyzers, build/verify triggers, arbitrary artifact PUT, runtime control APIs, or Catalog publish endpoints.

## Verification

```bash
cd packages/web
npm run test:companion
npm run build
```
