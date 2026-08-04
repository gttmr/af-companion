# 21. Smart CEP Google ADK 구현 작업 지시서

상태: **in progress — Provider Return-to-Discover materialization state must be refreshed**

작성일: 2026-08-03 KST

기준 checkout: `main` at `3510e792b89b5dff7dd3d5cea943cffc44e80669`

참조:

- [19. Smart CEP Companion/ADK 통합 여정 증거](./19-smart-cep-companion-adk-continuation.md)
- [20. Companion lifecycle UX 전면 개편](./20-companion-lifecycle-ux-overhaul.md)
- [Operating Model](../operating-model.md)
- [Graph IR](../graph-ir.md)

## 목적

이미 확정된 Agent Factory 결정을 바탕으로 세 개의 독립 Google ADK 애플리케이션과 공용
Mock MCP를 구현하고, Google ADK Web chat에서 A2A Human Input을 포함한 전체 흐름을 사람이
직접 비교할 수 있게 한다.

이 문서는 **CEP ADK 구현 전용 작업 지시서**다. Companion launcher, Bridge session,
Handoff UX, Workbench 상태 투영이나 recovery UI를 수정하지 않는다. 해당 문제는
[20번 작업서](./20-companion-lifecycle-ux-overhaul.md)가 전담한다.

ADK 구현 세션에서 Companion 결함을 발견하면 다음 원칙을 따른다.

1. 재현 증거와 정확한 blocker를 20번 문서에 추가한다.
2. 현재 ADK 작업에서 안전한 공식 경로로 계속할 수 없으면 멈춘다.
3. 같은 change set에서 Companion source를 함께 수정하지 않는다.
4. 수동 shell fallback을 제품 완료 증거로 사용하지 않는다.

## 완료 산출물

| 산출물 | 책임 | 계획 포트 |
| --- | --- | --- |
| 공용 Mock Lab | deterministic MCP Tool 구현 | 8891 |
| Explicit Workflow 앱 | 고정 Graph 순서의 1-1 → 1-2 → 1-3 | 8892 |
| Page 추천 A2A provider 앱 | 독립 Agent, `objective_text` → `broad_handoff_payload` | 8896 |
| Task/model Workflow 앱 | 모델 판단 기반 분석 Tool routing 후 1-2 → 1-3 | 8900 후보 |

`8900`은 승인된 비교 Plan의 값이지만 현재 root `AGENTS.md`는 이를 spare로 예약한다.
runtime 시작 전 사용자에게 이 충돌 하나를 명시적으로 제시해 8900 사용 승인 또는 새로운
예약 포트를 결정한다. 조용히 다른 포트를 선택하거나 문서와 launcher를 먼저 고정하지
않는다.

각 ADK 앱은 별도 process와 별도 ADK Web entrypoint로 실행한다. 자동 비교 launcher나
fixture 자동 응답기는 만들지 않는다. 사용자가 두 Workflow 앱에 같은 `objective_text`와
같은 Human Input 답변을 직접 입력해 trace와 결과를 비교한다.

## 범위

### 포함

- Provider, Explicit, Task/model 세 Work Item의 현재 lifecycle을 정확한 gate에서 계속한다.
- approved Graph/contract로 project-local ADK Python source를 scaffold한다.
- 공용 Mock MCP에 필요한 synthetic Tool 구현과 binding을 제공한다.
- ADK 2.4 계약에서 Remote A2A pause/resume, cancel, duplicate handling을 구현·검증한다.
- 세 앱을 독립 실행하고 ADK Web에서 end-to-end behavior를 검증한다.
- output, evidence, trace, MCP contract hash와 task identity를 기록한다.

### 제외

- Companion Web, Bridge, VS Code launcher, enrollment, Grant/Handoff UX 수정
- 실제 캠페인 실행, 외부 write, 승인 상태 변경
- 기존 Workflow 1-1 ADK source 복사 또는 wrapper 재사용
- A2A 대신 자동 비교 harness를 도입하는 우회
- Registry published version mutation 또는 근거 없는 publication
- 실제 고객 데이터, private endpoint, credentials, 조직 전용 배포 코드
- 모델이 실패한 필수 Tool 결과를 임의 생성하는 fallback

## 사용자 확정 결정

아래 결정은 해당 decision revision이 current 상태에서 invalidated되지 않는 한 다시 묻지
않는다.

### 전체 stage 의미

