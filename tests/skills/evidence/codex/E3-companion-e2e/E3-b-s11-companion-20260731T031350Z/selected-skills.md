# Selected skills — E3-b

## Selection

- Expected (`expected-skill.json`): `af-scaffold-runtime`
- Actual: `af-scaffold-runtime`
- Invocation kind: **implicit** — the prompt never names a skill. Routing went `af-workflow` → `af-scaffold-runtime` from the Work Item's own `"focus_skill": "af-scaffold-runtime"` plus the approved-gate state in `context/af-work-item.json`.
- Grade: **pass**. The hidden evaluator files were not read in this run.

## Read order (grouped; counts are line-hit counts in the raw log)

Entry / routing:
1. `.agents/skills/AGENTS.md`
2. `.agents/skills/af-workflow/SKILL.md` (21)
3. `.agents/skills/af-scaffold-runtime/SKILL.md` (8)  ← selected

Required reading of the selected skill (all ten items of `af-scaffold-runtime/SKILL.md:38-49` were opened):
4. `_shared/source-of-truth.md`
5. `_shared/lifecycle-invariants.md` (14)
6. `_shared/work-item-and-external-codex.md`
7. `_shared/companion-session-participation.md`
8. `_shared/decision-input-adapter.md`
9. `_shared/fresh-context-handoff.md` (11)
10. `_shared/session-and-work-item-provenance.md` (20)
11. `af-scaffold-runtime/references/artifact-and-source-generation.md`
12. `af-scaffold-runtime/references/output-modes-and-handoff.md`
13. `_shared/target-contract-v2.md`

Pattern-selected cards (correct narrowing per `_shared/runtime-pattern-selection.md`):
14. `_shared/adk/human-input-and-resume.md` (19)  ← the load-bearing card for this scenario
15. `_shared/adk/graph-and-dynamic-workflows.md` (17)
16. `_shared/adk/agents-workflows-tools.md`
17. `_shared/adk/state-and-artifacts.md`, `callbacks.md`, `function-and-mcp-tools.md`, `ambient-agents.md`, `a2a.md`
18. `af-scaffold-runtime/references/generated-output-checks.md`
19. `_shared/testing-contract.md`, `_shared/security-and-data.md`, `_shared/missing-information.md`

Cross-skill cards opened for routing only (not selected): `af-discover-assets/SKILL.md`, `af-compose-solution/SKILL.md`, `af-verify-runtime/SKILL.md`.

## Non-`af-*` skills also consulted (worth noting)

`.agents/skills/google-agents-cli-workflow/SKILL.md`, `google-agents-cli-adk-code/SKILL.md` + `references/adk-workflows.md` + `references/adk-python.md`, `google-agents-cli-scaffold/SKILL.md`.
The run mixed the Agent Factory lifecycle skills with the upstream agents-cli skills in the same turn without any card telling it how the two families relate. No collision was observed here, but the precedence is undefined.

## Source-of-truth behavior

It did not trust the cards' ADK version. It probed the installed package directly
(`/home/ilmaswsl/work/adk-apps/.venv`, `google-adk 2.4.0`) and read
`google/adk/runners.py`, `google/adk/apps/*`, `google/adk/cli/fast_api.py` to confirm
`RequestInput`, `Runner.run_async(invocation_id=…)` and
`App(resumability_config=ResumabilityConfig(is_resumable=True))`. This is exactly what
`_shared/source-of-truth.md` asks for, and it is what let it survive defect #5.
