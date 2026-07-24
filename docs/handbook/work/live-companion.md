# Live Companion

`WorkspaceProjection` combines canonical workspace identity, Work Item summaries, Git status/diff, filesystem events, and newest enrolled-Bridge activity. It emits SSE through `/api/workspace/events` and persists a bounded metadata-only activity list. `LiveRail` shows Activity, Changes, and Codex tabs; explicit file/diff open uses `VscodeWorkspaceLauncher` after path containment checks.

## Main flow

1. CLI or `/connections` creates a one-time enrollment ticket for an exact workspace, application, Work Item, and role.
2. The new Codex session carries the activation Capsule. The local Hook gate validates workspace and Capsule before endpoint discovery.
3. The Bridge consumes the ticket once, persists only the activated Companion session, and writes an exact-session lease bound to the current Bridge instance.
4. Later lifecycle Hooks resolve that contained lease locally. Unmanaged, revoked, expired, wrong-workspace, and subagent events no-op before Agent Factory network/state.
5. Exact-scope deliveries may be consumed once by the next eligible prompt. Ordinary sessions are never candidate targets.

The bridge stores bounded session, role, receipt, handoff, delivery, and activity metadata. It does not store prompts, transcripts, tool arguments, tool output, plaintext durable claim tokens, or unmanaged session rows.

## Handoff and decisions

Plan handoff creation requires a current leased Plan session and exact turn. A distinct fresh prompt claims one exact signed Capsule once; wrong scope, missing/duplicate Capsule, expiry, replay, same-session, and subagent claims fail closed. Automatic client transport is not assumed: `node scripts/af.mjs companion continue --handoff <id>` and `/connections` Continue return the explicit launch/copy fallback.

Work Skills choose structured decision input only from tools actually exposed in the current turn. Otherwise they ask one conversational question and stop at `waiting_for_input`. Both adapters preserve one decision ID/revision/option/provenance contract, and an ambiguous answer or stale recommendation does not write a user decision.

## Projection

`ConnectionsPage` presents four ordered registers: Companion Sessions, Pending Handoffs, Deliveries, and Setup/Diagnostics. Session rows keep participation, application/Work Item/role, activation origin, lease expiry, last event, alias, and revoke action distinct. Diagnostics expose capability labels and aggregate ignored/invalid/expired counts only.

Bridge health, editor launch acceptance, ticket issuance, active lease, and prompt receipt are separate states. The UI never lists ordinary Hook-observed sessions, selects the first active session, or reports editor launch as Codex connection proof.

Source:

- `packages/web/src/companion/sessionContract.ts` (`deliveryEligibility`, `canonicalizePlanBody`)
- `packages/web/server/workspaceProjection.ts`, `workspaceApi.ts`
- `packages/web/src/layout/LiveRail.tsx`
- `packages/web/server/codexBridgeStore.ts`
- `packages/web/server/codexBridgeServer.ts`, `codexCompanionApi.ts`
- `packages/web/src/routes/ConnectionsPage.tsx`, `packages/web/src/state/useCodexSessions.ts`
- `scripts/af-codex-hook.mjs`, `scripts/af-codex-hook-protocol.mjs`, `scripts/af.mjs`
- `.agents/skills/_shared/decision-input-adapter.md`, `.agents/skills/_shared/fresh-context-handoff.md`
