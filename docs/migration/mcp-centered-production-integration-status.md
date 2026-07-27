# Phase D 완료 보고

상태: **부분 완료 후 중단. Production project-scoped MCP와 제한된
second-slice run/eval은 실제 client에서 검증됐지만, canonical Agent Factory
Scaffold/Verify와 사용자가 요구한 Web → VS Code Companion 여정은 완료되지 않았다.**

실행일은 2026-07-27 KST다. Phase D 시작 시각은
`2026-07-27T02:39:36+09:00`, 계약을 만족한 application local run 종료는
`2026-07-27T14:38:32+09:00`으로 시작 후 11시간 58분 56초다. 초기 technical audit
종료는 `2026-07-27T14:49:05+09:00`, 시작 후 12시간 9분 29초였다. 종료 전
interactive acceptance와 최종 재검증은 `2026-07-27T16:01:03+09:00`, 시작 후
13시간 21분 27초에 끝났다. Canonical Verify는 시작하지 않았으므로 “전체 Verify
완료 시간”은 측정되지 않았다. 이 wall-clock에는 긴 사용자 대기와 재승인 시간이
포함되므로 Phase A의 연속 작업 시간과 직접 비교할 수 없다.

이 보고서에서 production integration 완료와 canonical lifecycle 완료를 구분한다.
MCP package, project config, CLI/VS Code Tool call, 외부 앱 run/eval은 검증했다.
반면 새 Work Item은 Discover/Compose까지만 승인됐고 OCR Tool의 reviewed production
binding과 generator lowering이 없어 Scaffold와 canonical Verify는 시작하지 않았다.
종료 직전 실제 Web/VS Code acceptance에서는 enrollment가 session으로 소비되지 않았다.
따라서 개별 MCP 호출 성공을 통합 제품 흐름의 성공으로 확대하지 않는다. Phase A부터
Phase D까지의 결론과 다음 작업의 제품 입력은
[Phases A–D 종료 요약](product-truth-phases-a-d-summary.md)에 모았다.

## Selected architecture

[Phase C ADR](mcp-hook-hybrid-architecture-decision.md)의 MCP 중심 결정을 그대로
구현했다.

- 상세 Agent Factory context는 external Application Workspace의 trusted
  `.codex/config.toml`이 시작하는 project-local stdio MCP에서 읽는다.
- MCP는 read-mostly context channel이다. Canonical Work Item mutation, handoff
  claim, first/default target 선택, Codex `session_id`/`turn_id` 생성 또는 추측은 없다.
- 기존 Companion Continue, exact Session/Hook/Lease/Security 계약은 유지한다.
  Current Hook을 external-app 상세 context fallback으로 사용하지 않는다.
- Workspace trust와 Tool approval은 별도 사용자 gate다. Project scope를 user-level
  global scope로 넓히지 않는다.
- CLI on WSL과 VS Code Remote-WSL만 지원 대상으로 검증했다. Native Windows는
  unsupported다.
- Tool transport 완료와 domain outcome을 별도로 노출하고, current evidence를 얻지
  못하면 `UNVERIFIED`로 중단한다.

## Production changes

`packages/agent-factory-context-mcp`에 Node 22+와 MCP SDK `1.29.0`을 사용하는
private production package `@agent-factory/context-mcp@0.1.0`을 추가했다. Server는
stdio만 사용하고 listener, credential, debug log, `/tmp` 또는 개발자 absolute path를
package에 넣지 않는다. 실제 `npm pack` payload는 README, package metadata, bin,
context/server source의 다섯 파일이며 tarball SHA-256은
`3e20d83b75b16df4ad12e0360562f5d21d8ea62a132b036b6fd24613e7405a91`이다.

Tool surface는 네 개로 제한했다.

| Tool | Read boundary | Fail-closed behavior |
| --- | --- | --- |
| `af_get_context` | current Work Item/Registry context와 revision | missing/stale evidence → `UNVERIFIED` |
| `af_get_pending_work` | actionable work와 non-claimable historical handoff 분리 | stale revision → Tool error |
| `af_get_asset_or_handbook_context` | export당 bounded Asset/Handbook evidence | invalid query/limit/revision → Tool error |
| `af_validate_decision_value` | allowed-value/domain read-only preview | invalid value → `persisted:false`, `UNVERIFIED` |

