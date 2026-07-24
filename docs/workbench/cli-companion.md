# External Codex Companion

The companion connects the canonical repository to explicitly enrolled Codex CLI or VS Code sessions without taking over turn or file ownership. A Codex process running in the same directory is not automatically a Companion session.

## Current boundary

- External Codex writes canonical artifacts and source through the four Work Skills.
- The web app observes the worktree and stores only bounded interaction/projection metadata outside its two canonical write surfaces.
- Graph IR and the Asset Registry are the only shared browser edit surfaces; the bridge never edits either one.
- The bridge cannot enumerate all local Codex processes, create or select a private IDE chat, start a turn, or steer an in-flight turn.
- A Bridge health response, editor launch receipt, matching `cwd`, or Hook invocation is not proof of Companion participation.

## Participation contract

Three axes remain independent:

| Axis | Values | Meaning |
| --- | --- | --- |
| Workspace eligibility | `factory`, `registered_application`, `unregistered` | whether the repository may issue a ticket |
| Session participation | `unmanaged`, `pending_activation`, `companion_active`, `revoked`, `expired` | whether one exact session may produce Companion side effects |
| Work attachment | `unattached`, `plan`, `materialization` | which approved work role the session owns |

`unmanaged` is a local no-op, not a durable Bridge row. `pending_activation` belongs to a one-time ticket, not a session. Only an activated session is persisted, and its lease binds one canonical workspace, application, Work Item, role, session, and Bridge instance.

The current repository resolver issues `factory` tickets only. `registered_application` remains a Target Contract value; there is not yet a separate application-root registry or independent registered-application cwd resolver. Within the factory checkout, `application_id` is an explicit logical scope and exact-equality delivery boundary, not proof of an external application workspace.

## Hook scope gate

Tracked `.codex/hooks.json` and the companion plugin may invoke `scripts/af-codex-hook.mjs` for:

```text
SessionStart
UserPromptSubmit
PreToolUse
PostToolUse
Stop
```

Hook definitions are additive. A project, user, plugin, and managed definition may all run, so config precedence or a profile name is not a Session participation boundary. The adapter therefore applies two local gates before endpoint discovery:

1. the event belongs to this exact canonical Agent Factory workspace and adapter;
2. the event carries an exact activation Capsule or resolves a regular, contained, permission-restricted, unexpired lease file for that session.

An unmanaged or malformed event exits with no stdout, endpoint read, Agent Factory network request, receipt, activity, or session state. Subagent events are ignored and never become top-level Companion sessions. This is side-effect isolation; strict suppression of the Hook process itself is not claimed.

The protocol adapter removes prompt and transcript fields before transport. Persisted activity is limited to event kind, session/turn identifiers, tool name when applicable, timestamps, and bounded status metadata. Prompt text, transcript content, tool arguments, and tool output are not persisted or projected.

## Enrollment and lease lifecycle

Interaction state uses the breaking v2 root:

```text
.agent-factory/codex-bridge/v2/
```

No v1 state is migrated. A new Bridge instance writes a new identity, making old leases unusable. Ticket and lease secrets are returned only when needed; durable ticket and Bridge state retain digests rather than plaintext claim tokens. Lease files live only under the contained `leases/` directory, use a session-ID digest as the filename, reject symbolic links, and expire.

Create one explicit scope and launch/join receipt from the repository root:

```bash
node scripts/af.mjs companion start \
  --application <application-id> \
  --work <work-id> \
  --role plan

node scripts/af.mjs companion join \
  --application <application-id> \
  --work <work-id> \
  --role materialization
```

`start` carries the enrollment Capsule in the new CLI process environment. `join` is the explicit Capsule path for a new session. Ticket issuance reads the strict canonical Work Item and binds its ETag. Ticket claim is consume-once, re-reads that same Work Item, and checks the unchanged ETag plus exact canonical cwd, workspace, application, Work Item, role, session, expiry, and claim token before issuing the lease. A deleted or changed Work Item revokes the pending ticket.

The same action is available from `/connections` Setup/Diagnostics. A VS Code command being accepted proves only editor launch. Participation is proven only after a fresh eligible Hook event claims the ticket and the v2 snapshot shows the exact leased session.

Revoke a session from `/connections`; subsequent Hook events no-op and deliveries fail closed. Reset is destructive local interaction-state maintenance and requires explicit confirmation:

```bash
node scripts/af.mjs companion reset --confirm
```

## Session trust and connection proof

Review loaded Hook sources and hashes with `/hooks` in Codex and trust the current version. After Hook changes or plugin reinstall, trust again and submit a fresh prompt.

Before claiming an enrolled session is connected, confirm all of the following:

1. the expected v2 session has `participation: companion_active` and the exact application/Work Item/role;
2. its lease names the current Bridge instance and has not expired;
3. a fresh prompt updates that session's `last_turn_id` and receipt;
4. a scoped delivery, when tested, is consumed only by that session and turn.

Sessions become stale by observation TTL because no supported end-event is assumed.

## Scoped delivery

A Graph save or context queue names one exact target session and scope. There is no global `default_target` and no first-active-session fallback. Queueing requires the intersection of:

```text
participation == companion_active
+ session status == active
+ current Bridge lease
+ exact workspace
+ exact application
+ exact Work Item
+ allowed role
+ current bundle revision
```

