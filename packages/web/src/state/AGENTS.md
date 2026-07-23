# Web State Hooks

## Scope

This directory holds the minimal shared TanStack Query configuration, read-only Catalog query, and Codex session query/mutations. Workspace and Work Item projection hooks live in `src/workspace`.

## Where to look

| Task | File |
| --- | --- |
| Query client | `queryClient.ts` |
| Read-only Catalog | `useCatalog.ts` |
| Codex session and editor workspace handoff | `useCodexSessions.ts` |

## Local rules

- Keep lifecycle and artifact truth in repository files, never localStorage.
- Catalog is read-only and accepts exactly Agent, Workflow, and Tool buckets.
- Codex session mutations target exact observed sessions; never auto-select the first live session.
- Editor launch acceptance is not Hook/session connection success.
- Keep query keys separated by workspace and Work Item identity.
- Do not add wrappers for removed `/api/af`, stage, runtime, approval, or publish endpoints.

## Verification

```bash
cd packages/web
npm run test:companion
npm run build
```