각 Tool은 read-only annotation을 사용한다. `tool_outcome`과 `domain_outcome`은
별도 필드이며 direct dispatch에서도 schema를 다시 검사한다. `limit: 0`, stale
revision, invalid enum, incomplete/symlink project context는 성공으로 coercion하지 않는다.

`scripts/af.mjs mcp export-context`는 strict Work Item parser와 current
`AssetRegistryService`를 재사용해 명시된 application root에 다음 두 파일만 쓴다.

- `.agent-factory/af-context.json`
- `.codex/config.toml`

다른 기존 project config는 overwrite하지 않고 conflict로 중단한다. 생성 config는
project-local dependency를 `npm exec --offline -- af-context-mcp --project-context`로
시작한다. Root와 descendant에서 exact regular-file context/config pair를 찾고,
untrusted project, sibling baseline app, unrelated repository에서는 AF MCP가 노출되지
않음을 확인했다. User-level Codex config에는 `agent_factory`를 등록하지 않았다.

Production context export의 현재 값은 다음과 같다.

- application ID: `product-truth-mcp-ocr`
- Work ID: `product-truth-mcp-production-slice`
- ledger revision: `4`
- context revision:
  `7a4c1b6b70747b904a31640f6a722082f0356b96f89d45e0fb6c0a3c71aea1f2`
- actionable pending work: `af-workflow`의 `route_required`
- historical handoff: 없음
- current evidence: Asset 12건, Handbook 4건

### Actual client evidence

Codex CLI on WSL은 isolated exact-trust home에서 root와 descendant를 각각
실행했다. 두 run 모두 `af_get_context`를 정확히 한 번 선택했고 같은 current context
revision, application/work ID, ledger revision 4를 반환했다. 같은 home에서 Phase A
sibling과 unrelated repository의 `codex mcp list`에는 `agent_factory`가 없었고,
untrusted app에서도 노출되지 않았다. CLI approval은 두 run에 한정된 non-persistent
one-run override였으며 global/persistent registration은 만들지 않았다.

VS Code `1.130.0`, Remote-WSL Ubuntu 24.04, OpenAI extension
`26.721.41059`에서 실제 external app workspace를 열었다. Workspace Trust를 한 번
승인한 뒤 새 Codex conversation에서 다음 의도의 최소 prompt 하나만 보냈다:
`af_get_context`를 정확히 한 번 호출하고 다섯 current 필드만 반환한다. UI의 Tool
approval은 `Allow` 한 번만 선택했고 persist는 선택하지 않았다. Thread
`019fa209-d6b4-7810-8fdb-5ae5bd418604`, turn
`019fa209-db09-7f62-9324-720125dd67f3`에서 Tool call과 domain `current`가 모두
성공했다. Client log의 thread/turn은 client evidence이며 MCP가 제공하거나 추측한
provenance가 아니다. 한 번의 approval 대기를 포함한 turn은 75.212초였다.

이 UI 조작은 자동화한 최소 probe다. 사용자가 평소처럼 VS Code에서 source를 직접
검토하고 web 화면과 CLI를 함께 보며 판단한 human workflow나 visual usability를
검증했다고 주장하지 않는다. Web은 production build만 검증했고 화면 변경은 없다.

### Fallback and verification evidence

- untrusted project: project MCP non-exposure 확인
- startup failure: 초기 config-relative `cwd` 가정으로 actual CLI initialize 실패를
  재현한 뒤, offline package resolution과 project-context discovery로 수정
- omitted required Tool: Tool 이름과 목적을 명시해 한 번 재시도하는 절차만 문서화;
  omission 자체는 강제로 재현하지 않음
- missing/stale/invalid evidence: unit/contract test에서 `UNVERIFIED`와 Tool error 확인
- canonical lifecycle: Work Skills와 direct artifact inspection 사용; MCP mutation 없음
- Fresh Context: 기존 Companion Continue 유지 및 regression test 통과

