# Agent Factory Companion — follow-up index

2026-07-23 hard cutover로 과거 Stage Runner backlog는 폐기됐다. 현재 계약과 구현 탐색점은 [Operating Model](../operating-model.md), [CLI Companion](../cli-companion.md), [Handbook](../../handbook/README.md), root `STATUS.md`를 따른다.

이전 Workbench UI·runtime bridge 후속은 제거된 Stage Runner 제품을 전제로 하므로 현재 구현 항목이 아니다. 완료된 00–16 기록은 `docs/archive/follow-ups/`에 역사 자료로 남아 있다. 17번 문서는 hard cutover로 폐기된 항목임을 자체 표기한다.

새 Companion 제품 작업은 우선 `packages/companion`의 App, Graph Control,
MCP, Web 경계 중 어디에 속하는지 정한다. 기존 네 Work Skill,
`af-work-item.json`, external Codex Hook, Bridge 작업은 legacy lifecycle 또는
migration compatibility가 명시된 경우에만 해당 canonical 문서에 기록한다.

## Current follow-up

- [18. agents-cli Skill 개선 잔여 선택 도입](18-agents-cli-1-1-skill-adoption.md) — `partial`; standalone ADK base / Agent Factory overlay / Companion transport 경계와 ADK 2.4 기준은 완료했고, design dialogue, scope control, version-aware verification, 별도 ADK application/GKE 경계는 잔여다.
- [19. Smart CEP Companion/ADK 연속 실행 증거](19-smart-cep-companion-adk-continuation.md) — `evidence record`; 2026-08-03까지의 통합 여정을 보존하며 후속 실행은 Companion 20번과 ADK 21번으로 분리됐다.
- [20. Companion lifecycle UX 전면 개편](20-companion-lifecycle-ux-overhaul.md) — `evidence / legacy fallback`; 동일 workspace descriptor 재사용으로 Materialization Task가 시작되지 않은 live 결함과 현 구조의 문제 레지스터는 보존하되, launcher 보강 계획은 22번 extension spike 판단 전까지 진행하지 않는다.
- [21. Smart CEP Google ADK 구현](21-smart-cep-google-adk-implementation.md) — `paused`; 독립 Page 추천 A2A provider와 Workflow 비교 구현은 Companion 최소 경로 재설계가 결정될 때까지 중단한다.
- [22. Companion 단순화와 Codex App Server 직접 소유 전환](22-companion-simplification-vscode-extension.md) — `partially implemented primary path`; `packages/companion` Graph/App workspace와 독립 App Server client는 구현됐고, 실제 turn UI 연결과 legacy route 제거는 남아 있다.
