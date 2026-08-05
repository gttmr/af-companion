# Session 2. Companion 통합과 offline end-to-end acceptance

상태: **blocked — Phase A current-run VS Code AI chat과 model transport lock이 충돌**

Master: [2-session 프로그램](../23-companion-adk-development-program.md)

## 이 session의 한 가지 결과

Session 1에서 검증한 AF Skills vNext와 ADK 2.4 capability evidence를 primary Companion에 연결해,
선택한 Graph Node·Edge·Region에서 외부 Codex 작업을 만들고 self-hosted
`qwen3.6-27b-128k`로 ADK source 생성·검증·local Git commit까지 수행하는 사용자 여정을 완성한다.

이 session에서는 AF Skill instruction이나 ADK pattern card를 수정하지 않는다. Skill defect는
Session 1 workstream의 follow-up defect로 분리한다.

Phase A의 browser, local MCP, Registry, App Git과 restart evidence는 2026-08-06에 다시
수집했지만, `USER-ACCEPTANCE.md`가 요구하는 새 VS Code Codex AI chat은 current Session 2에서
실행하지 않았다. 현재 extension은 cloud model을 기본 사용하고 설치 manifest에 approved
self-hosted provider setting을 노출하지 않는다. Cloud model 금지와 current-run extension chat
요구를 동시에 만족하는 검증된 경로가 없으므로 Phase A는 완료가 아니라 blocker다. 전일 cloud
extension evidence나 독립 local MCP 결과를 current Session 2 PASS로 대체하지 않는다.

## 시작 gate

1. Session 1 Skill/evidence PR이 merge됐고 bundle version/digest가 고정돼 있다.
2. Skill manifest input/output, ADK 2.4 capability inventory, representative integration set와
   unsupported/excluded list를 읽었다.
3. current PR #22 state, checks, head와 worktree를 다시 확인했다.
4. self-hosted `qwen3.6-27b-128k`와 128k (`131072`) context, ADK 2.4.0 interpreter,
   accepted agents-cli `1.2.1`과 Google Skills `1.2.1` exact digest bundle이 App cwd에서
   준비됐다. Candidate agents-cli `1.3.1`은 Session 1에서 rejected다.
5. primary checkout의 두 untracked historical work-order 파일을 보존했다.

Session 1의 known unsupported pattern을 Companion UI나 prompt가 supported로 노출하면 code
write 전에 contract mismatch로 중단한다.

## Phase A — PR #22 foundation closure

같은 session의 첫 checkpoint다.

1. 최소 GitHub CI에 Companion typecheck, test, build와 shared artifact validator를 추가한다.
2. `USER-ACCEPTANCE.md`의 App·Asset·Graph·MCP·local Git foundation을 fresh server/App에서
   실행한다.
3. App switch `app_inactive`, restart recovery, invalid Graph fail-closed, `graph_stale`, VS Code
   get/apply와 screenshot을 검증한다.
4. current foundation failure만 재현 후 최소 수정한다. source/Skill context 기능을 PR #22의
   과거 commit에 억지로 섞지 않는다.
5. independent review와 사용자 merge gate 뒤 PR #22를 merge하고 clean worktree만 정리한다.

PR #22가 이미 merge됐다면 이 phase를 재구현하지 않고 current CI/acceptance evidence를
재확인한다.

## Phase B — Source와 Development Context contract

latest `main` 기반 새 Companion change set에서 다음 versioned contract를 먼저 확정한다.

### App source projects

- nested source project ID와 App-relative root
- runtime `google-adk`, language/package manager와 executable entrypoint
- v1 App manifest read/upgrade policy
- absolute path, `..`, symlink escape, duplicate ID/root와 cross-App locator rejection
- Manager baseline 뒤 source·Graph commit은 사용자/Codex 소유

### Implementation mapping

- Graph element 또는 exact Asset ref → source project/module/symbol/config/test locator
- Graph revision, Asset version/hash와 Git base/result commit
- current/missing/stale/conflict 계산 근거
- strict Graph IR field를 늘리지 않는 separate sidecar

### Skill/model lock