검증 결과는 다음과 같다.

- MCP package unit/contract: 8/8
- root CLI tests: 9/9
- full Companion/Hook/CLI regression: 63/63
- generator regression with ADK `2.3.0`: 51/51
- artifact validator tests: 36/36
- `node scripts/validate-artifacts.mjs`: pass
- `packages/web` production build: pass
- production stdio initialize/list/call: 4 Tools 및 fail-closed cases pass
- actual Codex MCP call: CLI 2/2, VS Code Remote-WSL 1/1
- Tool selection/domain current outcome: 3/3, 3/3

Package source lock의 `npm audit`에는 MCP SDK가 가져오는 Windows
encoded-backslash `serve-static` advisory로 moderate 2건이 남는다. 외부 앱은
`@hono/node-server@1.19.17`을 resolve하지만 advisory fixed range는 `>=2.0.5`이므로,
package wrapper까지 전파된 moderate 3건을 보고한다. Current surface는 stdio on WSL이고
Native Windows는 unsupported지만 finding 자체를 해결된 것으로 보지 않는다. Current
SDK dependency graph에는 audit fix가 없으며 범위 밖 override/downgrade/force fix는 하지
않았다.

## Second vertical slice

동일 요구를 distinct external repository에서 수행했다.

> A new external application classifies an input document. When it contains an
> image, an Agent may use an OCR Tool. Return structured output.

Application ID와 directory는 `product-truth-mcp-ocr`이다. Phase D의 MCP 경로와
OCR 과업을 드러내고 기존 `product-truth-ocr-agent`와 충돌하지 않으며 agents-cli의
이름 제한 안에 든다. Work ID는 `product-truth-mcp-production-slice`로 정해 historical
`product-truth-vertical-slice`를 재사용하지 않았다. Phase A handoff도 claim하지
않았다.

새 Work Item ledger revision 4에는 일반 Decision 9개와 Asset Decision 2개가 있다.
Discover와 Compose review는 승인됐고 composition revision은
`f785efad8d9c2647f360a661378e2c71dc4d6744b70915894e9b96fcc9d9f4a0`이다.
Root Executable은 single Agent다. 그러나 OCR candidate에 reviewed production binding이
없고 current generator가 in-process Function Tool을 attach할 수 없어
`scaffold-plan.json`은 source generation을 허용하지 않는다. 따라서
`af-scaffold-runtime`과 canonical `af-verify-runtime`은 `not_started`로 보존했다.

실제 run/eval을 위해 `/home/ilmaswsl/work/af-apps/product-truth-mcp-ocr`에
작은 hand-written ADK verification app을 만들었다. 이것은 Agent Factory Scaffold
output이 아니며 production generator capability로 세지 않는다. Runtime source는
191 LOC, fixture builder와 test/eval harness는 413 LOC다. 즉 external envelope/eval
harness 수동 구성 부담은 여전히 크다.

Runtime contract는 다음과 같이 제한했다.

- Google AI Studio와 요청 모델 정확히 `gemini-2.5-flash`; Vertex 미사용
- synthetic PNG와 명시적 `data_classification=non_sensitive`만 처리
- caller가 `allowed_labels`를 제공
- image-bearing input은 `ocr_text_extraction`을 정확히 한 번 호출
- 외부 result는 `label`, `unknown`, `confidence`, `ocr_used`, `ocr_status`,
  `failure` 여섯 필드만 반환
- OCR text는 Tool turn 내부 분류에만 사용하고 final response/eval artifact에는 저장하지 않음
- Tool completion과 domain success/invalid를 별도 검사

정정 전 첫 local run은 final response에 OCR text를 노출했고 agents-cli `1.1.0`의
`session_type: in_memory` 의도와 달리 ADK `2.3.0`이 `.adk/session.db`를 만들었다.
이를 완료 증거로 사용하지 않았다. Exact six-field output, non-sensitive attestation,
eval redaction을 계약 테스트로 고정하고 기존 DB를 삭제했다. 실제 client rerun에는
`ADK_DISABLE_LOCAL_STORAGE=1`을 주어 session/artifact service가 모두 in-memory임을
server log에서 확인했다.