- 1-1: 목적에 맞는 Page/Page Group 추천
- 1-2: Page와 분석 근거를 사용한 CEP 시나리오 추천
- 1-3: 채널, 대상, 조건, 대기 시간과 전송 채널을 포함한 synthetic 실행계획 생성
- 1-3은 제안서를 만들 뿐 실제 캠페인을 실행하거나 승인하지 않는다.

### 비교 방식

- 비교 대상은 Explicit Workflow와 Task/model Workflow다.
- 두 앱은 같은 모델과 generation 설정을 사용한다.
- 각 앱은 provider를 `RemoteA2aAgent`로 직접 호출한다.
- provider의 `input-required`에는 각 ADK Web에서 사람이 직접 답한다.
- 두 실행에 같은 objective와 같은 사람 답변을 사용한다.
- 비교 launcher, fixture 자동 응답, 한 앱이 다른 두 앱을 대신 호출하는 harness는 없다.

### 실패 정책

- 필수 MCP transient error는 한 번만 재시도한다.
- Page 추천, 시나리오 추천 또는 execution-plan Tool이 최종 실패하면 구조화 오류를
  반환한다.
- 필수 결과를 모델이 꾸며내지 않는다.
- provider task를 자동 재시작하거나 fallback task를 만들지 않는다.
- 실제 외부 campaign write는 없다.

## 애플리케이션 계약

### A. Page recommendation A2A provider

Work Item:
`page-recommendation-a2a-provider`

Root:
`agent.page-recommendation.a2a-required-page-selection@1`

전략:
`agent_delegation`

입력:

```text
objective_text: string
```

출력:

```text
broad_handoff_payload: object
```

project-local specialist Agent:

- `agent.page-recommendation.objective-classifier@1`
- `agent.page-recommendation.tool-argument-builder@1`
- `agent.page-recommendation.initial-page-selector@1`
- `agent.page-recommendation.analysis-synthesizer@1`

네 specialist Agent의 현재 확정 disposition:

```text
selected_disposition: create_project_draft
catalog_entry_id: null
reuse_status: project_only
version: 1
```

이 결정은 published contract의 책임과 I/O를 보존하되 executable source가 없는
`reuse_exact`를 꾸며내지 않기 위한 것이다. Registry bytes를 변경하지 않는다.

exact reuse Tool:

- `tool.page-recommendation.get-scenario-taxonomy@1`
- `tool.page-recommendation.search-page-candidates@1`
- `tool.page-recommendation.search-page-products@1`
- `tool.page-recommendation.run-userflow-analysis@1`
- `tool.page-recommendation.recommend-scenario-by-behavior-type@1`
- `tool.page-recommendation.analyze-page-customer-relation@1`

runtime exclude:

- `workflow.page-recommendation.required-page-selection@1`
- `workflow.page-recommendation.workflow-1-2-placeholder@1`

provider는 기존 Workflow 1-1을 감싸거나 해당 ADK source를 복사하지 않는다. 위 전문 Agent와
Tool 계약으로 1-1 책임을 project-local Root 아래 재구성하고 direct A2A exposure를
제공한다.

### B. Explicit Workflow

Work Item:
`smart-cep-scenario-compare`

Root:
`workflow.page-recommendation.cep-explicit-1-2-1-3@1`

전략:
`explicit_workflow`

create project draft:

- Root Workflow
- `agent.page-recommendation.remote-provider-explicit@1`
- `tool.page-recommendation.generate-synthetic-execution-plan-explicit@1`

exact reuse Tool:

- `tool.page-recommendation.run-userflow-analysis@1`
- `tool.page-recommendation.analyze-page-customer-relation@1`
- `tool.page-recommendation.recommend-scenario-by-behavior-type@1`

고정 실행 순서:

```text
objective_text
  → Remote Page provider 1-1
  → UserFlow 분석
  → Page/customer relation 또는 T2S 분석
  → CEP 시나리오 추천
  → synthetic execution plan
  → 공통 output
```

두 분석 Tool을 명시적으로 호출하고, 분석 결과가 완성된 뒤 추천 Tool과 execution-plan
Tool을 순서대로 호출한다. model은 이 순서를 생략하거나 재배치하지 않는다.

### C. Task/model Workflow

Work Item:
`smart-cep-scenario-compare-task-model`

Root:
`workflow.page-recommendation.cep-task-model-1-2-1-3@1`

전략:
`hybrid`

create project draft:

