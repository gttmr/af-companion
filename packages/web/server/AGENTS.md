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
| Asset Registry | `assetRegistryApi.ts` |

## Local rules

- Validate exact Work Item and Target v2 shapes; do not migrate or backfill rejected input.
- Every API is loopback-only. Mutations also require same-origin and server-validated input.
- Graph writes require `If-Match`, approved discovery, a strict Target Graph, and one explicit active Companion session whose lease and workspace/application/Work Item/role scope match.
- Keep Graph write scope to `analysis-result.json`, `graph-ir.json`, lifecycle invalidation, and exact scoped-session context delivery.
- File and diff reads must stay within the canonical repository/Work Item root, reject symlinks that escape it, and cap size/count.
- Editor launch uses fixed argv with a trusted host executable. Never execute client-supplied commands.
- Persist only explicitly activated, bounded Hook/session/activity metadata with restrictive permissions. Unmanaged events create no durable row. Never persist prompt, transcript, tool input, or tool output.
- Registry writes require same-origin loopback, strict JSON validation, exact `If-Match`, atomic persistence, and explicit lifecycle decisions. Published versions stay immutable.
- Do not add stage runners, direct analyzers, build/verify triggers, arbitrary artifact PUT, or runtime control APIs.

## Verification

```bash
cd packages/web
npm run test:companion
npm run build
```
