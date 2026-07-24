# Live Companion

`WorkspaceProjection` combines canonical workspace identity, Work Item summaries, Git status/diff, filesystem events, and newest bridge activity. It emits SSE through `/api/workspace/events` and persists a bounded metadata-only activity list. `LiveRail` shows Activity, Changes, and Codex tabs; explicit file/diff open uses `VscodeWorkspaceLauncher` after path containment checks.

The bridge observes official lifecycle Hooks and stores bounded session, role, receipt, handoff, delivery, and activity metadata. Plan handoff creation requires a known active Plan-mode source session and exact turn. A distinct fresh prompt claims one exact signed marker once; missing, ambiguous, expired, mismatched, same-session, and subagent claims fail closed without blocking normal Codex use.

`ConnectionsPage` keeps bridge health, Hook capability, editor capability, session connection, Plan/materialization role, Work Item, cwd, last seen, handoff, explicit attach, and queued delivery distinct. `scripts/af.mjs work attach-session` is the CLI fallback for one named active session.

Source:

- `packages/web/server/workspaceProjection.ts`, `workspaceApi.ts`
- `packages/web/src/layout/LiveRail.tsx`
- `packages/web/server/codexBridgeStore.ts` (`createPlanHandoff`, `attachSession`, `consumePrompt`)
- `packages/web/server/codexCompanionApi.ts`
- `packages/web/src/routes/ConnectionsPage.tsx`
- `scripts/af-codex-hook-protocol.mjs`, `scripts/af.mjs`
