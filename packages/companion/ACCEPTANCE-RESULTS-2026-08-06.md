# Companion 사용자 Acceptance 결과 · 2026-08-06

## 판정 범위

- Draft PR: [#22](https://github.com/gttmr/af-companion/pull/22)
- 시작 head: `42e4212588d36287f7479d641162a913f3db2c6f`
- 격리 환경: 임시 `COMPANION_APPLICATIONS_ROOT`와 Registry 복사본
- Browser: Chrome `147.0.7727.55`, 1440×1000, Chrome DevTools `8899`
- Codex CLI: `0.146.0`, isolated `CODEX_HOME`, exact App project config
- VS Code: `1.131.0`, WSL `Ubuntu-24.04`, `openai.chatgpt@26.727.40816`; launcher와
  workspace/config 경계만 확인하고 AI chat은 사용자 결정으로 생략
- MCP client: Codex CLI project load와 독립 local MCP process를 별도 판정

전체 Phase A 판정은 **PASSED — USER MERGE DECISION REQUIRED**다. Browser, Registry, App,
local MCP와 restart, Codex CLI model-mediated Graph get/apply, ADK runtime, GitHub CI와 제한된
egress가 현재 실행에서 통과했다. 사용자는 approved provider를 설정할 수 없는 VS Code
extension의 current-run AI chat을 생략하고 Codex CLI만 사용하도록 허용했다. PR #22는 계속
Draft이며 이 판정만으로 ready 또는 merge하지 않는다.

Session 2 primary acceptance model은 사용자 결정으로 `gemini-3.1-flash-lite`다. Companion,
Codex CLI와 generated runtime은 ignored local configuration의 loopback bridge
`http://127.0.0.1:8897/v1`만 사용하고, bridge만 Gemini Developer API로 egress했다. API key는
external mode-0600 env file에서만 읽었으며 이 문서, repository, managed App, screenshot 또는
Git evidence에 저장하지 않았다.

## Preparation과 foundation failure

다음 command를 source write 전에 실행했다.

```bash
node .agent-factory/runtime/session2-model-preflight.mjs
```

요청했던 `gemini-2.5-flash-lite`는 새 project에서 404로 사용할 수 없어 acceptance에서
제외했다. 사용자가 승인한 `gemini-3.1-flash-lite` preflight는 `ready: true`, provider
`gemini_developer_api_openai_compatibility`, observed version `3.1-flash-lite-05-2026`, input
context `1048576`, output token limit `65536`, chat completion `passed`, function call `passed`,
credential mode `600`, model fallback `false`를 반환했다. 이 판정은 **Gemini 3.1 Flash-Lite
Session 2 acceptance**이며 `small-model PASS`나 `self-hosted-27B Session 2 acceptance`가 아니다.

PR #22에는 GitHub status check가 하나도 없었고 repository에 `.github/**`가 없었다.
`gh pr checks 22`는 `no checks reported`로 exit 1이었다. product source의 baseline
`typecheck`, 70 tests, build, root artifact validator는 모두 통과했으므로 failure를
GitHub verification foundation 부재로 국소화했다.

최소 수정은 pull request와 `main` push에서 Companion `npm ci`, typecheck, test, build와
root artifact validator를 실행하는 `Companion foundation` workflow 추가로 제한했다.
수동 acceptance에서 별도로 발견한 capability temp 문제에는 partial source fix를 섞지 않고
아래 남은 위험으로 기록했다.

첫 workflow 실행 [run `31062409540`](https://github.com/gttmr/af-companion/actions/runs/31062409540),
head `b7cd9ef5822a6c279f3b4f942544adc15d0b65ee`, job `92492928113`은 `Test Companion`에서
실패했다. `each readiness request is aborted within the remaining deadline` test가
`cancelledByParent`와 `Promise resolution is still pending but the event loop has already resolved`를
보고했고 build와 artifact validator는 skip됐다. 실패를 재현한 뒤 test double이
`AbortSignal.timeout()`의 unref timer만 기다려 Node 22 runner의 event loop가 먼저 종료되는
것으로 국소화했다. Production source는 바꾸지 않고
`8fd2d4507e02f9a9d3cff5b061ac234cd23414df`에서 fake request에 ref 상태인 1초 fail-safe를
추가하고 abort 때 clear했다. Abort가 동작하지 않으면 기존 `<250ms` assertion이 그대로
실패한다.

수정한 launcher safety test는 local에서 20회 연속 통과했고 full local suite도 70/70
통과했다. Source-fix [run `31062612139`](https://github.com/gttmr/af-companion/actions/runs/31062612139),
head `8fd2d4507e02f9a9d3cff5b061ac234cd23414df`, job `92493525855`는 1분 26초에 install,
typecheck, test, build와 validator를 모두 통과했다. 이 run은 `actions/checkout@v4`와
`actions/setup-node@v4`의 Node 20 action-runtime deprecation annotation을 남겼다. 2026-08-06에
official release API로 각각 최신 `v7.0.1`, `v7.0.0`을 확인한 뒤 workflow의 두 action ref만
`@v7`로 올렸다. Hygiene commit `fd12ba86c3fb889537e117bfaa41b245f008afae`의
[run `31062757202`](https://github.com/gttmr/af-companion/actions/runs/31062757202), job
`92493959495`는 1분 31초에 모든 step을 통과했고 같은 deprecation annotation이 없었다.
GitHub CI foundation은 통과했고 아래 model-mediated Companion MCP acceptance도 통과했다.

## Codex CLI current-run 대체 검증

사용자의 Session 2 전용 결정에 따라 extension AI chat 대신 Codex CLI `0.146.0`을 exact
`phase-a-beta` App root에서 실행했다. Isolated `CODEX_HOME`과 project trust를 사용한
`codex doctor`/`codex mcp` 결과는 project config load, required `companion_graph` server와
exact Tool `companion_get_graph_workspace`, `companion_apply_graph_changes` 두 개를 확인했다.

Google OpenAI compatibility endpoint는 Chat Completions를 제공하지만 Codex가 사용하는
Responses `/responses`는 직접 제공하지 않아 404를 반환했다. Session 2 ignored local runtime에
Responses-to-Chat-Completions bridge를 두고 Codex에는 loopback base만 노출했다. Official Codex
`rust-v0.146.0` source에서 `ResponseItem::FunctionCall`의 optional `namespace`와 router의
`ToolName::new(namespace, name)` wire를 확인해, bridge가 Gemini용 flat function name을 만들고
응답의 exact namespace/name을 복원하도록 했다. 이 bridge는 acceptance plumbing이며 PR #22
product source나 generated runtime source가 아니다.

Final Codex thread `019fd511-3ffc-7573-b5d5-012dfc0aada2`는 read-only sandbox와 Graph apply
Tool 하나에 대한 one-off approval override로 실행했다. Rollout에는 다음 function call만 정확히
두 개 있었고 retry나 다른 Tool call은 없었다.

1. `mcp__companion_graph.companion_get_graph_workspace`
2. `mcp__companion_graph.companion_apply_graph_changes`

Get의 base revision은
`04e1a8c7a838e1bbbd8070f0b033a12c18df43bc9baf65d590ad5184f74a8056`였고 apply는
`APPLIED`, resulting revision
`6c3d865b91657b1784f881055a23a53ad63cc42c0b24ef943a791762156fb132`, changed nodes
`["node.output"]`, changed count 1을 반환했다. Final label은
`Gemini egress-locked MCP acceptance`다. Rollout SHA-256은
`9749948adfb8cabab76ad06c8ed2640d00400ef765ec80eb7c0f784eea2d8944`다.

Bridge unit `af-session2-phase-a-gemini-bridge-20260806-05.service`, invocation
`6c3c8df4ca15427ebb8341ebc2e8716b`은 deny `0.0.0.0/0 ::/0`, allow loopback과
`<resolved-gemini-api-ip>/32`만 적용했다. Preflight unit
`af-session2-phase-a-model-preflight-20260806-06.service`, invocation
`64b10c4db72244f5839f7d97fdebc067`도 같은 policy에서 exit 0이었다. 별도 deny unit
`af-session2-phase-a-egress-deny-20260806-07.service`, invocation
`2bb4f0e7b2e4435ea46a2f2d61c812d0`은 arbitrary external IP:80 연결을 2001.99ms 뒤
`TimeoutError`로 차단했다. LiteLLM의 GitHub raw cost-map fetch 시도도 DNS/policy로 차단됐고
local backup을 사용했다. 이 blocked attempt는 runtime이 승인되지 않은 destination에 접근할 수
없다는 보조 증거다.

초기 self-hosted Qwen direct/code-mode 실패와 network policy가 강제되지 않은 user-scope probe는
최종 PASS에 포함하지 않고 sanitized JSON의 superseded/incident evidence로 보존한다. Gemini는
fallback이 아니라 사용자가 승인한 Session 2 primary model이다. 다른 model, deploy, publish 또는
cloud observability는 호출하지 않았다.

## 실제 browser와 local MCP 결과

아래 항목은 current operator observation이며, private endpoint와 token을 제거한 exact
status/revision/hash transcript는
[Phase A sanitized evidence](./evidence/phase-a-2026-08-06-evidence.json)에 보존했다.

| 시나리오 | 결과 | 현재 실행 증거 |
| --- | --- | --- |
| App 생성과 local Git baseline | 통과 | UI에서 `phase-a-alpha`를 만들었다. branch `main`, baseline commit 1개, 제목 `chore: initialize Companion app workspace`, 작성자 `Agent Factory Companion <companion@agent-factory.local>`, remote 없음, 최초 status clean과 네 tracked file을 확인했다. |
| exact Asset binding | 통과 | published Agent·Tool·Workflow를 각각 binding하고 typed Node를 추가했다. Graph save 뒤 commit 수는 1이고 exact ref/version/hash가 App binding과 Graph disk readback에 일치했다. |
| Asset lifecycle | 통과 | 임시 Registry에서 contract validation failure `422`를 먼저 확인한 뒤 draft create/update, user-evidence review, incomplete publish의 browser-side write 차단, 세 confirmation을 포함한 immutable publish, exact binding, next-version draft를 확인했다. |
| Registry stale CAS | 통과 | 같은 revision의 첫 update는 200, 늦은 update와 stale UI review는 `409 registry_revision_conflict`였다. UI는 적용하지 않고 최신 version을 다시 읽었다. |
| Deprecated 제외 | 통과 | 명시적 user Decision으로 published v1을 deprecated 처리했다. Alpha의 기존 exact binding은 보존됐고 새 Beta App의 published search에는 v1과 draft v2가 모두 나타나지 않았다. |
| App 전환과 격리 | 통과 | UI에서 `phase-a-beta`를 만들자 Alpha에 계속 연결된 MCP process의 다음 get이 `app_inactive`를 반환했다. Beta의 새 process는 application ID, selection과 Graph만 읽었다. |
| MCP Tool contract와 selection | 통과 | local MCP list는 `companion_get_graph_workspace`, `companion_apply_graph_changes` 두 Tool만 반환했다. Web에서 선택한 `node.output`을 get의 `workspace.active_selection`에서 정확히 읽었다. |
| MCP Node·Edge와 live Web | 통과 | 첫 invalid Function add는 missing `role`로 `422 graph_contract_violation`을 재현했다. fresh get 후 `role: transform`으로 재계산한 add Node+Edge는 `APPLIED`였고 Web은 새로고침 없이 3 Nodes·2 Edges, 자동 위치와 `Codex 변경 반영됨`을 표시했다. |
| Edge Inspector | 통과 | Web에서 endpoint를 `node.input → node.phase-a-step`, control을 `condition`, condition을 `phase_a.ready`, default를 false, channel을 `artifact`로 바꾸고 저장했다. |
| Web draft 대 MCP write | 통과 | output-label Web draft 1개가 활성 상태일 때 fresh get→apply를 실행했다. MCP 결과가 canonical이 됐고 UI는 `저장 전 변경 1개가 대체되었습니다`를 표시했다. |
| 직접 파일 fallback | 통과 | Graph JSON의 input label을 유효하게 직접 수정하자 watcher/reconciliation/SSE가 새 revision과 `외부 파일 변경 반영됨`을 표시했다. |
| invalid JSON fail-closed | 통과 | invalid JSON 동안 Context 검증 실패와 `Graph write · 차단`, draft/presentation `409`, MCP `409 invalid_external_source`를 확인했다. 원본 복구 뒤 같은 canonical revision과 write 가능 상태가 돌아왔고 실패한 label은 남지 않았다. |
| stale Graph CAS | 통과 | 독립 MCP client 둘이 revision `a03d340c…f88`을 읽었다. A apply 뒤 B old-revision apply는 `412 graph_stale`과 current revision을 반환했다. B가 fresh get 후 재계산한 apply는 `APPLIED`로 revision `d8280414…d8ee`가 됐다. |
| restart recovery | 통과 | active App `phase-a-beta`, Graph revision `d8280414…d8ee`, `node.output` selection, position `(550,250)`과 `pinned: true`가 복구됐다. root state, Graph, presentation과 workspace-state hashes가 restart 전후 일치했고 기존 Beta MCP process도 회전된 capability를 hot-read했다. |
| local App Git 경계 | 통과 | Beta는 baseline commit `b95fcdd9c3859af05443fde1e8d719380e2e59fe` 하나와 remote 없음이 유지됐다. Final status에는 canonical `companion-graph.json` 변경만 남았고 file SHA-256은 `e22fac548c09e0752c58c30a9b9b43acc9c4ff1e499217895a8939117c443ae2`다. |

## VS Code launcher 경계

실제 browser에서 `VS Code에서 열기 ↗`를 눌러 POST
`/api/companion/editor/launch-vscode`의 `202`와 `VS Code 열기 요청됨`을 확인했다.
`code --status`는 새 window를 WSL remote의 exact root
`/tmp/af-companion-session2-phase-a.Wfnw0U/apps/phase-a-beta`로 표시했다. project-local
`.codex/config.toml`은 exact root를 cwd와 `--project-root`로 사용하며 두 MCP Tool만
enable하고 write approval mode를 `writes`로 유지했다.

2026-08-05의 실제 extension chat 두 개에 의한 get/apply, write approval과 stale retry
evidence는 [전일 Acceptance 결과](./ACCEPTANCE-RESULTS-2026-08-05.md)에 보존돼 있다.
이번 실행에서는 installed extension에 approved provider setting이 없어 사용자
결정에 따라 새 extension AI chat을 호출하지 않았다. 이는 current-run gate에서 허용된 생략이며
전일 cloud extension evidence를 Session 2 PASS로 재사용하지 않는다. 대체 client인 Codex CLI의
model-mediated MCP get/apply는 위 final thread에서 별도로 통과했다.

## Browser DOM·console·network

재시작 뒤 fresh reload에서 다음을 Chrome DevTools Protocol로 수집했다.

- DOM: active `phase-a-beta`, Graph revision prefix `6c3d865b`, 3 Nodes·2 Edges, Context 사용 가능,
  Graph validation 통과, selected/pinned `node.output`, label
  `Gemini egress-locked MCP acceptance`
- Runtime exception 0, console error 0, Log error/warning 0
- network loading failure 0, HTTP 4xx/5xx 0
- fresh reload request 38개, resource status 36개가 모두 200이고 page resource origin은
  `http://127.0.0.1:8890` 하나이며 external resource 0

![Companion Graph Gemini Phase A acceptance](./acceptance-gemini-2026-08-06.png)

Screenshot은 1440×1000 PNG이며 SHA-256은
`365db0296394a3dab02dfd0e9c66b526874b47aeacb48b85201554bad67bea13`이다.

## Session 1 handoff audit와 남은 위험

- Session 1 source `d486c83d6a7599354fb859923f64fa9126ba84cc`와 merge
  `614743de98744d7301676408b1d1f13893ce4562`는 현재 head의 ancestor다.
- PR #23 merged evidence, bundle `2.0.0-adk2.4-session1`과 digest
  `8bafba76b99095265b927b696eddbd6ea251c68039ff356a933efdb75db8350c`,
  accepted agents-cli/Google Skill digests, exact ADK/MCP/A2A versions, 70-row inventory,
  64 experiments와 completion audit를 확인했다.
- merged Session 1 artifact에는 literal `required_integration` field나 named set이 없다.
  CP-001–CP-005 compound set과 Session 2 E2 minimum list는 존재하지만 둘을 임의로
  같은 handoff artifact라고 재정의하지 않았다. Phase B는 이 계약 gap을 명시적으로
  해소하기 전 representative set을 추측해서는 안 된다.
- Session 1 manifest, AF Skill instruction과 Session 1 evidence는 변경하지 않았다.
- abrupt server stop 중 기존 App에 mode 0600 capability atomic-write temp가 남아
  `git status`에 나타나는 것을 재현했다. Disposable App에서는 stale/rotated token 파일을
  수동 제거했지만 기존 App 안전 remediation은 구현하지 않았다. `git add -A` 전에 이런
  temp를 검사해야 하며 별도 security follow-up이 필요하다.
- Codex `0.146.0`은 custom model ID의 metadata를 찾지 못했다는 warning과 fallback metadata 사용을
  보고한다. Explicit context override와 실제 calls는 통과했지만 warning 자체는 남아 있다.
- Google OpenAI compatibility endpoint가 Codex Responses API를 직접 제공하지 않아 ignored local
  bridge가 필요했다. Bridge는 exact namespace를 복원해 acceptance를 통과했지만 product/runtime
  source가 아니므로 Phase B가 transport contract를 설계할 때 이 의존성을 별도로 검토해야 한다.
- aggregate `validate-af-skills-vnext.mjs --runtime`의 첫 diagnostic은 agents-cli update check로
  PyPI에 한 번 접속을 시도했으므로 acceptance에서 제외했다. No-egress 재실행에서는
  `agents-cli info`가 내부 `npx skills list` timeout 뒤 `installed_skills: null`을 반환해 aggregate
  shape gate가 실패했다. Session 1 validator나 evidence를 고치지 않고 exact ADK interpreter의
  capability probe를 loopback-only unit에서 직접 실행해 46/46을 통과시켰다.
- Gemini API resolved IP를 고정한 system-level allowlist는 DNS 결과가 바뀌면 stale해진다. Phase B
  시작과 각 checkpoint 전에 fail-closed preflight로 다시 resolve하고 policy를 재생성해야 한다.
- [Independent review](./evidence/phase-a-2026-08-06-independent-review.md)의 최초 blocker는 사용자
  criterion change와 final Gemini Codex get/apply로 닫혔다. Capability temp, metadata warning,
  local bridge와 agents-cli aggregate shape drift는 remaining risk로 남는다.
- Phase A가 통과했어도 PR #22는 Draft다. 사용자의 명시적 merge 결정 전에는 ready 또는 merge하지
  않고 Phase B–E를 시작하지 않는다.

## 검증 command

현재 source set에서 다음 local gate가 모두 통과했다.

- `npm run typecheck`: exit 0
- `npm run test`: 70 tests, 70 pass, 0 fail
- `npm run build`: exit 0, Vite production build 포함
- `node scripts/validate-artifacts.mjs`: `Artifact validation OK`
- `git diff --check`: exit 0
- sanitized evidence JSON parse: 통과
- edited Markdown 6개, relative link 29개 검사: 통과
- `node --test test/dev-launcher-safety.test.mjs` 20회 연속 실행: 20/20 통과
- exact ADK `2.4.0` loopback-only runtime probe: 46 tests, 46 pass, compound CP-001–CP-005 포함
- Gemini preflight: chat/function call 통과, input context `1048576`, output limit `65536`
- system-level egress deny probe: arbitrary external IP 차단
- Codex final Graph turn: exact two Tool calls, one changed node, no retry
- GitHub source-fix run `31062612139`: 1분 26초, 모든 step 통과
- GitHub current-actions run `31062757202`: 1분 31초, 모든 step 통과, deprecation annotation 0
- GitHub evidence-head run `31063076608`: 모든 step 통과

실행 command는 다음과 같다. 이 evidence-only final head의 GitHub check는 PR description에
별도로 기록한다.

```bash
cd packages/companion
npm run typecheck
npm run test
npm run build
for i in $(seq 1 20); do node --test test/dev-launcher-safety.test.mjs || exit 1; done
cd ../..
node scripts/validate-artifacts.mjs
git diff --check
```
