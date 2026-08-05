# Companion 사용자 Acceptance 결과 · 2026-08-06

## 판정 범위

- Draft PR: [#22](https://github.com/gttmr/af-companion/pull/22)
- 시작 head: `42e4212588d36287f7479d641162a913f3db2c6f`
- 격리 환경: 임시 `COMPANION_APPLICATIONS_ROOT`와 Registry 복사본
- Browser: Chrome `147.0.7727.55`, 1440×1000, Chrome DevTools `8899`
- VS Code: `1.131.0`, WSL `Ubuntu-24.04`, `openai.chatgpt@26.727.40816`
- Client: 독립 local MCP process. Cloud model과 Gemini fallback은 호출하지 않았다.

전체 Phase A 판정은 **BLOCKED / INCOMPLETE**다. Browser, Registry, App, local MCP와
restart 항목은 현재 실행에서 통과했지만, `USER-ACCEPTANCE.md`가 요구하는 새 VS Code Codex
AI chat은 Session 2의 model transport lock을 지키면서 실행할 수 있는 검증된 경로가 없다.
따라서 PR #22는 ready/merge 대상이 아니다.

Session 2 model preflight는 ignored local configuration의 승인된 Tailscale direct
OpenAI-compatible `/v1` transport에서만 실행했다. Private endpoint bytes는 이 문서,
repository, managed App, screenshot 또는 Git evidence에 저장하지 않았다.

## Preparation과 foundation failure

다음 command를 source write 전에 실행했다.

```bash
node .agent-factory/runtime/session2-model-preflight.mjs
```

결과는 `ready: true`, provider `self_hosted_vllm_over_tailscale_direct`, model
`hosted_vllm/qwen3.6-27b-128k`, reported context `131072`, chat completion
`passed`, cloud fallback `false`였다. 이 판정은 **self-hosted-27B Session 2
acceptance**이며 `small-model PASS`가 아니다.

PR #22에는 GitHub status check가 하나도 없었고 repository에 `.github/**`가 없었다.
`gh pr checks 22`는 `no checks reported`로 exit 1이었다. product source의 baseline
`typecheck`, 70 tests, build, root artifact validator는 모두 통과했으므로 failure를
GitHub verification foundation 부재로 국소화했다.

최소 수정은 pull request와 `main` push에서 Companion `npm ci`, typecheck, test, build와
root artifact validator를 실행하는 `Companion foundation` workflow 추가로 제한했다.
수동 acceptance에서 별도로 발견한 capability temp 문제에는 partial source fix를 섞지 않고
아래 남은 위험으로 기록했다.

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
| local App Git 경계 | 통과 | Beta는 baseline commit 1개와 remote 없음이 유지됐다. stale capability temp를 제거한 뒤 status에는 canonical `companion-graph.json` 변경만 남았다. |

## VS Code 경계

실제 browser에서 `VS Code에서 열기 ↗`를 눌러 POST
`/api/companion/editor/launch-vscode`의 `202`와 `VS Code 열기 요청됨`을 확인했다.
`code --status`는 새 window를 WSL remote의 exact root
`/tmp/af-companion-session2-phase-a.Wfnw0U/apps/phase-a-beta`로 표시했다. project-local
`.codex/config.toml`은 exact root를 cwd와 `--project-root`로 사용하며 두 MCP Tool만
enable하고 write approval mode를 `writes`로 유지했다.

2026-08-05의 실제 extension chat 두 개에 의한 get/apply, write approval과 stale retry
evidence는 [전일 Acceptance 결과](./ACCEPTANCE-RESULTS-2026-08-05.md)에 보존돼 있다.
이번 실행에서는 Session 2의 cloud model/다른 Internet egress 금지를 지키기 위해 Codex
extension의 새 AI chat을 호출하지 않았다. 따라서 launcher, exact WSL root, extension
version, project MCP load contract와 독립 local MCP behavior는 현재 재검증했지만, 새
extension thread의 model-mediated 최종 응답, Tool card, write approval과 두-chat stale retry는
현재 증거가 없다. 전일 cloud extension evidence나 독립 local MCP 결과는 이 current-run
gate를 대체하지 않으므로 full USER-ACCEPTANCE는 **BLOCKED**다.

## Browser DOM·console·network

재시작 뒤 fresh reload에서 다음을 Chrome DevTools Protocol로 수집했다.

- DOM: active `phase-a-beta`, 3 Nodes·2 Edges, Context 사용 가능, Graph validation 통과,
  selected/pinned `node.output`
- Runtime exception 0, console error 0, Log error/warning 0
- network loading failure 0, HTTP 4xx/5xx 0
- page resource origin은 `http://127.0.0.1:8890` 하나이며 external resource 0

![Companion Graph Phase A acceptance](./acceptance-2026-08-06.png)

Screenshot은 1440×1000 PNG이며 SHA-256은
`7fba8c0b81da00be24b73af912cf941dc5eeeb3f689d948478b56622cd7f0961`이다.

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
- [Independent review](./evidence/phase-a-2026-08-06-independent-review.md)는 current-run
  VS Code gap을 High, active agents-cli lock drift와
  capability temp의 기존-App 경계를 Medium으로 판정했다. Toolchain 문서는 accepted
  `1.2.1` outcome으로 수정했고 sanitized transcript를 추가했지만 VS Code blocker와
  capability remediation은 남아 있다.
- 새 GitHub workflow의 실제 check 결과가 통과하더라도 위 blocker가 해소되기 전 PR #22를
  ready 또는 merge하지 않는다.

## 검증 command

현재 source set에서 다음 local gate가 모두 통과했다.

- `npm run typecheck`: exit 0
- `npm run test`: 70 tests, 70 pass, 0 fail
- `npm run build`: exit 0, Vite production build 포함
- `node scripts/validate-artifacts.mjs`: `Artifact validation OK`
- `git diff --check`: exit 0
- sanitized evidence JSON parse: 통과
- 수정한 7개 Markdown file의 relative link 검사: 통과

실행 command는 다음과 같다. 최종 commit과 GitHub check 결과는 PR evidence에 별도로
기록한다.

```bash
cd packages/companion
npm run typecheck
npm run test
npm run build
cd ../..
node scripts/validate-artifacts.mjs
git diff --check
```
