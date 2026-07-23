# Work Skill Cutover Status

Checked 2026-07-23.

## Canonical tree

- `af-workflow` — read-only lifecycle router.
- `af-discover-assets` — evidence and asset candidates.
- `af-compose-solution` — Graph/contracts and Scaffold Readiness.
- `af-scaffold-runtime` — approved composition to source/handoff.
- `af-verify-runtime` — fresh five-level evidence.

No former-stage aliases or executable compatibility shims are supported.

## Current execution contract

- Work Skills run in the user's external Codex CLI or VS Code session.
- `artifacts/af/<work-id>/af-work-item.json` is the lifecycle ledger.
- Each skill updates its own state/evidence; review gates change only after an explicit user/reviewer decision with session and turn provenance.
- Canonical artifacts are written directly under the Work Item root; there are no run proposal/apply directories.
- Scaffold requires approved discovery/composition and never consumes raw requirement prose.
- Verify chooses commands by claim and writes current evidence; it does not use a server allow-list or self-approve.
- Work Skills never edit Catalog seeds.

## Structural proof

`node scripts/validate-skills.mjs` validates the exact five-skill tree, frontmatter, direct references, checked dates, and absence of retired executable skill IDs. Target v2 artifact behavior remains separately covered by schema, validator, generator, and scenario tests.

Historical scenario evidence under `tests/skills/evidence/**` describes the checkout in which it was captured and is not current lifecycle proof by itself.
