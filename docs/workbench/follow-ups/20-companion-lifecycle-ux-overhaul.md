# 20. Companion lifecycle UX 전면 개편 작업서

상태: **proposed — live failure evidence captured, implementation not started**

작성일: 2026-08-03 KST

기준 checkout: `main` at `3510e792b89b5dff7dd3d5cea943cffc44e80669`

연결 작업:

- [19. Smart CEP Companion/ADK 통합 여정 증거](./19-smart-cep-companion-adk-continuation.md)
- [21. Smart CEP Google ADK 구현](./21-smart-cep-google-adk-implementation.md)
- [Operating Model](../operating-model.md)
- [CLI Companion](../cli-companion.md)
- [Graph IR](../graph-ir.md)

## 이 문서의 목적

Smart CEP ADK 애플리케이션을 만드는 실제 여정에서 Companion lifecycle을 여러 번
중단·재개하면서 확인한 제품, 런처, 상태 투영, Work Skill, Runtime Handoff 문제를 하나의
작업서로 보존한다. 다음 세션은 긴 대화 기록을 복원하거나 이미 끝난 결정을 다시 묻지 않고
이 문서에서 인터페이스 개편을 시작할 수 있어야 한다.

이 문서는 현재 구현이나 정본 계약을 설명하는 문서가 아니다. 아래에서 **Current
Implementation**과 **Proposed Target Contract**를 의도적으로 분리한다. 현재 권위는 source,
Work Item, [Operating Model](../operating-model.md), [CLI Companion](../cli-companion.md)에 있고,
이 문서의 Target은 구현·검증·review를 거쳐야 정본이 된다.

이번 작업서는 다음을 하지 않는다.

- 현재 `claimed` Materialization session이나 Work Item을 조작하지 않는다.
- Graph IR, Asset Registry, ADK source를 변경하지 않는다.
- Smart CEP의 확정된 Agent/Workflow/Tool disposition을 다시 결정하지 않는다.
- 보안상 필요한 exact scope, current-prompt receipt, fresh lease, revision binding을 약화하지
  않는다.

## 별도 작업과의 경계

Smart CEP Google ADK 구현은 이 작업서의 일부가 아니다. 세 ADK 앱, Mock MCP, A2A Human
Input resume, Scaffold와 runtime 비교는 [21번 작업서](./21-smart-cep-google-adk-implementation.md)가
전담한다.

Companion 개편 세션은 ADK source, generator lowering, runtime port, Smart CEP Work Item의
Asset disposition을 변경하지 않는다. Companion 작업 중 ADK 문제를 발견하면 21번 문서에
evidence만 남기고 같은 change set에서 수정하지 않는다. 반대로 ADK 구현 세션은 launcher나
Companion UI를 수정하지 않는다.

## 2026-08-03 live checkpoint

이 절은 현재 authority가 아니라 문제 재현 당시의 관찰 기록이다. 새 세션은 아래 ID나
lease를 재사용하지 않고 현재 source와 fresh receipt를 다시 확인해야 한다.

### Bridge의 transient 상태

- re-entrant Handoff:
  `45d115d4-5980-4466-b73c-2ddca3382276`
- 상태: `claimed`
- 생성: `2026-08-03T04:45:32.290Z`
- claim: `2026-08-03T04:55:53.609Z`
- source Plan session:
  `019fc593-c259-7603-8ad9-225a10816c3b`
- source turn:
  `019fc5f0-cbb7-7150-84cc-8af443d82466`
- claimed Materialization session:
  `019fc5fa-686f-7f41-89fc-6e901e32cb17`
- claimed turn:
  `019fc5fa-6a67-7103-adf3-d16d8702d956`
- Materialization session origin: `plan_handoff_capsule`
- 관찰 당시 failure: `null`

`claimed`는 새 Materialization session이 Handoff를 인수했다는 뜻이다. Phase B artifact가
작성됐거나 review gate가 열렸다는 뜻은 아니다.

### durable Work Item 상태

같은 시점의
`artifacts/af/page-recommendation-a2a-provider/af-work-item.json`은 다음 상태였다.

- `ledger_revision: 5`
- `focus_skill: af-discover-assets`
- `active_runs: []`
- Discover와 Compose: `stale`
- Discovery gate: `stale`
- Composition gate: `changes_requested`
- decision revision:
  `31ec346dcb4e6347e08324a22f981959665772de3d833afc91fcc5c1e7ad6cba`
- 네 specialist Agent disposition: `create_project_draft`
- `session_handoffs[]`의 최신 durable record는 과거 Bootstrap Grant
  `c28a350b-964a-4843-828f-a0eca014a989`의 claim이었다.

Bridge의 새 Handoff가 `claimed`인데 ledger가 revision 5인 것은 그 자체로 모순이 아니다.
Bridge claim은 transient lifecycle state이고, 현재 Return-to-Discover Phase B가 성공해야
claim provenance와 새 discovery revision이 durable ledger에 기록된다. UI는 이 두 상태를
하나의 “연결됨”이나 “완료”로 합치면 안 된다.

