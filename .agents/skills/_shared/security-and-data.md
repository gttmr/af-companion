# Security and Data

## Purpose

Keep skill artifacts, fixtures, Runtime Handoff, and validation evidence safe for repository and local-review use.

## When to read

Read when requirements mention authentication, private systems, personal or financial data, external calls, side effects, audit, callbacks, ambient triggers, A2A, MCP, artifacts, or test fixtures.

## Decision criteria

Use the minimum data and authority needed for review:

- represent secrets by environment-variable names or secret references, never values;
- replace private endpoints and identifiers with synthetic placeholders;
- use deterministic synthetic inputs and outputs for mocks and smoke tests;
- separate read, write, notification, transaction, and approval side effects;
- require explicit auth, authorization, audit, masking, retention, and replay decisions where the pattern crosses a boundary;
- keep local Runtime Handoff and `/run` evidence distinct from production readiness;
- treat guardrail flags (e.g. `synthetic_only`, `no_private_data`) as declarations, not runtime checks — nothing validates them automatically, so a spec's own description can contradict a declared flag undetected;
- define what each guardrail flag means for the pattern before relying on it: if any identifier in a payload is a real production value, `synthetic_only` is not true regardless of what the flag says.

## Required evidence

Record:

- data classification and prohibited fields;
- source ACL and least-privilege requirement;
- secret injection mechanism and allowed environment-variable name pattern;
- side-effect and idempotency boundary;
- audit event, actor, correlation identifier, and redaction policy;
- retention/deletion requirement for state, artifacts, logs, and run ledgers;
- synthetic fixture provenance;
- threat or failure scenarios relevant to the selected runtime pattern.

## Artifact implications

Do not place any of the following in requirements normalized for examples, proposals, Catalog deltas, evidence, mocks, or generated source:

- credentials, tokens, keys, cookies, or secret values;
- private endpoints or internal hostnames;
- real customer or banking data;
- production payload captures or full private terminal history;
- organization-specific deployment scripts or runtime business logic.

Preserve only sanitized summaries and references. Catalog proposals may contain deterministic synthetic mock payloads, not production data.

The same list bounds what you may **read**, not only what you may write. In particular, do not read the operator's coding-session transcript — the file named by `CODEX_COMPANION_TRANSCRIPT_PATH`, or any equivalent agent/terminal history — to recover scope, identity, or lifecycle state. Measured: when a card demanded a scope value that no command exposes, a strong model went to that transcript and printed raw private session JSONL, and in doing so also read evaluator files it was supposed to be blind to. A missing observation surface is a Stop condition and a Missing-Information item, never a licence to mine the transcript. If a card asks you to observe something and no read command provides it, report that gap rather than sourcing it from history.

## Scaffold implications

- Use environment lookups with approved variable names; do not generate secret defaults.
- Default side-effecting examples to disabled, mocked, or manual-review paths.
- Add idempotency and duplicate-delivery handling for at-least-once tools, ambient triggers, and resume paths.
- Keep auth, timeout, retry, fallback, cancellation, and cleanup explicit for MCP/A2A connections.
- Do not emit deployment automation from a skill-only Runtime Handoff.

## Verification

- Inspect the changed-file inventory and generated artifact tree.
- Search the authorized output set for secret patterns, private hosts, and copied production payloads.
- Run applicable artifact validation and pattern-specific negative scenarios.
- Run this check on every mock spec file: `grep -inE 'synthetic_only|no_private_data|no_production_business_logic' <mock-spec-file>` to find each guardrail flag, then `grep -inE "real (data|customer|production)|production data|live data|actual customer" <mock-spec-file>` on the same file to find words asserting real/production/live data. If a guardrail flag declared `true` and any such real/production/live-data wording both appear in the same spec file, **read the matched lines before judging**. The grep is a finder, not a verdict: it matches safe negations such as "this fixture must not use production data" exactly as it matches a genuine contradiction. Treat it as a Stop condition only when a matched line actually asserts that real, production, or live data is present. Never wire this pattern into an automated hard stop — natural-language greps cannot tell an assertion from its negation. `packages/mock-lab/scripts/validate-mock-spec.mjs` does not currently perform this check (confirmed: it only asserts the guardrail keys equal `true`); a proper lint rule for this contradiction is still wanted. Note the path — an earlier revision of this card wrote it as `scripts/validate-mock-spec.mjs`, which does not exist. `scripts/validate-skills.mjs` resolves markdown `](…)` links only, so a path written inline in backticks is checked by nobody; run `ls` on any such path before writing it.
- Record redactions and residual security uncertainty without reproducing the sensitive value.

## Stop conditions

Stop when a task requires a real secret, private endpoint, customer record, unapproved side effect, production deployment authority, or retention policy that has not been decided, or when a matched line in the guardrail grep above actually asserts that real, production, or live data is present (a match alone is not the condition — read the line).

## Official sources checked

- [Operating Model security boundary](../../../docs/workbench/operating-model.md#7-보안비공개-경계)
- [Agent Factory local development security](../../../docs/workbench/local-dev-security.md)
- Pattern-specific ADK official pages linked from `adk/` cards

## Checked date

- Checked date: 2026-07-31
- Official sources: Agent Factory Operating Model and local-development security guidance
- Installed package version: `google-adk 2.4.0`
- Known compatibility note: Local Workbench and Runtime Handoff success is not evidence of production authorization, security review, or deployment readiness. A mock spec's prose must not claim real data while declaring `synthetic_only: true`; guardrail flags are declarations, not automatic runtime checks, so the Verification section above now specifies a grep-based check plus a Stop condition instead of relying on manual confirmation.
- 2026-07-31: corrected the `validate-mock-spec.mjs` path (it lives under `packages/mock-lab/scripts/`, not `scripts/`); note that `validate-skills.mjs` resolves markdown links only, so inline backticked paths go unchecked. Added an explicit prohibition on reading the operator's coding-session transcript to recover scope or identity — observed in a recorded run, where an unsatisfiable participation check drove a model into raw session JSONL.
