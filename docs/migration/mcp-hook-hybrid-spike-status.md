# Phase B Spike 보고: MCP vs Hook vs Hybrid

상태: **Phase B 완료, post-report VS Code evidence 반영**

실행일: 2026-07-27 (KST)

이 문서는 `product-truth-vertical-slice`의 완료된 lifecycle을 재개하는 문서가 아니다.
Phase A의 동일한 작은 OCR 과업을 외부 Application Workspace에서 다시 사용해
Current Hook, project-scoped MCP, Minimal Hook + MCP Hybrid를 비교한 짧은 engineering
spike 결과다. 아래 Recommendation은 Phase C Architecture Decision이 아니라 그 단계에
전달할 비구속 실험 결론이다.

## Retain / temporary boundary

Retain:

- 이 보고서 한 파일

Temporary, do not merge:

- `/tmp/af-phase-b-spike/prototype/af_mcp_server.py`
- `/tmp/af-phase-b-spike/prototype/run_gemini_mcp_trial.py`
- `/tmp/af-phase-b-spike/prototype/minimal_hook.mjs`
- `/tmp/af-phase-b-spike/app-{hook,mcp,hybrid}/**`
- `/tmp/af-phase-b-spike/{audit,evidence}/**`
- 임시 `.codex/config.toml`, `.codex/hooks.json`, context state, Codex/Gemini home
- 모든 hard-coded absolute path와 debug output

Google AI Studio API key는 기존 runtime environment에서 프로세스 환경으로만 읽었다.
임시 root에 key literal이 없음을 검색했고, Codex 인증을 위해 만들었던 임시
`auth.json` symlink도 측정 직후 제거했다.

VS Code 수동 probe는 보고서 작성 후 완료됐다. `/tmp/af-phase-b-spike`의 임시
prototype, config, clone, audit, log는 probe evidence일 뿐 retain 또는 merge 대상이
아니다. Phase C 문서 작업은 이 root를 production source로 승격하거나 추적하지 않는다.

## Experiment matrix

| Arm | 같은 사용자 과업에서 달라지는 통합 | 반복 | 핵심 판정 |
| --- | --- | ---: | --- |
| A. Current Hook | 실제 외부 app에서 Current Hook이 전달할 수 있는 context만 사용. 실제로는 0-byte no-op여서 Tool 없음 | 5 | no-context 실패 양상 |
| B. Project-scoped MCP | app의 `.codex/config.toml`에 임시 stdio MCP 4 Tools 등록 | 5 | Tool 선택, current evidence, 임시 decision record |
| C. Minimal Hook + MCP | B와 같고 Hook은 224-char selection pointer만 강제 전달 | 5 | Tool 선택과 session/selection provenance 결합 |

세 arm은 같은 user prompt, `temperature=0`, `candidate_count=1`, 같은 Phase A
evidence를 사용했다. B/C의 Tool schema와 C의 최소 Hook pointer만 조건에 따라
추가됐다. 정규 반복 외에 `r1 → r2` freshness probe를 B/C 각각 1회 수행했다.

## Test environment

- Factory spike worktree: `spike/mcp-hook-hybrid`
- 시작 시 fetch 후 `HEAD = origin/main = merge-base =
  dfcf69c885062c552588e2afa6389020734df575`
- Generated app source: clean `main`,
  `e263e7aa1c48aacc807d83a6c41d10b7ad9efb2d`
- 실험 app 세 개는 generated app의 `/tmp` clone이며 같은 HEAD를 유지
- Phase A source는 지정된
  `/home/ilmaswsl/work/af-companion/artifacts/af/product-truth-vertical-slice`
  절대 경로에서 read-only로 사용
- Phase A ledger: revision 11, 네 Work Skills 모두 `complete`, verification
  `passed`, `active_runs=[]`
- historical pending handoff:
  `claimed_by_session_id=null`; spike에서 claim하지 않음
- Codex CLI: `0.145.0`
- Codex connection-only model: `gpt-5.6-sol`
- VS Code: `1.130.0`; Remote-WSL `Ubuntu-24.04`; probe extension host
  `openai.chatgpt@26.715.61943`
- Extension의 Codex app-server와 `agent_factory_phase_b` MCP stdio server는 모두
  WSL process로 실행됨
- Model experiment: Google AI Studio API key +
  `google-genai==2.14.0`, requested and every response에서 observed
  `gemini-2.5-flash`
- Python `3.13.12`, Node `24.13.0`

