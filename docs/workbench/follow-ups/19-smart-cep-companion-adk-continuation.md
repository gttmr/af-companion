# 19. Smart CEP Companion/ADK 통합 여정 증거

상태: **evidence record — execution work split into follow-ups 20 and 21**

작성일: 2026-08-03 KST

기준 checkout: `main` at `3510e792b89b5dff7dd3d5cea943cffc44e80669`

## 목적

Smart CEP 비교 애플리케이션 세 개를 만드는 실제 여정에서 발견한 Companion,
Work Skill, ADK generator의 문제를 다음 세션이 추정이나 질문 반복 없이 이어서
수정·검증할 수 있게 한다. 이 문서는 현재 계약의 대체 정본이 아니라 재현 증거와
미완료 작업을 보존하는 follow-up이다. 현재 계약은 [Operating Model](../operating-model.md),
[CLI Companion](../cli-companion.md), [Graph IR](../graph-ir.md), 현재 source를 따른다.

## 실행 작업 분리

이 문서는 2026-08-03까지의 통합 여정과 재현 증거를 보존할 뿐, 다음 세션의 실행
지시서로 사용하지 않는다. 후속 구현은 반드시 아래 두 작업 중 하나만 선택해 시작한다.

- [20. Companion lifecycle UX 전면 개편](./20-companion-lifecycle-ux-overhaul.md):
  Companion launcher, session/Handoff, 상태 투영, recovery와 Web UX만 수정한다.
- [21. Smart CEP Google ADK 구현](./21-smart-cep-google-adk-implementation.md):
  Page 추천 A2A provider, explicit Workflow, task/model Workflow, Mock MCP와 ADK Web
  end-to-end 비교만 구현한다.

한 세션이나 change set에서 두 작업을 함께 구현하지 않는다. 공통 과거 증거가 필요할 때만
이 문서를 참조한다.

아래의 “현재” 상태와 남은 순서는 각 dated checkpoint 당시의 기록이다. 새 세션의 현재
gate나 실행 순서로 해석하지 않는다.

## 북극성: 이 작업의 실제 완료 조건

Bootstrap Grant, Phase B, Graph IR, Scaffold는 최종 목표가 아니라 아래 ADK end-to-end
비교 환경을 만들기 위한 lifecycle 관문이다. 중간 gate를 통과했다는 이유로 이 작업을
완료 처리하지 않는다.

1. 기존 Workflow 1-1 ADK source를 복사하지 않고, 기존 전문 Agent와 Mock MCP Tool의
   exact 계약을 이용해 독립적인 Page 추천 A2A provider 앱을 8896에 만든다.
2. explicit 앱은 Google ADK graph/workflow 기능을 충분히 사용해 고정 순서의
   `1-1 remote Page 추천 → 1-2 CEP 시나리오 추천 → 1-3 synthetic 실행계획`을 8892에서
   수행한다.
3. task/model 앱은 같은 기능과 Tool 계약을 사용하되 hybrid router가 분석 Tool의
   호출 여부·순서·재호출을 판단하도록 만든다. 승인 Plan의 포트는 8900이지만 루트
   `AGENTS.md`의 `8900 remains spare` 규칙과 충돌하므로 실제 기동 전에 명시적으로
   해결하고, 어느 쪽도 조용히 변경하지 않는다.
4. 두 Workflow는 fixture나 자동 비교 launcher가 아니라 각각의 Google ADK Web chat에서
   동일 `objective_text`와 동일한 사람 답변으로 수동 비교한다. 두 앱은 provider를
   `RemoteA2aAgent`로 직접 호출한다.
5. remote `input-required`는 ADK Web에 inline long-running function call로 보여야 하며,
   사람의 function response 뒤에도 같은 function-call ID와 A2A `task_id`/`context_id`를
   보존해 같은 task를 `completed`로 resume해야 한다. 그 뒤에만 1-2와 1-3을 진행한다.
6. 두 비교 앱은 같은 모델·generation 설정과 공용 Mock Lab 8891을 사용하고, 공통 output
   `variant`, `synthetic`, `recommended_scenarios`, `execution_plan`, `evidence`, `trace`를
   반환한다. 실제 캠페인 write, 외부 실행, 자동 승인, model fallback은 하지 않는다.
