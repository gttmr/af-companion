# Fresh-context Handoff

## Purpose

Carry one approved Discovery Decision Plan into one exact fresh materialization context without hashing activation metadata into the Plan or guessing a session. Prepare a revision-bound Handoff when real revisions exist, and use the deliberately narrower Bootstrap Grant only for the strict pristine Work Item.

## Canonical Plan body

The canonical Plan body excludes every Companion enrollment or handoff capsule. Canonicalization follows the current Companion contract exactly:

1. convert CRLF and CR newlines to LF;
2. remove leading and trailing empty lines only;
3. reject an empty result;
4. preserve all remaining bytes and line order;
5. append exactly one final LF;
6. reject embedded Companion enrollment or handoff capsule delimiters.

Compute `plan_body_hash` as the lowercase SHA-256 of the UTF-8 canonical Plan-body bytes. The claimed `session_handoffs[].plan_hash`, whether written from a re-entrant Handoff or Bootstrap Grant, must equal this Companion `plan_body_hash`; do not hash a capsule and do not invent a second Plan hash.

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

After all decisions are explicit, pipe the complete canonical Plan body to:

```bash
printf '%s' "$PLAN_BODY" | node scripts/af.mjs companion prepare-materialization \
  --work <work-id> --session <source-session-id> --turn <source-turn-id> [--root PATH]
```

For a non-pristine Work Item with current discovery and decision revisions, the
Bridge allocates the Handoff ID and marker, binds the exact source Work Item
ETag and revisions, and stores the encrypted bounded Plan only in ignored local
state. Phase A does not add a pending ledger record. The returned marker is:

```text
AF_WORK_ITEM=<work-id>
AF_HANDOFF=<handoff-id>
AF_DISCOVERY_REVISION=<discovery-revision-digest>
AF_TARGET=materialize-discovery
```

The 512 KiB JSON transport envelope is sized to carry a valid canonical Plan
after worst-case escaping; the Plan itself remains capped at 64 KiB. Public
snapshots and receipts omit it. Continue and Attach recheck the exact ETag,
revisions, source session/latest turn and lease, target, marker, hash, and
expiry. Drift fails closed and erases the encrypted Plan. A Bridge restart also
invalidates an unclaimed Handoff. A successfully claiming Materialization
session writes exactly one claimed `session_handoffs[]` record in Phase B,
using the Handoff's source revision objects and complete claim provenance.

The lower-level `/v1/handoffs` path remains valid when an exact pending Work
Item Handoff already exists; it names that existing ID and marker instead of
allocating replacements.

## Pristine Bootstrap Grant

Use a Materialization Bootstrap Grant only when the Work Item exactly equals the
strict default v2 ledger. It is not a second re-entrant Handoff type and must not
be used after real discovery or decision revisions exist.

The same `companion prepare-materialization` command creates this Grant when
the exact Work Item is pristine; it never creates a re-entrant Handoff with
invented revisions.

The generated trusted Plan Task uses `--sandbox workspace-write
--ask-for-approval on-request`; it does not enable sandbox network for the
session. Request approval only for this exact command when it needs to cross
the command sandbox to the loopback Bridge on port 8898. Never replace that
bounded request with global or persistent network access,
`danger-full-access`, a global approval-policy change, or a broad command
prefix. This approval enables transport only and grants no lifecycle
authority.

Treat host listener health, Web projection, Hook reachability, and shell-command
reachability as separate claims. A sandboxed `bridge_unavailable` error is not
evidence that the host listener is down. If exact-command approval is not
available, create no Handoff or Grant, report that capability gap, relaunch a fresh
trusted Plan Task, and use only its new current-prompt receipt.

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

For a re-entrant Handoff, use this fallback order:

1. **Companion Continue** — the primary explicit fresh-session action for the exact handoff and scope;
2. **Copy Capsule** — copy the exact returned capsule byte-for-byte and present it in the fresh session's first prompt;
3. **Exact confirmed attach** — name the exact session and scope; its next leased prompt receives the same verified canonical Plan body and revisions without returning raw Capsule or Plan bytes to the browser.

The third path is an explicit durable target selection, not an automatic candidate claim. It does not relax Plan-body, marker identity, revision, decision, target, expiry, role, or provenance checks.

## Claim rules

A re-entrant Handoff claim succeeds only on the first prompt of a distinct fresh session when current evidence proves:

- current Companion enrollment and exact materialization scope;
- one exact unexpired Bridge Handoff selected by matching ID and marker digest/capsule, not by list position;
- application, workspace, Work Item, target, Plan hash, discovery revision, and decision revision match;
- the claim session differs from the source Plan session;
- claim session/turn/time and first-prompt receipt are present;
- the handoff is not claimed, expired, superseded, failed, or canceled.

Never auto-claim the sole pending candidate, newest candidate, default target, or first session. Ambiguity stops the turn.

## Compaction and resumed sessions

Compaction inside the same session is not a fresh-session claim. Re-read current scope, lease, Work Item, Plan hash, decision refs, recommendation revision, handoff state, and latest receipt. Preserve open and resolved decision refs; do not regenerate them from summary prose.

A resumed or forked session is not materialization-authorized until current participation and exact attachment/claim evidence prove it.

## Verification

For a re-entrant Handoff, verify canonical Plan bytes independently, recompute the hash, prove public receipts contain no plaintext Plan body, inspect capsule separation, check exact Handoff ID/marker, source Work Item ETag, expiry and scope/revisions/target, and correlate first-prompt plus claim receipts. Also prove Phase A did not write the Work Item and Phase B wrote one claimed record. For a Bootstrap Grant, verify the local mode-`0600` state may contain the Plan only before claim, every public surface omits it, restart preserves the ready Grant, Continue rotates the token, one fresh prompt claims it, Plan bytes are erased, and exact canonical materialization automatically finalizes it.

## Stop conditions

Stop when the Plan body contains a capsule, a hash differs, scope/target/expiry differs, a claim candidate is ambiguous, the selected session is not exact, or first-prompt claim evidence is absent. Also stop if a non-pristine Work Item lacks current discovery/decision revisions, the source ETag or turn drifts, a Bootstrap Grant is requested for a non-pristine Work Item, real revisions would be invented, or Phase B cannot write and validate the one exact claimed Handoff record.

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