### 동시 작업 주의

관찰 당시 claimed Materialization session이 실행 중일 수 있었다. 다음 세션은 먼저 Work
Item revision, active run, review gate, Bridge session을 다시 읽는다. revision 5를 가정해
Phase B를 중복 수행하거나, active session에 prompt를 보내거나, 같은 Handoff를 다시
claim하지 않는다.

## 실제 여정과 실패 지점

아래는 사용자가 겪은 흐름을 결과 중심으로 복원한 것이다.

1. 세 Work Item과 비교 방식, A2A provider, explicit/hybrid 차이, synthetic execution
   boundary를 결정했다.
2. Companion receipt를 현재 prompt에서 증명할 수 없어 Grant 생성이 반복해서 막혔다.
3. current-prompt participation receipt가 추가된 뒤 정확한 Plan session/turn을 사용할 수
   있게 됐다.
4. shell의 `bridge_unavailable`이 실제 Bridge 중단이 아니라 command sandbox의 loopback
   차단이었던 경우가 있었다.
5. exact Bridge 명령만 승인하는 경계를 추가해 Bootstrap Grant와 최초 Phase B를 완료했다.
6. Compose가 standalone Agent delegation Graph를 만들었으나 Web parser만 이를 잘못
   거부했다. validator를 수정했다.
7. published specialist Agent 네 개에 executable `python:module#symbol` source ref가 없어
   `reuse_exact`가 불가능함을 확인하고 Return-to-Discover에서
   `create_project_draft`로 결정했다.
8. non-pristine Work Item에는 새 Handoff를 준비할 공식 경로가 없어 lifecycle이 막혔다.
   generic re-entrant materialization preparation 경로를 추가했다.
9. fresh Plan session에서 Handoff를 `ready`로 만들고 Web의
   `새 Materialization Session 열기`를 눌렀지만 VS Code에서 새 창, Task, session 변화가
   보이지 않았다.
10. Web은 launch request를 accepted로 처리했지만 Handoff는 계속 `ready`였고 실제
    Materialization session은 생기지 않았다.
11. canonical `companion continue --handoff ...`를 수동으로 실행한 뒤에야 Handoff가
    `claimed`로 바뀌었다.

이 흐름은 개별 버그뿐 아니라 현재 UI가 lifecycle의 서로 다른 상태를 사용자에게 하나의
“연결” 흐름처럼 보여 주는 것이 핵심 문제임을 드러낸다.

## 문제 레지스터

상태 표기:

- `fixed in working tree`: 현재 dirty working tree에 수정과 test가 있으나 merge된 기준선으로
  간주하면 안 된다.
- `open`: 구현되지 않았다.
- `design gap`: 정확한 Target/API 설계부터 필요하다.

### 1. Launcher와 VS Code

#### LAUNCH-01 — Plan과 Materialization이 같은 workspace descriptor를 덮어씀

- 상태: **open, reproduced live**
- 심각도: blocker
- 증상: `새 Materialization Session 열기`를 눌러도 기존 VS Code 창에 눈에 띄는 변화가
  없고 Handoff가 `ready`에 머물렀다.
- Current Implementation:
  `packages/web/server/vscodeWorkspaceLauncher.ts`는 role과 authority가 달라도
  `.agent-factory/vscode/<work-id>.code-workspace` 하나를 사용한다. 새 launch는 그 파일의
  Task를 `Continue AF Handoff`로 덮어쓴 뒤 `code --new-window <same-path>`를 호출한다.
- 근본 원인: VS Code는 이미 열린 동일 workspace URI를 새 window로 만들지 않고 기존 창을
  focus/deduplicate할 수 있다. 기존 창에서 `folderOpen`은 다시 발생하지 않으므로 새
  `runOn: folderOpen` Task도 실행되지 않는다.
- 제약: Handoff claim 전 source Plan session은 active 상태로 남아 있어야 한다. 사용자에게
  기존 Plan 창을 닫게 하는 것은 올바른 해결이 아니다.
- 필요한 수정: role, authority, launch attempt마다 immutable한 descriptor 경로를 만들고
  기존 Plan descriptor를 덮어쓰지 않는다.

#### LAUNCH-02 — process spawn 성공을 실제 Materialization 시작으로 오해함

- 상태: **open**
- 심각도: blocker
- Current Implementation: `code --new-window` 프로세스 호출이 성공하면 Web API가 launch를
  accepted로 반환한다.
- 누락된 증거:
  - distinct workspace가 load됐는가
  - generated Task가 시작됐는가
  - `companion continue`가 Bridge에 도달했는가
  - fresh Materialization session이 등록됐는가
  - Handoff가 정확한 session에 claim됐는가