사용자 지시에 따라 128k local model 구축/기동은 하지 않았다. Phase A의 deterministic
local model API도 MCP Tool 선택 evidence로 사용하지 않았다. 측정 arm은 Vertex가
아니며 `genai.Client(api_key=...)` direct Google AI Studio 경로다. 사용자 명시 전의
Vertex connectivity smoke와, 요청 모델을 다른 모델로 remap한 Gemini CLI smoke는
모두 정규 데이터에서 제외했다.

시작과 종료 시 reserved listener 소유자는 같았다.

| Port | Owner | Spike 사용 |
| ---: | --- | --- |
| 8890 | PID 308019, primary checkout `packages/web` Vite | 사용/재시작 안 함 |
| 8898 | PID 308664, primary checkout Codex Bridge | positive MCP evidence에 사용 안 함 |
| 8899 | PID 331, dedicated Chrome CDP | 사용 안 함 |
| 8891–8897, 8900 | listener 없음 | 사용 안 함 |

Spike MCP는 reserved port를 쓰지 않는 stdio child process였다. 따라서 primary-checkout
서비스로 spike code를 검증하지 않았고, 서비스 재시작도 필요하지 않았다.

## Current friction being tested

Phase A에서 기록된 다음 마찰을 직접 겨냥했다.

- 일반 Decision 8개와 Asset Decision 2개의 반복감
- Plan 이후 explicit Codex resume 필요
- automatic fresh-session claim 미입증
- Plan/Default mode와 session 종료 경계 불명확
- 외부 app envelope와 deterministic eval harness의 수동 구성
- 긴 local run/Verify 시간
- 외부 Application Workspace에서 Current Hook이 실제 도달하는지 불명확

## Hook result

현재 host에서 global Agent Factory plugin의 `SessionStart`와
`UserPromptSubmit` Hook state는 둘 다 `enabled=false`였다. 또한
`codex plugin list`는 기존 marketplace source가 더 이상 지원 manifest를 갖지 않아
실패했다. 이는 현재 host의 실제 startup 상태이며 일반적인 Hook 계약으로 확대해
해석하지 않는다.

설치 cache의 실제 `af-codex-hook-entry.mjs`를 외부 app에서 Codex
`UserPromptSubmit` Hook으로 강제 실행했다. Codex는 프로세스를 실행했지만:

- exit `0`
- wall time `0.02s`
- stdout/stderr 각각 `0 bytes`
- 외부 app부터 filesystem root까지 찾는
  `scripts/af-codex-hook.mjs` 후보가 모두 없음

Entry source는 readable workspace adapter를 찾을 때만 import한다. 그러므로 이
외부 app에서는 endpoint discovery나 Bridge 요청 이전에 no-op했다. Current Hook을
Application Repo마다 복사하지 않는 조건에서 외부 app context delivery는
**실제 미도달**이다.

이 상태를 그대로 반영한 A arm에서 Gemini는 Tool을 0/5회 호출했다.

- 1/5: 요청대로 `UNVERIFIED`
- 4/5: 존재하지 않는 Registry reuse, transport, revision, selection ID를 확신 있게 생성
- current revision이나 검증 가능한 decision record: 0/5

즉 Tool을 호출하지 않았을 때의 주 실패는 단순 중단보다 **그럴듯한 fabricated
provenance**였다.

## MCP result

임시 MCP는 4 Tools만 제공했다.

- `af_get_context`
- `af_get_pending_work`
- `af_get_asset_or_handbook_context`
- `af_record_spike_decision`

`af_record_spike_decision`은 `/tmp` audit만 쓰고 canonical Work Item에는 쓰지
않았다.

Gemini 정규 반복 결과:

- MCP Tool을 한 번 이상 선택: **5/5 (100%)**
- context + Asset evidence read: **5/5**
- 유효한 임시 decision record: **4/5 (80%)**
- 호출 수: `3, 3, 3, 5, 3`
- 한 실패 run은 disposition enum을 대문자/축약형으로 세 번 바꿔 재시도했지만
  canonical `create_project_draft`로 복구하지 못하고 `UNVERIFIED` 종료

중요하게 MCP protocol call 자체의 `is_error`는 0건이었다. Domain validation이
`recorded:false` payload로 반환됐기 때문이다. 따라서 “Tool이 호출됐다”와
“의사결정이 기록됐다”를 분리해 audit outcome으로 판정해야 했다.

Codex CLI에서도 project MCP를 실제 선택했다. 첫 비대화형 실행은 Tool을 정확히
선택한 뒤 approval boundary에서 `user cancelled MCP tool call`로 끝났다. 명시적
approval bypass를 준 connection probe에서는 `af_get_context`가 완료됐고
`phase-b-context-r2`를 반환했다. Server-side Tool duration은 `6.221ms`였다.