7. Workbench 8890과 Companion Bridge 8898을 함께 띄워 lifecycle과 runtime을 사람이
   재현할 수 있어야 하며, 세 ADK 앱·Mock Lab의 포트, A2A pause/resume identity,
   MCP contract hash, 최종 output/evidence/trace를 fresh runtime evidence로 검증한다.

현재 남은 순서는 `Provider Compose review → Remote A2A same-task resume lowering 수정·검증 →
Provider Scaffold/Verify → explicit 및 task/model 각각 Discover/Compose/Scaffold/Verify →
네 runtime과 ADK Web end-to-end 비교`다. Provider Grant, Phase B, Discovery review는
2026-08-03에 완료됐고 Compose artifact는 review 대기 상태다.

## 제품 목표와 현재 lifecycle 상태

비교 대상은 세 개의 독립 application/Work Item이다.

| Work Item | Root 후보 | 전략 | 포트 |
| --- | --- | --- | --- |
| `smart-cep-scenario-compare` | `workflow.page-recommendation.cep-explicit-1-2-1-3@1` | `explicit_workflow` | 8892 |
| `smart-cep-scenario-compare-task-model` | `workflow.page-recommendation.cep-task-model-1-2-1-3@1` | `hybrid` | 8900 |
| `page-recommendation-a2a-provider` | `agent.page-recommendation.a2a-required-page-selection@1` | `agent_delegation` | 8896 |

공용 Mock Lab은 8891, Companion Bridge는 8898이다. 두 Workflow는 같은 A2A
provider를 `RemoteA2aAgent`로 호출하고, 사람이 ADK Web의 inline long-running
function-call UI에서 같은 답을 제공한 뒤 1-2 시나리오 추천과 1-3 synthetic
execution plan을 수행하는 것이 목표다. 실제 캠페인 write/approval은 범위 밖이다.

2026-08-03 현재 세 Work Item은 source generation 전이다.
`page-recommendation-a2a-provider`는 ledger revision 3이며 Discover가 current exact
binding으로 승인·완료됐다. Compose artifact는 생성됐고 composition gate가 pending인
`waiting_for_review` 상태다. Scaffold와 source generation은 시작하지 않았다.
나머지 두 비교 Work Item도 source generation 전이다. Workbench의 `terminal connected`는
active Companion projection일 뿐 개별 lifecycle gate 완료 증거가 아니다.

### 확정된 Provider Discovery selection

아래 내용은 사용자가 승인했고 Phase B와 Discovery review를 거쳐 canonical revision으로
materialize된 provider selection이다. 새 session은 이를 다시 질문하지 않고 현재 Work Item의
revision과 gate binding을 검증해 사용한다.

- Discovery revision:
  `913a15a46edd82c630874d46035d2262644cfd3b61b78fe6dbf3cfcd6821311f`
- Decision revision:
  `cdacb628eb4a2003f5d21d9e5845c3f250ac99dee6ed7bf2a0e07597ac8da893`
- Asset-decision revision:
  `93b517ebe5ab7b090f62e4a2dac0d1d15bb93644cb1d6ef9b7b72cf40f3ae652`
- Discovery artifact ETag:
  `7ca6c98990546066540d4602721fd4bb5001f08fd55c7398d246a93adb313299`

- Registry revision:
  `2a303eed929d252d012bd69d86acbf6314c6e270cd76726e79ebe6d19b7c327f`
- strategy: `agent_delegation`
- owner: `AI공통플랫폼팀`
- 모든 신규 Asset: project-only
- Root create project draft:
  `agent.page-recommendation.a2a-required-page-selection@1`
- reuse exact Agent:
  - `agent.page-recommendation.objective-classifier@1`
  - `agent.page-recommendation.tool-argument-builder@1`
  - `agent.page-recommendation.initial-page-selector@1`
  - `agent.page-recommendation.analysis-synthesizer@1`
- reuse exact Tool:
  - `tool.page-recommendation.get-scenario-taxonomy@1`
  - `tool.page-recommendation.search-page-candidates@1`
  - `tool.page-recommendation.search-page-products@1`
  - `tool.page-recommendation.run-userflow-analysis@1`
  - `tool.page-recommendation.recommend-scenario-by-behavior-type@1`
  - `tool.page-recommendation.analyze-page-customer-relation@1`
