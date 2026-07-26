# Web State Hooks

## Scope

This directory holds the minimal shared TanStack Query configuration, Asset Registry queries, and Codex session query/mutations. Workspace and Work Item projection hooks live in `src/workspace`.

## Where to look

| Task | File |
| --- | --- |
| Query client | `queryClient.ts` |
| Asset Registry | `useAssetRegistry.ts` |
| Codex session and editor workspace handoff | `useCodexSessions.ts` |

## Local rules

- Keep lifecycle and artifact truth in repository files, never localStorage.
- Invalidate the Asset Registry query family after successful guarded mutations; never hide ETag conflicts with an automatic write retry.
- Companion mutations target exact enrolled sessions and scope; never materialize unmanaged observations or auto-select the first live session.
- Editor launch acceptance is not Hook/session connection success.
- Keep query keys separated by workspace and Work Item identity.
- Do not add wrappers for removed `/api/af`, stage, runtime, approval, or publish endpoints.

## Verification

```bash
cd packages/web
npm run test:companion
npm run build
```