- 영향: UI가 실제로는 아무 일도 일어나지 않은 요청을 성공처럼 보인다.

#### LAUNCH-03 — `runOn: folderOpen` 하나에 critical transition을 의존함

- 상태: **open, design gap**
- 증상: Plan workspace에서도 자동 Task가 10초 이상 시작되지 않은 사례가 있었고,
  Materialization workspace reuse에서는 아예 재실행되지 않았다.
- 영향: VS Code 설정, workspace trust, automatic task 허용, URI deduplication에 따라 핵심
  lifecycle 전환이 조용히 누락된다.
- 필요한 수정: `folderOpen`은 trigger일 수 있지만 유일한 성공 증거가 되어서는 안 된다.
  Task-start/Continue/session-claim acknowledgements와 수동 recovery가 필요하다.

#### LAUNCH-04 — launcher attempt identity와 timeline이 없음

- 상태: **open**
- 증상: 여러 번 버튼을 눌러도 어느 request가 어느 descriptor, process, Task, Handoff와
  연결됐는지 알 수 없다.
- 필요한 수정: non-secret `launch_attempt_id`, workspace descriptor identity, 단계별
  timestamp와 terminal outcome을 기록·투영한다.

#### LAUNCH-05 — 정상 경로가 실패하면 내부 ID와 shell command가 사용자에게 노출됨

- 상태: **open**
- 영향: 사용자가 Handoff ID를 복사해
  `node scripts/af.mjs companion continue --handoff ...`를 직접 실행해야 했다. 이는 원래의
  “ID, Capsule, shell command를 입력하지 않는다”는 Web-first 목표를 깨뜨린다.
- 원칙: manual command는 개발자 진단용 fallback으로만 남기고 일반 recovery는 Web의
  bounded action이어야 한다.

### 2. 상태 모델과 화면

#### STATE-01 — 세 상태면을 하나로 표현함

- 상태: **open, architectural**
- 현재 서로 다른 세 상태가 있다.
  1. durable lifecycle ledger: revision, run, review gate, handoff provenance
  2. transient Bridge: session, lease, prompt turn, Grant/Handoff, claim
  3. operational launcher: API request, descriptor, VS Code load, Task/process
- 증상: `terminal connected`, `Plan 연결됨`, `VS Code 시작 전`, `claimed` 같은 일부 label로
  전체 진행을 추측해야 한다.
- 영향: Bridge listener가 살아 있는 것, Plan session이 active인 것, Handoff가 ready인 것,
  새 window가 열린 것, Phase B가 끝난 것을 서로 오인한다.

#### STATE-02 — 현재 해야 할 단 하나의 action이 명확하지 않음

- 상태: **open**
- 증상: Home, Discover, Connections를 오가며 버튼을 찾아야 했고,
  `새 Materialization Session 열기`가 언제 어디에 생기는지 알기 어려웠다.
- 필요한 수정: Work Item 화면 상단에 항상 하나의 primary next action을 표시한다. 실행할 수
  없으면 버튼을 숨기지 않고 disabled 상태와 정확한 선행조건을 보여 준다.

#### STATE-03 — 시작/연결 label이 실제 상태와 불일치함

- 상태: **open**
- 예:
  - VS Code와 enrollment ticket이 이미 생겼는데 Home이 `VS Code 시작 전`으로 표시했다.
  - `terminal connected`는 active Companion projection일 뿐 current lifecycle gate 완료가
    아니다.
  - launch accepted 뒤 실제 session이 없는데 사용자는 연결된 것으로 이해할 수 있다.
- 필요한 상태 최소 집합:
  - launch intent 없음
  - launch requested
  - workspace load 대기
  - Task start 대기
  - first prompt/receipt 대기
  - Plan active
  - authority ready
  - Materialization launch 대기
  - Handoff claim 대기
  - Materialization active
  - Phase B/review 대기

#### STATE-04 — lifecycle role과 Codex collaboration mode가 혼동됨

- 상태: **partly fixed in working tree, UI wording open**
- 과거 동작: lifecycle `role: plan` 외에 `permission_mode === plan`을 authority로 요구했다.
  실제 launcher session은 `bypassPermissions`였기 때문에 정상 session이 거부됐다.
- working-tree 수정: lifecycle role과 Codex Plan/Default collaboration mode를 분리했다.
- 남은 문제: UI와 안내에 여전히 “Plan Mode session” 같은 표현이 있어 사용자가 VS Code의
  Plan mode로 바꿔야 한다고 이해한다.
- Target wording: `Lifecycle Plan session`과 `Codex collaboration mode`를 별도 필드로
  표시한다.

#### STATE-05 — Bridge claim과 durable Phase B completion을 구분하지 않음

- 상태: **open**
- 이번 재현: Bridge Handoff는 `claimed`였지만 Work Item은 revision 5와 stale gates를
  유지했다.