## Hybrid result

Minimal Hook은 상세 context를 싣지 않고 다음만 강제 전달했다.

- fixed `selection_id=selection.phase-b-ocr.v1`
- 상세 current evidence는 project MCP에서 pull하라는 pointer

실제 Codex `UserPromptSubmit`에서 Hook은 `session_id`, `turn_id`, `cwd`를
audit에 남겼다. 같은 Codex turn의 MCP connection probe도
`phase-b-context-r2`를 반환했고 server-side Tool duration은 `3.943ms`였다.

Gemini 정규 반복 결과:

- MCP Tool을 한 번 이상 선택: **5/5 (100%)**
- context + Asset evidence read: **5/5**
- selection ID 보존: **5/5**
- 유효한 임시 decision record: **4/5 (80%)**
- 호출 수: `4, 4, 4, 4, 4`
- 한 실패 run은 non-canonical disposition alias를 두 번 사용하고
  `UNVERIFIED` 종료

Hybrid는 Tool 선택률이나 end-to-end 유효 record 비율을 MCP-only보다 높이지
않았다. 대신 MCP가 자체 제공하지 않는 Codex session/turn과 selection provenance를
최소 payload로 보존했다.

### Post-report VS Code Remote-WSL probe

보고서 작성 후 실제 VS Code Codex turn을 한 번 실행했다.

- Screenshot: `/mnt/c/Users/ilmas/OneDrive/사진/Screenshots/스크린샷 2026-07-27 021150.png`
- 사용자 prompt는 `agent_factory_phase_b.af_get_context`를
  `task=ocr_asset_disposition`으로 정확히 한 번 호출하도록 요청함
- 사용자가 MCP Tool 실행을 승인했고, Extension log는
  `mcpServer/elicitation/request` 응답의 `persist=always`를 기록함
- Codex가 실제 `af_get_context`를 호출했고 화면 응답은
  `phase-b-context-r2`였음
- `/tmp/af-phase-b-spike/audit/codex-hybrid.jsonl`의 대응 record는
  `at=2026-07-26T17:08:10.521791+00:00`, `condition=hybrid`,
  `outcome=success`, `duration_ms=4.149`,
  `workspace=/tmp/af-phase-b-spike/app-hybrid`임
- 같은 prompt 시각 이후
  `/tmp/af-phase-b-spike/audit/minimal-hook.jsonl`의 새
  `UserPromptSubmit` record는 0건임

따라서 이 probe는 VS Code Remote-WSL의 project-scoped MCP, MCP approval UX,
app-server와 MCP server의 WSL 실행을 **verified**로 올린다. Minimal Hook은
**unverified/not observed**이고, VS Code 전체 Hybrid는 **partial**이다. 기존 CLI
Hybrid의 session/turn/selection evidence는 계속 **verified**지만 VS Code까지
일반화하지 않는다.

## Comparison

토큰 수는 각 run에서 Google AI Studio가 반환한 usage다. “max prompt”는 multi-step
Tool loop 중 가장 큰 prompt token count의 5-run median이고, “cumulative total”은
각 API step의 total token count 합계의 median이다.

| Criterion | Hook | MCP | Hybrid |
| --- | --- | --- | --- |
| 외부 app 실제 context delivery | 미도달, 0-byte no-op | project pull 성공 | 최소 pointer 강제 + project pull 성공 |
| Gemini MCP Tool 선택률 | 0/5 | 5/5 | 5/5 |
| 유효한 임시 decision record | 0/5 | 4/5 | 4/5 |
| no-tool/validation 실패 | 4 fabricated, 1 safe `UNVERIFIED` | 1 enum recovery 실패 | 1 enum recovery 실패 |
| CLI 연결 | Hook 프로세스만 실행, context 없음 | 승인 후 actual call 성공 | Hook과 actual MCP call 모두 성공 |
| Project scope | current global/plugin 경로는 app에 기능 미도달 | app root와 descendant에만 AF MCP | app root와 descendant에만 AF MCP |
| Unrelated repo 노출 | AF context 없음 | `[]` | `[]` |
| Freshness `r1 → r2` | current revision 없음 | 재설정 없이 `r2` read; final record는 enum 실패 | 재설정 없이 `r2` read + valid record |
| Decision provenance | 외부 app decision 없음 | time, trial, workspace, revision; session/turn 없음 | Hook session/turn/cwd + selection ID + MCP revision |
| Model wall latency median | `9.379s` | `7.864s` | `9.279s` |
| Model wall latency range | `6.104–10.014s` | `7.253–16.507s` | `8.199–17.195s` |
| Initial / max prompt tokens | `149 / 149` | `556 / 1,589` | `605 / 1,805` |
| Cumulative total tokens | `1,968` | `5,444` | `7,813` |
| Local Tool time/run median | `0ms` | `21.439ms` | `25.157ms` |
| Cold-start user gates observed | 0, but nonfunctional | workspace trust + MCP approval: 2 | workspace trust + Hook trust + MCP approval: 3 |
| VS Code Remote-WSL | Current Hook 미검증 | project-scoped MCP·approval·WSL 실행 verified | MCP leg verified, Minimal Hook 미관찰; 전체 partial |

