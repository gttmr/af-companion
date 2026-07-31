# Follow-ups status

마지막 갱신: 2026-07-31 KST.

Open queue는 1개다. 2026-07-23 hard cutover로 Stage Runner, runtime chat/A2A 실행 UI, Mock Lab UI, Analyze·Design·Build·Verify 화면을 제거했기 때문에 기존 후속 항목은 현재 제품 범위가 아니다.

| ID | 상태 | 범위 |
| --- | --- | --- |
| [18](./18-agents-cli-1-1-skill-adoption.md) | partial | standalone ADK base / Agent Factory overlay / Companion transport 경계와 ADK 2.4 기준은 완료. design dialogue, scope control, locator 교정, 별도 ADK app workspace·container/Gateway 설계는 잔여 |

현재 baseline은 다음과 같다.

- 외부 Codex CLI 또는 VS Code Codex extension이 네 Work Skill을 실행하고 artifact/source를 소유한다.
- Companion은 Hook activity, Work Item, artifact, Git diff를 실시간 투영한다.
- 웹의 유일한 canonical edit는 Compose Graph IR이며, 활성 Codex session과 optimistic concurrency가 필요하다.
- Runtime 실행, review 승인 변경, Catalog publish, 임의 파일 쓰기는 웹 API가 제공하지 않는다.
- ADK Runtime Handoff와 generator는 `>=2.4.0,<2.5.0` 계약을 사용하고 exact `google-adk 2.4.0`에서 검증한다.

현재 경로는 [INDEX](./INDEX.md)와 root `STATUS.md`를 따른다. 00–16은 `docs/archive/follow-ups/`의 역사 기록이다.
