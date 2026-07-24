# Registry Publication and Reuse Evidence

## Purpose

Verify reusable Asset state and route publication through the canonical revision-checked Asset Registry service/CLI. `catalog-delta.yaml` and direct YAML edits are not current publication contracts.

## Decision criteria

Verification may establish that an exact draft/reviewed Asset version is ready for review or publication, but it never turns that finding into a user decision.

Publication requires all of the following:

- one exact `<asset-id>@<version>` in `reviewed` state;
- current contract, owner, domain, reuse, dependency, source/binding, and verification evidence;
- an explicit user publish decision for those exact bytes/version;
- the current Registry revision as `--expected-revision`;
- mutation through the single Registry service/CLI.

Published versions are immutable. A changed contract requires a new draft version. Published dependencies must resolve to published exact versions.

## Required evidence

- exact Asset ID, type, version, status, and contract hash;
- current Registry revision before and after any mutation;
- source refs or reviewed MCP/A2A binding/exposure;
- owner/domain/reuse decision and dependency compatibility;
- relevant generated/runtime/behavior evidence and residual uncertainty;
- explicit user decision provenance;
- exact CLI command, exit code, and returned Registry revision when publication was authorized.

## Canonical commands

Validate the exact Registry record:

```bash
node scripts/af.mjs asset validate <asset-id>@<version> --root <repo-root>
```

Publication is a reviewed optimistic-concurrency mutation:

```bash
node scripts/af.mjs asset publish <asset-id>@<version> --decision <decision-json> --expected-revision <registry-sha256> --root <repo-root>
```

Use `--registry <path>` only when the repository has explicitly selected a non-default Registry. Do not invent a publish command, omit `--expected-revision`, retry a conflict with a new revision without re-reading/reviewing, or edit `catalog/asset-registry.json` directly.

## Verification report guidance

In `validation-report.md`, record one of:

- `not_requested` — no publication claim/action was in scope;
- `candidate_unverified` — required evidence is missing;
- `ready_for_user_decision` — verification passed, but no explicit publish decision exists;
- `authorized_not_run` — a decision exists but the canonical mutation was intentionally deferred;
- `published` — the canonical CLI succeeded; include exact ref and resulting Registry revision;
- `publication_failed` — preserve the command error/conflict and unchanged revision.

Do not create a proposal file as a substitute for Registry state. A successful publication changes the Registry revision; refresh the Work Item Catalog snapshot and route any now-stale discovery, composition, scaffold, or verification evidence to its owning skill before making a current lifecycle claim.

## Boundary

Verify does not auto-publish. It may run the canonical mutation only under separate explicit authorization for the exact reviewed Asset/version and expected revision. It never writes Registry JSON or `catalog/*.yaml` directly.

## Stop conditions

Stop when the Asset is not `reviewed`, contract/version identity is ambiguous, dependencies are unpublished, user publication approval is absent, expected revision is stale, sensitive/private content would enter the Registry, or a direct-file/legacy-delta mutation is requested.

## Checked date

- Checked date: 2026-07-24
- Contract sources: `scripts/af.mjs`, `packages/agent-factory-core/src/assetRegistry.ts`, and `schemas/asset-registry.schema.json`
