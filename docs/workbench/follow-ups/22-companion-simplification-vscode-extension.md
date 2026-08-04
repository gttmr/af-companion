# 22. Companion 단순화와 Codex App Server 직접 소유 전환

상태: **partially implemented primary path — Graph/App/MCP implemented, turn UI pending**

작성일: 2026-08-03 KST

조사 기준:

- 현재 저장소의 Web launcher, CLI Companion, Hook, Bridge 구현
- Codex CLI `0.146.0`의 `app-server` command와 생성 가능한 protocol schema
- [Codex App Server 공식 문서](https://developers.openai.com/codex/app-server/)
- [OpenAI의 App Server 설계 설명](https://openai.com/index/unlocking-the-codex-harness/)

연결 문서:

- [20. Companion lifecycle UX 전면 개편](./20-companion-lifecycle-ux-overhaul.md)
- [21. Smart CEP Google ADK 구현](./21-smart-cep-google-adk-implementation.md)
- [CLI Companion](../cli-companion.md)
- [Operating Model](../operating-model.md)
- [Verification Model](../validation.md)

## 이 문서의 역할

이 문서는 새 구현의 파일 목록이나 명령 순서를 고정하는 작업 지시서가 아니다. 현재
Companion이 왜 복잡해졌는지, Codex App Server가 어떤 경계를 대체할 수 있는지, 구현자가
어떤 증거를 읽고 최소 구조를 판단해야 하는지를 정리한 architecture note다.

구현 시점에는 이 문서의 조사 결과를 출발점으로 삼되 다음을 다시 확인한다.

- 현재 checkout의 실제 source와 test
- 설치된 Codex binary의 `app-server` help와 generated schema
- Work Item, Registry, Graph, review gate를 소유하는 canonical 문서
- 유지하려는 사용자 경험과 실제로 제거 가능한 transport 경계

이 문서에 적힌 package 이름이나 component 배치는 Target Contract가 아니다. source를 읽은
결과 더 작은 경계가 발견되면 그 경계를 선택한다. 반대로 현재 구현이 전제한 무결성을
대체 구조가 증명하지 못하면 기존 경계를 성급히 삭제하지 않는다.

## 2026-08-04 구현 상태

- `packages/companion`이 새 Companion의 primary development surface로
  선택됐다.
- managed App root, exact Asset binding, single-writer Graph Control Server,
  Context v2, read/write MCP, live Web synchronization, VS Code extension
  launcher가 구현됐다.
- `app-server-client`는 Graph synchronization과 독립된 protocol client로
  구현·검증됐다.
- App Server thread/turn을 실제 제품 실행 UI에 연결하는 작업과 기존
  `packages/web` route 제거는 아직 구현되지 않았다. 기존 코드는 전환
  판단을 위한 legacy/reference로 유지한다.

## 결론

Agent Factory가 해결해야 할 핵심은 **VS Code extension을 만드는 것**이 아니라
**Agent Factory가 Codex App Server client가 되어 자신이 시작한 connection, thread, turn,
approval, user input, completion을 직접 소유하는 것**이다.

VS Code extension은 가능한 client host 중 하나일 뿐 필수 조건이 아니다. 현재 저장소에는
이미 Browser Workbench와 Node server가 있으므로 첫 번째 구현 가설은 `packages/web` backend가
`codex app-server` child process를 `stdio`로 소유하는 구조다. 이 가설이 성립하면 기존 Web
UI를 유지하면서 terminal launch, Hook, localhost Bridge, receipt, lease, Capsule을 정상
실행 경로에서 제거할 수 있다.

```text
Browser Workbench
  -> Agent Factory Web backend
       -> Codex App Server client/controller
            -> stdio JSON-RPC
                 -> codex app-server child process
                      -> application workspace
```

별도 VS Code extension, 별도 daemon, 공개 listener는 이 구조의 선행 조건이 아니다. editor
native diff, selection, command, Workspace Trust 같은 IDE 통합이 제품 요구로 확인되면 같은
App Server client contract를 사용하는 후속 client로 VS Code extension을 검토할 수 있다.

## 현재 작업 중단점

이 문서는 Companion architecture를 재검토하기 위해 Smart CEP/ADK 실행을 일시 중단한
시점의 판단을 기록한다. 현재 Smart CEP artifact, Graph IR, Boundary, Scaffold, Registry,
generated ADK source를 진행시키는 문서가 아니다.

`page-recommendation-a2a-provider`는 Discovery materialization 이후 lifecycle과 stale
projection 문제가 얽힌 상태였다. 이 상태를 기존 Bridge/receipt 절차로 더 진행시키기 전에
Companion의 실행 소유권을 단순화하는 것이 이번 architecture reset의 목적이다. 실제 재개
시점의 Work Item revision과 review gate는 이 문서의 스냅샷을 믿지 않고 canonical artifact를
다시 읽는다.

## 현재 구조에서 확인된 문제

### 실행을 시작한 component와 실행을 증명하는 component가 다르다

현재 정상 경로는 Browser, Web server, VS Code launcher, generated workspace Task, Codex CLI,
Hook, localhost Bridge를 지난다.

```text
Web action
  -> code --new-window
  -> generated .code-workspace / folderOpen Task
  -> interactive Codex CLI
  -> UserPromptSubmit Hook
  -> localhost Bridge
  -> ticket / lease / receipt / Handoff or Grant
  -> Work Skill write
```

Web은 실제 Codex turn을 시작하지 않고 launcher는 `code` process가 요청을 받았다는 사실만
안다. Hook은 이미 발생한 prompt를 사후 관찰한다. Bridge는 서로 다른 component가 같은
Work Item 실행을 가리킨다는 사실을 다시 조립한다. 각 방어는 도입 당시의 race와 scope
문제를 막지만, 전체로는 실행 주체가 없는 control plane이 된다.

### transport identity가 domain identity보다 커졌다

Work Item과 revision 외에 workspace descriptor, launch attempt, Codex session/turn, enrollment
ticket, activation Capsule, Bridge instance, lease, prompt receipt, Grant/Handoff marker와 expiry가
한 번의 작업에 관여한다. 이 값의 대부분은 Agent Factory 업무 개념이 아니라 간접 transport를
안전하게 연결하기 위한 값이다.

그 결과 사용자는 무엇을 만들고 검토하는지보다 어떤 session이 어떤 receipt를 가졌는지를
이해해야 한다. stale transport state가 domain 작업을 막고, 오류 복구도 제품 내부가 아니라
terminal과 session 조작으로 노출된다.

### 세 state plane이 서로를 추론한다

현재는 다음 상태가 별도로 존재한다.

- durable domain state: Work Item, decisions, review, artifact revisions
- transient Bridge state: session, lease, receipt, delivery, Handoff/Grant claim
- launch state: VS Code process, workspace descriptor, Task와 terminal 시작 여부

20번 문서는 세 plane을 더 정확히 보이게 만드는 개선안을 제시한다. 이는 기존 경로를
유지해야 할 때 유효하지만, 장기 구조는 세 plane을 모두 정교하게 만드는 것이 아니라 domain
state와 current execution state 두 개로 줄이는 편이 낫다.

### 구현 표면이 하나의 사용자 action에 비해 너무 넓다

현재 source에서 `codexBridgeStore.ts`, `codexBridgeServer.ts`, `codexCompanionApi.ts`,
`vscodeWorkspaceLauncher.ts`, Hook adapter, `scripts/af.mjs`가 한 실행 경로에 함께 참여한다.
어떤 파일 하나가 나쁘기 때문이 아니라, 한 action의 성공을 판단하려면 모든 component의
상태 전이를 알아야 한다는 것이 문제다.

새 구조는 기존 코드를 다른 이름으로 한곳에 복사해서는 안 된다. App Server가 이미 제공하는
thread/turn/approval/event identity와 Agent Factory가 소유해야 하는 Work Item gate 사이의
최소 adapter만 남기는 것이 목표다.

## Codex App Server가 제공하는 경계

Codex App Server는 VS Code 전용 extension API가 아니다. 자체 제품에서 authentication,
conversation history, approvals, streamed agent events를 통합하기 위한 bidirectional JSON-RPC
interface다. VS Code extension은 이 interface를 사용하는 client 사례 중 하나다.

현재 공식 문서와 로컬 `0.146.0` CLI에서 확인한 핵심은 다음과 같다.

- connection마다 `initialize`와 `initialized` handshake가 필요하다.
- client는 `thread/start`, `thread/resume`, `thread/fork`로 대화 identity를 소유한다.
- `turn/start`, `turn/steer`, `turn/interrupt`로 한 번의 실행을 제어한다.
- thread, turn, item, command, file change, approval, completion event가 stream으로 전달된다.
- 설치된 Codex version에 맞는 TypeScript 또는 JSON Schema를 생성할 수 있다.
- 기본 transport는 newline-delimited JSON을 사용하는 `stdio`다.
- Unix socket과 local daemon/proxy 경로도 현재 CLI에 존재한다.
- WebSocket listener는 현재 experimental/unsupported이며 remote exposure에는 별도 인증과
  TLS 판단이 필요하다.

App Server process만 시작한다고 제품이 완성되는 것은 아니다. initialize, thread/turn,
stream, approval, user input, crash/restart를 처리하는 client가 반드시 있어야 한다. 이번
전환의 설계 대상은 별도 “서버 설치”보다 이 client ownership이다.

App Server는 rich interactive client를 위한 interface다. 단순 CI job이나 비대화형 batch가
목적이라면 Codex SDK나 `codex exec`가 더 작은 선택일 수 있다. Agent Factory Companion은
review, 질문, approval, streamed progress, fresh thread 전환이 필요하므로 App Server가 더
가까운 후보로 판단된다.

## client host 선택

어느 UI framework를 선택할지보다 다음 책임을 한 process boundary가 가질 수 있는지가
중요하다.

- Codex process 또는 App Server connection의 생명주기
- exact thread/turn ID와 event subscription
- approval과 사용자 질문의 왕복
- application root, `cwd`, sandbox, model과 Work Item scope 연결
- process exit, protocol error, stale revision의 명확한 실패 처리
- Browser나 editor에 보여 줄 bounded projection

현재 저장소를 기준으로 가능한 host는 다음과 같다.

| client host | 유리한 점 | 추가되는 경계 | 현재 판단 |
| --- | --- | --- | --- |
| 기존 Web backend | Workbench, Work Item projection, application root, server-side process 제어를 이미 가짐 | Browser에 event/approval을 전달할 얇은 channel 필요 | 첫 feasibility 대상 |
| local daemon/service | Web restart와 여러 client 사이에서 process를 공유하기 쉬움 | daemon ownership, socket lifecycle, concurrency 정책 필요 | 공유 필요가 확인된 뒤 고려 |
| 독립 VS Code extension | editor, diff, command, workspace UX를 직접 제공 | extension packaging, Remote-WSL, trust, host lifecycle 관리 | IDE 통합 가치가 확인될 때 고려 |
| desktop 또는 별도 client | IDE와 독립된 제품 경계 | workspace/file/diff UX를 새로 구축 | 장기 선택지 |
| 기존 OpenAI Codex extension 연동 | 기존 chat UI 활용 가능성 | 문서화되지 않은 private command와 내부 state에 결합 | lifecycle 기반으로 사용하지 않음 |

Web backend가 첫 후보라는 것은 최종 UI를 영구 고정한다는 뜻이 아니다. 현재 가장 많은
도메인 context를 이미 가진 process에서 App Server ownership 가설을 가장 작게 검증할 수
있다는 뜻이다. client contract가 분리돼 있으면 이후 VS Code extension이나 다른 UI는 같은
contract 위에 추가할 수 있다.

## transport 선택

### `stdio` child process

첫 vertical slice에는 가장 작은 경계다. Web backend 또는 다른 local client가
`codex app-server`를 child process로 시작하고 stdin/stdout JSONL을 직접 소유한다. 공개
port, endpoint token, listener discovery, 별도 Bridge health가 필요 없다. process accepted,
initialized, thread started, turn started, turn completed, process exited를 같은 owner가 구분할
수 있다.

이 방식이 적합한지는 현재 Web dev server의 restart 특성, 장시간 실행, 한 사용자에게 필요한
동시 Work Item 수를 source와 실제 사용 시나리오에서 확인해 판단한다.

### Unix socket 또는 managed daemon

App Server를 Web process보다 오래 유지하거나 여러 local client가 공유해야 한다면 Unix
socket/daemon이 자연스러운 다음 후보가 된다. 현재 CLI에는 daemon management와 stdio-to-
control-socket proxy가 있다.

그러나 shared daemon은 공짜가 아니다. 어느 client가 Work Item write를 소유하는지, reconnect
후 event를 어떻게 복원하는지, 여러 client가 같은 thread를 조작할 수 있는지에 대한 정책이
필요하다. 이 요구가 실제로 나타나기 전에는 child process보다 단순하다고 가정하지 않는다.

### WebSocket listener

Browser가 App Server WebSocket에 직접 연결하는 구조는 겉보기에는 단순하지만 현재 공식
지원 수준과 Agent Factory의 trust boundary에 맞지 않는다. WebSocket transport는
experimental/unsupported이고, listener·token·origin·remote exposure를 다시 관리하면 기존
Bridge와 비슷한 transport 보안 계층을 만들 수 있다.

localhost listener나 원격 접속이 실제 요구로 확인되기 전에는 선택하지 않는다. 선택한다면
token hash가 왜 필요한지까지 포함해 공식 App Server 보안 계약을 그대로 따르고, Agent
Factory 고유 ticket/Capsule protocol을 추가로 발명하지 않는다.

## 권장 Target shape

Target은 UI가 아니라 책임 배치로 표현한다.

```text
User-facing client
  Browser Workbench initially; another client may follow
        |
        v
Agent Factory execution controller
  - owns one App Server connection/process boundary
  - maps Work Item scope to cwd and turn configuration
  - records current run identity
  - handles approvals, questions, stream and failure
        |
        v
Codex App Server
  - thread / turn / item lifecycle
  - sandboxed tools and file changes
  - authentication and Codex session history

Durable domain authority
  - artifacts/af/<work-id>/af-work-item.json
  - reviewed discovery/composition/scaffold/verification artifacts
  - catalog/asset-registry.json
```

execution controller의 local state는 다음 정도의 current run projection만 가져야 한다.

- Work Item과 application root
- 시작 시 읽은 exact revision 또는 ETag
- lifecycle role
- App Server process/connection identity
- thread ID와 turn ID
- running, waiting for user, waiting for approval, failed, completed 같은 실행 상태

Work Item의 `waiting_for_input`, `waiting_for_review`, `blocked`, `stale`는 domain state다. App
Server turn 상태, Codex collaboration mode, Agent Factory lifecycle role을 하나의 enum으로
합치지 않는다.

## Plan과 Materialization의 의미

Plan과 Materialization을 분리한 이유는 transport가 아니라 context와 write authority다.
새 구조에서도 다음 무결성은 남는다.

- Plan은 결정을 탐색하고 bounded handoff를 만든다.
- Materialization은 사용자의 명시적 결정 뒤 fresh context에서 시작한다.
- Materialization 시작 직전 canonical Work Item과 decision revision을 다시 읽는다.
- source drift나 open decision이 있으면 write 전에 멈춘다.
- validator와 review gate가 성공 결과를 판정한다.

fresh context를 만들기 위해 새 VS Code window, 새 terminal, Capsule, lease가 필요한 것은
아니다. client가 새 App Server thread를 시작하고 승인된 Plan context를 직접 전달하면 된다.
어떤 data를 handoff로 유지할지는 현재 Work Skill contract와 실제 source를 읽어 정하며,
Bridge transport provenance를 그대로 새 controller schema로 복사하지 않는다.

## 보존할 무결성과 제거할 transport 보안

단순화는 hash와 검증을 전부 없애는 작업이 아니다. 현재 `crypto`, `digest`, `sha256`이라는
용어가 서로 다른 목적에 사용되므로 먼저 구분한다.

### 유지하는 것

- Work Item과 artifact revision/ETag
- Registry optimistic concurrency와 immutable published version
- Graph, discovery, asset decision, scaffold/verification input의 content fingerprint
- source drift 확인과 validator
- Git object hash
- Codex sandbox와 approval

여기서 SHA-256은 암호화가 아니라 bytes가 바뀌었는지 비교하는 fingerprint다. canonical
artifact의 무결성과 stale write 차단에 직접 쓰이는 값은 transport 정리와 무관하게 남긴다.

### 제거 후보

- enrollment ticket와 activation Capsule
- Bridge endpoint token과 listener discovery
- session lease와 expiry
- current-prompt participation receipt
- next-prompt delivery와 consume proof
- Bridge-local Grant/Handoff transport state
- 위 값을 보호하기 위해 Bridge에 추가된 encryption, token digest, signature logic

이 항목은 Web, terminal, Hook, Bridge 사이에서 authority를 전달하기 때문에 필요해졌다.
App Server client가 process와 turn을 직접 소유해 같은 무결성을 대체한 뒤 정상 경로에서
제거할 수 있다. 아직 legacy path가 쓰는 값을 먼저 삭제하거나 검사를 약화하는 방식으로
단순화하지 않는다.

App Server 자체의 remote WebSocket 인증이나 외부 library의 transitive cryptography
dependency는 별개의 문제다. 실제 선택한 transport와 dependency graph를 확인한 뒤 판단하며,
이름에 `crypto`가 있다는 이유만으로 삭제하지 않는다.

## 현재 source에서 읽어야 할 경계

구현자는 기존 설계를 그대로 옮기기보다 다음 source가 각각 어떤 책임과 실패를 소유하는지
확인한다.

- `packages/web/server/codexCompanionApi.ts`: Browser-facing Companion facade와 현재 launcher/
  Bridge 연결
- `packages/web/server/vscodeWorkspaceLauncher.ts`: application root 검증, workspace descriptor,
  host `code` launch와 editor open 동작
- `packages/web/server/codexBridgeServer.ts`: localhost protocol과 request boundary
- `packages/web/server/codexBridgeStore.ts`: ticket, session, lease, receipt, delivery,
  Grant/Handoff와 scope 검증
- `scripts/af.mjs`: Work/Asset/Companion CLI command와 Hook/launcher가 호출하는 adapter
- `.agents/skills/_shared/**`: Work Skill이 기대하는 current session, handoff, write gate
- `packages/web/src/**`: Connections, live state, action UI가 현재 어떤 server projection에
  의존하는지
- strict artifact validator와 Registry service: transport 제거 후에도 유지할 domain core

읽을 때는 “이 파일을 삭제할 수 있는가”보다 다음을 묻는다.

- 이 검사는 domain invariant인가, 간접 transport를 보완하는 invariant인가?
- App Server protocol event나 direct process ownership이 같은 사실을 이미 제공하는가?
- 제공하지 않는다면 가장 작은 새 adapter는 어디에 있어야 하는가?
- Web backend가 이미 가진 application/workspace 검증을 재사용할 수 있는가?
- Work Skill instruction에만 맡긴 lifecycle mutation 중 typed core로 옮길 실제 실패 사례가
  있는가?

## 구현 접근

첫 작업은 전체 Companion을 교체하는 프로젝트가 아니라 **현재 Web backend가 App Server
client가 될 수 있는지 확인하는 bounded vertical slice**가 적절하다.

이 slice는 canonical artifact를 쓰지 않는 한 Work Item을 대상으로 connection handshake,
한 thread와 turn, streamed output, approval 또는 사용자 질문, completion과 process failure를
관찰한다. Browser가 결과를 볼 수 있어야 하지만 기존 Workbench 전체를 새 conversation UI로
재구축할 필요는 없다. Output panel이나 최소 projection으로도 핵심 ownership을 검증할 수
있다.

구현 위치와 abstraction은 현재 Web server composition, test seam, process launcher를 읽은
뒤 정한다. `AppServerClient`, `ExecutionController` 같은 이름을 먼저 계약으로 만들거나
기존 Bridge type을 그대로 재사용하지 않는다. generated protocol schema도 저장소에 넣기
전에 binary pin, regeneration, test 전략을 함께 판단한다.

vertical slice가 성공하면 다음 change set은 source에서 확인된 가장 바깥 transport 경계부터
정상 경로에서 우회한다. legacy path는 비교와 rollback에 필요한 기간만 격리하고, 새 경로가
동일한 Work Item drift/review/approval 무결성을 증명한 뒤 삭제한다. Web UI 개편, lifecycle core
추출, VS Code extension은 각각 실제 필요가 확인될 때 별도 판단한다.

## 완료를 판단할 증거

architecture 전환은 코드가 존재하는 것만으로 완료되지 않는다. 다음 결과가 관찰돼야 한다.

### 실행 소유권

- 한 client process가 initialize부터 turn completion 또는 failure까지 관찰한다.
- current run의 thread/turn은 Hook receipt나 editor launch로 추론하지 않는다.
- process accepted, connection initialized, thread started, turn started, turn completed를
  구분한다.
- restart, disconnect, duplicate action이 유령 active run을 만들지 않는다.

### 사용자 경험

- 사용자가 terminal command, Handoff ID, Capsule, lease, session/turn ID를 복사하지 않는다.
- Plan과 Materialization 전환에 새 window나 terminal이 필요하지 않다.
- approval, 질문, failure와 recovery가 Workbench에서 이해 가능한 상태로 보인다.
- 작업을 진행할 수 없는 이유가 transport 용어가 아니라 domain blocker와 실행 오류로
  구분된다.

### domain 정확성

- Work Item과 Registry가 계속 durable authority다.
- source revision drift와 stale decision은 write 전에 fail-closed한다.
- Codex approval과 Agent Factory review decision이 분리돼 있다.
- validator success 없이 `waiting_for_review`나 완료 상태를 열지 않는다.
- client local state가 canonical artifact를 덮어쓰지 않는다.

### 보안과 운영

- default path는 불필요한 network listener와 custom token protocol을 만들지 않는다.
- application root, `cwd`, sandbox와 approval policy가 run scope에 맞게 제한된다.
- protocol parse error, stderr, process exit와 unsupported capability를 진단할 수 있다.
- 지원 Codex version과 protocol schema의 compatibility를 test로 확인한다.
- legacy path와 새 path가 같은 Work Item을 동시에 쓰지 못한다.

## 주요 위험

### App Server maturity와 version drift

App Server는 공식 deep-integration interface지만 현재 local CLI는 command를 experimental로
표시한다. stable surface와 experimental capability를 분리하고, 설치된 version의 schema를
기준으로 test한다. 특정 experimental user-input API가 없다고 전체 구조를 포기하거나,
반대로 experimental field를 durable Agent Factory contract로 승격하지 않는다.

### Web server restart와 장시간 작업

`stdio` child ownership은 단순하지만 Web dev server restart와 process lifetime이 결합된다.
실제 작업 시간이 길고 restart recovery가 제품 요구라면 Unix socket/daemon이 더 적합할 수
있다. 먼저 문제를 재현하고 thread persistence와 event resubscription이 어느 수준까지 필요한지
확인한 뒤 경계를 확장한다.

### Browser projection의 비대화

기존 Workbench에 완전한 IDE와 chat client를 한 번에 넣으면 새 복잡성이 생긴다. 첫 slice는
current run, streamed response, approval/question, error와 diff review에 필요한 정보만
projection한다. Graph, Registry, activity 등 기존 화면은 사용 가치와 ownership이 다른 만큼
독립적으로 유지하거나 정리한다.

### lifecycle core 중복

새 controller 안에 Work Item parser, validator, Registry service를 복사하면 Bridge를 다른
이름으로 다시 만든다. 현재 strict validator와 revision-checked service를 process boundary로
호출하는 것으로 시작하고, 여러 caller가 실제로 필요로 하는 최소 typed core만 추출한다.

### 기존 Codex extension과의 관계

기존 OpenAI Codex extension의 private command, Webview DOM, storage, child process를 lifecycle
evidence로 사용하지 않는다. 두 client가 coexist할 수는 있지만 Agent Factory는 자신이 만든
thread만 current run으로 취급한다. VS Code에서 파일을 여는 편의 기능과 Agent Factory run
ownership도 별도 책임으로 본다.

## 20번·21번 문서와의 관계

20번 문서는 현 구조에서 실제로 나타난 LAUNCH, STATE, LIFE failure와 recovery 요구를 담은
문제 레지스터로 계속 유효하다. 다만 그 해결책을 기존 launcher와 Bridge를 영구적으로
정교화하는 순서로 그대로 구현하지 않는다. 각 failure는 새 direct-ownership slice가
대체해야 할 acceptance case로 사용한다.

21번 Smart CEP 구현은 domain 작업의 연속성을 보존한다. Companion architecture가 최소
acceptance를 통과하기 전에는 중단 상태를 유지하고, 재개할 때는 당시 canonical Work Item과
artifact revision을 다시 읽는다. 과거 receipt, lease, Handoff 상태를 새 실행의 권한으로
재사용하지 않는다.

## 작업을 시작할 때의 판단 요약

다음 작업자는 “VS Code extension을 구현한다”는 전제를 받지 않는다. 대신 현재 source와
공식 App Server schema를 읽고, 기존 Web backend가 `stdio` child를 직접 소유하는 가장 작은
read-only journey를 먼저 찾는다.

그 journey가 connection, thread/turn, streaming, approval/user input, completion/failure를
직접 관찰할 수 있으면 client ownership 가설은 성립한다. 그 뒤 실제 source dependency를
따라 Bridge와 launcher의 transport 책임을 한 겹씩 정상 경로에서 제거한다. Web server
lifetime이 구조적으로 맞지 않으면 Unix socket/daemon을 비교하고, IDE-native 경험이 제품
가치로 확인되면 VS Code extension을 별도 client로 검토한다.

어떤 client를 선택하든 최종 판단 기준은 동일하다. 사용자는 Agent Factory domain state를
이해하면 작업할 수 있어야 하며, 연결을 증명하기 위해 terminal transport의 내부 identity를
관리해서는 안 된다.
