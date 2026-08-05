# Agent Factory Companion — follow-up index

2026-07-23 hard cutover로 과거 Stage Runner backlog는 폐기됐다. 현재 계약과 구현 탐색점은 [Operating Model](../operating-model.md), [CLI Companion](../cli-companion.md), [Handbook](../../handbook/README.md), root `STATUS.md`를 따른다.

이전 Workbench UI·runtime bridge 후속은 제거된 Stage Runner 제품을 전제로 하므로 현재 구현 항목이 아니다. 완료된 00–16 기록은 `docs/archive/follow-ups/`에 역사 자료로 남아 있다. 17번 문서는 hard cutover로 폐기된 항목임을 자체 표기한다.

새 Companion 제품 작업은 우선 `packages/companion`의 App, Graph Control,
MCP, Web, App Server client 경계 중 어디에 속하는지 정한다. 기존 네 Work
Skill, `af-work-item.json`, external Codex Hook, Bridge 작업은 legacy
lifecycle 또는 migration compatibility가 명시된 경우에만 해당 canonical
문서에 기록한다.

## Current follow-up

- [18. agents-cli Skill 개선 잔여 선택 도입](18-agents-cli-1-1-skill-adoption.md) — `partial`; standalone ADK base / Agent Factory overlay / Companion transport 경계와 ADK 2.4 기준은 완료했고, design dialogue, scope control, version-aware verification, 별도 ADK application/GKE 경계는 잔여다.
- [22. Companion 단순화와 Codex App Server 직접 소유 전환](22-companion-simplification-vscode-extension.md) — `partially implemented evidence`; `packages/companion` Graph/App workspace와 독립 App Server client는 구현됐지만 Browser direct-host 우선 가설은 23번에 의해 primary 순서에서 대체됐다.
- [23. Companion skill-aware ADK 개발 프로그램](23-companion-adk-development-program.md) — `planned, exactly two sessions`; Session 1은 ADK 2.4 Workflow·Agent·Sub-agent capability evidence와 AF Skills vNext를 완성하고, Session 2는 외부 Codex, Graph selection, App source와 offline acceptance를 통합한다. 22번의 Browser App Server 직접-host 방향을 primary 순서에서 대체한다.
- [24. AF Skills vNext 설계와 evidence 범위](24-af-skills-vnext-program.md) — `planned Session 1 scope`; 낡은 `af-*` Skill을 Google 공식 Skill과 중복되지 않는 versioned Graph/Asset/context overlay로 다시 설계하며 loop·parallel·dynamic에 한정하지 않는 capability inventory와 종합 실험을 요구한다. Companion 코드와 같은 PR에 섞지 않는다.
