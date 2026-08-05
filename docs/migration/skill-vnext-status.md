# Work Skill Cutover and ADK 2.4 Evidence Status

Checked 2026-08-05.

## Canonical tree

- `af-workflow` — read-only lifecycle router.
- `af-discover-assets` — evidence and asset candidates.
- `af-compose-solution` — Graph/contracts and Scaffold Readiness.
- `af-scaffold-runtime` — approved composition to source/handoff.
- `af-verify-runtime` — fresh five-level evidence.

No former-stage aliases or executable compatibility shims are supported. The five names and count are not compatibility requirements: Session 1 retained them after verifying one primary intent and one durable authority boundary per Skill. The current bundle manifest owns membership and permits a later evidence-backed rename, split, or merge.

## Session 1 compatibility and capability closure

- `agents-cli 1.3.1` package itself has no direct ADK dependency, but its generated ADK/A2A ranges require ADK `>=2.5` and A2A SDK `>=1.0`; they exclude the exact ADK 2.4/A2A 0.3 baseline.
- The locally available latest admitting release, `agents-cli 1.2.1`, is installed with four required Google Skills at exact version/tree digest. Its generated source imports under exact `google-adk 2.4.0`.
- The [machine-readable inventory](../../tests/skills/adk24/capability-inventory.json) closes 70 rows; the [experiment matrix](../../tests/skills/adk24/experiment-matrix.json) contains 46 exact-runtime cases, 12 interactions, five compound topologies, and nine source conflicts.
- Actual `qwen3.6-small` runs remain evidence-backed `blocked` under the user-approved absent-model assumption. No external model fallback is enabled.
- The [bundle manifest](../../.agents/skills/af-skills-vnext-manifest.json) pins four Google Skills, five AF Skills, shared references, exact compatibility, model profile, intent/I/O contracts, and user-scope offline install/rollback digests.

## Current execution contract

- Work Skills run in the user's external Codex CLI or VS Code session.
- `artifacts/af/<work-id>/af-work-item.json` is the lifecycle ledger.
- Each skill updates its own state/evidence; review gates change only after an explicit user/reviewer decision with session and turn provenance.
- Canonical artifacts are written directly under the Work Item root; there are no run proposal/apply directories.
- Scaffold requires approved discovery/composition and never consumes raw requirement prose.
- Verify chooses commands by claim and writes current evidence; it does not use a server allow-list or self-approve.
- Work Skills never edit Catalog seeds.

## Structural proof

`node scripts/validate-skills.mjs` validates the current five-Skill tree, frontmatter, direct references, checked dates, and absence of retired executable skill IDs. `node scripts/validate-af-skills-vnext.mjs --runtime` validates the inventory/evidence/manifest links, installed CLI/Google Skill lock, exact ADK interpreter, complete deterministic runtime case set, and the explicit baseline for accepted high/medium gaps. `node --test scripts/af-skills-bundle.test.mjs` proves offline user-scope install with a separately supplied trusted digest, exact byte verification, partial-copy recovery, prior-byte rollback, and manifest/bundle tamper fail-closed behavior. Target v2 artifact behavior remains separately covered by schema, validator, generator, and scenario tests.

Historical scenario evidence under `tests/skills/evidence/**` describes the checkout in which it was captured and is not current lifecycle proof by itself.