- Root Workflow
- `agent.page-recommendation.cep-tool-router@1`
- `agent.page-recommendation.remote-provider-task-model@1`
- `tool.page-recommendation.generate-synthetic-execution-plan-task-model@1`

exact reuse Tool은 Explicit과 같은 세 개다.

동적 실행 경계:

- remote provider 1-1 호출은 필수다.
- `cep-tool-router`가 두 분석 Tool의 호출 여부, 순서, 재호출을 판단한다.
- CEP 시나리오 추천 Tool 호출은 필수다.
- execution-plan Tool 호출은 추천 성공 뒤 필수다.
- router의 판단과 Tool trace를 최종 `trace`에 남긴다.

이는 자유형 single Agent가 아니다. reviewed hybrid Workflow 안에서 분석 구간만 모델이
판단한다.

## 공통 I/O와 Mock MCP

두 비교 Workflow의 외부 입력:

```text
objective_text: string
```

provider completed 결과:

```text
broad_handoff_payload: object
```

두 Workflow의 공통 최종 출력:

```text
variant: "explicit" | "task_model"
synthetic: true
recommended_scenarios: array
execution_plan: object
evidence: array
trace: array
```

공용 execution-plan Mock MCP binding:

```text
wf-page-recommendation-mock/generate_synthetic_execution_plan
```

입력:

```text
objective_text
selected_page_ids
recommended_scenarios
evidence_summaries
```

출력:

```text
synthetic: true
source
execution_plan
```

Explicit과 Task/model에는 Work Item-local Tool Asset을 두되 runtime Mock Lab 구현은 하나다.
동일 canonical input에는 동일 결과를 반환해야 한다. 두 앱이 같은 endpoint, Tool schema,
contract hash를 사용했음을 trace와 startup evidence로 증명한다.

## A2A Human Input 계약

### Target behavior

1. Workflow의 `RemoteA2aAgent`가 provider에 새 task를 만든다.
2. provider가 목적 확인 등 사람 답변이 필요한 지점에서 `input-required`를 반환한다.
3. ADK Web은 이를 inline long-running function call로 표시한다.
4. 사용자가 function response를 제출한다.
5. consumer는 원래 function-call ID, A2A `task_id`, `context_id`를 보존해 같은 task에
   response를 전달한다.
6. provider task는 `completed`로 전이하고 `broad_handoff_payload`를 반환한다.
7. 그 뒤에만 Workflow가 1-2와 1-3을 실행한다.

### Identity와 timeout

- HTTP request timeout: 30초
- `input-required` 사람 대기에 대한 자동 expiry 없음
- 같은 function-call ID 유지
- 같은 A2A task/context ID 유지
- 자동 task restart 없음
- 사용자 cancel은 같은 remote task의 `canceled` 전이
- mismatched/stale response는 fail-closed
- duplicate response는 idempotent 처리 또는 명시적 duplicate 결과

### 현재 구현 gap

`scripts/adk-source/remote-a2a.mjs`는 현재 remote task state가 `input-required` 또는
`auth-required`이면 event를 yield한 뒤 `RuntimeError`를 발생시킨다. installed ADK의
upstream capability가 존재하더라도 generated consumer가 same-task resume를 구현했다고
볼 수 없다.

필수 수정:

- exact installed `google-adk==2.4.0` source와 event model 재확인
- ADK Web function response → remote A2A resume mapping
- function-call/task/context identity 보존
- cancel propagation
- duplicate/exact-once behavior
- stale/mismatched identity failure
- 기존 input-required 후 throw test를 pause/resume 성공 test로 교체

최종 증거는 source inspection이 아니라 실제 ADK Web에서 input 전후 event와 A2A identity를
관찰한 결과다.

## 그 밖의 현재 Scaffold blocker

### Agent Root RequestInput lowering

Provider Graph의 reviewed Human Input contract를 ADK long-running function call로 생성하는
lowering이 필요하다. Page 이름, scenario 이름, product literal을 generator에 hard-code하지
않고 reviewed artifact와 Tool contract에서 behavior를 내려야 한다.

### Provider cancel

ADK 2.4 경로에서 확인된 cancel `NotImplementedError`를 지원하지 않은 채 readiness를 true로
표시하면 안 된다. provider와 consumer 중 어느 layer가 cancel을 소유하는지 source로
확정하고 live cancel transition을 검증한다.

### duplicate/exact-once ledger

