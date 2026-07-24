# Asset Registry and Reuse

## Purpose

Use the versioned Asset Registry as the canonical Agent, Workflow, and Tool reuse surface. Search deterministically, disclose contract detail progressively, preserve exact versions and Registry revisions, and require explicit user decisions for reuse, creation, review, publish, and deprecation.

## Current boundary

The default Registry path in `scripts/af.mjs` is `catalog/asset-registry.json`. Web and CLI call the same `AssetRegistryService`; neither is an alternate file writer. The service validates under a lock, compares the caller's lowercase SHA-256 `registry_revision`, writes atomically, and returns the new revision.

The workbench's canonical writes are Graph IR and this versioned Registry only. Work Skills do not directly edit Registry storage or `catalog/*.yaml`.

Registry statuses are exactly:

```text
draft → reviewed → published → deprecated
```

Only a draft contract can be updated. A reviewed Asset can be published only with an explicit publish decision; a published Asset can only be deprecated, not edited. A changed contract requires a newly created version.

## Search and progressive disclosure

Use deterministic search before model comparison:

1. hard filters: Asset type, required I/O, side effect, domain, owner/policy, Binding/Exposure, runtime requirements;
2. structural compatibility and rejection reasons;
3. lexical/tag ranking;
4. optional model explanation of the bounded candidates;
5. explicit user Asset disposition.

Search returns the Registry revision, normalized query, considered-candidate evidence, accepted results, compatibility facts, rejection reasons, and `exact`, `compatible`, `partial`, or `none` match grades. It searches published versions by default and may include deprecated versions only when explicitly requested.

Use the supported disclosure levels:

- L0: `asset search` result cards;
- L1: `asset get <id>@<version> --level 1` with I/O, owner, domain, Binding, requirements, refs, and usage;
- L2: `asset get <id>@<version> --level 2` full versioned contract.

Do not load the whole Registry into model context. Read L0 first, then L1 for bounded candidates, then L2 only for final comparison or implementation.

## Work Item Asset decisions

For each required capability, preserve query/filter evidence, the bound Registry revision, considered exact Asset versions, match grade, compatibility/rejection facts, and one explicit user disposition:

```text
reuse_exact
reuse_new_version
compose_existing
create_project_draft
create_publish_candidate
defer
exclude
```

The model may recommend but never select. A required `asset_decisions[]` entry remains open with null selection/provenance until the user chooses. A changed Registry snapshot, selected version, or disposition stales discovery approval and downstream evidence bound to the old revision.

`reuse_exact` binds an existing exact version. `reuse_new_version` creates a new draft version from reviewed intent. `compose_existing` preserves the selected component versions. `create_project_draft` remains Work-Item-local. `create_publish_candidate` creates a Registry draft; it is not published merely because Discover, Scaffold, or Verify completes.

## Supported Asset CLI

These are the complete `asset` commands currently dispatched by `scripts/af.mjs`. Every command also accepts `[--root <path>] [--registry <path>]`.

```bash
node scripts/af.mjs asset search [--text <text>] [--type <agent|workflow|tool>] \
  [--required-input <name:type[:required|optional]>]... \
  [--required-output <name:type[:required|optional]>]... \
  [--side-effect-class <none|read_only|write|external_action>] \
  [--domain-scope <domain_specific|cross_domain|domain_neutral>] \
  [--business-domain <id>] [--owner <id>] \
  [--binding-kind <function|mcp|built_in|a2a|unresolved|none>] \
  [--exposure-protocol <a2a|none>] [--runtime-requirement <value>]... \
  [--include-deprecated] [--limit <positive-integer>]

node scripts/af.mjs asset get <asset-id>@<positive-version> [--level <1|2>]
node scripts/af.mjs asset compare <asset-id> <from-version> <to-version>
node scripts/af.mjs asset usage <asset-id>@<positive-version>
node scripts/af.mjs asset validate <asset-id>@<positive-version>
node scripts/af.mjs asset validate --contract <file>
node scripts/af.mjs asset create-draft --contract <file> --created-by <id> --expected-revision <sha256>
node scripts/af.mjs asset update-draft <asset-id>@<positive-version> --contract <file> --expected-revision <sha256>
node scripts/af.mjs asset review <asset-id>@<positive-version> --decision <file> --expected-revision <sha256>
node scripts/af.mjs asset publish <asset-id>@<positive-version> --decision <file> --expected-revision <sha256>
node scripts/af.mjs asset deprecate <asset-id>@<positive-version> --decision <file> --expected-revision <sha256>
```

`asset search` also accepts `--input` and `--output` as implemented aliases for `--required-input` and `--required-output`. Mutation commands require the exact current Registry revision and fail on conflict; do not retry against a new revision without re-reading and reconciling the changed Registry.

Review/deprecation decision files contain `decision_id`, `selected_by: "user"`, and `rationale`. Publish decisions additionally require `owner_confirmed`, `domain_confirmed`, and `reuse_confirmed` to be true. Do not invent a CLI `list`, `save`, `new-version`, `claim`, or generic mutation command.

## Scaffold implications

- Bind an existing Asset by exact ID/version and the Registry revision reviewed in the Work Item.
- Do not scaffold a draft/reviewed publish candidate as though it were a published reusable version.
- Preserve selected dispositions and component refs; never duplicate an exact reused Asset as a generated replacement.
- Use reviewed synthetic mocks only for local verification and keep private endpoints, credentials, customer data, deployment scripts, and production logic out of Registry contracts.

## Verification

For reads, preserve the command and returned `registry_revision`. For mutations, preserve the expected revision, result revision, exact Asset ref/version/status, and decision provenance. Then validate the Work Item and inspect direct-write absence:

```bash
node scripts/af.mjs work validate <work-id-or-path> [--root <path>]
git diff --check
```

## Stop conditions

Stop when compatibility is unproven, a required Asset decision is open, a selected version is absent or changed, the Registry revision is stale, publication/deprecation lacks explicit user provenance, a dependency needed for publication is not published, or an action would bypass the service or mutate an immutable version.

## Sources checked

- `scripts/af.mjs`
- `packages/agent-factory-core/src/assetRegistry.ts`
- `schemas/af-work-item.schema.json`
- [Taxonomy Reuse Governance](../../../docs/workbench/taxonomy.md#reuse-governance)

## Checked date

- Checked date: 2026-07-24
- Current contract: shared versioned Asset Registry with optimistic revision and atomic service mutations