최종 실제 결과는 다음과 같다.

- Python compile/import와 contract tests: 5/5
- behavior eval: success + fail-closed invalid image 2/2
- requested/observed root model: `gemini-2.5-flash`
- requested/observed OCR model: `gemini-2.5-flash`
- provider: Google AI Studio; Vertex `false`
- success: exact OCR Tool call 1회, Tool completed, domain success, six-field
  `label: invoice` result
- invalid case: exact OCR Tool call 1회, Tool completed, domain invalid,
  `OCR_UNAVAILABLE`, `unknown: true`
- eval artifact: OCR text key/value 없음, `text_present: true`만 기록
- actual `agents-cli run`: PID `1464856`, port `18080`, app source에서 시작,
  9초 내 성공 후 자동 종료
- local ADK DB: 생성되지 않음; ignored server log에도 OCR text/image bytes 없음
- port `18080`: 종료 후 listener 없음

`agents-cli run`의 diagnostic terminal stream은 synthetic OCR Tool response의 text를
일시적으로 표시했다. Application final result와 persisted eval/log는 metadata-only지만,
CLI diagnostic visibility까지 숨긴 것은 아니다. 이번 data policy가 synthetic
non-sensitive로 제한된 이유이며 protected/private document 지원을 주장하지 않는다.

### Interactive Web / VS Code acceptance

종료 전에 사용자가 기대한 실제 여정을 Web과 VS Code Remote-WSL을 함께 보며 시험했다.
기대 여정은 Web에서 작업을 시작하고 VS Code를 열면 exact Companion session이 연결되며,
사용자가 VS Code에 요구사항을 입력하는 동안 Web이 Work Skill 진행, Graph IR와 증거를
시각화하는 것이다. 이 acceptance는 **실패**했다.

- 현재 Web 상단 `VS Code` 버튼은 Factory repository worktree를 여는
  `/launch-vscode` 요청만 보낸다. 선택한 external application, Work Item, role 또는
  enrollment를 함께 전달하지 않는다.
- Web은 새 Work Item을 만들지 않는다. Connections의 `Create enrollment`는 사용자가
  이미 존재하는 application ID, Work ID와 role을 직접 입력해야 하며, VS Code
  fallback도 activation capsule을 명령 텍스트로 보여 줄 뿐 새 VS Code Codex session에
  전달하거나 소비시키지 않는다.
- 첫 시도에서 없는 `af-work-item.json` 때문에 server가 404를 반환했지만 frontend는
  모든 404를 “현재 Companion facade에서 이 기능을 지원하지 않습니다”로 감싸 표시했다.
  Facade route 자체는 구현돼 있었으므로 원인과 조치가 다른 오도성 오류 표현이다.
- 실제 enrollment TTL은 source와 persisted state 모두 **5분**이다. 첫 UX ticket은
  `2026-07-27T06:31:01.563Z`에 발급돼 `06:36:01.563Z`에 만료됐고 만료 후 시도되어
  unclaimed로 끝났다.
- 두 번째 ticket은 `06:43:02.610Z`에 발급돼 `06:48:02.610Z`까지 유효했다. 사용자는
  유효 시간 안에 capsule을 VS Code Codex에 입력했지만, model은 이를 일반 prompt로
  해석해 repository를 조사하고 다음 행동을 질문했다. Ticket은
  `claimed_by_session_id:null`, `claimed_at:null`인 채 만료됐고 해당
  `product-truth-vscode-ux-test` scope의 session이나 prompt receipt는 생성되지 않았다.

따라서 첫 실패에는 만료가 영향을 줬지만 두 번째 실패는 런타임 재기동이나 TTL 문제가
아니다. Current UI가 capsule 발급과 VS Code Hook activation 사이를 연결하지 않는
제품 통합/사용성 gap이다. 이번 change set에서는 새 UI나 Session/Hook 계약을 수정하지
않고 관찰 결과만 종료 증거로 남긴다.

