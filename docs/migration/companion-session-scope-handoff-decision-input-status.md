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
| Enrollment/Bridge/API | Agent B | `agent/session-scope-bridge` | integrated and closed | direct/facade negative and exact-scope cases pass in the 62-test Companion suite after Parent remediation |
| Hook/Launcher/CLI | Agent C | `agent/session-scope-hook-cli` | integrated and closed | Hook/CLI 17/17; plugin validator pass |
| Decision Adapter/Skills | Agent D | `agent/decision-input-skills` | integrated and closed | skill validator: 46 files, zero errors/warnings; decision/session contract 9/9 |
| Handoff/Connections UI | Agent E | `agent/session-handoff-ui` | integrated and closed | build, Companion tests, and real fixed-port desktop/narrow browser acceptance |
| Independent acceptance | Agent F | read-only after integration | complete and closed | five canonical-state, stale-authority, durable-attach, and evidence-strength findings reviewed |

Only targeted-test-passing commits are eligible for Parent review and
cherry-pick. This table is updated after each result is captured.

Agent F's review found that enrollment/CLI could name a nonexistent Work Item,
delivery and Handoff revisions were caller-relative, existing-session Attach
returned only a transient Capsule, pending authority survived source/restart
drift, and Decision Adapter proof was text-only. Parent remediation now uses the
strict canonical Work Item parser at enrollment/CLI and authority boundaries,
rechecks repository/Graph and Handoff revisions, persists exact Attach targets,
fails stale/restarted authority, and runs schema-validated semantic parity
fixtures. Client-only behavior remains explicitly unverified below.

A second independent integration review found five deeper authority gaps: the
Bridge did not carry the actual non-persisted Decision Plan body; it replaced
the canonical Work Item Handoff identity; ticket activation did not re-read the
Work Item; queued delivery did not recheck source revision when consumed; and
strict Decision records did not persist recommendation/selection provenance.
Each case was reproduced before remediation. The Bridge now binds the exact
canonical Handoff ID and marker, verifies and encrypts the complete Plan body,
injects it once, and erases it; activation binds and rechecks a Work Item ETag;
delivery rechecks canonical source revision at consume time; and strict
Decision/Asset Decision records preserve decision/recommendation revisions,
selection source, bounded answer summary, input mode, and exact session/turn.

A third independent review found three final authority-edge gaps: a read-only
snapshot did not reconcile a removed canonical Handoff, a superseded selected
Decision could retain provenance without its input mode, and the facade JSON
limit could reject a valid 64 KiB Plan after worst-case escaping. Each case was
first captured as a failing regression. Snapshot projection now fails stale
authority and erases protected Plan bytes, superseded selection provenance is
all-or-none including `decision_input_mode`, and both direct and facade Handoff
requests use one 512 KiB transport envelope while canonical Plan text remains
strictly bounded to 64 KiB.

## Acceptance evidence