- runtime exclude:
  - `workflow.page-recommendation.required-page-selection@1`
  - `workflow.page-recommendation.workflow-1-2-placeholder@1`
- input: `objective_text`
- output: `broad_handoff_payload`
- 기존 1-1 Workflow를 감싸지 않고 전문 Agent와 Tool로 1-1 책임을 재구성한다.
- A2A exposure를 제공하며 Human Input은 inline long-running function call로 표현한다.
- resume은 같은 function-call ID와 A2A `task_id`/`context_id`를 사용한다.
- input-required 자동 만료, 자동 task 재시작, model fallback은 없다. 사용자 cancel은
  remote task `canceled`로 끝난다.

두 Workflow Work Item에 대해서도 다음 disposition이 이미 승인됐다.

Explicit:

- create project draft:
  - `workflow.page-recommendation.cep-explicit-1-2-1-3@1`
  - `agent.page-recommendation.remote-provider-explicit@1`
  - `tool.page-recommendation.generate-synthetic-execution-plan-explicit@1`
- reuse exact:
  - `tool.page-recommendation.run-userflow-analysis@1`
  - `tool.page-recommendation.analyze-page-customer-relation@1`
  - `tool.page-recommendation.recommend-scenario-by-behavior-type@1`
- 분석 Tool 두 개를 명시적으로 호출하고 추천 Tool, execution-plan Tool 순서로
  진행한다.

Task/model:

- create project draft:
  - `workflow.page-recommendation.cep-task-model-1-2-1-3@1`
  - `agent.page-recommendation.cep-tool-router@1`
  - `agent.page-recommendation.remote-provider-task-model@1`
  - `tool.page-recommendation.generate-synthetic-execution-plan-task-model@1`
- reuse exact: Explicit과 같은 published Tool 세 개
- router Agent가 분석 Tool 호출 여부·순서·재호출을 판단하되 시나리오 추천 Tool은
  반드시 호출한다.

두 Workflow 모두 외부 `objective_text`를 받아 provider 8896을 직접 호출하고 completed
`broad_handoff_payload`를 소비한다. 공통 output은 `variant`, `synthetic: true`,
`recommended_scenarios`, `execution_plan`, `evidence`, `trace`다. execution-plan binding은
각 Work Item-local 후보지만 Mock Lab 구현은 하나의
`wf-page-recommendation-mock/generate_synthetic_execution_plan`이며 동일 입력에 동일
결과를 반환한다. 필수 MCP 일시 오류는 한 번만 재시도하고 추천 또는 execution-plan
실패 시 model fallback 없이 구조화 오류를 반환한다.

## 이번 여정에서 확인한 문제

### A. current prompt에서 lifecycle provenance를 관찰할 수 없었음

Bridge는 active session과 prompt receipt를 private state에 저장했지만 일반 leased
`UserPromptSubmit` Hook 응답은 context 없이 끝났다. Work Skill은 private Bridge state나
과거 session에서 authority를 복원하면 안 되므로, 사용자가 새 Plan session을 여러 번
열어도 `workspace_id`, `session_id`, `turn_id`, lease와 cwd digest를 현재 prompt의
신뢰 가능한 입력으로 확인할 수 없었다.

현재 working tree 수정:

- 모든 valid top-level leased `UserPromptSubmit`에 non-secret
  `current_prompt_participation` receipt를 `additionalContext`로 반환한다.
- receipt는 exact scope/session/turn/lease metadata만 포함한다.
- lease token, activation Capsule, prompt/transcript, Tool payload, Plan body는 제외한다.
- Handoff, Grant, Graph context가 함께 전달되면 receipt 뒤에 결합한다.
- duplicate, unmanaged, revoked, expired, wrong-scope, subagent event는 기존처럼
  context를 받지 않는다.

관련 source/test:

- `packages/web/server/codexBridgeStore.ts`
- `packages/web/server/codexBridgeStore.test.ts`
- `packages/web/server/codexBridgeServer.test.ts`

### B. lifecycle role과 Codex collaboration permission을 혼동했음

