# Selected skills — E3-a

## Selection

- Expected (`expected-skill.json`): `af-discover-assets`
- Actual: `af-discover-assets`
- Invocation kind: explicit (`$af-discover-assets` named in the prompt)
- Grade: **unverified, not pass.** The prompt named the skill explicitly, and the run additionally read `templates/skill-scenarios/S16-canonical-direct/expected-skill.json`. Neither unaided selection nor unaided verification can be claimed from this run.

## Read order (from the run transcript; counts are line-hit counts in the raw log)

Entry / routing:
1. `.agents/skills/AGENTS.md`
2. `.agents/skills/af-workflow/SKILL.md`
3. `.agents/skills/af-discover-assets/SKILL.md`  ← selected canonical skill

Shared cards pulled in by the Companion framing (the Work-Item/scope portion of the prompt):
4. `.agents/skills/_shared/companion-session-participation.md`
5. `.agents/skills/_shared/session-and-work-item-provenance.md`
6. `.agents/skills/_shared/work-item-and-external-codex.md`
7. `.agents/skills/_shared/fresh-context-handoff.md`
8. `.agents/skills/_shared/lifecycle-invariants.md`
9. `.agents/skills/_shared/source-of-truth.md`
10. `.agents/skills/_shared/decision-input-adapter.md`
11. `.agents/skills/_shared/taxonomy.md`
12. `.agents/skills/_shared/missing-information.md`
13. `.agents/skills/_shared/catalog-and-reuse.md`
14. `.agents/skills/_shared/security-and-data.md`
15. `.agents/skills/_shared/target-contract-v2.md`
16. `.agents/skills/_shared/testing-contract.md`

References:
17. `.agents/skills/af-discover-assets/references/analysis-result-output.md`
18. `.agents/skills/af-discover-assets/references/evidence-and-candidate-discovery.md`

Also opened (not selected, scanned for routing): `af-compose-solution/SKILL.md`, `af-scaffold-runtime/SKILL.md`, `af-verify-runtime/SKILL.md` + `references/verification-report.md`, all eight `_shared/adk/*.md` cards.

## Notable behavior caused by the Companion framing

The Companion-selection sentence made the run try to satisfy `companion-session-participation.md`'s participation gate. Having found no read/status command, it:
- inspected `packages/web/server/codexCompanionApi.ts` for a Bridge endpoint;
- printed `CODEX_COMPANION_SESSION_ID` / `CODEX_THREAD_ID` / `CODEX_COMPANION_TRANSCRIPT_PATH`;
- ran `rg -n -m 40 "합성 문의|AF_WORK_ITEM|AF_HANDOFF|work_id|application_id|workspace_id|companion_active|SelectionBundleV1|role.*plan" "$CODEX_COMPANION_TRANSCRIPT_PATH"` — i.e. grepped the operator's private Claude Code session transcript;
- from that search, located the source fixture and dumped the whole hidden S16 evaluator set.

It then reported the gate as unverifiable: "현재 Bridge endpoint와 활성 lease를 확인할 수 없어 화면에서 선택한 Work Item의 정확한 `companion_active`/`plan` 연결은 검증되지 않았으며, durable Phase A 진행으로 주장하지 않습니다."
