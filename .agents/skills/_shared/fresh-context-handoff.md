# Fresh-context Handoff

## Purpose

Carry one approved Discovery Decision Plan into one exact fresh materialization context without hashing activation metadata into the Plan, guessing a session, or weakening revision and scope checks.

## Canonical Plan body

The canonical Plan body excludes every Companion enrollment or handoff capsule. Canonicalization follows the current Companion contract exactly:

1. convert CRLF and CR newlines to LF;
2. remove leading and trailing empty lines only;
3. reject an empty result;
4. preserve all remaining bytes and line order;
5. append exactly one final LF;
6. reject embedded Companion enrollment or handoff capsule delimiters.

Compute `plan_body_hash` as the lowercase SHA-256 of the UTF-8 canonical Plan-body bytes. The durable Work Item's existing `session_handoffs[].plan_hash` must equal this Companion `plan_body_hash`; do not hash a capsule and do not invent a second Plan hash.

## Handoff identity

A handoff identifies exactly:

- `handoff_id`;
- `workspace_id`, `application_id`, and `work_id`;
- source Plan session and turn;
- current discovery and decision revisions;
- `plan_body_hash` and separate capsule/marker digest when present;
- target `af-discover-assets.materialize`;
- creation and expiry times;
- claim session, turn, and time after a successful claim.

The Companion create request names the exact canonical Work Item `handoff_id` and `marker_digest`; the Bridge does not allocate a replacement identity. It also receives the complete canonical Plan body, recomputes `plan_body_hash`, and rejects any byte mismatch before authority exists. The 512 KiB JSON transport envelope is sized to carry a valid canonical Plan after worst-case escaping; the Plan itself remains capped at 64 KiB. The bounded Plan body is encrypted in ignored local state, omitted from snapshots and receipts, injected only into the exact successful claim's `additionalContext`, and erased on claim, cancellation, failure, expiry, supersession, source revoke, or restart. Snapshot projection rechecks active pending authority against the canonical Handoff and fails it closed with body erasure when the Handoff is removed or drifts.

## Transport and fallback order

Treat built-in fresh-context carriage as `unverified` unless a current first-prompt receipt proves the exact Plan body/capsule arrived intact. Client or model behavior is never assumed from version or configuration.

Use this fallback order:

1. **Companion Continue** — the primary explicit fresh-session action for the exact handoff and scope;
2. **Copy Capsule** — copy the exact returned capsule byte-for-byte and present it in the fresh session's first prompt;
3. **Exact confirmed attach** — name the exact session and scope; its next leased prompt receives the same verified canonical Plan body and revisions without returning raw Capsule or Plan bytes to the browser.

The third path is an explicit durable target selection, not an automatic candidate claim. It does not relax Plan-body, marker identity, revision, decision, target, expiry, role, or provenance checks.

## Claim rules

A claim succeeds only on the first prompt of a distinct fresh session when current evidence proves:

- current Companion enrollment and exact materialization scope;
- one exact unexpired canonical Work Item handoff selected by matching ID and marker digest/capsule, not by list position;
- application, workspace, Work Item, target, Plan hash, discovery revision, and decision revision match;
- the claim session differs from the source Plan session;
- claim session/turn/time and first-prompt receipt are present;
- the handoff is not claimed, expired, superseded, failed, or canceled.

Never auto-claim the sole pending candidate, newest candidate, default target, or first session. Ambiguity stops the turn.

## Compaction and resumed sessions

Compaction inside the same session is not a fresh-session claim. Re-read current scope, lease, Work Item, Plan hash, decision refs, recommendation revision, handoff state, and latest receipt. Preserve open and resolved decision refs; do not regenerate them from summary prose.

A resumed or forked session is not materialization-authorized until current participation and exact attachment/claim evidence prove it.

## Verification

Verify canonical Plan bytes independently, recompute the hash, prove local state and public receipts contain no plaintext Plan body, inspect capsule separation, check exact Work Item Handoff ID/marker, expiry and scope/revisions/target, and correlate first-prompt plus claim receipts. Record transport capability as observed; use `unverified` when built-in carriage was not proven.

## Stop conditions

Stop when the Plan body contains a capsule, a hash differs, built-in carriage is merely assumed, scope/revision/target/expiry differs, a claim candidate is ambiguous, the selected session is not exact, or first-prompt claim evidence is absent.

## Sources checked

- `packages/web/src/companion/sessionContract.ts`
- `packages/web/src/companion/sessionContract.test.ts`
- `packages/web/server/codexBridgeStore.ts`
- `packages/web/server/codexBridgeStore.test.ts`
- `schemas/af-work-item.schema.json`

## Checked date

- Checked date: 2026-07-24
- Contract note: capsule bytes are activation metadata and are never part of the canonical Plan body.
