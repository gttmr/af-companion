# Verification Commands

## Purpose

Choose commands by claim and preserve the exact Work Item, Registry, generated-tree, and Git state tested.

## Rules

- Run from the confirmed repository and explicit target roots.
- Use the lightest command that proves the claim.
- Preserve exact argv, cwd, environment facts, start/end time, exit code, and concise output.
- Record `git rev-parse HEAD`, `git status --short`, and the relevant diff/inventory when the tested tree is dirty.
- Record current Work Item revision digests and Registry revision, not only the Git commit.
- Never report a stronger claim than the command supports.
- A stale result is `stale`, not `passed`; an unavailable required check is `unverified`.

## Current repository commands

Work Item and artifact contract:

```bash
node scripts/af.mjs work validate <work-id-or-path> --root <repo-root>
node scripts/validate-artifacts.mjs <artifact-root>
```

Exact Registry record and revision:

```bash
node scripts/af.mjs asset validate <asset-id>@<version> --root <repo-root>
node scripts/af.mjs asset get <asset-id>@<version> --level 2 --root <repo-root>
```

Generated runtime under the repository-standard artifact output:

```bash
node scripts/validate-generated-runtime.mjs <artifact-root>
```

Repository code checks when relevant:

```bash
npm run build --prefix packages/web
npm run test:companion --prefix packages/web
```

These commands are examples, not a server allow-list. Runtime identity, exact imported source, protocol connection, behavior, and fresh-session claim require targeted probes in the actual generated/session environment.

## Publication command boundary

Only after a separate explicit user decision for one exact reviewed Asset/version:

```bash
node scripts/af.mjs asset publish <asset-id>@<version> --decision <decision-json> --expected-revision <registry-sha256> --root <repo-root>
```

Do not replace this with `catalog-delta.yaml`, direct Registry JSON, or Catalog YAML edits. A revision conflict requires re-read and renewed review, not a blind retry.

## Session continuity evidence

There is no standalone CLI command that proves an automatic fresh-session claim. Inspect the current `session_handoffs[]` record and correlated Hook/Bridge/session evidence for exact Work Item, marker/plan digest, target, expiry, claim session/turn/time, cwd, and first-prompt delivery. If a new explicit materialization enrollment is required, use the implemented Join path:

```bash
node scripts/af.mjs companion join --application <application-id> --work <work-id> --role materialization --root <repo-root>
```

Join is not claim proof. Do not run it merely to make an automatic-claim test pass, and do not invent the removed `work attach-session` command.

## Environment failures

Distinguish product, artifact/source, Registry conflict, missing dependency, unavailable service, credential boundary, sandbox/network limitation, wrong runtime, and evidence gap. Record `failed`, `unverified`, or `stale` with the real cause; do not silently substitute a weaker command.

## Completion

Verification may be `passed` only when every required claim has fresh sufficient evidence at the current revisions and no required check failed.

## Checked date

- Checked date: 2026-07-24
- Contract sources: `scripts/af.mjs`, `scripts/validate-artifacts.mjs`, `scripts/validate-generated-runtime.mjs`, and `schemas/af-work-item.schema.json`
