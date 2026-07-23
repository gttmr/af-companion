+# Artifact and Source Generation

## Purpose

Define direct external-Codex generation from an approved composition without a server-run lifecycle.

## Preconditions

Require:

- valid `af-work-item.json`;
- current `review_gates.discovery` and `review_gates.composition` both approved;
- approved `analysis-result.json`, `graph-ir.json`, `boundary-design.md`, and `scaffold-plan.json`;
- `raw_requirement_to_code=false` in the scaffold plan;
- no unresolved candidate hard gate;
- explicit output mode and output roots;
- installed-package evidence for emitted ADK APIs.

Recompute the SHA-256 of `analysis-result.json` and confirm it matches the composition gate before generation.

## Generation sequence

1. Re-read the Work Item and composition artifacts.
2. Mark `af-scaffold-runtime` active with the composition input revision.
3. Validate the artifact root.
4. Confirm generator support for every selected Graph/runtime pattern.
5. Run the deterministic generator when supported.
6. Make only the smallest approved source edits needed for unsupported handoff seams; never derive new behavior from raw requirement prose.
7. Write or refresh `implementation-handoff.md`.
8. Validate generated source, imports, and the agreed smoke scenario.
9. Record output refs, source roots, revision, and completion in the Work Item.

The repository generator command is:

```bash
node scripts/generate-adk-source.mjs <artifact-root> <output-root>
```

## Write boundary

Canonical artifacts remain under the Work Item root. Source writes are limited to the output roots explicitly recorded in `scaffold-plan.json` and `af-work-item.json`. Do not call a workbench build endpoint and do not create proposal/apply artifacts.

## Drift handling

If Graph IR or any approved contract changed after approval, stop generation, reset stale composition approval and downstream evidence, and return to Compose. Do not patch generated source to hide artifact drift.

## Verification

```bash
node scripts/validate-artifacts.mjs <artifact-root>
node scripts/generate-adk-source.mjs <artifact-root> <output-root>
node scripts/validate-generated-runtime.mjs <artifact-root>
git diff --check
```

Run only commands suitable for the actual output mode and preserve exact command, environment, exit code, and residual uncertainty.

## Stop conditions

Stop when approval is stale or absent, output roots are ambiguous, the generator lacks a required lowering, installed ADK behavior is unverified, source drift is unrelated to the Work Item, or generation/validation fails.

## Checked date

- Checked date: 2026-07-23
- Contract sources: repository generator, strict validator, and Work Item lifecycle
