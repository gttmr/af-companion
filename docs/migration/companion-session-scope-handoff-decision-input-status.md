# Companion Session Scope, Handoff, and Decision Input Status

Checked 2026-07-24 against the independent `gttmr/af-companion` checkout at
`8f54360a69f1e28168b98567f352b4194a3e7293`.

This document records implementation evidence. The active contracts remain
`docs/workbench/*`, the current source remains final authority, and unverified
client behavior is not presented as supported.

## Scope and isolation

- Integration worktree: `/home/ilmaswsl/work/af-wt-session-scope-handoff-decision-input`
- Integration branch: `agent/session-scope-handoff-decision-input`
- Base: fetched `origin/main` `8f54360a69f1e28168b98567f352b4194a3e7293`
- Original checkout: `/home/ilmaswsl/work/af-companion`, preserved on `main`
- Remote push: not authorized and not performed

Parent owns the shared v2 contract, integration order, active documentation,
and final acceptance. Bridge/API, Hook/CLI, Work Skills, and UI are isolated in
separate branches and worktrees with non-overlapping write ownership.

## Phase 0 — source-backed audit

The baseline `cd packages/web && npm run test:companion` passed 32 web/server
tests and five Hook tests after installing the package dependencies. The suite
also reproduced the behaviors being replaced: an unknown prompt session is
recovered into durable state, and a global `default_target` preference is
accepted.

| Surface | Current baseline behavior | v2 disposition |
| --- | --- | --- |
| Hook gate | `scripts/af-codex-hook.mjs` parses input, searches upward for the Bridge endpoint, then sends every supported event when an endpoint is visible. | Resolve an exact lease or activation capsule before endpoint discovery; ordinary unmanaged events exit locally with no stdout or AF side effect. |
| Session registration | `CodexBridgeStore.handleHook` creates or recovers a session from `SessionStart`, prompt, tool, or stop events. | Persist only explicitly activated Companion sessions. `unmanaged` is not a durable session state. |
| Session scope | Session rows have cwd/model/source/status plus optional Work Item/role; application, workspace, origin, lease, and participation are absent. | Bind enrollment and lease to exact canonical cwd, workspace, application, Work Item, role, session, and Bridge instance. |
| Target selection | The store and API retain one global `default_target`. | Remove global defaults. Every delivery, attach, Start, and Continue action names an exact scope and session or handoff. |
| Delivery | `createDelivery` checks that the target session exists and is active. | Require `companion_active`, fresh lease, active observation, exact workspace/application/work match, allowed role, and current bundle revision. |
| Plan handoff | One explicit marker binds Work Item, revisions, Plan hash, target, and claim token. Built-in fresh-context transport is not claimed. | Separate canonical Plan body hash from Capsule metadata; preserve exact claim checks and make Companion Continue the default fallback until client transport is proven. |
| Decision input | Work Item decisions require user provenance, but the five skills do not share a full structured/conversational adapter procedure. | Select an adapter from tools actually exposed in the current turn and normalize both paths to the same decision ID/revision/option semantics. |
| Connections | The default screen lists all Hook-observed sessions and offers manual Work Item attachment. | Show Companion Sessions, Pending Handoffs, Deliveries, and aggregate Setup/Diagnostics only. |

The baseline root cause is therefore not a display filter. Ordinary Hook events
are sent before participation is proven and are then intentionally materialized
as sessions, receipts, and activity. The fix must gate both sides of the
transport and fail closed at delivery.

## Phase 1 — capability matrix

The matrix is completed only from the installed client, official Codex
documentation, and sanitized executable probes. A documented capability is not
treated as runtime verification for this machine.

Installed versions differ by surface:

```text
shell Codex CLI: codex-cli 0.145.0
VS Code: 1.130.0
OpenAI Codex extension: 26.715.61943
extension-bundled Codex CLI: 0.145.0-alpha.27
```

