# Analysis Result Output

## Purpose

Define the canonical Discover outputs and the strict v2 `analysis-result.json` shape.

## Output paths

Write only inside the confirmed Work Item root:

```text
<artifact-root>/analysis-result.json
<artifact-root>/normalized-requirement.json
<artifact-root>/asset-candidates.json
<artifact-root>/analysis-summary.md
<artifact-root>/af-work-item.json
```

The split JSON files must be faithful projections of `analysis-result.json`. Discover may include a conservative draft Graph envelope needed by strict v2, but it does not decide final topology, invocation control, or runtime contracts.

## Required evidence

`analysis-result.json` contains:

```text
contract_version
normalizedRequirement
evidence
assetCandidates
a2aContracts
runtimeContracts
graph
```

`contract_version` is exactly `"2.0"`. Empty contract collections remain arrays. Each candidate preserves identity, `asset_type`, confidence, rationale, I/O, reuse, risk, status, missing information, side effect, auth, audit, and data-policy fields required by the active schema.

Reopen these sources before writing exact nested shapes:

- `schemas/analysis-result.schema.json`
- `packages/web/src/analyzer/types.ts`
- `scripts/validate-artifacts.mjs`

A2A stays on an Agent binding or exposure with its body in top-level `a2aContracts[]`. Do not create an A2A asset or split contract file.

## Work Item update

On successful output creation, set Discover to `waiting_for_review`, record the output paths and current output revision, and leave `review_gates.discovery` pending. Only an explicit reviewer decision may change that gate.

If an existing discovery artifact changes, reset discovery and composition review gates plus Scaffold/Verify evidence that depended on the old bytes.

## Verification

```bash
node -e 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))' <artifact-root>/analysis-result.json
node scripts/validate-artifacts.mjs <artifact-root>
git diff --check
```

Inspect that the output inventory contains no source code or files outside the Work Item root.

## Stop conditions

Stop when the root is ambiguous, required evidence is absent, the v2 shape cannot represent a decision, a candidate hard gate is hidden as an assumption, validation fails, or writing would escape the declared root.

## Checked date

- Checked date: 2026-07-23
- Contract sources: strict v2 schema, validator, and Work Item lifecycle