The next eligible prompt re-reads the strict Work Item and current canonical repository/Graph source revision before consuming a delivery once. Missing source state or revision drift fails that delivery without inserting context. Consumption is Hook-side context insertion, not model acknowledgement. A delivery failure is surfaced separately and never broadens the target.

## Plan-to-materialization handoff

A Plan handoff binds the exact source session and latest turn, workspace, application, canonical Work Item Handoff ID and marker digest, discovery and decision revisions, canonical Plan body hash, target skill, expiry, and consume-once claim. Creation includes the complete bounded canonical Plan body. The Bridge canonicalizes it, recomputes the hash, rejects a mismatch or embedded Capsule, and rechecks the exact current strict Work Item Handoff tuple before authority exists. Capsule metadata is excluded from the Plan body hash.

The verified Plan body is encrypted in ignored local Bridge state, omitted from public snapshots and receipts, and injected only into the successful fresh claim or named existing target's next leased prompt. It is erased on claim, cancellation, failure, expiry, supersession, source revocation, or restart. Every later authority-producing action rechecks the same canonical ID, marker, revisions, hash, target, and expiry.

Automatic built-in transfer to a fresh context is not assumed. The default supported path is an explicit Companion Continue action:

```bash
node scripts/af.mjs companion continue --handoff <handoff-id>
```

`/connections` exposes the same action and a copyable returned Capsule. The Capsule contains identity, revision, expiry, and consume-once claim metadata, not the Plan body. A claim succeeds only for one different fresh session with the exact Capsule and scope, then receives the verified body through Hook `additionalContext`. Wrong-session, same-session, duplicate, expired, superseded, ambiguous, and subagent claims fail closed. The Bridge never claims a handoff merely because one candidate is pending.

When a fresh client cannot be launched, `/connections` can durably attach the pending Handoff to one user-selected existing materialization Companion session. The target must have a current lease and the exact workspace/application/Work Item scope; no candidate is preselected, no raw Capsule or Plan body is returned, and only the named session can receive the verified context on its next leased prompt. Reload preserves the target. Pending handoffs can also be canceled explicitly. Target revoke detaches; source revoke/staleness, source-turn drift, canonical ID/marker/revision drift, or Bridge restart closes pending authority.

If a client strips the Capsule, keep the handoff waiting and use Continue or Copy Capsule again. Do not infer participation from `cwd`, editor launch, or an observed prompt.

## Decision input

The Work Skills inspect tools exposed in the current turn. When `request_user_input` is actually available they use the structured adapter; otherwise they ask exactly one conversational question, set `waiting_for_input`, and end the turn. Both paths preserve the same decision ID, option IDs, decision/recommendation revisions, selected value, selection source, bounded non-verbatim answer summary, and exact session/turn. The strict record also preserves whether the input mode was `structured` or `conversational`. `tests/skills/decision-input-fixture.mjs` behaviorally proves semantic normalization parity and strict Work Item roundtrip; this does not replace a live current-turn client capability check.

“추천대로 진행” is user consent only when it unambiguously names the currently displayed recommendation revision. Ambiguous answers trigger one clarification and no write. Recommendations, defaults, validator output, and prior-session assumptions never satisfy a hard gate.

## Capability summary

| Capability | Current |
| --- | --- |
| unmanaged Hook side-effect isolation | supported by local gate; Hook-process suppression not claimed |
| explicit CLI enrollment and per-session lease | supported |
| metadata-only activity | supported for enrolled sessions |
| exact scoped next-prompt context | supported |
| exact Plan handoff | supported through fresh Continue/Capsule or explicit exact existing-session attach |
| automatic built-in fresh-context transport | unverified; not the default |
| structured decision prompt | current-turn capability only |
| conversational decision fallback | supported by Work Skill contract |
| workspace/Git/file projection | supported |
| VS Code workspace/file/diff open | supported; thread selection is unsupported |
| delivery/model acknowledgement | not claimed |
| direct turn start or in-flight steer | unsupported |

## Source locators

| Behavior | Source |
| --- | --- |
| shared v2 contract | `packages/web/src/companion/sessionContract.ts` |
| Hook gate and protocol adapter | `scripts/af-codex-hook.mjs`, `scripts/af-codex-hook-protocol.mjs` |
| Hook declarations | `.codex/hooks.json`, `plugins/agent-factory-companion/hooks/hooks.json` |
| bridge state and lease lifecycle | `packages/web/server/codexBridgeStore.ts` |
| bridge process/routes | `packages/web/server/codexBridgeServer.ts`, `codexBridgeMain.ts` |
| companion web facade and explicit handoff actions | `packages/web/server/codexCompanionApi.ts`, `packages/web/src/routes/ConnectionsPage.tsx` |
| workspace observer | `packages/web/server/workspaceProjection.ts`, `workspaceApi.ts` |
| editor handoff | `packages/web/server/vscodeWorkspaceLauncher.ts` |
| Connections registers | `packages/web/src/routes/ConnectionsPage.tsx`, `packages/web/src/state/useCodexSessions.ts` |
| Companion CLI | `scripts/af.mjs` |
| decision/session procedures and semantic parity fixture | `.agents/skills/_shared/decision-input-adapter.md`, `.agents/skills/_shared/session-and-work-item-provenance.md`, `tests/skills/decision-input-fixture.mjs` |