- 필요한 수정: timeline에서 `Handoff claimed`와 `Phase B committed`를 별도 event로
  표시하고, durable revision/ETag가 생기기 전에는 완료 badge를 주지 않는다.

#### STATE-06 — expiry와 freshness가 사용자에게 보이지 않음

- 상태: **open**
- 실제 실패: command approval을 기다리는 동안 Plan activity가 만료되어
  `plan_session_required`가 발생했다. 한 작업은 1시간 35분 이상 대기했다.
- 현재 중요한 시간축: session inactivity TTL, lease expiry, Handoff expiry, latest prompt
  turn freshness.
- 필요한 수정: 절대 시각과 countdown, 마지막 activity, “이 창과 source Plan session을
  유지해야 함” 경고를 함께 표시한다.

#### STATE-07 — Bridge restart와 절전/재개 recovery가 불투명함

- 상태: **open**
- 사실: Bridge restart는 unclaimed Handoff와 기존 session authority를 무효화할 수 있다.
  다음 날 재개 시 과거 session/turn을 authority로 사용할 수 없다.
- 필요한 수정: restart detected, session stale, Handoff lost를 분리하고 안전한 다음 action을
  제공한다. 과거 receipt를 자동 재사용하면 안 된다.

### 3. Lifecycle와 Work Skill

#### LIFE-01 — current prompt provenance를 읽을 수 없었음

- 상태: **fixed in working tree; fresh-session acceptance 유지 필요**
- 과거 증상: private Bridge state나 과거 transcript를 추정하지 않으면
  `workspace_id`, `session_id`, `turn_id`, lease, cwd digest를 증명할 수 없었다.
- 수정: valid top-level `UserPromptSubmit`에 non-secret
  `current_prompt_participation` receipt를 주입한다.
- 회귀 금지: Skill이 private state나 과거 receipt로 authority를 복원하면 안 된다.

#### LIFE-02 — `bridge_unavailable`이 서로 다른 실패를 뭉갬

- 상태: **partly mitigated; taxonomy open**
- 재현: host Bridge/listener는 정상이었지만 Codex command sandbox가 8898 loopback을
  차단했다.
- 현재 단기 해법: exact `prepare-materialization` command에만 bounded approval을 요청한다.
- 남은 문제: listener down, network denial, approval capability 없음, authentication 실패,
  wrong scope를 서로 다른 code와 recovery로 보여 줘야 한다.

#### LIFE-03 — non-pristine Return-to-Discover Handoff 준비 경로가 없었음

- 상태: **fixed in working tree**
- 기존 chicken-and-egg:
  - Plan Phase A는 ledger를 쓸 수 없다.
  - 기존 Handoff endpoint는 이미 존재하는 pending ledger record를 요구했다.
  - Bootstrap Grant는 pristine Work Item 전용이다.
- 수정: non-pristine Work Item의 current revision tuple과 ETag에 결합된 Bridge-local
  re-entrant Handoff를 준비하는 generic materialization path를 추가했다.
- 필요한 회귀: source ETag/revision/turn/lease drift, expiry, supersession, Bridge restart,
  duplicate preparation을 계속 fail-closed해야 한다.

#### LIFE-04 — 이미 해결된 결정을 반복해서 질문함

- 상태: **open at interaction layer**
- 증상: control strategy와 Asset disposition을 여러 Work Item에 대해 반복 확인했고,
  Return-to-Discover에서도 이미 확정된 `create_project_draft`를 다시 물을 위험이 있었다.
- 필요한 수정: UI와 Skill handoff에 “frozen decisions” 요약, decision revision, reopen 조건을
  표시한다. 해당 revision이 invalidated되지 않았다면 같은 질문을 반복하지 않는다.

#### LIFE-05 — Plan session과 Materialization session 전환 지침이 분산됨

- 상태: **open**
- 증상: 사용자는 “기존 Start AF Session을 닫아야 하나”, “Plan mode로 바꿔야 하나”, “새
  Materialization Session 버튼이 어디 있나”를 반복해서 확인해야 했다.
- 필요한 수정: source Plan을 유지해야 하는 구간, 새 target session이 생기는 시점,
  first-prompt claim, source를 닫아도 되는 시점을 timeline에 명시한다.

#### LIFE-06 — return record가 resolved decision을 open으로 가리킨 적이 있음

- 상태: **fixed in working tree; regression required**
- 영향: structurally resolved decision인데 Work Item validator가 return transition을
  거부했다.
- 회귀 기준: `open_decision_id`는 실제 unresolved required decision만 가리키거나 null이어야
  한다.

### 4. Contract와 validation

#### CONTRACT-01 — valid standalone Agent delegation Graph를 Web만 거부함

- 상태: **fixed in working tree**
- 증상: CLI artifact validator와 generator는 통과했지만 Web Target Contract parser가
  `workflow_ref: null` Graph의 Root+delegated Agent를 “explicit execution Node 5개”로
  계산해 owning Workflow를 요구했다.