VS Code launcher는 `--role plan`으로 Companion lifecycle attachment를 만들지만 Codex
Plan collaboration mode를 선택하지 않는다. 실제 유효 session의 Hook metadata는
`permission_mode: bypassPermissions`였다. 그런데 Grant/Handoff 일부 gate가
`source.permission_mode === "plan"`을 추가로 요구해 유효한 `role: plan` session을
거부했다.

현재 working tree 수정:

- Grant 생성, Handoff 생성/계속/consume/reconciliation, Web materialization workspace
  launch에서 `permission_mode` 권한 검사를 제거했다.
- lifecycle `role: plan`, active participation/status, current lease, current latest prompt
  receipt, exact workspace/application/Work Item/session/turn 검사는 유지했다.
- 반대 회귀도 추가했다. `permission_mode: plan`이어도 lifecycle role이
  `materialization`이면 Grant 생성은 거부된다.

관련 source/test:

- `packages/web/server/codexBridgeStore.ts`
- `packages/web/server/codexCompanionApi.ts`
- `packages/web/server/codexBridgeStore.test.ts`
- `packages/web/server/codexCompanionApi.test.ts`

### C. `bridge_unavailable`이 host Bridge 부재가 아니라 command sandbox 차단이었음

실패 당시 host에는 PID가 존재했고 `127.0.0.1:8898` listener와 Workbench facade의
`bridge_available: true`가 확인됐다. 동시에 generated VS Code Plan terminal의 Codex는
다음 형태로 실행됐다.

```text
codex --sandbox workspace-write \
  --config sandbox_workspace_write.writable_roots=[<application-root>]
```

수정 전 launcher에는 `--ask-for-approval on-request`가 없었고 전역
`approval_policy = "never"`가 상속됐다. command sandbox의 network도 기본 차단되므로,
shell에서 실행한 `companion prepare-materialization`은 host loopback Bridge에 연결하지
못했고 exact-command 승인을 요청할 수도 없어 `bridge_unavailable`로 축약됐다. 웹의 연결
표시와 Plan command의 연결 실패는 서로 모순이 아니다. Hook adapter가 도달하는 경로와
agent shell command의 sandbox가 다르다.

수정된 launcher argv는 다음과 같다.

```text
codex --sandbox workspace-write \
  --ask-for-approval on-request \
  --config sandbox_workspace_write.writable_roots=[<application-root>]
```

구현한 단기 해법:

1. 전체 session network를 켜지 않는다.
2. generated trusted Plan Task에 per-session `--ask-for-approval on-request`를 명시한다.
3. exact `companion prepare-materialization` 한 명령만 host-network/unsandboxed approval
   경로로 실행한다.
4. 해당 실행 capability가 없으면 멈추고 정확히 보고한다.
5. Bridge 재시작 뒤에는 이전 session/turn/lease를 재사용하지 않고 `Start AF Session`으로
   새 lifecycle Plan session과 새 prompt receipt를 만든다.

`scripts/af.mjs`와 `scripts/af-cli.test.mjs`가 이 argv 계약으로 수정됐고 targeted CLI
suite 10/10이 통과했다. 이후 fresh Provider Plan session에서 exact-command approval,
Grant 생성·claim·자동 finalization까지 live acceptance가 완료됐다.

장기 제품 개선 후보:

- CLI가 listener 없음, 인증 실패, command sandbox/network denial을 모두
  `bridge_unavailable`로 뭉개지 않도록 진단 code를 분리한다.
- persistent/global network enable 대신 local Bridge 한정의 bounded transport가
  가능한지 검토한다. Unix socket 또는 host-owned trusted task 같은 대안은 별도 설계와
  Windows/WSL 검증 없이 즉시 도입하지 않는다.

### D. Work Skill에 bounded Bridge 실행 지침이 부족함

AF Skill은 exact receipt와 Grant 계약에 더해 generated Plan terminal의 command sandbox가
8898을 막을 수 있다는 운영 경계를 명시하도록 수정했다.

- `af-workflow`: lifecycle role과 Codex collaboration/approval mode를 분리하고
  `/plan` 또는 `permission_mode`를 Grant authority로 취급하지 않는다.
- `af-discover-assets`: `prepare-materialization` 직전에 current prompt receipt를
  검사하고, exact local Bridge command에만 bounded host-network approval을 요청하는
  절차와 실패 분류를 추가한다.