Latency는 `n=5`이고 각 MCP arm에 16–17초 outlier가 하나씩 있어 순위보다 범위를
같이 봐야 한다. Local Tool 실행은 수십 ms뿐이어서 지연 대부분은 model round-trip과
추가 Tool loop다. Hybrid는 MCP-only 대비 median wall time이 약 `1.414s (18%)`,
cumulative total tokens가 `2,369 (44%)` 더 컸다.

## Model behavior (Google AI Studio)

이 절은 원래 work order의 “Local model behavior” 자리를 사용자 지시에 따라 Google
AI Studio `gemini-2.5-flash`로 대체한 것이다. Local model 결과로 표현하지 않는다.

- 매 API step의 `model_version`이 정확히 `gemini-2.5-flash`였음
- B/C 모두 Tool 선택은 안정적이었음: 10/10 정규 runs
- Tool 선택 성공이 domain value 준수까지 보장하지 않았음: B/C 각각 1/5 record 실패
- C의 selection ID는 5/5 보존됐음
- A처럼 evidence access가 없을 때 4/5가 안전하게 중단하지 않고 provenance를 조작했음
- temperature 0이어도 response와 retry behavior는 완전히 deterministic하지 않았음

따라서 이 모델에서는 MCP pull을 기대할 수 있지만, Tool schema의 enum과 domain
failure를 모델이 무시하기 어렵게 노출하지 않으면 호출률만으로 제품 성공률을
판정할 수 없다.

## CLI / VS Code difference

Codex CLI:

- trusted temp home에서 app-mcp/app-hybrid는
  `agent_factory_phase_b` 하나를 표시
- app-hook와 unrelated repo는 AF MCP를 표시하지 않음
- app-mcp descendant에서도 같은 project MCP를 표시
- 실제 Tool 선택과 응답까지 확인
- default non-interactive approval은 호출을 취소했으므로 approval UX가 실제 조작
  비용임
- Codex connection-only token total은 repository/system context와 cache 상태가
  run마다 달라 Gemini arm 비교표에는 섞지 않음

VS Code Remote-WSL:

- VS Code `1.130.0`, Remote-WSL `Ubuntu-24.04`, 실제 probe extension
  `openai.chatgpt@26.715.61943`에서 실행
- Extension의 Codex app-server와 project MCP server가 WSL에서 실행됨
- app-hybrid project config의 `agent_factory_phase_b`가 노출되고 실제
  `af_get_context(task=ocr_asset_disposition)` 호출까지 완료됨
- 사용자의 MCP approval과 Extension log의 `persist=always`가 확인됨
- Tool event, temp audit, 화면의 `phase-b-context-r2`가 같은 probe를 지지함
- 같은 prompt에 대응하는 Minimal Hook `UserPromptSubmit` audit는 없음
- 따라서 project-scoped MCP와 approval UX는 **verified**, Minimal Hook은
  **unverified/not observed**, 전체 Hybrid는 **partial**임

VS Code에서 unrelated-repository non-exposure까지 반복한 것은 아니다. 그 negative
scope evidence는 CLI probe가 소유하며, VS Code의 positive claim은 app-hybrid에서
project config가 로드되고 MCP Tool이 실행된 범위로 제한한다.

관련 Codex 계약 문서:

- [Config basics](https://learn.chatgpt.com/docs/config-file/config-basic)
- [Model Context Protocol](https://learn.chatgpt.com/docs/extend/mcp)
- [Hooks](https://learn.chatgpt.com/docs/hooks)
- [IDE developer settings](https://learn.chatgpt.com/docs/developer-settings?surface=ide)

## App workspace isolation

정상 user config에서는 temp app을 trust하지 않았기 때문에 project config의 AF MCP가
숨겨졌고 user-level MCP 세 개만 보였다. 정확한 temp project paths를 trusted로 둔
격리된 Codex home에서는:

- `app-mcp`: AF MCP visible
- `app-mcp/product_truth_vertical_slice_adk`: AF MCP visible
- `app-hybrid`: AF MCP visible
- `app-hook`: AF MCP absent
- 별도 초기화한 `unrelated` git repository: AF MCP absent

이는 project scope와 descendant inheritance, sibling/unrelated non-exposure를 실제
CLI startup으로 확인한 결과다. Generated app 원본에는 `.codex` 파일을 쓰지 않았다.

## Decision provenance

MCP-only가 남긴 provenance:

- UTC timestamp
- condition/trial ID
- app workspace
- evidence revision
- decision arguments와 deterministic temporary record ID

MCP-only가 남기지 못한 provenance:

- Codex `session_id`
- Codex `turn_id`

Hybrid Hook은 실제 Codex event에서 session/turn/cwd를 얻고 selection ID를 모델
context에 넣었다. MCP decision은 그 selection ID를 5/5 보존했다. 다만 이 spike는
새 Crypto/Lease를 만들지 않았으므로 두 로그의 join은 selection ID에 의존하며
cryptographic/session-bound proof가 아니다. 이 한계를 숨기지 않는다.

## Failed assumptions

1. Current plugin Hook이 설치되어 있으면 외부 app에도 도달할 것이라는 가정:
   host state에서 disabled였고, entry를 강제 실행해도 workspace adapter가 없어 no-op.
2. Project config가 파일 존재만으로 활성화된다는 가정: trust 전에는 AF MCP가 숨겨짐.
3. 비대화형 Codex가 model-selected MCP를 바로 실행한다는 가정: default approval
   boundary가 `user cancelled`로 처리.
4. Tool 호출률이 task 성공률이라는 가정: 100% 호출과 80% valid record가 분리됨.
5. Domain rejection이 MCP `is_error`가 된다는 가정: 정상 protocol response 안의
   `recorded:false`였음.
6. `google-genai==2.14.0` typed `GenerateContentConfig`에 live MCP session을 넣을
   수 있다는 가정: deep-copy가 asyncio Future에서 실패해 문서화된 dict config를 사용.
7. Gemini CLI에서 요청한 model label이 그대로 실행된다는 가정: smoke가 다른 model로
   remap되어 direct AI Studio SDK로 교체하고 해당 smoke를 제외.
8. CLI 성공이 VS Code 성공을 대신한다는 가정: post-report Extension turn은 MCP
   leg만 확인했다. Minimal Hook event가 관찰되지 않아 전체 Hybrid는 여전히 partial.

## Recommendation

**Phase C 입력으로 Minimal Hook + project-scoped MCP Hybrid를 추천한다.**

근거:

- Current Hook 유지안은 외부 app에서 실제로 context에 도달하지 못했다.
- MCP-only는 가장 단순하고 median latency/token도 낮았으며 model Tool 선택률은
  100%였다.
- 그러나 MCP-only는 Codex session/turn을 제공하지 않는다.
- Hybrid는 상세 evidence를 MCP에 남기면서 Hook을 224-char session/selection pointer로
  제한했고, actual Codex session/turn과 selection preservation을 증명했다.
- 다만 그 Hybrid 증거는 CLI에 한정된다. post-report VS Code probe는 MCP와 approval은
  확인했지만 Minimal Hook을 관찰하지 못했다.
- Hybrid의 18% median latency, 44% cumulative token overhead와 Hook trust gate는
  명확한 비용이다. Session provenance가 필요 없다고 Phase C에서 판단하면 MCP-only가
  더 경제적인 fallback이다.

이 추천으로 Architecture Decision을 확정하지 않는다. 특히 VS Code Minimal Hook
미관찰과 enum/domain failure 계약은 Phase C가 독립적으로 판단할 리스크다. Phase B는
Production Integration을 승인하지 않는다. 최종 선택과 지원 경계는
[Phase C Architecture Decision](mcp-hook-hybrid-architecture-decision.md)이 소유한다.

## Prototype files to discard

완료된 VS Code probe를 포함한 다음 root 전체가 discard 단위다.

```text
/tmp/af-phase-b-spike
```

그 안의 임시 server, model harness, Hook, cloned apps, project configs, audit/evidence,
state, debug files 어느 것도 merge 대상이 아니다. Phase C는 이 root를 삭제·복사·승격
하지 않으며, Phase A generated app과 완료된 Work Item ledger를 변경하지 않는다.
