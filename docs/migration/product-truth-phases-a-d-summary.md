# Product Truth Phases A–D 종료 요약

상태: **기존 Work Order를 종료하고 후속 제품 작업을 분리한다.**

이 문서는 2026-07-26부터 2026-07-27까지 수행한 Product Truth Work Order의 Phase
A–D 결과를 한곳에 보존한다. 실행 가능한 Agent application과 project-scoped MCP의
개별 client 동작은 증명했지만, 사용자가 기대한 Web과 VS Code의 통합 여정은 증명하지
못했다. 이 차이를 숨기지 않고 현재 작업을 종료한다.

## 사용자가 기대한 제품 여정

최종 acceptance에서 확인된 목표 사용성은 다음과 같다.

1. 사용자는 Agent Factory Web과 VS Code source를 동시에 본다.
2. Web에서 새 작업을 시작하거나 기존 작업을 선택하고 `VS Code`를 누른다.
3. 올바른 external application workspace와 exact Work Item/role의 Codex session이
   별도 capsule, ID 입력 또는 터미널 조립 없이 연결된다.
4. 사용자는 VS Code Codex에 자연어 요구사항을 입력하고 source를 직접 검토한다.
5. Web은 같은 작업의 Work Skill 진행, Decisions, Graph IR, generated source와 검증
   증거를 실시간으로 시각화한다.
6. 실패하면 “unsupported” 같은 포괄 문구가 아니라 missing Work Item, expired ticket,
   unclaimed activation 등 실제 원인과 다음 조작을 보여 준다.

Current Implementation은 2–3단계에서 끊어진다. Web은 repository projection과 별도
VS Code launch/enrollment controls를 제공하지만 Work Item bootstrap, workspace launch,
exact Hook activation을 하나의 사용자 행동으로 연결하지 않는다.

## Phase별 결과

| Phase | 수행 내용 | 증명된 결과 | 남은 한계 |
| --- | --- | --- | --- |
| A — Product Truth vertical slice | 새 OCR document classifier를 Discover → Compose → Scaffold → Verify | 별도 app local run 성공, behavior eval 2/2, ledger 11, 네 Work Skills complete, verification passed | local run 약 79분, 전체 Verify 약 98분, 일반 Decision 8 + Asset Decision 2, explicit resume와 외부 envelope/eval 수동 구성 필요 |
| B — MCP/Hook/Hybrid spike | 외부 app context 전달 경로를 같은 prompt로 비교 | MCP와 Hybrid는 Tool 선택 5/5, valid temporary decision 4/5; CLI MCP/Hybrid와 VS Code MCP 실제 호출 확인 | Current Hook은 external app에서 0-byte no-op, no-tool arm은 5회 중 4회 provenance를 날조, VS Code Minimal Hook은 미관찰 |
| C — Architecture Decision | Phase B 증거로 production boundary 선택 | project-scoped read-mostly MCP를 상세 context의 중심 채널로 승인 | canonical mutation, Session/Turn provenance, global scope, Native Windows는 의도적으로 제외 |
| D — 최소 production integration과 재검증 | production stdio MCP package, context export/project config, 두 번째 OCR slice, client/scope 검증 | CLI root/descendant 2/2와 VS Code Remote-WSL 1/1 MCP call, unrelated non-exposure, hand-written app run/eval 2/2 | canonical Scaffold/Verify 미완료, 12시간 이상 wall-clock, 수동 runtime/harness 유지, 기대한 Web → VS Code enrollment/visualization 여정 실패 |

Phase B의 상세 수치와 임시 구현 경계는
[spike status](mcp-hook-hybrid-spike-status.md), Phase C 선택은
[architecture decision](mcp-hook-hybrid-architecture-decision.md), Phase D 구현과 검증은
[production integration status](mcp-centered-production-integration-status.md)가 소유한다.

## 유지된 production 결과

- `@agent-factory/context-mcp`는 project-local stdio MCP이며 four-tool read-only
  surface만 제공한다.
- `scripts/af.mjs mcp export-context`는 explicit external application root에 bounded
  context와 project `.codex/config.toml`을 내보낸다.
- Workspace Trust와 MCP Tool approval은 사용자 gate다. User-level global MCP
  registration은 만들지 않았다.
- Canonical Work Item mutation, historical handoff claim, first/default target 추측,
  Codex session/turn ID 생성은 MCP에 추가하지 않았다.
- 기존 Companion Continue, exact Session Hook, Lease/Security 계약과 UI는 Phase D
  production change에서 수정하지 않았다.
- CLI on WSL과 VS Code Remote-WSL만 actual client evidence가 있다. Native Windows는
  unsupported다.