| Capability | CLI | VS Code | Default | Fallback |
| --- | --- | --- | --- | --- |
| Strict hook-process isolation | not established; Hook sources are additive and a profile does not remove base/project/plugin Hooks | not established; no supported IDE profile selector was found | side-effect-gated Hook process | dedicated pre-provisioned `CODEX_HOME`, but only after a new-process trace proves isolation |
| Session environment enrollment | `CODEX_HOME` and launch environment are documented; runtime ticket path remains an implementation acceptance test | extension source inherits process environment, but an existing extension host may defeat a new launch environment | explicit CLI ticket | signed Join Capsule; never treat `code --new-window` as enrollment proof |
| Fresh-context Capsule carry | `/new` is empty and `/fork` preserves history; automatic Plan metadata carriage is not documented | installed “implement plan” flow reuses the same conversation and submits Plan content after switching mode | unverified | Companion Continue, then Copy Capsule, then exact confirmed attach |
| `request_user_input` | current-turn capability only; the installed default-mode feature is experimental and disabled | experimental setting applies to new threads and remains capability-gated | use only when the tool is actually exposed | one conversational question, `waiting_for_input`, then end the turn |

Official Codex Hook behavior confirms that matching project, user, plugin, and
managed Hook definitions are additive and may run concurrently. Hook trust is
definition-hash-specific. Config precedence is therefore not a Session
participation boundary. See [Codex Hooks](https://developers.openai.com/codex/hooks),
[environment variables](https://developers.openai.com/codex/config-file/environment-variables),
and [advanced configuration](https://developers.openai.com/codex/config-advanced).

Current effective Hook loading in a fresh CLI/IDE process remains unproven. A
live acceptance claim requires `/debug-config`, `/hooks`, a new prompt, and the
current Bridge receipt/lease state. Subagent Start/Stop fields are documented,
but the base Companion does not register those events and current
`UserPromptSubmit` documentation does not promise `agent_id`/`agent_type`.

## Parent contract

The shared contract makes Workspace Eligibility, Session Participation, and
Work Attachment independent. A persisted Companion session cannot be
`unmanaged` or `pending_activation`; those meanings belong to local no-op and
user-created ticket state respectively.

Delivery eligibility is the intersection of:

```text
participation == companion_active
+ session status == active
+ lease not expired
+ exact workspace
+ exact application
+ exact Work Item
+ allowed role
```

Canonical Plan bytes normalize newlines and exclude enrollment/handoff Capsule
markers. A Capsule is transport metadata, not part of `plan_body_hash`.

Evidence:

- `packages/web/src/companion/sessionContract.ts`
- `packages/web/src/companion/sessionContract.test.ts`
- `cd packages/web && npm run test:companion`
- `cd packages/web && npm run build`

## Integration ledger

| Slice | Owner | Branch | State | Evidence |
| --- | --- | --- | --- | --- |
| Shared contract | Parent | `agent/session-scope-handoff-decision-input` | complete | contract tests and build pass |
| Capability research | Agent A | read-only | complete and closed | installed CLI/IDE source plus official Codex docs |
| Enrollment/Bridge/API | Agent B | `agent/session-scope-bridge` | active | pending targeted tests |
| Hook/Launcher/CLI | Agent C | `agent/session-scope-hook-cli` | integrated and closed | Hook/CLI 16/16; plugin validator pass |
| Decision Adapter/Skills | Agent D | `agent/decision-input-skills` | integrated and closed | skill validator 46/46; decision/session contract 4/4 |
| Handoff/Connections UI | Agent E | `agent/session-handoff-ui` | integrated and closed | build + Companion tests; legacy fail-closed browser check at desktop/narrow |
| Independent acceptance | Agent F | read-only after integration | pending | negative/security/locator review |

Only targeted-test-passing commits are eligible for Parent review and
cherry-pick. This table is updated after each result is captured.

## Acceptance evidence pending

- unmanaged SessionStart/prompt/tool/stop: zero AF network and durable state;
- ticket/lease activation, expiry, replay, revoke, and symlink protection;
- exact workspace/application/work/role delivery isolation;
- atomic distinct-session handoff claim and wrong-session rejection;
- structured/conversational Decision Record semantic parity;
- fixed-port `/connections` browser and screenshot verification;
- skill, artifact, contract, companion, Hook, build, link, and diff gates.

## Known limitations until proven otherwise

- Project/plugin Hooks may still start a local process for an unmanaged session.
- Built-in Plan-to-fresh-context Capsule carriage is not assumed.
- VS Code launch acceptance is not Session enrollment or Hook-delivery proof.
- `request_user_input` availability is turn/surface capability, not a version promise.
- Delivery consumption is Hook-side consumption, not model acknowledgement.