- 수정: canonical Agent delegation star topology만 허용하고 Agent sequencing, Agent+Tool,
  control/private node 등은 계속 Workflow ownership을 요구한다.
- 회귀 금지: Provider Graph를 오류 회피 목적으로 Workflow Root로 바꾸지 않는다.

#### CONTRACT-02 — Target Contract와 Current Implementation gap이 UI에서 한 문장으로 보임

- 상태: **open**
- 영향: 문서상 지원 계약과 현재 generator lowering을 사용자가 구분하기 어렵다.
- 필요한 수정: readiness와 blocker panel에서 `Target`, `Implemented`, `Verified live`를
  각각 표시한다.

### 5. 운영과 장기 세션

#### OPS-01 — 코드 수정 뒤 Bridge restart가 기존 authority를 무효화함

- 상태: **expected behavior, UX open**
- 보안 계약상 정상이나, UI가 restart의 영향과 fresh Plan session 필요성을 즉시 설명하지
  않는다.

#### OPS-02 — long conversation과 context compaction으로 원래 목표를 잃기 쉬움

- 상태: **this document is the mitigation**
- 영향: lifecycle gate 자체가 목표처럼 보이고 Smart CEP runtime 생성이 뒤로 밀렸다.
- 대응: 이 문서와 19번 문서에 북극성, frozen decisions, 정확한 resume point를 유지한다.

#### OPS-03 — dirty working tree에서 interface overhaul을 바로 시작하기 어려움

- 상태: **open operational prerequisite**
- 현재 tree에는 Companion/Skill/validator 수정과 사용자 소유 untracked 문서가 함께 있다.
- 금지: 기존 변경을 revert, stash, stage, commit하거나 새 worktree에서 누락시키는 선택을
  사용자 승인 없이 하지 않는다.
- 다음 세션은 먼저 현재 diff의 소유권과 검증 결과를 inventory하고, overhaul용 branch나
  worktree가 어떤 기준 commit을 포함해야 하는지 합의한다.

## Proposed Target Contract

### 1. 하나의 Work Item journey

Work Item 화면은 다음 transition을 하나의 ordered timeline으로 투영한다.

```text
Plan workspace requested
  → Plan workspace loaded
  → Start Task running
  → first prompt receipt accepted
  → Lifecycle Plan session active
  → decisions complete
  → Grant/Handoff ready
  → Materialization launch requested
  → distinct workspace loaded
  → Continue Task running
  → Handoff claimed by fresh session
  → Phase B revision committed
  → review pending
```

각 단계는 source plane, timestamp, terminal 상태, 다음 action을 가진다. 이전 단계의 성공을
추정해 건너뛰지 않는다.

### 2. 세 state plane을 명시적으로 분리

| Plane | source of truth | 예 | UI 원칙 |
| --- | --- | --- | --- |
| Lifecycle | `af-work-item.json` | revision, run, review gate, durable handoff | 저장됨/검토 대기 |
| Companion | authenticated Bridge | session, lease, prompt turn, authority, claim | 현재 연결/만료 |
| Launch | launcher attempt record | descriptor, process, workspace/Task ack | 열기/실행 진행 |

한 plane의 event로 다른 plane의 success를 주장하지 않는다. 예를 들어 process spawn
성공은 session claim이 아니고, Handoff claim은 Phase B commit이 아니다.

### 3. 항상 보이는 primary action

화면 상단에는 현재 state로 계산된 action 하나만 primary로 표시한다.

- 실행 가능: `Plan session 열기`, `Handoff 준비`, `Materialization session 열기`,
  `Review 요청 확인` 등
- 실행 불가: 같은 위치에 disabled button과 정확한 이유 표시
- 대기 중: 무엇을 기다리는지, timeout까지 얼마인지, recovery를 언제 제공하는지 표시
- 완료: 다음 Work Skill과 review gate를 표시

버튼이 조건에 따라 사라져 사용자가 위치를 추측하게 하지 않는다.

### 4. immutable workspace identity

workspace descriptor는 최소 다음 identity를 포함한다.

```text
.agent-factory/vscode/
  <work-id>/
    <lifecycle-role>/
      <authority-id-or-launch-id>/
        <attempt-id>.code-workspace
```

정확한 경로 schema는 보안·정리 정책 review에서 확정한다. 불변 원칙은 다음과 같다.

- 열린 Plan descriptor를 Materialization Task로 덮어쓰지 않는다.
- Plan과 Materialization은 서로 다른 workspace URI다.
- descriptor는 ignored local state이고 permission `0600`을 유지한다.
- activation Capsule, lease token, prompt 본문을 화면이나 log에 노출하지 않는다.
- 같은 authority에 대한 duplicate click은 idempotent하거나 명확한 새 attempt로 구분한다.
- stale descriptor cleanup은 active session/authority를 확인한 뒤 별도 정책으로 수행한다.