## 두 vertical slice의 결론

Phase A는 Agent Factory가 작은 external application을 실제로 만들고 검증할 수 있다는
Product Truth를 증명했다. Baseline app은
`/home/ilmaswsl/work/af-apps/product-truth-ocr-agent`의 clean HEAD
`e263e7aa1c48aacc807d83a6c41d10b7ad9efb2d`로 보존한다. Canonical ledger는 local
Factory artifact root에서 revision 11, 네 Skills complete, verification passed,
`active_runs=[]`, historical handoff pending/unclaimed 상태다.

Phase D의 새 Work Item `product-truth-mcp-production-slice`는 Discover와 Compose까지만
완료했다. Reviewed production OCR binding과 Function Tool lowering이 없어 canonical
Scaffold/Verify를 시작하지 않았다. 별도
`/home/ilmaswsl/work/af-apps/product-truth-mcp-ocr` app의 실제 run/eval 2/2는 유용한
runtime evidence지만 hand-written verification app이며 Agent Factory generated output이
아니다.

따라서 Phase D는 context 전달과 repository isolation은 개선했지만 end-to-end 시간,
Decision 수, source/harness 수동 구성 또는 session 연결 사용성을 개선했다고 말할 수
없다.

## 종료 직전 Web / VS Code 증거

- 없는 Work Item으로 `Create enrollment`를 누르면 server의 artifact 404가 frontend에서
  facade unsupported로 잘못 표현됐다.
- 실제 5분 TTL의 첫 ticket은 만료 후 시도되어 unclaimed였다.
- 두 번째 ticket은 TTL 안에 VS Code Codex에 입력했지만 일반 prompt로 처리됐다.
  Persisted state에는 claim/session/prompt receipt가 없었다.
- Web 상단 `VS Code`는 Factory worktree를 열 뿐 selected Work Item의 exact enrollment를
  함께 활성화하지 않는다.
- 결과적으로 사용자는 requirement 입력과 Web live visualization 단계에 도달하지
  못했다.

개별 VS Code MCP Tool call 성공은 이 Companion enrollment 실패를 상쇄하지 않는다.
MCP transport completion, domain outcome, Hook/session provenance와 제품 여정은 각각
별도 outcome이다.

## 보존과 제외

- Phase A baseline app과 canonical ledger/historical handoff는 수정하지 않는다.
- Phase B `/tmp` prototype, debug log, credential과 hard-coded developer path는
  production change에 포함하지 않는다.
- Phase D의 hand-written external app은 별도 uncommitted local repository다. Production
  source 또는 generated application으로 승격하지 않으며, 삭제 여부는 별도 사용자
  결정으로 남긴다.
- Local Bridge state와 test Work Item은 acceptance evidence를 이 문서와 Phase D 보고에
  요약한 뒤 production repository의 tracked artifact로 올리지 않는다.
- 이 change set은 새 Work Order, UI 변경, Hook 재설계, 새 Phase를 포함하지 않는다.

## 후속 Work Order의 제품 입력

새 작업 지시서는 별도 세션에서 작성한다. 그 지시서가 해결해야 할 제품 문제는 다음과
같다.

- Web을 사용자의 명확한 시작 surface로 정의한다.
- new/existing Work Item 선택, external application workspace, VS Code launch와 exact
  enrollment activation을 하나의 검토 가능한 흐름으로 만든다.
- 사용자에게 application/work/role ID, activation capsule, TTL과 Hook 내부 계약을
  정상 경로의 수동 입력으로 요구하지 않는다.
- 요구사항 입력은 VS Code Codex가 소유하고 Web은 같은 canonical Work Item을 live로
  투영한다.
- Work Skill 상태, Decisions, Graph IR, source/evidence가 어느 시점에 갱신되는지 화면에
  드러낸다.
- 서버 오류, domain rejection, expired/unclaimed enrollment와 client 미연결을 서로
  다른 오류로 표시하고 정확한 recovery action을 제공한다.
- 실제 VS Code session의 Hook receipt와 Web projection까지 관찰해야 지원을 선언한다.
  Contract test나 standalone MCP Tool call만으로 이 여정을 verified로 표시하지 않는다.

## 종료 판단

현재 Work Order는 **Stop**한다. Phase A–D에서 얻은 production-safe MCP 경계와 실행
증거는 유지하되, 추가 MCP Tool이나 임시 Hook fallback으로 목표 사용성의 부재를 덮지
않는다. 다음 작업은 이 종료 요약을 입력으로 삼아 Web/VS Code 제품 여정을 별도로
정의하고 승인받아야 한다.
