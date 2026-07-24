# Decision Input Adapter

## Purpose

Give structured and conversational decision input one canonical meaning. Tool availability changes presentation only; it never changes the decision, recommendation, evidence, or resolution standard.

## Capability detection

At the start of each decision turn, inspect the tools actually available in that turn.

- Use the structured path only when `request_user_input` is currently callable.
- Otherwise use the conversational path.
- Never infer availability from a Codex version, model name, configuration, prior turn, Plan Mode, or remembered environment.

Record the observed path as `structured` or `conversational` in Companion interaction provenance when the current contract supports it. Tool availability is not user consent.

## Canonical decision input

Both paths present the same canonical input:

- stable `decision_id`;
- current decision revision and matching recommendation revision;
- one question;
- the same materially distinct options;
- the same optional recommendation and rationale;
- the same evidence refs and material trade-offs;
- whether the decision is required and whether it is a hard, credential, deployment, security, or irreversible gate.

The current Work Item schema stores the recommendation on the Decision Record and stores a content-addressed revision for the decision set. Preserve the displayed recommendation revision in the Decision Plan, handoff, and provenance evidence; do not invent an unsupported per-record schema field.

## One-question turn

Ask exactly one interactive question per turn. Do not bundle two decisions into one structured call, numbered conversational prompt, or compound yes/no question.

For the structured path, submit one question through `request_user_input` and stop for the response.

For the conversational path:

1. render the same `decision_id`, revision, options, recommendation, evidence, and trade-offs in plain text;
2. ask exactly one question;
3. report the interaction outcome as `waiting_for_input`;
4. stop the turn;
5. perform no materialization, Compose work, review transition, or other downstream action in that turn.

If non-mutating Plan rules prohibit a ledger write, `waiting_for_input` is the turn outcome, not permission to forge a Work Item update.

## Normalization

Normalize both paths to the same schema-valid Decision Record semantics:

- open: selection and session/turn provenance remain null;
- resolved: the selected option is one of the displayed options, `selected_by` is `user`, and selection reason plus exact session/turn provenance are present;
- superseded: preserve the old record and link the replacement according to the current schema.

Do not add a path-specific decision type, reduce conversational answers to weaker provenance, or resolve a required decision from silence, timeout, likelihood, model preference, or an assumed default.

## Answer handling

Resolve only an unambiguous answer to the displayed matching decision and recommendation revision.

- An ambiguous, partial, conditional, contradictory, or out-of-option answer remains open. Present a normalized interpretation for confirmation as the next turn's one question, mark `waiting_for_input`, and stop again.
- `추천대로`, “use the recommendation,” or equivalent resolves only the recommendation that was displayed for the same `decision_id` and recommendation revision.
- Recommendation shorthand never resolves a hard, credential, deployment, security, or irreversible gate. Those require an explicit named option and confirmation of the material consequence.
- If options, evidence, or recommendation changed, issue a new revision and redisplay the question. Do not apply an answer to an older revision.
- A required decision has no default or assumption path.

## Compaction and fresh context

Preserve open and resolved decision refs, displayed options, selected option when any, evidence refs, decision revision, and recommendation revision. After compaction or fresh-session entry, re-read that state before asking or normalizing an answer. Never reinterpret `추천대로` against a newly generated recommendation.

## Verification

For each decision, show that the question path was selected from current tool availability, exactly one question was asked, the displayed and normalized semantics match, and any resolution has explicit user plus session/turn provenance.

## Stop conditions

Stop when tool availability is unknown, the displayed revision cannot be recovered, more than one question would be needed, the answer is ambiguous or conditional, a required choice is absent, or resolution would rely on recommendation shorthand for a protected gate.

## Sources checked

- `packages/web/src/companion/sessionContract.ts`
- `schemas/af-work-item.schema.json`
- `packages/web/src/analyzer/afWorkItem.ts`

## Checked date

- Checked date: 2026-07-24
- Contract note: presentation mode is turn-local; Decision Record semantics are path-independent.
