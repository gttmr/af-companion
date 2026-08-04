# Verification Model

`af-verify-runtime` verifies current claims directly from the external Codex session. The workbench displays evidence; it does not execute a fixed command allow-list.

## Evidence levels

1. Skill structure and references.
2. Artifact/schema/cross-file contract.
3. Build, type, compile, import, and automated tests.
4. Runtime protocol and integration smoke.
5. Required success, failure, safety, duplicate, timeout, restart, and quality behavior.

Every claim records revision, environment, command/cwd, input, exit code, observed output, and residual uncertainty. File existence is not runtime proof; build success is not interoperability proof.

## Outcome

- `passed`: all required claims have fresh sufficient evidence.
- `failed`: at least one required claim is disproved.
- `unverified`: required evidence cannot be obtained.

`af-work-item.json` may mark Verify complete only with `verification.outcome: "passed"`. Discovery/composition review is never created by verification. A changed Registry, Graph, Root, contract, or scaffold revision makes claim-dependent evidence stale.

Retained Scaffold plans continue to receive schema and internal Graph-reference validation. Asset, Graph, and runtime-contract projection parity is checked against the current analysis aggregate unless the Work Item proves by exact file SHA-256 that the plan belongs to a stale Compose output or superseded composition cycle. Historical Return-to-Discover plans therefore remain inspectable without being mistaken for the current composition.

Common commands include:

```bash
node scripts/validate-skills.mjs
node scripts/validate-artifacts.mjs <artifact-root>
node scripts/validate-generated-runtime.mjs <artifact-root>
node scripts/af-cli.test.mjs
cd packages/web && npm run test:contracts
cd packages/web && npm run test:companion
cd packages/web && npm run build
```

These are examples, not a complete list. Choose the command that proves the actual claim and report environment blockers honestly.

For a completed Scaffold, `validate-artifacts.mjs` resolves and checks every declared `skills.af-scaffold-runtime.output_roots` entry. Relative paths are rooted at the Work Item artifact directory and absolute paths retain their reviewed external application boundary. Every declared root must contain a regular file. `validate-generated-runtime.mjs` remains the specialized wrapper for a generated artifact-local runtime bundle; an external output root instead uses compile, import, test, and runtime evidence from that workspace.
