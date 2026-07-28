# Fresh-context Handoff

## Purpose

Carry one approved Discovery Decision Plan into one exact fresh materialization context without hashing activation metadata into the Plan or guessing a session. Use the canonical Handoff when real revisions exist, and the deliberately narrower Bootstrap Grant only for the strict pristine Work Item.

## Canonical Plan body

The canonical Plan body excludes every Companion enrollment or handoff capsule. Canonicalization follows the current Companion contract exactly:

1. convert CRLF and CR newlines to LF;
2. remove leading and trailing empty lines only;
3. reject an empty result;
4. preserve all remaining bytes and line order;
5. append exactly one final LF;
6. reject embedded Companion enrollment or handoff capsule delimiters.

Compute `plan_body_hash` as the lowercase SHA-256 of the UTF-8 canonical Plan-body bytes. A canonical Handoff's existing `session_handoffs[].plan_hash`, or the claimed Handoff written during Bootstrap Grant materialization, must equal this Companion `plan_body_hash`; do not hash a capsule and do not invent a second Plan hash.

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

## Pristine Bootstrap Grant

Use a Materialization Bootstrap Grant only when the Work Item exactly equals the
strict default v2 ledger. It is not a second canonical Handoff type and must not
be used after real discovery or decision revisions exist.

After all Phase A decisions are explicit, pipe the canonical Plan body through
stdin from the exact enrolled Plan session and latest observed turn:

```bash
printf '%s' "$PLAN_BODY" | node scripts/af.mjs companion prepare-materialization \
  --work <work-id> --session <source-session-id> --turn <source-turn-id> [--root PATH]
```

The Bridge allocates the Grant ID and binds exact workspace/application/work,
source session/turn, pristine Work Item ETag, canonical Plan hash, target,
creation/expiry, and a one-time claim. The returned portable marker is:

```text
AF_MATERIALIZATION_GRANT=<grant-id>
AF_WORK_ITEM=<work-id>
AF_PLAN_BODY_HASH=<sha256>
AF_TARGET=materialize-discovery
```

`marker_digest` is only the checksum required by the current Work Item schema,
not a new authentication layer. Do not add a Capsule digest, transport
capability, invented bootstrap revision, or Phase A ledger write.

The Plan body is temporarily plaintext only in ignored Bridge `state.json`
under mode `0600`, omitted from public snapshots, receipts, browser responses,
and workspace descriptors, and erased on claim, failure, expiry, or
supersession. This is a local single-user integrity boundary: it protects
against accidental wrong-session, stale, and replayed continuation, not a
hostile process running as the same OS user.

A ready Grant survives Bridge/host restart. Continue rechecks its preserved
source record, exact latest source turn, non-revoked participation, pristine
Work Item ETag, Plan hash, scope, target, and expiry, then rotates the one-time
claim token. The old source lease need not remain active across restart. Only
the first prompt of one distinct fresh Materialization session may claim it.

Phase B must materialize real discovery and decision revision objects and
exactly one claimed `session_handoffs[]` record using the Grant ID as
`handoff_id`, the original source session/turn, actual revisions, Plan hash,
target, Grant creation/expiry, marker checksum, and claim session/turn/time.
After writing and validating that record, re-read the Bridge snapshot and
require the Grant to be `finalized`. Finalization is automatic exact-record
matching; there is no finalize command or endpoint.

## Transport and fallback order

Treat built-in fresh-context carriage as `unverified` unless a current first-prompt receipt proves the exact Plan body/capsule arrived intact. Client or model behavior is never assumed from version or configuration.

For a canonical Handoff, use this fallback order:

1. **Companion Continue** — the primary explicit fresh-session action for the exact handoff and scope;
2. **Copy Capsule** — copy the exact returned capsule byte-for-byte and present it in the fresh session's first prompt;
3. **Exact confirmed attach** — name the exact session and scope; its next leased prompt receives the same verified canonical Plan body and revisions without returning raw Capsule or Plan bytes to the browser.

The third path is an explicit durable target selection, not an automatic candidate claim. It does not relax Plan-body, marker identity, revision, decision, target, expiry, role, or provenance checks.

## Claim rules

A canonical Handoff claim succeeds only on the first prompt of a distinct fresh session when current evidence proves:

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

For a canonical Handoff, verify canonical Plan bytes independently, recompute the hash, prove public receipts contain no plaintext Plan body, inspect capsule separation, check exact Work Item Handoff ID/marker, expiry and scope/revisions/target, and correlate first-prompt plus claim receipts. For a Bootstrap Grant, verify the local mode-`0600` state may contain the Plan only before claim, every public surface omits it, restart preserves the ready Grant, Continue rotates the token, one fresh prompt claims it, Plan bytes are erased, and exact canonical materialization automatically finalizes it.

## Stop conditions

Stop when the Plan body contains a capsule, a hash differs, scope/target/expiry differs, a claim candidate is ambiguous, the selected session is not exact, or first-prompt claim evidence is absent. Also stop if a Bootstrap Grant is requested for a non-pristine Work Item, the pristine ETag or source turn drifts, real revisions would be invented, or Phase B cannot write and validate the one exact claimed canonical Handoff record.

## Sources checked

- `packages/web/src/companion/sessionContract.ts`
- `packages/web/src/companion/sessionContract.test.ts`
- `packages/web/server/codexBridgeStore.ts`
- `packages/web/server/codexBridgeStore.test.ts`
- `scripts/af.mjs`
- `schemas/af-work-item.schema.json`

## Checked date

- Checked date: 2026-07-28
- Contract note: capsule bytes are activation metadata and are never part of the canonical Plan body; a Bootstrap Grant is limited to pristine-ledger integrity continuity.