### 5. 단계별 launch acknowledgement

API의 `accepted`는 launcher command가 수락됐다는 뜻으로만 사용한다. 다음 ack를 별도로
관찰한다.

1. `launch_requested`
2. `workspace_process_accepted`
3. `workspace_loaded`
4. `task_started`
5. `continue_request_observed`
6. `session_registered`
7. `handoff_claimed`

VS Code extension이나 generated Task에서 제공할 수 없는 ack가 있다면 정확히 표시하고,
Bridge가 관찰 가능한 최소 event로 대체한다. 관찰되지 않은 단계를 success로 꾸미지 않는다.

### 6. session과 authority panel

일반 사용자에게 다음 non-secret 필드를 보여 준다.

- lifecycle role
- active/stale/expired/revoked
- source session과 target session의 관계
- last activity와 inactivity expiry
- lease expiry
- authority kind와 ready/claimed/finalized/failed
- Handoff expiry countdown
- exact Work Item/revision binding 여부

raw UUID와 digest는 기본 화면이 아니라 “진단 정보”에 둔다. normal path는 ID 복사를
요구하지 않는다.

### 7. 복구 UX

실패 원인별로 안전한 bounded action을 제공한다.

| 실패 | 일반 사용자 action |
| --- | --- |
| workspace process만 accepted, load ack 없음 | 같은 immutable descriptor 다시 열기 |
| workspace loaded, Task ack 없음 | 해당 workspace에서 generated Task 시작 |
| source Plan stale | fresh Lifecycle Plan session 열기 |
| Handoff expired/lost | current revision으로 새 Handoff 준비 |
| Bridge listener down | Companion 재시작 상태와 재연결 안내 |
| source revision/turn drift | 새 prompt receipt로 Plan 재확인 |
| Handoff claimed, ledger unchanged | Materialization session 진행/실패 상태 확인 |

recovery는 기존 authority를 조용히 재생성하거나 다른 session으로 claim하지 않는다. 새
authority가 필요한 경우 사용자가 그 transition을 명시적으로 시작한다.

### 8. 오류 taxonomy

최소한 다음 code를 구분한다.

- `bridge_listener_unavailable`
- `bridge_authentication_failed`
- `bridge_transport_denied`
- `approval_capability_unavailable`
- `plan_session_inactive`
- `plan_prompt_turn_stale`
- `lease_expired`
- `handoff_expired`
- `handoff_source_drift`
- `workspace_launch_rejected`
- `workspace_reused_without_folder_open`
- `workspace_task_not_started`
- `continue_not_observed`
- `session_claim_timeout`
- `phase_b_not_committed`

내부 detail을 숨기되 사용자가 취할 수 있는 다음 행동은 잃지 않는다.

### 9. read-only diagnostic projection

권위를 생성하지 않는 bounded diagnostic projection이 필요하다. 예:

```text
node scripts/af.mjs companion status --work <work-id>
```

정확한 CLI 추가 여부는 별도 설계한다. 이 projection은 다음 원칙을 따른다.

- current-prompt receipt를 대신하지 않는다.
- session/turn/lease를 materialization authority로 제공하지 않는다.
- secret, Capsule, prompt, Tool payload를 노출하지 않는다.
- 세 state plane의 현재 관찰과 불일치를 진단 목적으로만 보여 준다.

## 구현 슬라이스

대대적인 수정이지만 한 번의 큰 patch로 진행하지 않는다. 각 slice는 독립 review와 live
acceptance를 가져야 한다.

### Slice 0 — baseline 고정과 재현 test

목표:

- 현재 dirty working tree의 Companion/Skill/validator 변경 소유권을 inventory한다.
- current Materialization Phase B의 결과를 확인하되 개입하지 않는다.
- 동일 workspace path overwrite와 launch-without-claim을 test fixture로 재현한다.
- Current Implementation event/state model을 한 문서와 type map으로 정리한다.

검증:

- 기존 Companion, contract, artifact, Skill suite를 fresh run한다.
- 기존 user-owned untracked 파일을 수정하지 않는다.
- source baseline을 commit/worktree로 분리할지 사용자 승인을 받는다.

### Slice 1 — unique workspace와 launch attempt

주요 ownership:

- `packages/web/server/vscodeWorkspaceLauncher.ts`
- launcher tests
- 필요한 최소 server-side attempt type/store

구현:

- lifecycle role/authority/attempt별 descriptor를 만든다.
- 기존 Plan descriptor를 덮어쓰지 않는다.
- duplicate click semantics와 cleanup policy를 정의한다.
- process accepted와 실제 claim을 분리한다.

필수 test:

