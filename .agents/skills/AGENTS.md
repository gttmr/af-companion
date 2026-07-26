# Agent Factory Coding-Agent Skills

## Scope

This tree contains the Agent Factory coding-agent skills and shared references.
Edit it only for explicit skill, DLC workflow, or skill-sync work.

## Structure

Entrypoint + four work skills (canonical):

- `af-workflow`: re-entrant entrypoint — checks Work Item revisions, gates, invalidations, runs, and handoffs; binds the external session; and routes to the skill that owns the current work.
- `af-discover-assets`: requirement → evidence-backed Agent/Workflow/Tool candidates, resources, dependencies, missing information.
- `af-compose-solution`: reviewed candidates → execution structure (standalone-or-Workflow decision, Graph IR, Invocation Control, Binding, runtime pattern contracts, scaffold readiness).
- `af-scaffold-runtime`: approved compose output → ADK project / Runtime Handoff bundle. Never consumes raw requirements.
- `af-verify-runtime`: five-level verification (skill structure, artifact contract, code correctness, runtime smoke, behavior evaluation) with evidence.

Only these five IDs are valid. Do not add aliases, compatibility entrypoints, or alternate stage IDs.

`_shared` is reference material only, never a triggerable skill. Pattern cards live under `_shared/adk/` and are read conditionally via `_shared/runtime-pattern-selection.md`, not all at once.

## Where To Look

| Task | Location |
| --- | --- |
| Which skill to run next | `af-workflow/SKILL.md` |
| Truth hierarchy and Target/Current/Blocker labels | `_shared/source-of-truth.md` |
| Re-entrant lifecycle, raw→code prohibition, review and invalidation invariants | `_shared/lifecycle-invariants.md` |
| Work Item, external Codex ownership, session handoff, review provenance, web write boundary | `_shared/work-item-and-external-codex.md` |
| Companion enrollment, ordinary-session exclusion, lease and exact-scope write gate | `_shared/companion-session-participation.md` |
| Structured/conversational decision input and normalized Decision Record semantics | `_shared/decision-input-adapter.md` |
| Canonical Plan body hashing, fresh-context carriage, claim, and fallback order | `_shared/fresh-context-handoff.md` |
| Application/workspace/work attachment and durable session/turn provenance | `_shared/session-and-work-item-provenance.md` |
| Asset taxonomy summary (canonical: docs/workbench/taxonomy.md) | `_shared/taxonomy.md` |
| Graph IR summary (canonical: docs/workbench/graph-ir.md) | `_shared/graph-ir.md` |
| Strict Target Contract v2 artifact shape | `_shared/target-contract-v2.md` |
| Missing-information hard/soft gates | `_shared/missing-information.md` |
| Security and synthetic-data rules | `_shared/security-and-data.md` |
| Asset Registry, search, versioning, mutation, and reuse boundary | `_shared/catalog-and-reuse.md` |
| Evidence → runtime pattern card routing | `_shared/runtime-pattern-selection.md` |
| Deterministic test vs behavior eval contract | `_shared/testing-contract.md` |
| ADK pattern cards (MCP, A2A, callbacks, event loop, ambient, human input, state, graph/dynamic) | `_shared/adk/*.md` |

## Local Rules

- Keep the five canonical IDs only. The normal forward path is Discover → Compose → Scaffold → Verify, but routing is re-entrant and follows current revisions, gates, invalidations, and failure ownership rather than a fixed next-stage counter.
- `af-scaffold-runtime` must not consume raw requirements or unapproved compose output.
- Tool Invocation Control uses only Workflow | Agent.
- New canonical artifacts write only strict Target v2 fields from `_shared/target-contract-v2.md`; do not emit retired fields or accept retired artifact shapes.
- Use `focus_skill` for the user's current surface and `active_runs` for live Plan, planning-subagent, materializer, Compose, Scaffold, and Verify actors.
- Each executing skill updates its own state and revision evidence without erasing unrelated runs or prior cycles. Review gates change only after an explicit user/reviewer decision with current Codex session and turn provenance.
- Required decisions never receive a model-selected default. “Use the recommendation” resolves only the displayed matching recommendation revision and never resolves a hard, credential, deployment, security, or irreversible gate.
- The workbench is a live projection with exactly two canonical write surfaces: Graph IR and the versioned Asset Registry. Lifecycle artifacts and source remain external-Codex writes.
- Web and CLI Registry mutations use the shared Asset Registry service with the current `registry_revision`; never edit the Registry file or `catalog/*.yaml` directly.
- A changed requirement, decision, Asset selection, Registry snapshot, Graph, root executable, runtime contract, scaffold, or verification subject must reset the owning review gate or stale downstream gates/evidence bound to the old revision.
- Preserve superseded discovery/composition cycles and invalidation history. Do not auto-merge an old Graph when Compose re-enters after Discover.
- Keep `_shared` references generic; skill-specific procedure belongs in that skill's `SKILL.md` or `references/`.
- Reference files stay version-neutral in name; record Checked date, official source, and installed package version inside the file.
- Canonical skills never reference retired skill IDs.
- Skill output under `artifacts/af/*` is ignored runtime data, not source to commit.

## Verification

- Structural validation: `node scripts/validate-skills.mjs`
- Documentation-only skill edits: `git diff --check`
- Contract-affecting artifacts: `node scripts/validate-artifacts.mjs`
- Scenario/trigger testing: see `tests/skills/README.md` (light models, fresh sessions, no answer leakage)