- 공통 handoff reference: Bridge host health, Web projection, Hook reachability, shell
  command reachability가 서로 다른 claim임을 명시한다.
- 어떤 Skill도 private Bridge state나 과거 session history에서 session/turn/lease를
  복원하지 않는다.

수정 source는 `af-workflow`, `af-discover-assets`, 공통
`fresh-context-handoff`, `companion-session-participation`이다. current-prompt receipt를 현재
turn의 primary direct source로 사용하고, private Bridge state나 과거 session history에서
session/turn/lease를 복원하지 않는 계약도 함께 정렬했다. live fresh-session forward test는
아직 남아 있다.

### E. Remote A2A `input-required` same-task resume lowering이 미완료임

공유 generator의 `scripts/adk-source/remote-a2a.mjs`는 현재 remote task state가
`input-required` 또는 `auth-required`이면 event를 한 번 yield한 뒤 RuntimeError를
발생시킨다. 이 동작은 fail-closed에는 맞지만 이번 제품 요구인 ADK Web inline Human
Input 응답 후 같은 A2A `task_id`/`context_id` resume를 충족하지 않는다.

Compose/Scaffold 전에 필요한 변경:

- 설치된 exact `google-adk==2.4.0`의 `RemoteA2aAgent` source와 ADK Web event handling을
  다시 확인한다.
- long-running function-call ID와 A2A `task_id`/`context_id`를 보존한다.
- user function response를 원격 task에 다시 붙여 same-task resume한다.
- 기존 “input-required 뒤 RuntimeError” generator test를 pause/resume 성공과 cancel,
  stale/mismatched task 실패 테스트로 교체한다.
- explicit Workflow와 task/model Workflow 모두 같은 lowering과 provider를 사용한다.

ADK 2.4 설치 자체나 upstream `RemoteA2aAgent` capability만으로 generated source가 이
계약을 만족한다고 주장하지 않는다. ADK Web에서 실제 inline 응답 전후 event/task
identity를 관찰해야 한다.

### F. Home의 시작 상태가 pending enrollment를 `VS Code 시작 전`으로 표시함

2026-08-03 live 재현에서는 Provider `vscode-start`와 Codex 프로세스가 실행 중이고
`af_vscode_launch` enrollment ticket도 pending이었지만, Home은
`Codex terminal · VS Code 시작 전`을 표시했다. 아직 첫 prompt가 없어
`companion_active` session이 없는 것은 정상이나, VS Code/Task가 이미 시작된 상태까지
“시작 전”으로 표현하는 문구는 부정확하다.

현재 source 원인은 `packages/web/src/routes/WorkspaceHome.tsx`의 `launchStage`가 browser
local state로 `idle`에서 시작하고, `displayedLaunchStage`가 active session만 복원하며
pending `af_vscode_launch` ticket을 상태 제목에 반영하지 않는 것이다. 페이지 refresh나
다른 창에서 launch한 경우 실제 pending state를 잃는다.

후속 UI 수정에서는 최소한 다음 상태를 구분한다.

- launch/ticket 없음: `VS Code 시작 전`
- exact pending `af_vscode_launch` ticket 있음: `Codex terminal · 첫 prompt 대기`
- current exact session이 `companion_active`: `Companion 연결됨`

pending ticket은 launch intent이지 connection proof이므로 “연결됨”으로 승격하지 않는다.
UI 수정 시 `frontend-skill`, real screen 확인, screenshot과 journey recovery regression을
함께 적용한다.

### G. Web ownership validator가 canonical Agent delegation Graph를 거부했음

Provider Compose Graph는 `workflow_ref: null`인 Agent Root와 네 delegated Agent를
`Input → Root`, `Root → delegated Agent`, `Root → Output`의 channel 없는 `next` edge로
연결한다. 이는 [Graph IR](../graph-ir.md)의 `agent_delegation` 계약과
`scripts/adk-source/root-executable.mjs`의 lowering 조건에 정확히 맞지만, Web의
`graphOwnershipReadinessIssues`가 모든 Agent Node를 explicit execution Node로 세어
“explicit execution Node 5개” 오류를 냈다. CLI artifact validator와 generator가 통과한
반면 Web strict parser만 실패하는 split validation이었다.

현재 working tree 수정:

- Web ownership guard는 canonical standalone Agent delegation star topology만 예외로
  허용한다.
- Agent 간 순차 실행, Agent+Tool, private/control Node, Region, 조건·data channel은 계속
  owning approved Workflow를 요구한다.
- Target parser와 scaffold readiness에 정상 delegation/잘못된 sequencing 회귀 test를
  추가했다.
- Work Item, Graph IR, composition ETag, Registry bytes는 수정하지 않았다.

검증 결과:

- Provider `analysis-result.json`의 Web strict parser: PASS
- 실행 중 Workbench의 Provider Graph API: HTTP 200, composition ETag
  `c5609dd8f0d6e6b05979266af32c61a4bd683450400fb1d958c287ee175e1f4d`
- `test:contracts`: TypeScript 23/23 + artifact/generator 87/87 PASS
- Web TypeScript/Vite build: 581 modules PASS

## 현재 working tree와 검증

기존 사용자 소유 untracked 파일은 수정하거나 stage하지 않는다.

- `agent-factory-web-first-journey-work-order.md`
- `agent-factory-web-first-next-session-context.md`

이번 continuation의 tracked 변경은 Companion source/test와 active docs/follow-up에만
한정한다. 2026-08-03 현재 검증 결과는 다음과 같다.

```text
af-cli targeted: 10/10 PASS
codexBridgeStore.test.ts + codexCompanionApi.test.ts: 35/35 PASS
test:contracts: TypeScript 23/23 + artifact/generator 87/87 PASS
test:companion: package 65/65 + CLI/Hook 19/19 PASS
build: TypeScript + Vite, 581 modules PASS
validate-artifacts: PASS
validate-skills: 46 files / 41 Markdown / 5 Skills, 0 errors / 0 warnings
git diff --check: PASS
```

위 결과는 per-session `on-request` launcher와 Skill 경계 수정 후 2026-08-03에 다시
실행한 당시 증거다. 이후 fresh Plan/Grant acceptance와 Provider Discover approval까지
완료됐다. 다음 세션이 source를 더 수정하면 위 결과를 재사용하지 않고 동일 gate를 다시
실행한다.

### 2026-08-03 pre-Grant live service checkpoint

- 변경된 source로 Workbench 8890과 Bridge 8898을 재시작했다.
- 8898 authenticated snapshot은 HTTP 200/schema v2, unauthenticated read는 401이었다.
- Bridge restart 직후 active Companion session은 0개다. 이전 Provider Plan session은
  lease가 expired 상태이므로 authority가 아니다.
- per-session approval 수정 뒤에는 수정 전 argv로 실행 중이던 Provider 프로세스 그룹
  `3418234`만 종료했다. explicit와 task/model Plan 프로세스는 건드리지 않았다.
- Provider Plan workspace launch API는 다시 202를 반환했고 exact generated workspace를
  열었다. descriptor에는 `task.allowAutomaticTasks: on`, `runOn: folderOpen`, default build
  Task `Start AF Session`이 있지만 10초 관찰 동안 VS Code가 Task를 자동 시작하지 않았다.
  따라서 새 `vscode-start`/Codex 프로세스와 live `on-request` argv는 아직 관찰되지 않았다.
- 사용자는 Provider workspace에서 default build task `Start AF Session`을 다시 실행하고
  첫 human prompt를 보내야 한다. 그 전에는 새 session/turn/lease receipt가 없다.
- `node scripts/af.mjs work validate page-recommendation-a2a-provider`는 valid pristine
  ledger revision 0을 확인했다.

### 2026-08-03 Provider Discover 승인 checkpoint

- Bootstrap Grant `c28a350b-964a-4843-828f-a0eca014a989`는 exact claimed Handoff와
  일치해 Bridge projection에서 `finalized`가 확인됐다.
- Phase B가 canonical discovery 다섯 파일을 materialize했고 Discovery review가 exact
  requirement, decision, Asset-decision, discovery, Catalog snapshot revision과
  `analysis-result.json` ETag에 binding됐다.
- Work Item은 ledger revision 2, `af-discover-assets: complete`, current discovery cycle
  `complete`, discovery gate `approved`, active run 없음이다.
- `af-compose-solution`, Scaffold, Verify는 `not_started`; Graph IR, source, Registry 변경은
  없다.