- 같은 Work Item의 Plan/Materialization descriptor 경로가 다르다.
- 두 launch의 Task command가 서로 덮어쓰지 않는다.
- 이미 Plan workspace가 열려 있어도 Materialization descriptor는 distinct하다.
- malformed authority와 wrong-scope launch는 기존처럼 거부된다.

### Slice 2 — journey projection과 primary action

주요 ownership:

- `packages/web/src/routes/work/DiscoverWorkspace.tsx`
- `packages/web/src/routes/WorkspaceHome.tsx`
- Companion query/hooks와 UI types
- 필요 시 전용 journey projector

구현:

- 세 state plane을 하나의 timeline으로 조합하되 source를 보존한다.
- primary action을 항상 표시한다.
- `Plan Mode`와 lifecycle Plan role 문구를 분리한다.
- pending enrollment, launch, first prompt, claim, Phase B를 구분한다.

검증:

- `frontend-skill`을 적용한다.
- 8890 real screen에서 각 state fixture를 확인한다.
- Chrome DevTools 8899 gate를 통과한 뒤 screenshot을 남긴다.
- parent shell이나 다른 panel에서 제거된 old label이 남지 않았는지 확인한다.

### Slice 3 — acknowledgement와 recovery

구현:

- launch attempt 단계와 timeout을 투영한다.
- 가능한 최소 Task/Bridge acknowledgement를 추가한다.
- 실패별 one-click recovery와 developer diagnostic fallback을 분리한다.
- browser retry가 duplicate claim을 만들지 않게 한다.

필수 시나리오:

- `code` accepted 후 workspace load 없음
- workspace load 후 Task start 없음
- source Plan activity 만료
- Handoff 만료
- Bridge restart
- Handoff claim 성공 후 Phase B 실패

### Slice 4 — error taxonomy와 diagnostic status

구현:

- `bridge_unavailable` 등 과도하게 넓은 오류를 원인별로 분리한다.
- read-only Web diagnostic object를 먼저 설계하고 CLI 필요성을 결정한다.
- raw diagnostics는 expandable panel로 제한한다.

검증:

- host Bridge down과 sandbox transport denial을 별도 test로 증명한다.
- auth failure와 scope/revision mismatch를 구분한다.
- 진단 API가 lifecycle authority로 오용될 수 없는지 review한다.

### Slice 5 — Work Skill과 문서 정렬

구현:

- UI의 새 상태 이름과 Work Skill의 lifecycle 용어를 맞춘다.
- frozen decision/reopen 조건을 handoff에 포함한다.
- source Plan 유지 구간과 fresh target session claim 구간을 명시한다.
- active docs와 decision log를 같은 change set에서 갱신한다.

금지:

- Skill이 private Bridge state를 authority로 사용하게 하지 않는다.
- launcher 편의를 위해 exact scope/revision/turn 검사를 완화하지 않는다.

### Slice 6 — WSL/VS Code live acceptance

실제 Windows VS Code + WSL 환경에서 다음을 fresh session으로 검증한다.

1. Work Item에서 Plan session 열기
2. 첫 prompt receipt 확인
3. non-pristine Handoff 준비
4. source Plan 창을 닫지 않고 Materialization 열기 클릭
5. distinct workspace/window와 Continue Task 관찰
6. fresh target session과 exact Handoff claim 관찰
7. Phase B durable revision과 review pending 관찰
8. 중간 단계별 UI timeline과 recovery 확인

shell fallback 없이 성공해야 normal-path acceptance다.

## 전면 개편 acceptance criteria

### Launcher

- 기존 source Plan workspace가 열린 상태에서 Materialization click이 distinct descriptor를
  연다.
- 기존 Plan descriptor와 Task는 변경되지 않는다.
- click 한 번으로 generated Continue Task가 정확히 한 번 시작된다.
- duplicate click/retry가 duplicate session이나 duplicate claim을 만들지 않는다.
- API `accepted`와 workspace/task/session/claim 상태가 각각 표시된다.

### Lifecycle

- current-prompt receipt, active role, exact scope, lease, latest turn, Work Item revision binding을
  유지한다.
- stale source, expired Handoff, Bridge restart, revision drift가 fail-closed한다.
- `Handoff claimed`와 `Phase B committed`가 별도 event다.
- Phase B 성공 뒤 durable ledger에 exact claim provenance와 새 revision이 기록된다.

### Interface

- 사용자는 ID, Capsule, shell command를 normal path에서 입력하지 않는다.
- primary next action이 항상 같은 위치에 보인다.
- disabled 상태에는 정확한 원인과 recovery가 있다.
- lifecycle Plan role과 Codex collaboration mode가 혼동되지 않는다.
- expiry countdown과 source-session 유지 경고가 보인다.
- raw UUID/digest는 진단 panel에만 있다.

### Verification

- targeted unit/integration tests
- `cd packages/web && npm run build`
- `node scripts/validate-artifacts.mjs`
- 관련 Skill 변경 시 Skill validation
- `git diff --check`
- 8890 real screen 검증과 screenshot
- WSL에서 실제 VS Code launch/claim/Phase B fresh-session evidence