- Session 1 AF bundle version/digest와 required Google Skill IDs
- App cwd discoverability, disabled/missing/version/digest/offline-ready
- exact ADK 2.4 and agents-cli compatibility
- self-hosted `qwen3.6-27b-128k`, 128k context와 allowed local dependency source
- ignored local configuration의 승인된 Tailscale direct `/v1` endpoint만 허용하고 private endpoint
  bytes는 source, App, artifact 또는 evidence에 저장하지 않음
- localhost tunnel, 다른 Internet egress, cloud model과 Gemini fallback을 fail closed로 거절
- deploy/cloud Skill을 missing requirement로 표시하지 않음

### Development Context Capsule

- App/source root, base commit, Graph revision
- one selected Node·Edge·Region과 필요한 bounded neighborhood
- exact Asset binding/runtime contract와 implementation locator
- primary intent 하나와 explicit `$skill-name`
- write roots, forbidden changes와 verification
- Session 1 capability/experiment evidence ID와 known unsupported guard
- no Internet, no cloud fallback와 local model profile

dedicated read-only MCP Tool과 existing workspace read 확장 중 더 작은 wire를 source/tests로
결정한다. selection에서 source를 직접 쓰는 Tool은 만들지 않는다.

## Phase C — Runtime implementation

1. App Manager가 C02 contract대로 nested source project identity를 create/read/attach하고 restart와
   App switch 뒤 복구한다. ADK scaffold 자체는 외부 Codex/Skill이 수행한다.
2. implementation mapping을 canonical Graph/Git revision과 함께 관리한다.
3. Skill readiness는 local filesystem/bundle evidence를 검사하되 “설치됨”을 “실제로 사용됨”과
   혼동하지 않는다.
4. selected Node, Edge, Region 각각의 bounded capsule을 deterministic하게 조립한다.
5. stale Graph, changed Asset hash, missing source/Skill/model과 unsupported ADK 2.4 capability를
   actionable typed error로 반환한다.
6. Graph writes는 latest `get -> apply`를 유지하고 source write와 권한을 합치지 않는다.

## Phase D — Selection-to-Codex UX

visible UI 변경이므로 `frontend-skill`과 `docs/visualization/design-system.md`를 적용한다.

1. Inspector에 `Codex 개발 작업 만들기` action을 제공한다.
2. source project, selected context, required Skills, ADK capability evidence, write roots와 checks를
   실행 전에 검토할 수 있게 한다.
3. canonical App/source cwd에서 Codex CLI 또는 VS Code extension 새 chat으로 exact task를
   전달한다.
4. task는 한 primary intent만 가지며 full Graph/Registry와 unrelated references를 넣지 않는다.
5. Browser App Server conversation, online docs/marketplace와 cloud model login을 요구하지 않는다.
6. launch/requested Skill/completion receipt와 actual output quality evidence를 구분한다.

React Flow 전환, 고급 layout/pan/zoom과 Browser direct App Server는 이 phase의 비범위다.

## Phase E — Offline end-to-end matrix

모든 scenario는 승인된 Tailscale model transport 외 external network를 차단하고 self-hosted
`qwen3.6-27b-128k`, exact ADK 2.4.0과 Session 1 Skill bundle을 사용한다.

### E1 Existing Workflow/Subworkflow

- exact published 또는 project-only Workflow와 source locator를 binding한다.
- Subworkflow Node와 parent I/O/failure contract를 시각화한다.
- 선택 Node/Edge → capsule → external Codex source → import/unit/runtime/local eval을 실행한다.
- child internals를 parent Graph에 복제하지 않는다.

### E2 representative capability integration

Session 1 capability inventory가 `required_integration`으로 지정한 대표 집합을 하나의 검토 가능한
App Graph와 여러 bounded task로 통합한다. 최소한 다음 기능군을 포함한다.

- coordinator와 둘 이상의 Sub-agent delegation, result aggregation와 error propagation
- explicit Graph route, parallel fan-out/fan-in과 real Join
- bounded loop의 exit/exhaustion 또는 exact 2.4에서 검증된 반복 대안
- 필요한 경우에만 reviewed dynamic node selection과 unsupported target 처리
- Workflow-fixed Function/MCP Tool과 Agent-selected Tool의 Invocation Control 차이
- parent/child 또는 branch 사이의 state/artifact ownership과 Event commit evidence
- callback/guardrail 또는 Human Input/confirmation의 pause, resume와 duplicate-side-effect 방지
- downstream typed output과 terminal failure path

