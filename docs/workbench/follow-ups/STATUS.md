# Follow-ups status

마지막 갱신: 2026-08-04 KST.

현재 실행 우선순위는 `packages/companion`의 App-scoped Graph/MCP 경로다. 이
경로를 primary development surface로 사용하고, 기존 `packages/web`
lifecycle은 migration 판단을 위한 legacy/reference로 유지한다. 22번의
App Server client 경계와 Graph/App workspace는 구현됐지만, App Server를
실제 turn 실행 UI에 연결하거나 기존 route를 제거하는 전환은 아직 하지
않았다. 19번과 20번은 evidence/legacy fallback으로 보존하고, 21번 ADK
구현은 Companion 최소 경로의 사용자 acceptance가 정리될 때까지 paused다.

| ID | 상태 | 범위 |
| --- | --- | --- |
| [18](./18-agents-cli-1-1-skill-adoption.md) | partial | standalone ADK base / Agent Factory overlay / Companion transport 경계와 ADK 2.4 기준은 완료. design dialogue, scope control, locator 교정, 별도 ADK app workspace·container/Gateway 설계는 잔여 |
| [19](./19-smart-cep-companion-adk-continuation.md) | evidence record | Smart CEP ADK와 Companion이 섞여 있던 2026-08-03 통합 여정. 실행은 20번과 21번으로 분리 |
| [20](./20-companion-lifecycle-ux-overhaul.md) | evidence / legacy fallback | Plan/Materialization workspace 충돌, launch acknowledgement 부재, 세 state plane 혼동 등 현 구조의 live failure를 보존. launcher 보강 구현은 22번 판단 전까지 중단 |
| [21](./21-smart-cep-google-adk-implementation.md) | paused | Page 추천 A2A provider와 Workflow 비교 구현은 Companion 최소 경로 재설계 결정까지 중단 |
| [22](./22-companion-simplification-vscode-extension.md) | partially implemented primary path | `packages/companion` Graph/App workspace와 독립 App Server client는 구현. turn 실행 UI 연결과 legacy route 제거는 미완료 |

legacy `packages/web` baseline은 다음과 같다.

- 외부 Codex CLI 또는 VS Code Codex extension이 네 Work Skill을 실행하고 artifact/source를 소유한다.
- Companion은 Hook activity, Work Item, artifact, Git diff를 실시간 투영한다.
- 웹의 유일한 canonical edit는 Compose Graph IR이며, 활성 Codex session과 optimistic concurrency가 필요하다.
- Runtime 실행, review 승인 변경, Catalog publish, 임의 파일 쓰기는 웹 API가 제공하지 않는다.
- ADK Runtime Handoff와 generator는 `>=2.4.0,<2.5.0` 계약을 사용하고 exact `google-adk 2.4.0`에서 검증한다.

현재 경로는 [INDEX](./INDEX.md)와 root `STATUS.md`를 따른다. 00–16은 `docs/archive/follow-ups/`의 역사 기록이다.
