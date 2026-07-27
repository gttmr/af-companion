# Live Companion

`WorkspaceProjection` combines canonical workspace identity, Work Item summaries, Git status/diff, filesystem events, and newest enrolled-Bridge activity. It emits SSE through `/api/workspace/events` and persists a bounded metadata-only activity list. `LiveRail` shows Activity, Changes, and Codex tabs; explicit file/diff open uses `VscodeWorkspaceLauncher` after path containment checks.

## Main flow

1. CLI or `/connections` reads the strict Work Item and creates a one-time enrollment ticket bound to its ETag and exact workspace, application, Work Item, and role.
2. The new Codex session carries the activation Capsule. The local Hook gate validates workspace and Capsule before endpoint discovery.
3. The Bridge re-reads the unchanged Work Item, consumes the ticket once, persists only the activated Companion session, and writes an exact-session lease bound to the current Bridge instance.
4. Later lifecycle Hooks resolve that contained lease locally. Unmanaged, revoked, expired, wrong-workspace, and subagent events no-op before Agent Factory network/state.
5. Exact-scope deliveries recheck canonical source revision and may be consumed once by the next eligible prompt. Ordinary sessions are never candidate targets.

The bridge stores bounded session, role, receipt, handoff, delivery, and activity metadata. It does not store prompts, transcripts, tool arguments, tool output, plaintext durable claim tokens, or unmanaged session rows.

## External application MCP

`mcpExportContext` reads one strict Work Item through
`parseAfWorkItemManifest`, reads the current Registry through
`AssetRegistryService.loadSnapshot`, and writes a portable bounded context plus
project-local `.codex/config.toml` to one explicitly named application root. It
does not mutate the Work Item or Registry. A different existing project config
is a conflict rather than an overwrite.

`runServer` starts the installed `@agent-factory/context-mcp` package over
stdio. `findProjectContext` resolves only a regular context/config pair from
the application root or descendant. Every Tool call reloads and revalidates the
context. `callTool` keeps transport completion separate from domain outcome,
fails stale revisions and invalid allowed values as `UNVERIFIED`, and exposes no
canonical mutation, session/turn fabrication, or handoff claim.

## Handoff and decisions

Plan handoff creation requires the exact canonical Work Item Handoff ID/marker, leased Plan session, exact latest turn, and complete canonical Plan body. The Bridge recomputes its hash, encrypts the bounded body locally, and omits it from public state. A distinct fresh prompt claims one exact signed Capsule once and receives those verified bytes; wrong scope/marker, missing or duplicate Capsule, canonical revision drift, expiry, replay, same-session, and subagent claims fail closed. Automatic client transport is not assumed: `node scripts/af.mjs companion continue --handoff <id>` and `/connections` Continue return the explicit launch/copy fallback. A separate `/connections` action durably records one user-selected, same-scope leased materialization target without returning a Capsule or Plan body; only its next leased prompt receives the Handoff. No candidate is preselected. Pending handoffs can be canceled, target revocation detaches them, and source revocation/staleness or Bridge restart closes their authority and erases body ciphertext.

Work Skills choose structured decision input only from tools actually exposed in the current turn. Otherwise they ask one conversational question and stop at `waiting_for_input`. Both adapters preserve one decision ID/option meaning plus durable decision/recommendation revisions, selection source, bounded answer summary, input mode, and exact session/turn; an ambiguous answer or stale recommendation does not write a user decision. An executable semantic fixture proves strict-parser roundtrip, path-independent semantics, delegated-recommendation binding, and protected-gate blocking; live two-client-path execution remains capability-dependent.

## Projection

`ConnectionsPage` presents four ordered registers: Companion Sessions, Pending Handoffs, Deliveries, and Setup/Diagnostics. Session rows keep participation, application/Work Item/role, activation origin, lease expiry, last event, alias, and revoke action distinct. Handoff rows show the source session/turn, revisions, transport, destination, expiry, and explicit Continue, exact existing-session Attach, and Cancel actions. Diagnostics expose capability labels and aggregate ignored/invalid/expired counts only.

Bridge health, editor launch acceptance, ticket issuance, active lease, and prompt receipt are separate states. The UI never lists ordinary Hook-observed sessions, selects the first active session, or reports editor launch as Codex connection proof.

Source:

- `packages/web/src/companion/sessionContract.ts` (`deliveryEligibility`, `canonicalizePlanBody`)
- `packages/web/server/workspaceProjection.ts`, `workspaceApi.ts`
- `packages/web/src/layout/LiveRail.tsx`
- `packages/web/server/codexBridgeStore.ts`
- `packages/web/server/codexBridgeServer.ts`, `codexCompanionApi.ts`
- `packages/web/src/routes/ConnectionsPage.tsx`, `packages/web/src/state/useCodexSessions.ts`
- `scripts/af-codex-hook.mjs`, `scripts/af-codex-hook-protocol.mjs`, `scripts/af.mjs`
- `packages/agent-factory-context-mcp/src/context.mjs`, `packages/agent-factory-context-mcp/src/server.mjs`
- `.agents/skills/_shared/decision-input-adapter.md`, `.agents/skills/_shared/fresh-context-handoff.md`
- `tests/skills/decision-input-fixture.mjs`, `tests/skills/decision-session-contract.test.mjs`