| Claim | Current evidence |
| --- | --- |
| unmanaged lifecycle is inert | Hook acceptance sends ordinary SessionStart, prompt, tool, and stop inputs while trapping endpoint/network/state access; all exit silently with zero AF request, lease, activity, or durable session |
| activation is exact and one-time | direct Bridge tests cover forged, replayed, expired, cross-scope, subagent, v1, symlink, deleted Work Item, and valid post-issuance Work Item mutation cases; successful activation writes only one restrictive session lease |
| delivery fails closed | tests reject unmanaged, stale, revoked, deleted/tampered-lease, wrong workspace/application/Work Item/role, stale queue revisions, and source state unavailable at consume time |
| restart and expiry invalidate authority | Bridge restart expires sessions, invalidates old leases, cancels queued delivery, and fails pending Handoffs; lease/source expiry and a later source turn close pending authority; snapshot polling also reconciles canonical Handoff removal/drift and erases protected Plan ciphertext |
| handoff is explicit and exact | tests cover exact canonical Work Item Handoff ID/marker/revisions, independently recomputed Plan hash, encrypted-at-rest body, distinct fresh exact-body claim, body erasure, same/wrong session, replay, durable same-scope existing-session target, next-prompt claim, target detach, cancel, source revoke, canonical drift, and a valid 64 KiB Plan under worst-case JSON escaping |
| decisions have path-independent semantics | all five skills use the shared turn-capability contract; an executable fixture presents one identical canonical question and produces equivalent strict-parser-valid semantics from structured/conversational answers while preserving input mode, delegated recommendation revision, selection source, safe summary, and exact session/turn; selected provenance remains all-or-none when a record is superseded |
| browser projection matches the contract | real Chrome on fixed `8890` shows the four ordered registers; exact Attach and alias Rename return 200, no candidate is preselected, reload preserves the target without rendering a Capsule or Plan body, desktop/narrow layouts have no root overflow, and console reports zero errors/warnings |
| attached Plan reaches only the exact target | the named target's next leased prompt returns 200 with the exact canonical Plan bytes plus Handoff ID/marker/hash; its following prompt returns 204 with no context, and persisted ciphertext fields are erased |
| activity projection is bounded | one Bridge activity ID is projected once even when unrelated v2 state rewrites trigger filesystem observation |

Browser evidence:

- `artifacts/af/browser-companion/evidence/connections-v2-durable-attach-desktop.png`
- `artifacts/af/browser-companion/evidence/connections-v2-durable-attach-narrow.png`

The screenshots are respectively 1920×1200 and 740×2724. Their current
SHA-256 digests are `d4622be297a8d93777669e64936011d9b0a2815c7463509357a7c04ede541306`
and `4c978db9d7a6e426c98d2a679db2ac97c198cad0c0955161a3f3a90b1a234ac1`.

## Validation snapshot

| Command | Result |
| --- | --- |
| `node scripts/validate-skills.mjs` | PASS; 46 files, zero errors/warnings |
| `node scripts/validate-artifacts.mjs` | PASS |
| `cd packages/web && AF_TEST_PYTHON=/home/ilmaswsl/work/af-companion/.agent-factory/runtime/.venv/bin/python npm run test:contracts` | PASS; 23 web + 84 validator/generator = 107 tests |
| `cd packages/web && npm run test:companion` | PASS; 45 web/server + 17 Hook/CLI = 62 tests |
| `node --test scripts/af-codex-hook.test.mjs` | PASS; 9 tests |
| `node --test tests/skills/decision-session-contract.test.mjs` | PASS; 9 tests |
| `cd packages/web && npm run build` | PASS; TypeScript and Vite, 576 modules |
| changed active Markdown relative-link check | PASS; 14 files, 34 local targets, zero broken |
| `git diff --check` | PASS |

The integration worktree intentionally reuses the original checkout's existing
Google ADK 2.3.0 test interpreter through `AF_TEST_PYTHON`. The first run
without that override failed only because this isolated worktree has no local
ignored `.agent-factory/runtime/.venv/bin/python`; the full 107-test rerun with
the explicit interpreter passed.

## Known limitations

- Project/plugin Hooks may still start a local process for an unmanaged session; the verified guarantee is zero AF communication or persistence after local proof gating.
- Built-in Plan-to-fresh-context Capsule carriage is client-dependent and remains unverified, so explicit Continue/copy/exact attach is the supported path.
- The current workspace resolver issues `factory` eligibility only. `registered_application` is a Target Contract value without a separate application-root registry or independent cwd resolver.
- A VS Code window-open acceptance does not prove that one Codex thread inherited enrollment environment or delivered a Hook event.
- `request_user_input` availability is a current-turn capability, not a CLI/extension version promise. Semantic output parity is executable, but one live structured and one live conversational client path were not both available in this run; conversational fallback remains required.
- Delivery consumption records Hook-side consume-once handling, not model acknowledgement.
- There is no current `SessionEnd` Hook contract; Stop, lease expiry, revoke, and Bridge restart provide the bounded lifecycle semantics.