## 명시적 범위 밖

- browser가 Codex prompt나 function response를 임의로 대신 전송하는 기능
- Web이 Work Item, Graph 외 artifact, Registry를 임의로 수정하는 기능
- exact scope/lease/current-turn 검사를 줄이는 편의 기능
- A2A를 새 top-level Asset type으로 만드는 taxonomy 변경
- Graph IR 또는 Asset Registry schema의 전면 재설계
- 실제 캠페인 execution/write
- Smart CEP ADK source, generator lowering, Mock MCP 또는 runtime 구현
- Smart CEP의 이미 확정된 `create_project_draft`, `agent_delegation`, explicit/hybrid 비교
  결정을 다시 여는 것

## 새 세션 시작 전 확인 사항

1. active Materialization session이 남아 있는지, Phase B가 이미 ledger를 갱신했는지 확인한다.
2. `git status --short`, current branch/HEAD, existing diff ownership을 확인한다.
3. 이 문서, root/nearest `AGENTS.md`, active canonical docs를 읽는다. 19번은 과거 증거가
   필요할 때만 읽고 21번의 ADK 구현 지시를 실행하지 않는다.
4. Smart CEP Work Item과 ADK source를 변경하지 않는다.
5. live Bridge/session 값은 새 prompt receipt에서만 authority로 사용한다.
6. 기존 user-owned untracked 문서를 수정하지 않는다.
7. overhaul branch/worktree 기준에 dirty continuation 변경이 포함되는지 먼저 결정한다.

## 새 세션용 복사 프롬프트

```text
/home/ilmaswsl/work/af-companion에서 Companion lifecycle UX 전면 개편 작업을 새로 시작하라.

먼저 root와 nearest AGENTS.md, 다음 문서를 완전히 읽어라.
- docs/workbench/follow-ups/20-companion-lifecycle-ux-overhaul.md

현재 Work Item/Bridge/launcher 상태를 read-only로 다시 확인하라. 과거 문서의 session_id,
turn_id, lease, Handoff ID를 authority로 재사용하지 마라. page-recommendation-a2a-provider의
현재 Materialization이 여전히 active인지, Return-to-Discover Phase B가 완료돼 ledger와
review gate가 바뀌었는지 먼저 보고하라. active 작업에는 prompt를 보내거나 중복 claim하지
마라.

그 다음 현재 dirty working tree의 소유권과 검증 상태를 inventory하라. 사용자 소유
untracked 파일을 수정하지 말고, 기존 변경을 revert/stash/commit하거나 clean worktree에서
누락시키지 마라. 구현 기준 branch/worktree가 불명확하면 그 한 가지 결정을 먼저 요청하라.

20번 작업서의 Slice 0과 Slice 1만 이번 작업 범위로 삼아라. 특히 같은 Work Item의 Plan과
Materialization launch가 동일 .code-workspace 경로를 덮어쓰는 문제를 test로 재현한 뒤,
role/authority/attempt별 immutable descriptor와 launch-attempt 상태를 최소 변경으로
구현하라. code process accepted를 workspace loaded, Task started, session claimed로
간주하지 마라. source Plan session을 닫게 하거나 exact lifecycle security gate를 약화하는
해결은 금지한다.

구현 후 targeted tests, packages/web build, 관련 artifact validation, git diff --check를
실행하고 변경 파일, live 미검증 항목, 다음 Slice를 보고하라. Smart CEP ADK source 생성은
진행하지 마라. ADK 구현은 별도 21번 작업이며 같은 change set에 포함하지 마라.
```

## 다음 세션이 처음 확인할 source

- `packages/web/server/vscodeWorkspaceLauncher.ts`
- `packages/web/server/codexCompanionApi.ts`
- `packages/web/src/routes/work/DiscoverWorkspace.tsx`
- `packages/web/src/routes/WorkspaceHome.tsx`
- `packages/web/src/state/useCodexSessions.ts`
- `packages/web/src/companion/types.ts`
- `scripts/af.mjs`
- `.agents/skills/af-workflow/SKILL.md`
- `.agents/skills/af-discover-assets/SKILL.md`
- `.agents/skills/_shared/companion-session-participation.md`
- `.agents/skills/_shared/fresh-context-handoff.md`

## 문서 유지 규칙

- live state가 달라져도 과거 재현 증거를 삭제하지 않고 dated checkpoint를 추가한다.
- issue가 고쳐지면 source/test/acceptance evidence와 merge 기준 commit을 기록한다.
- proposal이 canonical contract가 되면 owning active docs와 `docs/decision-log.md`를 같은
  change set에서 갱신한다.
- Smart CEP ADK 진척은 21번 문서에, Companion interface 진척은 이 문서에 기록한다.
