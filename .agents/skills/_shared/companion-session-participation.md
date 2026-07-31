# Companion Session Participation

## Purpose

Gate lifecycle participation on current Companion enrollment and an exact application, workspace, Work Item, and role attachment. Ordinary Codex sessions remain usable for ordinary work, but they are not Agent Factory lifecycle actors.

## Participation gate

A session may make a durable lifecycle write or create lifecycle evidence only when all of these are current and directly observed:

- `participation` is `companion_active`;
- session `status` is `active`;
- the lease exists, has not expired, and matches the current `lease_id`;
- canonical cwd and `canonical_cwd_digest` identify the intended repository;
- `workspace_id`, `application_id`, and `work_id` exactly match the requested scope;
- the attached role is allowed for the operation: `plan` or `materialization`;
- the current turn has an observed `session_id` and `turn_id`.

Workspace eligibility, a running Bridge, Hook installation, a visible session, an enrollment ticket, a capsule, or a prior attachment is not sufficient by itself. Recheck the lease and exact scope immediately before a durable write, review decision, handoff creation/claim, or evidence record.

### Known gap: there is no read-only observation command

"Directly observed" currently has no non-mutating source. `node scripts/af.mjs companion <cmd>` dispatches exactly six subcommands — `start`, `join`, `vscode-start`, `prepare-materialization`, `continue`, `reset` — and every one of them mutates. `status`, `show`, `session`, `sessions`, `list`, and `get` all return `unknown companion command`. The protocol itself is documented in `docs/workbench/cli-companion.md`; read that before reasoning about the surface, and do not reconstruct it from `packages/web/` implementation files.

Until a read path exists, the gate resolves in exactly one of three ways, and you must pick one explicitly:

1. The turn already carries the scope because an implemented command returned it as a receipt in this same session. Use it.
2. The operation is read-only inspection. Proceed; observation is not a durable write.
3. Neither holds. **Stop, name the unobservable field as a Missing-Information item, and report the product gap.** Do not proceed with a partial check, and do not recover the values from the operator's session transcript or any other history — see `security-and-data.md`.

Option 3 is a real outcome, not a failure to try harder. Measured: when the card offered no third option, a strong model silently dropped the precondition and generated a full runtime anyway — the guardrail was routed around rather than fired. A gate that cannot be satisfied and cannot be declined is a gate that will be ignored.

## Ordinary sessions

Treat `unmanaged`, `pending_activation`, `revoked`, `expired`, stale, lease-expired, and scope-mismatched sessions as non-participants. Hook handling may fail open for their ordinary Codex work, but the Work Skills must not:

- add them to `active_runs`;
- attribute a user decision, review, handoff claim, artifact write, scaffold, or verification evidence to them;
- infer enrollment from a familiar cwd, one pending candidate, or the first listed session;
- upgrade their observations into durable lifecycle evidence.

An ordinary session may inspect and explain state. Before it performs lifecycle work, require a current Companion enrollment and exact confirmed attachment.

## Activation and attachment

Enrollment activation must come from a current supported origin and be confirmed by the resulting Companion session/lease state. An activation or attach request is not proof that activation or attachment succeeded.

Manual attachment always names the exact session, application, workspace, Work Item, and requested role. Confirm the resulting state before proceeding. Never select the newest, sole pending, default-target, or first active session as a convenience.

The current CLI may expose only part of this flow. Do not invent a command or claim success from command intent; use the observed Companion session contract and receipt returned by the implemented surface.

## Role boundaries

- `plan` owns non-mutating Discover conversation, question turns, and Plan/handoff preparation.
- `materialization` owns durable Work Item/artifact writes, Compose, Scaffold, and Verify evidence.
- A Plan session does not gain materialization authority because the mode changed.
- A materialization session does not inherit Plan decisions without exact handoff or confirmed attachment evidence.

After revocation, expiry, cwd change, application/workspace/work mismatch, or role mismatch, stop before the next durable operation and re-establish the exact scope.

## Verification

Record the observed session ID, turn ID, participation, lease ID/expiry, cwd digest, `workspace_id`, `application_id`, `work_id`, role, and check time. Correlate these with the current Work Item and operation; redact lease tokens and activation capsules.

## Stop conditions

Stop lifecycle work when participation, lease freshness, canonical cwd, exact scope, role, session, or turn is absent or ambiguous. Do not turn an ordinary session into a lifecycle actor by assumption.

## Sources checked

- `packages/web/src/companion/sessionContract.ts`
- `packages/web/src/companion/sessionContract.test.ts`
- `schemas/af-work-item.schema.json`

## Checked date

- Checked date: 2026-07-31
- Contract note: Companion-local enrollment state and the durable Work Item are correlated evidence, not interchangeable records.
- 2026-07-31: recorded that the participation gate has no read-only observation command — `scripts/af.mjs companion` dispatches only six mutating subcommands — and gave the gate an explicit third outcome (stop and report the gap). Pointed at `docs/workbench/cli-companion.md`, which no skill card had ever cited. Observed failure mode: with no declinable option, a strong model dropped the precondition silently and generated anyway.