## Before / after comparison

| Measure | Phase A | Phase D observation |
| --- | ---: | ---: |
| 시작 → local run | 약 79분 | 11시간 58분 56초 wall-clock; 악화 |
| 시작 → 전체 Verify | 약 98분 | canonical Verify 미도달; technical audit 12시간 9분 29초, final re-audit 13시간 21분 27초 |
| 일반 / Asset Decision | 8 / 2 | 9 / 2 |
| behavior eval | 2/2 | 2/2 |
| MCP Tool selection/domain | 해당 없음 | 3/3 / 3/3 current |
| explicit resume / follow-up | resume 필요 | initial order 후 최소 24회; MCP 완료 뒤 interactive acceptance/정리 입력 6회 포함 |
| 사용자 copy/paste | baseline envelope 수동 구성 | 자동 MCP probe 0회; 후속 enrollment capsule 수동 입력 2회 |
| trust operations | 기록 없음 | CLI isolated trust 1, VS Code Workspace Trust 1 |
| Tool approval operations | 기록 없음 | CLI one-run override 2, VS Code Allow once 1, persist 0 |
| generated source manual edit | baseline app에 수동 구성 존재 | canonical generated 0; hand-written runtime 191 LOC + harness 413 LOC |
| application run | success | success, exact six-field result |
| external envelope/eval harness | 수동 | 여전히 수동; 개선 없음 |

Phase D가 분명히 개선한 부분은 project-scoped context 전달과 isolation이다. External
app root/descendant에서 같은 current context를 실제 client가 읽었고 unrelated
repository에는 노출되지 않았다. Canonical mutation과 provenance 추측도 추가하지 않았다.

그러나 end-to-end product 작업 시간, 사용자 입력, Decision 수, generated source 수정량,
external envelope/eval 구성은 개선되지 않았다. Wall-clock은 긴 중단을 포함해 직접 비교가
불공정하지만, 적어도 Phase A보다 빨라졌다는 증거는 없다. 추가 기능을 만들어 이 사실을
가리지 않는다.

자동화한 MCP client probe의 blocking Session error는 0건이었다. 그러나 후속
interactive Companion acceptance에서는 Work Item 부재 404 1건, 만료 후 unclaimed
enrollment 1건, 유효 시간 안에 입력했지만 소비되지 않은 unclaimed enrollment 1건을
확인했다. 이 셋은 MCP Tool-call 성공과 별도 outcome이다. 그 밖에 정정 전 required-MCP
startup error 1건, VS Code log의 non-blocking unknown-conversation warning 1건,
agents-cli local-storage contract mismatch 1건을 발견해 각각 수정하거나 남은 경계로
기록했다. Current context actual call에서 stale revision은 0건이고 stale/invalid
fail-closed behavior는 contract tests로 검증했다.

## Regressions

- 기존 Hook implementation/declaration, Session Lease/Security, Companion Continue를
  제거하거나 확장하지 않았다. Full Companion/Hook/CLI regression은 63/63이다.
- 새 UI, fixed MCP listener, Direct Turn/Steering, Registry mutation, canonical
  Work Item MCP mutation, Native Windows support를 추가하지 않았다.
- Production Bridge는 PID `1120446`, port `8898`, production worktree
  `packages/web` source에서 실행했다. Authenticated `/v1/health`는 `ok:true`, schema 2,
  matching PID/instance를 반환했다. 검증 후 정상 종료했고 endpoint와 listener가
  제거됐다.
- 종료 전 interactive acceptance에서는 같은 production worktree source로 Web PID
  `1508608`/port `8890`과 Bridge PID `1508607`/port `8898`을 실행했다. Web 응답과
  authenticated Bridge health를 확인하고 persisted ticket/session state를 보존한 뒤
  둘 다 정상 종료했다. 최종 `8890`–`8900` listener audit에는 사용자가 이미 사용하던
  Chrome DevTools PID `331`/port `8899`만 남았다.
