# Web-First Journey P7 Acceptance 상태

상태: **PARTIAL / BLOCKED — Web→VS Code exact Plan 연결과 복구는 실측됐지만,
Web 질문 내용·Plan→Materialization·Graph/source까지의 연속 여정은 통과하지 못함**

실행일: 2026-07-28 (KST)

이 문서는 Web-First Journey 작업 지시서 P7의 사람 실행 acceptance 결과다. Contract
test, Bridge health, editor receipt만으로 성공을 선언하지 않았으며, 실제 VS Code
Remote-WSL terminal, fresh Hook receipt, current Bridge state, Web DOM과 source를 함께
확인했다. 호스트 PC가 중간에 종료되어 launch timing과 최종 Plan audit은 각각의 fresh
run으로 재검증했으며, 끊기지 않은 한 번의 end-to-end 성공으로 합치지 않는다.

## 기준선과 실행 환경

- 기준선: `origin/main` `2166f67413ecf1b90191d759bcba582ee8fdd47e`
  (P6 PR #14 merge)
- Branch/worktree: `agent/web-first-journey-acceptance`,
  `/home/ilmaswsl/work/af-wt-web-first-journey-acceptance`
- Application/Work Item/role: `journey-acceptance` / `journey-acceptance` /
  `plan`
- External app root: `/home/ilmaswsl/work/af-apps/journey-acceptance`
- VS Code `1.130.0`, Remote-WSL Ubuntu 24.04, Linux
  `6.6.87.2-microsoft-standard-WSL2`
- Codex CLI `0.145.0`, acceptance model `gpt-5.6-luna`, reasoning effort `low`
- Node `24.13.0`, npm `11.17.0`
- Web `http://127.0.0.1:8890/`, Bridge `127.0.0.1:8898`, Chrome DevTools
  `127.0.0.1:8899`

## 실측 여정

첫 launch run의 epoch timestamp는 다음과 같다.

| Event | KST | T0 기준 |
| --- | --- | ---: |
| application 이름 입력 후 stopwatch 시작 | 03:59:03.091 | `0.000s` |
| primary action 클릭 | 03:59:09.012 | `5.921s` |
| 새 경로 확인 | 03:59:24.362 | `21.271s` |
| VS Code process 관찰 | 03:59:24.780 | `21.689s` |
| Workspace Trust 승인 | 04:01:21.503 | `138.412s` |
| 자연어 요구 제출 | 04:03:47.274 | `284.183s` |

`T1−T0`는 `21.689s`로 25초 목표를 통과했다. Terminal input-ready 시각은 독립적으로
기록되지 않았고, 자연어 제출 시각은 90초 목표의 보수적 상한으로도 `284.183s`라서
`T2−T0 ≤ 90s`는 **입증하지 못했다**. Trust 승인 대기와 host interruption을 제품
latency로 섞지 않기 위해 T2/T3/T4/T5의 연속 latency를 추정하지 않는다.

호스트 복구 뒤 generated workspace를 다시 열어 Workspace Trust를 유지한 상태에서
`folderOpen` Task를 재실행했다. Ticket
`cde9f8a2-1601-4868-a402-e088b013b23b` 한 건이
`activation_origin: af_vscode_launch`, `status: claimed`가 됐고, fresh Session
`019fa70c-5d3b-7041-a9b8-9891ba6d297b`은 exact application/Work Item/`plan`, factory
cwd, `gpt-5.6-luna`였다. Fresh `UserPromptSubmit` receipts와 `turn_stop`을 현재
state에서 확인한 뒤에만 Web 연결을 인정했다.

## 단계별 결과

| 단계 | 결과 | 관찰 |
| --- | --- | --- |
| 이름 1회 + primary click 1회 | **PASS** | `journey acceptance`가 `journey-acceptance`로 bootstrap됐다. |
| 경로 확인 | **PASS** | `~/work/af-apps/journey-acceptance` 생성 확인 1회. |
| multi-root VS Code open | **PASS** | app first, factory second; `T1−T0=21.689s`. |
| Workspace Trust + automatic Task | **PASS** | Trust 후 `Start AF Session` Task가 dedicated terminal에서 시작됐고 `Ctrl+Shift+B` fallback은 사용하지 않았다. |
| natural-language first turn | **PASS** | 사용자가 `사내 문서를 분류하는 간단한 Agent를 만들어 줘`를 terminal에 입력했다. |
| exact Companion connection | **PASS** | claimed ticket 1건, fresh prompt receipt, current leased exact Plan Session 확인. |
| 다중 선택 Question UX | **PASS after P7 fix** | 생성 workspace가 terminal panel을 최대화하자 Question의 여러 선택지가 동시에 보였다. `/model`은 model picker 뒤 effort picker가 연속 표시됐고 `gpt-5.6-luna` + `low`를 선택했다. |
| Web의 대기 질문 **내용** | **FAIL** | Web에는 `request_user_input` tool activity만 보이고 질문/선택지 본문은 나타나지 않았다. 빈 ledger는 `not_started` 그대로였다. |
| Plan→Materialization 1-click | **BLOCKED** | canonical pending Handoff가 생성되지 않아 P6 action의 launchable input이 존재하지 않았다. |
| Graph IR + app source | **NOT REACHED** | Materialization을 시작할 수 없어 Graph/source를 생성하지 않았다. App에는 bootstrap MCP 파일만 남았다. |
| `bridge_down` 실패 probe | **PASS** | Bridge 종료 뒤 Web이 `bridge_down`, “Codex Bridge가 멈춰 있습니다”, “Bridge 재시작 안내”를 구분해 표시했다. 재시작 뒤 offline 표시는 해제됐다. |

MCP Tool approval은 이 factory-cwd 경로에서 app root의 `.codex/config.toml`을 소비하지
않아 표시되지 않았다. 실제 gate 사용량은 path confirmation 1 + Workspace Trust 1 =
2회였고 허용 상한 3 이하였다. 사용자가 ID, Capsule, shell command를 입력하거나
브라우저에서 Capsule을 본 경우는 0건이었다.

## Plan 결정 증거

호스트 복구 후 같은 exact scope의 fresh Luna low Plan session에서 한 번에 질문 하나씩
다음 결정을 받았다.

| Decision | 선택 |
| --- | --- |
| `doc-classifier.goal.v1` r1 | 문서 유형 |
| `doc-classifier.goal.success.v1` r1 | 유형 정확 분류 |
| `doc-classifier.solution-control-strategy.v1` r1 | `single_agent` |
| `doc-classifier.asset-disposition.v1` r1 | `create_project_draft` |
| `doc-classifier.root-executable.v1-r2` | `agent.journey-acceptance.document-classifier@1` |
| `doc-classifier.input-boundary.v1` r1 | `text_only_non_sensitive` |
| `doc-classifier.output-taxonomy.v1` r1 | `fixed_controlled_labels` + `unknown` |
| `doc-classifier.low-confidence-human-input.v1` r1 | `human_review_gate` |
| `doc-classifier.output-label-set.v1` r1 | `letter`, `form`, `report`, `notice`, `other`, 별도 `unknown` |

Root r1은 존재하지 않는 unrelated historical Asset ref를 제안해 답변 전에 중단했고,
source 확인 뒤 r2로 교정했다. 이 discarded 질문을 사용자 결정으로 기록하지 않았다.

## Acceptance가 드러낸 결함

### 1. 좁은 terminal panel에서 선택지가 한 개처럼 보임 — P7에서 수정

Question payload에는 여러 선택지가 있었지만 generated Task terminal의 낮은 viewport가
목록 대부분을 가렸다. 생성 Plan/Materialization descriptor에
`workbench.panel.opensMaximized: "always"`를 추가했다. CLI의 option semantics,
Decision Input Adapter, model/effort 선택 순서는 바꾸지 않았다.

### 2. structured Question과 Web projection의 소유 데이터가 다름 — 미해결

Current Web은 strict Work Item에 `waiting_for_input` run과 open Decision이 이미
materialize된 경우에만 `WaitingDecisionStrip`을 렌더링한다. 실제 Plan Mode의
`request_user_input` 질문은 TUI 대화 안에만 존재하며 Hook/Bridge activity에는 bounded
tool name만 남는다. Phase A는 tracked artifact write를 금지하므로 빈 Work Item은
`ledger_revision: 0`, Discover `not_started`, `decisions: []`를 유지했다. 따라서 Web이
질문의 **내용**을 표시할 source가 없다.

### 3. 빈 ledger의 Plan→Materialization Handoff 선행조건이 순환함 — 미해결

`CodexBridgeStore.createPlanHandoff()`는 현재 Work Item의 exact pending
`session_handoffs[]`, `revisions.discovery`, `revisions.decision`, marker와 Plan hash가
먼저 일치해야만 Bridge Handoff를 만든다. 그러나 Phase A는 이 tracked ledger를 쓰지
않고, Phase B materialization은 그 Handoff를 fresh session에서 claim한 뒤에만 쓸 수
있다. 새 bootstrap ledger는 revisions가 모두 `null`, `session_handoffs: []`이므로 실제
Handoff/portable marker를 안전하게 만들 수 없다. 외부 Plan agent도 같은 source를
재확인하고 marker를 만들지 않은 채 `BLOCKED`로 종료했다.

Host에서는 Bridge가 `8898`에 정상 청취 중이었다. 외부 Codex sandbox의 `curl`만 같은
endpoint에 연결하지 못했으므로 이를 Bridge outage나 Handoff blocker의 근거로 쓰지
않는다.

## Pass 기준 판정

| 필수 기준 | 판정 |
| --- | --- |
| ID/Capsule/shell 입력 0 | **PASS** |
| primary click 1, gate ≤3 | **PASS** |
| exact claimed `af_vscode_launch` ticket 1건 + factory cwd | **PASS** |
| strict empty Work Item validator | **PASS** — root와 exact artifact root 모두 통과 |
| Web이 대기 질문 본문 표시 | **FAIL** |
| durable external app source 1개 이상 projection | **FAIL** |
| “지원하지 않습니다” 오도 문구 없음 | **PASS** |
| intentional `bridge_down` + recovery action | **PASS** |
| Plan→Materialization, Graph IR, app source 연속 완료 | **FAIL / NOT REACHED** |

따라서 P7은 **acceptance 실행과 결함 기록은 완료**했지만, 작업 지시서 §14의 최종 제품
성공은 완료되지 않았다. 보안/canonical write 경계를 바꾸지 않고 성공으로 재분류하지
않는다.

## Local screenshot evidence

다음 파일은 `/tmp/af-web-first-p7-evidence/`의 disposable evidence이며 commit하지 않는다.

| 파일 | SHA-256 | 의미 |
| --- | --- | --- |
| `vscode-question-options-host-recovery-luna-low.png` | `82f5a4ca54600ecd7df97cf62d9fa2695409965d1b57b9a94dcc6a149e32310f` | recovery 후 Luna low와 다중 선택 Question |
| `vscode-output-label-set-question-luna-low.png` | `ffd70a5034f3a8dfd705407a6dc5f867243fa276948bd334bc59f23f961f1213` | 마지막 exact label-set 선택지 |
| `web-connected-no-plan-question.png` | `cea82a7c8446d9fecb45ae3657afa3788d7662bcdcd2f947074c5377a32bffd0` | exact session 연결 중에도 질문 본문 부재 |
| `web-bridge-down-recovery.png` | `36690737102036398aa332a8f02ccb72c358c5fef2579003efd491c5bb306003` | 원인별 `bridge_down`과 복구 안내 |

전체 선택 질문 screenshot 7개와 hash는 같은 local evidence directory에 남겼다.

## Verification

검증된 `google-adk==2.3.0` Python을 `AF_TEST_PYTHON`으로 지정했다.

- targeted `vscodeWorkspaceLauncher.test.ts`: **5/5 passed**
- `node scripts/validate-skills.mjs`: **PASS**, errors/warnings 0
- `node scripts/validate-artifacts.mjs`: **PASS**
- `node scripts/validate-artifacts.mjs artifacts/af/journey-acceptance`: **PASS**
- `npm run test:contracts`: TypeScript **23/23**, artifact/generator **87/87**
- `npm run test:companion`: package **58/58**, CLI/Hook **18/18**
- `npm run build`: **PASS**, 581 modules transformed
- changed Markdown relative links: **PASS**
- `git diff --check`: **PASS**

## 다음 경계

Zero-context 재현, Phase/PR/파일 지도, 필수 후속과 사용자 결정은
[Web-First Journey Handoff](web-first-journey-handoff.md)에 정리한다.