browser retry 또는 중복 FunctionResponse가 remote task에 두 번 적용되지 않도록 resume
identity와 terminal response를 기록하는 local runtime 경계가 필요하다. 이 runtime state를
Graph IR, Registry, discovery artifact에 영구 저장하지 않는다.

### MCP stdio lowering

reviewed Tool binding과 Mock Lab process가 exact ADK `McpToolset` 또는 현재 지원 adapter로
연결되는지 검증한다. unsupported binding을 model Tool이나 synthetic inline function으로
조용히 대체하지 않는다.

### exact model

두 Workflow는 같은 model ID와 generation 설정을 사용해야 한다. Compose/Scaffold 시점의
현재 지원 모델과 local credential boundary를 확인해 exact ID를 확정한다. model 선택이
결과 비교 차이를 만들지 않도록 app별 override를 허용하지 않는다.

## 현재 lifecycle checkpoint

이 절은 2026-08-03 관찰 기록이며 새 session authority가 아니다.

Provider durable Work Item의 마지막 확인 상태:

- `ledger_revision: 5`
- `focus_skill: af-discover-assets`
- Discover/Compose: `stale`
- Discovery gate: `stale`
- Composition gate: `changes_requested`
- active run 없음
- decision revision:
  `31ec346dcb4e6347e08324a22f981959665772de3d833afc91fcc5c1e7ad6cba`

그 뒤 re-entrant Handoff가 fresh Materialization session에 `claimed`된 Bridge 관찰이 있었지만,
당시 durable ledger는 아직 revision 5였다. 따라서 새 세션은 다음을 직접 확인한다.

- Phase B가 완료돼 ledger revision과 discovery revision이 바뀌었는가
- exact claim provenance가 durable `session_handoffs[]`에 기록됐는가
- Discovery review가 `pending`인가
- Materialization session이 여전히 active인가, completed/failed인가

active Materialization session이 있으면 중복 prompt, 재claim, Phase B 재실행을 하지 않는다.
과거 session/turn/lease/Handoff ID를 authority로 재사용하지 않는다.

Explicit과 Task/model Work Item은 source generation 전이다. 현재 bytes에서 각 Work Item의
revision과 gate를 다시 읽은 뒤 해당 next Work Skill로 진입한다.

## 구현 순서

한 change set에서 Companion 개편을 병행하지 않는다. review/decision gate에서는 정확히
멈추되, 단순 구현 단계는 아래 순서를 따라 계속한다.

### ADK-0 — current state refresh

- root와 nearest `AGENTS.md`, 이 문서, canonical docs를 읽는다.
- 세 Work Item과 Registry revision을 현재 bytes에서 검증한다.
- active Materialization/Scaffold run이 있는지 확인한다.
- 기존 dirty tree와 생성 source ownership을 inventory한다.
- 현재 provider gate 하나를 확정한다.

산출물은 상태 보고뿐이다. active run이 있으면 개입하지 않는다.

### ADK-1 — Provider Return-to-Discover 완료

Phase B가 아직 끝나지 않았다면 현재 exact Materialization authority를 가진 actor만 계속한다.
성공 결과는 다음이어야 한다.

- 네 specialist Agent가 project-local `create_project_draft`
- Root, Tool 6개, agent delegation, A2A/Human Input topology 불변
- Registry bytes 불변
- 새 discovery revision과 artifact ETag
- Discovery review `pending`

사용자 review 전에는 Compose로 넘어가지 않는다.

### ADK-2 — Provider Compose 재수행과 review

승인된 새 Discovery revision으로 Compose를 다시 수행한다.

- 기존 Agent delegation Graph topology 유지
- 네 specialist binding만 project-local executable draft로 변경
- Tool binding과 A2A exposure 보존
- runtime gap을 정확한 owner로 분류
- `can_generate_source`를 blocker가 남은 채 true로 꾸미지 않음

Composition review가 필요하면 artifact와 blockers를 제시하고 멈춘다.

### ADK-3 — shared ADK lowering 구현

approved composition을 기준으로 다음 runtime-neutral 기능을 구현한다.

- Agent Root Human Input lowering
- Remote A2A input-required pause/resume
- task/context/function-call identity 보존
- cancel과 duplicate handling
- exact MCP binding

generator에 Smart CEP domain literal을 넣지 않는다. behavior-specific 값은 reviewed artifact와
Mock contract에 둔다.

검증:

- focused generator/unit tests
- exact ADK 2.4 environment test
- mismatched identity와 duplicate response negative tests
- cancel test
- existing unrelated generator fixture regression

### ADK-4 — Provider Scaffold와 Verify

approved composition과 fixed lowering으로 provider source를 생성한다.

- project-local Root와 specialist Agent source
- six MCP Tool bindings
- A2A Agent Card/exposure
- Human Input long-running function call
- structured `broad_handoff_payload`

Provider 단독 ADK Web과 A2A client에서 다음을 검증한다.

- Agent Card/readiness
- objective classification과 Tool calls
- input-required
- same-task resume
- completed payload
- cancel/duplicate negative paths

Scaffold와 Verify gate는 current artifact/source evidence에 결합한다.

### ADK-5 — Explicit Workflow lifecycle와 source

- existing approved decisions로 Discover/Compose를 완료한다.
- provider 8896 Remote A2A binding을 사용한다.
- explicit Graph 순서를 source에 보존한다.
- common Mock MCP execution-plan Tool을 사용한다.
- output/evidence/trace schema를 검증한다.

### ADK-6 — Task/model Workflow lifecycle와 source

- existing approved decisions로 Discover/Compose를 완료한다.
- same provider와 same Mock MCP contract를 사용한다.
- model router의 허용 구간과 mandatory Tool calls를 Graph/runtime에 보존한다.
- Explicit과 exact same model/generation settings를 사용한다.
- router 판단과 실제 Tool invocation trace를 기록한다.

### ADK-7 — 네 runtime 수동 비교

runtime 시작 전에 port conflict를 해결한다. 그 뒤 Mock Lab, provider, 두 Workflow를 각각
실행한다.

동일한 수동 test case마다 다음을 기록한다.

- objective_text
- provider Human Input 질문과 사람 답변
- function-call ID 전후 동일성
- A2A task/context ID 전후 동일성
- selected pages와 evidence
- analysis Tool 호출 순서
- recommended scenarios
- execution plan
- final output schema
- 오류/재시도 여부

두 Workflow의 차이는 orchestration이어야 한다. model, Tool implementation, objective,
Human Input, output contract 차이로 비교를 오염시키지 않는다.

## 필수 test matrix

| Case | Provider | Explicit | Task/model | 기대 결과 |
| --- | --- | --- | --- | --- |
| 정상 Human Input | input-required → same task completed | 고정 분석 순서 | router 판단 순서 | 공통 output 성공 |
| 취소 | same task canceled | 1-2/1-3 미실행 | 1-2/1-3 미실행 | structured canceled |
| duplicate response | idempotent/duplicate 명시 | 추가 실행 없음 | 추가 실행 없음 | side effect 없음 |
| stale task/context | fail-closed | 후속 Tool 미실행 | 후속 Tool 미실행 | structured identity error |
| MCP transient | 1회 retry | 1회 retry | 1회 retry | 성공 또는 최종 structured error |
| scenario 추천 실패 | provider completed | execution plan 금지 | execution plan 금지 | model fallback 없음 |
| execution-plan 실패 | provider completed | final error | final error | synthetic plan 조작 없음 |

## 완료 기준

### Provider

- 독립 A2A Agent로 실행되고 유효한 Agent Card를 제공한다.
- 기존 Workflow 1-1 source를 복사하거나 wrapper로 호출하지 않는다.
- project-local Root와 네 specialist Agent가 reviewed I/O를 만족한다.
- six Mock MCP Tool binding과 contract hash가 검증된다.
- ADK Web에서 Human Input과 same-task resume/cancel을 관찰한다.

### Explicit

- provider → 두 분석 → 시나리오 추천 → execution plan 순서를 Graph와 trace가 증명한다.
- 필수 단계가 model 판단으로 생략되지 않는다.
- 공통 output schema를 반환한다.

### Task/model

- provider와 시나리오 추천/execution-plan 호출은 필수다.
- 분석 Tool 선택, 순서, 재호출만 router Agent가 판단한다.
- 판단과 실제 호출이 trace에 남는다.
- Explicit과 같은 model/generation 및 Tool contracts를 사용한다.

### End-to-end