- VS Code test window, 두 stdio MCP child, Node inspector 9229와 테스트 screenshot을
  종료/삭제했다. 기존 사용자 `app-hybrid` VS Code window와 pre-existing Chrome
  DevTools PID 331/port 8899는 보존했다.
- Phase A baseline app는 clean HEAD
  `e263e7aa1c48aacc807d83a6c41d10b7ad9efb2d`다. Ledger revision 11, 네 Skills
  complete, verification passed, `active_runs=[]`, historical handoff
  pending/unclaimed를 보존했다.
- Phase A ledger/report SHA-256은 각각
  `31aa6c13aba2c2cfa59da516208b9c62676af9a6a8cd9bc828ce80b6c36bf28a`,
  `c309b93693c72380d1dd441555b5adeb5bf91a751bd78810b508f36639972c30`,
  `ce48cc4552d6920732ed23eb2fdb49d9d0d9b014d144c2942a4f9ae35bdff1c0`로
  유지됐다.
- Phase B prototype source/config/log를 tracked change에 복사하지 않았다. Credential,
  credential file/symlink, hard-coded prototype path도 tracked artifact에 없다.

## Remaining friction

- Canonical OCR binding과 Function Tool generator lowering이 없어 Scaffold/Verify가
  완료되지 않았다. Hand-written app은 이 gap을 해결하지 않는다.
- Context export는 explicit snapshot refresh다. Canonical ledger가 바뀌면 다시 export해야
  하며 stale revision은 fail-closed다.
- Workspace Trust와 per-client MCP approval은 의도적인 사용자 조작으로 남는다.
  VS Code first call은 one-time approval 대기 때문에 75.212초가 걸렸다.
- `agents-cli 1.1.0`의 in-memory manifest 의도만으로 ADK `2.3.0` local storage가
  비활성화되지 않았다. 현재 local probe는 `ADK_DISABLE_LOCAL_STORAGE=1`이 필요하다.
- `agents-cli` diagnostic stream은 Tool 내부 text를 표시한다. Synthetic non-sensitive
  test에는 허용했지만 metadata-only UX나 protected-data production 경로로 일반화할 수 없다.
- MCP package source lock에 moderate dependency advisory 2건, 외부 앱 install에 전파된
  moderate entry 3건이 남는다.
- 사람의 실제 code review, web visual inspection, interactive CLI 입력을 함께 수행하는
  정상 Compose 시나리오는 최소 자동화 probe만으로는 검증되지 않았다. 종료 전
  Web/VS Code acceptance를 추가로 수행했지만 exact enrollment 단계에서 실패해 이후
  requirement 입력과 live Graph/evidence visualization까지 도달하지 못했다.
- 사용자가 원하는 시작 surface는 Web이지만 Current Implementation은 Work Item
  bootstrap, VS Code launch, exact enrollment activation과 live projection을 하나의
  여정으로 조정하지 않는다. 사용자가 application/work/role, capsule, TTL과 Hook 소비
  조건을 알아야 하는 현재 Setup/Diagnostics 흐름은 목표 사용성과 일치하지 않는다.

## Recommendation to stop or continue

**Stop.** Production project-scoped MCP가 external app의 CLI와 VS Code Remote-WSL에서
작동하고 root/descendant scope와 unrelated isolation을 지키는 것은 충분히 증명됐다.
추가 MCP Tool, Hook fallback, global registration 또는 provenance abstraction을
만들 이유가 없다.

동시에 Phase D가 Phase A보다 end-to-end로 개선됐다고 결론낼 수 없다. Canonical
Scaffold blocker와 수동 app/eval 부담이 남았기 때문이다. OCR production binding과
generator lowering을 해결할지는 별도의 사용자 결정이 필요한 독립 작업이며, 이
change set에서 추가 Phase나 기능을 자동으로 시작하지 않는다. 더 중요한 후속은 MCP
Tool surface 확장이 아니라 사용자가 기대한 Web 시작 → exact VS Code session → 요구사항
입력 → live visualization을 하나의 제품 계약으로 다시 정의하는 일이다. 그 새 작업
지시서는 이 보고서에 만들지 않는다.