전체를 한 prompt로 구현시키지 않는다. Agent Node, control Edge, Tool Node, Human Input Node와
Region 등 selection별로 최소 여섯 개의 bounded task를 순서대로 실행하고 각 task 뒤 tests와
implementation mapping을 갱신한다. Companion이 해당 capability evidence, interaction risk와
unsupported guard를 정확히 전달하는지 확인한다. Session 1의 전체 research matrix를 여기서
반복하는 것은 목적이 아니다.

### E3 Existing Agent/A2A

- A2A를 Agent Asset Binding 또는 Exposure로만 표현한다.
- selected Agent/Edge에서 provider/consumer task를 만든다.
- local Agent Card health와 semantic call readiness를 구분한다.
- success, timeout/remote failure와 unsupported input/auth를 typed result로 검증한다.
- public endpoint, cloud deploy 또는 secret material을 사용하지 않는다.

### 각 scenario의 공통 evidence

- App/source project와 sanitized tree
- requested Skill IDs/version/digest와 selected references
- Graph revision, exact Asset version/hash와 capability/experiment evidence ID
- delivered bounded prompt/capsule와 changed-file/write-root inventory
- ADK 2.4 import/unit/runtime/local eval commands and results
- implementation mapping before/after
- local Git base/result commits
- 승인된 Tailscale model request 외 external network request가 없다는 evidence
- PASS/FAIL/UNVERIFIED와 residual risk

## Self-hosted-27B Session 2 acceptance

self-hosted `qwen3.6-27b-128k`에서 다음을 별도로 판정한다.

- required Skill을 정확히 선택하는가
- agents-cli guidance와 ADK 2.4 correction이 충돌할 때 Session 1 evidence protocol을 따르는가
- unsupported API를 memory로 만들어내지 않는가
- bounded context와 write root를 지키는가
- Agent/Sub-agent, Graph, Tool, state/lifecycle 중 선택 대상에 필요한 reference만 읽는가
- validation failure 뒤 speculative fix를 쌓지 않고 source/probe를 다시 읽는가

다른 local/cloud model에서 대신 성공한 결과는 Session 2 primary PASS가 아니다. 이 결과를
`small-model PASS`라고 부르지 않고 **self-hosted-27B Session 2 acceptance**로 기록한다.

## Checkpoint와 PR 경계

한 fresh session 안에서 아래 checkpoint를 순서대로 진행한다.

1. PR #22 CI/acceptance/merge
2. source/context contracts와 contract tests review
3. App source/mapping/readiness runtime implementation
4. selection-to-Codex UI와 browser verification
5. E1 Subworkflow
6. E2 representative capability integration
7. E3 A2A
8. independent review, final evidence와 Draft/ready 판단

interface와 UI를 별도 PR로 나눌 수 있지만, session context와 master work order는 하나를
유지한다. checkpoint failure를 다음 checkpoint의 workaround로 숨기지 않는다.

## 검증

- `cd packages/companion && npm run typecheck && npm run test && npm run build`
- `node scripts/validate-artifacts.mjs`
- contract/path/digest/read-only integration tests
- current ADK 2.4 capability/runtime tests selected by Session 1 evidence
- 승인된 Tailscale model transport 외 network-disabled self-hosted-27B E1–E3 acceptance
- Chrome DevTools `8899` gate 뒤 real screen DOM/console/network와 screenshot
- `git diff --check`, relative links, edited-file and App Git inventories
- GitHub required checks for each product PR

## 완료 gate

- PR #22 foundation이 merged 또는 current equivalent로 검증됐다.
- source project, implementation mapping, Skill/model lock과 bounded capsule이 구현됐다.
- selection에서 external Codex task를 시작하고 Skill/quality evidence를 구분할 수 있다.
- E1 Subworkflow, E2 representative capability integration과 E3 A2A가 offline
  self-hosted `qwen3.6-27b-128k`에서 PASS다.
- local Git commit이 Graph/source/evidence 기준점을 보존하고 remote push가 필요하지 않다.
- AF Skill source를 이 session에서 수정하지 않았고 unresolved Skill defect는 별도 issue/evidence로
  반환됐다.
- App Server, advanced editor와 legacy migration을 하지 않아도 product north star가 충족된다.
