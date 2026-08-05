# Session 1 exact ADK 2.4 completion audit

Checked 2026-08-05. This audit covers Session 1 only and was executed without
Internet access, a cloud or local generative model, or deployment.

## Result

All Session 1 technical gates pass with the compatibility verdict
`compatible_with_corrections`.

- `agents-cli 1.3.1` does not directly depend on ADK, but its generated ADK and
  A2A ranges exclude exact ADK 2.4/A2A 0.3.
- `agents-cli 1.2.1` is the latest release in the approved local cache whose
  generated ranges admit the exact baseline. The final shared executable and
  four bundled Google Skills are all 1.2.1.
- The exact runtime is Python 3.13.12 with `google-adk 2.4.0`, `mcp 1.28.1`, and
  `a2a-sdk 0.3.26`.
- The current five AF Skill entrypoints were retained only after a primary-intent
  and durable-authority audit. Their names and count are not compatibility
  requirements; the manifest owns bundle membership and permits a later
  evidence-backed rename, split, or merge.

The detailed version transition is in the [compatibility report](session1-adk24-compatibility.md),
and the complete capability decisions are in the [capability index](session1-adk24-capability-index.md).

## Capability and experiment closure

| Evidence | Closed result |
|---|---:|
| Capability rows | 70 |
| `confirmed` / `corrected` | 48 / 12 |
| `unsupported` / `blocked` / `excluded_cloud` | 4 / 3 / 3 |
| Experiment rows | 64 |
| Exact-runtime cases | 46/46 passed |
| Positive / negative-failure / interaction | 13 / 16 / 12 |
| Compound topologies | 5 |
| Source-comparison conflicts | 9 |
| Small-model forward cases | 4 blocked, 0 passed |

The inventory explicitly baselines seven high/medium `unsupported` or `blocked`
rows. The validator derives the current gap set from the inventory rather than
printing a constant: accepted gaps are 7, new gap IDs are empty, and new gaps are
0. The qwen-dependent local adapter, context pressure, bounded-context selection,
and refusal runs remain blocked under the user's absent-model authorization; no
fallback was attempted.

## Verification ledger

| Command or check | Result |
|---|---|
| `agents-cli --version` and `agents-cli info --json` | final CLI 1.2.1; detector gap for `installed_skills` recorded |
| `agents-cli eval metric list` | exit 0; local metric discovery only |
| `AF_TEST_PYTHON=... node scripts/validate-af-skills-vnext.mjs --runtime` | 70 capabilities, 46 runtime cases, 10 bundle members; exit 0 |
| direct Python syntax compilation of probe and two MCP fixtures | 3/3 passed |
| four Target generator suites with `AF_TEST_PYTHON` set to the exact interpreter | 51/51 passed |
| `node --test scripts/af-skills-bundle.test.mjs` | 6/6 passed |
| `node scripts/af-skills-bundle.mjs verify` | 10 members verified |
| `node scripts/validate-skills.mjs` | 47 files, 41 Markdown, 5 Skills, 0 errors, 0 warnings |
| `node scripts/validate-artifacts.mjs` | `Artifact validation OK` |
| relative-link check over edited Markdown | 12/12 files passed |
| `git diff --check` | exit 0 |
| `git status --porcelain -- packages/companion` | empty |

One preliminary generator invocation omitted `AF_TEST_PYTHON` and therefore
looked for the absent checkout-local `.agent-factory/runtime/.venv/bin/python`.
Its 21 runtime/import cases failed with `ENOENT`; the 30 non-runtime cases passed.
The unchanged 51-case suite was immediately rerun against the recorded exact 2.4
interpreter and passed 51/51. This was an environment-selection failure, not a
behavioral pass or a code fix.

## Consecutive audits

Two consecutive `node scripts/validate-af-skills-vnext.mjs --audit` runs on the
same checkout exited 0 and produced byte-identical JSON:

| Field | Both runs |
|---|---|
| Bundle digest | `8bafba76b99095265b927b696eddbd6ea251c68039ff356a933efdb75db8350c` |
| Coverage fingerprint | `56568f937d4909ecda38046b3079cd3ffda919cc1b9b4e9a1bc24e16dc2c461c` |
| Accepted high/medium gaps | 7 |
| New high/medium gap IDs | `[]` |
| New high/medium gaps | 0 |

## Independent review

The read-only reviewer found no HIGH issue and four MEDIUM issues in the first
pass:

1. partial-copy cleanup could prevent restoration of a previous Skill tree;
2. a self-consistent bundle manifest was not an independent provenance root;
3. `digest` hashed stale declared member digests before aggregate recomputation;
4. `new_high_medium_gaps` was hard-coded to zero.

The implementation now removes a partial destination before restoration, requires
a separately supplied trusted expected bundle digest during installation, resolves
measured member digests before manifest and bundle hashing, and derives new gaps
from an explicit reviewed baseline. Fault injection, fully recomputed substitution,
and stale-digest regressions are included in the six bundle tests. The same reviewer
then concluded: `All four MEDIUM findings resolved; no new HIGH/MEDIUM findings.`

## Scope and residual boundaries

- Changed source is limited to AF shared ADK cards, the AF Skills bundle manifest,
  dependency-light validators/install tooling, Session 1 evidence/tests, and active
  status/decision documentation.
- `packages/companion` is unchanged.
- External Web calls, cloud models, managed/cloud execution, deploy, publish,
  cloud observability, and online installation remain excluded.
- Workflow live/bidi, a public Python Runner cancellation API, public compaction
  exports, Workflow A2A exposure in Agent Factory, and the recorded small-model
  cases remain explicitly unsupported or blocked; none is reported as PASS.