- Work Item validator, artifact validator, 12개 exact Registry Asset validation,
  aggregate/split 일치, `git diff --check`가 통과했다.
- 다음 lifecycle owner는 `af-compose-solution`이다. current exact materialization receipt로
  Compose output만 작성하고 composition review `pending`에서 멈춘다.

### 2026-08-03 Provider Compose review checkpoint

- Work Item은 ledger revision 3, Compose run은 `waiting_for_review`, composition gate는
  `pending`이다.
- composition revision은
  `948eb2118c8d2e95338905bf28f7514dc7d1d1de56d25010902ef249205eebc4`, current
  `analysis-result.json` ETag는
  `c5609dd8f0d6e6b05979266af32c61a4bd683450400fb1d958c287ee175e1f4d`다.
- Graph는 canonical Agent Root delegation topology이며 Web projection 오류는 artifact
  변경 없이 validator 수정으로 해결됐다.
- `can_generate_source`는 아직 false다. Provider cancel, duplicate ledger, Agent Root
  RequestInput lowering, reuse-exact Agent executable source ref, stdio MCP lowering, consumer의
  input-required 후 실패를 composition review에서 각각 올바른 lifecycle owner로 분류해야
  한다.

### 2026-08-03 non-pristine Return-to-Discover Handoff fix checkpoint

- Provider Work Item은 ledger revision 5, focus `af-discover-assets`, Discover/Compose
  `stale`, composition gate `changes_requested`, active run 없음이다. 네 specialist Agent의
  `create_project_draft` 선택은 decision revision
  `31ec346dcb4e6347e08324a22f981959665772de3d833afc91fcc5c1e7ad6cba`에 기록돼 있다.
- Return-to-Discover Phase A는 재질문 없이 완료됐지만 pending Work Item Handoff를 만드는
  지원 경로가 없어 `새 Materialization Session 열기` 버튼이 표시될 수 없었다. Plan role은
  tracked ledger write가 금지되고 기존 `/v1/handoffs`는 이미 존재하는 pending record를
  요구했기 때문이다.
- `companion prepare-materialization`은 이제 `/v1/materializations`를 호출한다. strict
  pristine Work Item에는 기존 Bootstrap Grant를, current discovery/decision revision이
  있는 non-pristine Work Item에는 exact source Work Item ETag와 revision tuple에 결합된
  Bridge-local re-entrant Handoff를 반환한다.
- re-entrant Handoff 준비는 Provider Work Item, Graph, Registry, ADK source를 쓰지 않는다.
  Handoff Plan은 ignored Bridge state에서 암호화되고 public receipt에는 Plan과 internal
  ETag가 나오지 않는다. source ETag/revision/turn/lease drift, expiry, supersession 또는
  Bridge restart는 unclaimed authority를 fail-closed한다.
- fresh Materialization claim 뒤 Phase B가 Handoff의 source revision tuple과 complete claim
  provenance로 정확히 한 개의 claimed `session_handoffs[]` record를 기록한다. Bootstrap
  Grant는 기존처럼 실제 materialized revision을 기록하고 자동 finalize한다.
- targeted Bridge/store/server/CLI tests와 TypeScript/Vite build는 이 checkpoint 작성 전에
  통과했다. 전체 Companion/artifact/skill validation 결과는 최종 verification에서 새로
  기록한다.
- source 반영을 위해 Bridge가 재시작되면 기존 Plan lease는 authority가 아니다. fresh Plan
  session에서 current prompt receipt를 받은 뒤 이미 확정된 Decision Plan을 재사용하여 같은
  `prepare-materialization` 명령을 실행해야 한다. 반환된 Handoff가 `ready`로 투영되면
  Discover 화면에 `새 Materialization Session 열기` 버튼이 나타난다.

## 이후 실행 규칙

- Companion 자체를 수정하는 세션은 20번의 범위와 완료 기준만 따른다.
- CEP ADK를 구현하는 세션은 21번의 범위와 완료 기준만 따른다.
- 어느 쪽도 이 문서의 과거 session/turn/lease/Handoff ID를 current authority로 사용하지
  않는다.
- 한 작업에서 발견한 다른 작업의 결함은 해당 문서에 evidence만 추가하고, 같은 change
  set에서 함께 고치지 않는다.