- Mock Lab과 세 ADK 앱이 충돌 없는 승인 포트에서 실행된다.
- 사용자가 각 ADK Web에서 직접 질문하고 inline Human Input에 답할 수 있다.
- 같은 function-call ID와 A2A task/context ID로 input-required → completed가 전이된다.
- 두 앱의 공통 output, evidence, trace가 완전하다.
- 실제 외부 campaign write나 자동 승인이 없다.
- startup command, listener ownership, health/Agent Card, ADK version, model ID, contract hash,
  test 결과를 fresh evidence로 남긴다.

## 새 ADK 구현 세션용 복사 프롬프트

```text
/home/ilmaswsl/work/af-companion에서 Smart CEP Google ADK 구현 작업만 진행하라.

root와 nearest AGENTS.md, 다음 문서를 완전히 읽어라.
- docs/workbench/follow-ups/21-smart-cep-google-adk-implementation.md
- docs/workbench/follow-ups/19-smart-cep-companion-adk-continuation.md

Companion launcher, Bridge, Workbench session/Handoff UX는 수정하지 마라. 해당 결함을 만나면
docs/workbench/follow-ups/20-companion-lifecycle-ux-overhaul.md에 evidence만 기록하고 같은
change set에서 고치지 마라.

먼저 세 Work Item과 active Companion/Work Skill run을 read-only로 확인하라. 과거 문서의
session_id, turn_id, lease, Handoff ID를 authority로 사용하지 마라. Provider의 claimed
Materialization이 Phase B를 끝냈는지, ledger revision과 Discovery review가 갱신됐는지
확인하라. active actor가 있으면 개입하거나 중복 실행하지 마라.

네 specialist Agent의 create_project_draft, Agent Root, agent_delegation, Tool 6개,
A2A/Human Input topology와 Registry 불변 결정은 revision이 invalidated되지 않는 한 다시
질문하지 마라. 현재 exact gate에서 af-workflow로 route하고 필요한 AF Work Skill을 사용하라.

ADK 구현은 이 작업서의 ADK-0부터 순서대로 진행하라. approved composition 전 source를
생성하지 말고, generator gap을 domain literal hard-code로 우회하지 마라. exact google-adk
2.4 source와 generated behavior를 검증하고 Remote A2A input-required를 같은 function-call,
task_id, context_id로 resume하는 test를 먼저 확보하라.

review나 unresolved port 결정처럼 실제 사용자 authority가 필요한 gate에서는 정확히 멈춰라.
그 외에는 Provider Scaffold/Verify, Explicit, Task/model, Mock Lab과 ADK Web 비교까지 안전한
범위에서 계속하라. runtime 시작 직전 8900 spare-port 충돌은 조용히 결정하지 말고 사용자에게
한 번만 제시하라.

각 단계에서 변경 파일, artifact/source revision, tests, live runtime evidence와 남은 blocker를
보고하라. 실제 캠페인 write, model fallback, fixture 자동 Human Input은 금지한다.
```

## 처음 확인할 source와 artifact

Lifecycle/artifact:

- `artifacts/af/page-recommendation-a2a-provider/af-work-item.json`
- `artifacts/af/page-recommendation-a2a-provider/analysis-result.json`
- `artifacts/af/page-recommendation-a2a-provider/graph-ir.json`
- `artifacts/af/page-recommendation-a2a-provider/scaffold-plan.json`
- `artifacts/af/smart-cep-scenario-compare/af-work-item.json`
- `artifacts/af/smart-cep-scenario-compare-task-model/af-work-item.json`

Generator/runtime:

- `scripts/adk-source/remote-a2a.mjs`
- `scripts/adk-source/root-executable.mjs`
- `scripts/adk-source/asset-bindings.mjs`
- `packages/mock-lab/`
- `.agents/skills/af-compose-solution/SKILL.md`
- `.agents/skills/af-scaffold-runtime/SKILL.md`
- `.agents/skills/af-verify-runtime/SKILL.md`

실제 generated application source 경로는 approved Scaffold plan에서 확인한다. 이 문서가
경로를 미리 발명하지 않는다.

## 문서 유지 규칙

- ADK implementation, Graph/runtime contract, Mock MCP, runtime comparison 진척만 이 문서에
  기록한다.
- Companion launcher/session/UI 진척은 20번 문서에 기록한다.
- 19번 문서는 과거 통합 evidence이며 새 실행 순서를 추가하지 않는다.
- live state가 바뀌면 dated checkpoint를 추가하고 과거 재현 기록을 current authority처럼
  고쳐 쓰지 않는다.
- 완료 claim에는 current artifact/source revision, test와 actual ADK Web evidence가 필요하다.
