# MCP 중심 External Application 통합 Architecture Decision

상태: **Accepted for Phase C; Production Integration 미승인·미구현**

결정일: 2026-07-27 (KST)

## 최종 선택

외부 Application Workspace에서 Agent Factory의 상세 context, Asset, Handbook
evidence를 제공하는 주 통합 채널로 **project-scoped MCP 중심 구조**를 선택한다.

이 선택은 MCP-only로 기존 Companion Hook을 제거한다는 뜻이 아니다. 현재
[External Codex Companion](../workbench/cli-companion.md)의 exact Session, scoped
next-prompt delivery, Companion Continue 계약은 그대로 유지한다. 다만 외부 app의
상세 context 접근을 위해 Minimal Hook을 필수로 결합하지 않고, Hook을 주 context
채널로도 사용하지 않는다.

이 ADR은 문서 결정만 기록한다. Production MCP packaging, Tool 구현, 기존 Hook 제거,
Phase B prototype 승격, Phase D 시작을 승인하지 않는다.

| Concern | 결정 |
| --- | --- |
| 외부 app의 상세 AF context | application repository의 project-scoped MCP로 pull |
| Minimal Hook pointer | 선택된 baseline에서 요구하지 않음 |
| Fresh Context | Companion Continue가 공식 경로 |
| canonical Work Item decision write | 현행 Work Skill 소유 유지; MCP mutation은 별도 검증 전 제외 |
| MCP 실패 | provenance를 만들지 않고 `UNVERIFIED`로 중단한 뒤 명시적 retry/fallback |
| Native Windows | 미지원 |

## 판단 범위와 기준선

이 결정은 [Phase B Spike 보고](mcp-hook-hybrid-spike-status.md)와 다음 완료된 Phase A
evidence를 입력으로 사용했다.

- Phase A report:
  `/home/ilmaswsl/work/af-companion/artifacts/af/product-truth-vertical-slice/phase-a-report.md`
- validation report:
  `/home/ilmaswsl/work/af-companion/artifacts/af/product-truth-vertical-slice/validation-report.md`
- canonical ledger:
  `/home/ilmaswsl/work/af-companion/artifacts/af/product-truth-vertical-slice/af-work-item.json`
- generated app:
  `/home/ilmaswsl/work/af-apps/product-truth-ocr-agent`

Phase C 시작 시 fetch 후 Factory worktree는 branch `spike/mcp-hook-hybrid`,
`HEAD=f546d642d7da1facaf5be2999805a1dc4fd7db7f`,
`origin/main=dfcf69c885062c552588e2afa6389020734df575`였다. 자동 reset 또는 rebase는
하지 않았다. Generated app은 clean
`e263e7aa1c48aacc807d83a6c41d10b7ad9efb2d`였다. Phase A ledger는 revision 11,
네 Work Skills `complete`, verification `passed`, `active_runs=[]`였고 historical
handoff는 `pending`과 `claimed_by_session_id=null`을 유지했다. Phase A report의 옛
branch 표기는 당시 pre-merge 기록이지 Phase C의 현재 branch가 아니다.

## Phase A와 Phase B evidence

### Phase A product truth

Phase A는 별도 Git workspace에 Agent 1개와 HTTP MCP OCR Tool 1개를 가진 runnable
ADK application을 만들고 local run과 behavior eval 2/2를 통과했다. Product Truth는
성립했지만 사용자 흐름은 가볍지 않았다.

- local ADK run까지 약 79분, 전체 Verify까지 약 98분
- 일반 Decision 8개와 Asset Decision 2개
- Plan 이후 exact session의 explicit `codex resume` 필요
- automatic fresh-session claim은 historical pending/unclaimed 상태로 미입증
- 외부 app envelope와 eval harness의 수동 구성
- 외부 Application Workspace에서 Current Hook 도달 여부가 불명확

### Phase B channel comparison

모델 측정은 Vertex 또는 local model이 아니라 Google AI Studio API key 기반
`gemini-2.5-flash`였다.

- Current Hook은 실제 외부 app에서 0-byte no-op였다.
- Tool이 없는 arm은 5회 중 4회 존재하지 않는 provenance를 생성했다.
- MCP-only는 Tool 선택 5/5, 유효한 임시 decision record 4/5였다.
- Minimal Hook + MCP Hybrid도 Tool 선택 5/5, 유효 record 4/5였다.
- Hybrid는 selection ID를 5/5 보존하고 CLI에서 `session_id`와 `turn_id`를
  기록했지만 end-to-end decision 성공률을 높이지 않았다.
- CLI에서 project root와 descendant의 MCP 노출, sibling/unrelated repository의
  non-exposure, 실제 Tool call이 확인됐다.
- `r1 → r2` freshness probe에서 MCP는 project 재설정 없이 current revision을 읽었다.

### Post-report VS Code evidence

VS Code `1.130.0`, Remote-WSL `Ubuntu-24.04`, probe extension
`openai.chatgpt@26.715.61943`에서 Extension의 Codex app-server와 Phase B MCP server가
WSL process로 실행됐다. 사용자가 MCP Tool 실행을 승인했고 Extension log는 approval
`persist=always`를 기록했다. VS Code Codex는 실제
`af_get_context(task=ocr_asset_disposition)`를 호출해 `phase-b-context-r2`를 반환했다.

대응 MCP audit는 다음 성공 record를 남겼다.

```text
at=2026-07-26T17:08:10.521791+00:00
condition=hybrid
tool_name=af_get_context
outcome=success
duration_ms=4.149
workspace=/tmp/af-phase-b-spike/app-hybrid
```

그러나 같은 prompt 이후 Minimal Hook audit의 새 `UserPromptSubmit` record는 없었다.
따라서 VS Code의 project-scoped MCP, approval UX, WSL 실행은 verified이고, VS Code
Minimal Hook은 unverified/not observed이며 전체 Hybrid는 partial이다. CLI Hybrid만
verified다.

## 해결하는 실제 사용자 마찰

MCP 중심 구조는 Phase A/B에서 확인된 다음 문제를 직접 줄인다.

- 외부 app에 Factory Hook adapter가 없어서 상세 context가 0-byte no-op이 되는 문제
- application별 context를 user-level global integration 없이 노출해야 하는 문제
- 긴 상세 evidence를 Hook payload로 강제 주입할 때 생기는 크기와 최신성 부담
- Asset/Handbook/current revision을 필요한 시점에 다시 읽어야 하는 문제
- unrelated repository에 Agent Factory Tool을 노출하지 않아야 하는 project trust 문제

반대로 다음 문제는 이 ADR이 해결했다고 주장하지 않는다.

- Plan에서 fresh context로의 자동 운반
- Phase A의 10개 질문이 주는 반복감
- Plan/Default mode와 session 종료 경계
- generated app envelope의 수동 구성과 긴 runtime Verify
- enum/domain validation 실패
- MCP가 model-selected pull이라는 사실

## 독립 판단 근거

Phase B의 Hybrid recommendation은 실험 입력이지 승인된 결정이 아니었다. Phase C는
다음 이유로 MCP 중심을 독립 선택한다.

1. 외부 app에서 실제 문제였던 것은 상세 context 미도달이며 project-scoped MCP가
   CLI와 VS Code Remote-WSL 양쪽에서 이를 해결했다.
2. Hybrid는 MCP-only보다 Tool 선택률이나 유효 decision record 비율을 높이지 않았다.
3. Hybrid의 고유 이점인 session/turn/selection provenance는 CLI에서만 확인됐다.
   VS Code에서는 MCP leg만 관찰됐으므로 Hybrid를 공통 baseline으로 선언할 수 없다.
4. MCP-only가 더 낮은 latency와 token 비용을 보였다.
5. 현재 Acknowledgement 정책에서는 식별자를 답변에 보존한 사실만으로 성공을
   인정하지 않는다. 검증 가능한 side effect와 valid domain record가 별도로 필요하다.

## 기각한 대안

### Minimal Hook + project-scoped MCP Hybrid

필수 baseline으로는 기각한다.

- 장점: CLI에서 `session_id`, `turn_id`, `cwd`, selection ID를 보존했다.
- 기각 이유: MCP-only와 같은 4/5 valid record였고 Tool 선택도 같은 5/5였다.
- 비용: Hook trust gate, 중복 channel 운영, correlation 로직, 더 높은 latency/token.
- 지원 한계: VS Code MCP는 verified지만 Minimal Hook은 관찰되지 않아 전체 Hybrid가
  partial이다.

이 대안을 영구 금지하지는 않는다. session-bound provenance가 실제 canonical write의
필수 조건으로 확인되고 VS Code 재검증과 비용 정당화가 끝나면 재검토할 수 있다.

### Hook 유지

외부 app의 주 context 채널로는 기각한다.

- 설치 cache entry를 강제로 실행해도 workspace adapter를 찾지 못해 0-byte no-op였다.
- 상세 evidence, current revision, valid decision record를 제공하지 못했다.
- Tool 없는 조건에서 4/5 fabricated provenance가 발생했다.

이는 기존 Companion Session/Lease, exact next-prompt delivery, Companion Continue Hook
계약을 삭제한다는 결정이 아니다. 검증된 현행 기능은 동결하고, 외부 app 상세 context의
주 채널로 승격하지 않는다는 뜻이다.

## Latency와 token tradeoff

`n=5`의 작은 spike이므로 순위를 일반 성능 보장으로 확대하지 않는다. 그래도 선택에
필요한 방향은 일관됐다.

| Metric | MCP-only | Hybrid | 관찰 |
| --- | ---: | ---: | --- |
| Model wall latency median | `7.864s` | `9.279s` | Hybrid가 약 `1.414s`, `18%` 높음 |
| Model wall latency range | `7.253–16.507s` | `8.199–17.195s` | 양쪽에 16–17초 outlier 존재 |
| Initial / max prompt tokens | `556 / 1,589` | `605 / 1,805` | Hybrid pointer와 추가 loop 비용 |
| Cumulative total tokens median | `5,444` | `7,813` | Hybrid가 `2,369`, `44%` 높음 |
| Local Tool time/run median | `21.439ms` | `25.157ms` | 주 지연은 local Tool이 아니라 model round-trip |

MCP는 nonfunctional Hook arm보다 더 많은 token을 사용했지만 current evidence와 valid
record를 실제 제공했다. 선택의 relevant tradeoff는 기능하는 MCP와 Hybrid 사이이며,
동일한 task 성공률에서 MCP가 더 경제적이었다.

## Project trust와 MCP approval UX

Project scope는 보안과 사용자 조작을 함께 만든다.

- trust 전에는 project config의 AF MCP가 숨겨졌다.
- trust한 CLI app root와 descendant에는 AF MCP가 보였고 unrelated repository에는
  보이지 않았다.
- VS Code Remote-WSL app-hybrid에서도 project MCP가 실제 실행됐다.
- CLI의 첫 non-interactive call은 approval boundary에서 취소됐다.
- VS Code에서는 사용자가 Tool 실행을 승인했고 `persist=always`가 기록됐다.

따라서 workspace trust와 MCP approval은 제거할 오류가 아니라 명시적으로 감수하는
사용자 gate다. Production design은 이를 우회하거나 user-level global MCP로 넓히지
않는다. `persist=always`도 그 probe의 사용자 선택일 뿐 모든 client와 workspace에
자동 적용된다고 가정하지 않는다.

## Tool 호출 성공과 domain decision 성공

Phase B에서 B/C arm 모두 MCP Tool 선택은 5/5였지만 valid decision record는 4/5였다.
실패 run에서도 MCP protocol `is_error`는 0건이었고 server payload가
`recorded:false`를 반환했다. 그러므로 다음을 별도 outcome으로 측정해야 한다.

1. client가 올바른 MCP Tool을 선택하고 protocol call을 완료했는가
2. canonical enum과 revision을 만족하는 domain decision이 실제 기록됐는가

Tool event나 `is_error=false`만으로 2번을 성공 처리하지 않는다. 화면에 selection ID나
context revision을 복사한 것도 검증 가능한 domain side effect를 대신하지 않는다.

## Provenance 한계

MCP-only audit가 보존한 것은 timestamp, trial, workspace, evidence revision, arguments,
temporary record ID였다. MCP는 자체적으로 Codex `session_id` 또는 `turn_id`를 제공하지
않는다.

Hybrid CLI는 Hook에서 session/turn/cwd를 얻고 selection ID를 5/5 보존했지만, 두
temporary log의 join은 selection ID에 의존했고 cryptographic/session-bound proof가
아니었다. VS Code에서는 그 Hook record 자체가 없었다.

따라서 선택된 MCP 중심 구조는 session/turn provenance를 제공한다고 주장하지 않는다.
Canonical Work Item의 사용자 Decision은 계속 현행 Work Skill이 exact current
session/turn과 explicit user selection을 기록한다. 이 ADR만으로 canonical mutation
MCP Tool을 열지 않는다. 향후 그런 Tool을 검토하려면 provenance와 domain validation
조건을 먼저 만족해야 한다.

## Fallback

1. Project가 untrusted이거나 MCP server가 시작되지 않으면 Tool을 global scope로
   옮기지 않는다. setup/approval 상태를 드러내고 명시적으로 trust 또는 재시도를
   요청한다.
2. 모델이 필요한 MCP Tool을 선택하지 않으면 Tool 이름과 목적을 명시해 다시
   요청한다. 그래도 current evidence를 얻지 못하면 `UNVERIFIED`로 중단한다.
3. enum, revision, domain validation이 거부되면 alias를 추측하거나 성공으로
   coercion하지 않는다. canonical 선택지를 다시 제시하고 valid side effect 전에는
   decision 완료를 주장하지 않는다.
4. MCP가 불가한 동안 canonical lifecycle 작업은 Factory repository의 현행 Work Skill과
   직접 artifact inspection을 사용한다. Current Hook을 외부 app context fallback으로
   추측하지 않는다.
5. Fresh Context가 필요한 경우 MCP 여부와 관계없이 Companion Continue를 사용한다.

## 지원 환경별 evidence 상태

이 표는 Phase C의 evidence 상태이며 Production Integration 완료를 뜻하지 않는다.

| 환경 | MCP 중심 경로 | Hook/Hybrid evidence | 지원 결론 |
| --- | --- | --- | --- |
| Codex CLI on WSL | Tool call, project root/descendant scope, unrelated non-exposure verified | Minimal Hook + MCP와 session/turn/selection verified | 선택된 MCP 경로 verified |
| VS Code Remote-WSL | project MCP call, approval UX, WSL app-server/MCP 실행 verified | Minimal Hook unverified/not observed; 전체 Hybrid partial | 선택된 MCP 경로 verified |
| Native Windows | 측정 없음 | POSIX lease/Hook 의미 포함 측정 없음 | 현재 미지원 |

VS Code의 positive project MCP claim은 app-hybrid workspace에서 확인한 범위다.
Unrelated-repository non-exposure의 negative probe는 CLI evidence이며 VS Code에서 별도로
반복하지 않았다.

## 고정 정책

이 ADR은 다음 정책을 변경하지 않는다.

- **Fresh Context**: Companion Continue가 공식 경로다.
- **Acknowledgement**: 검증 가능한 side effect만 evidence다.
- **Direct Turn / Steering**: 별도 Architecture Decision 전까지 제외한다.
- **Native Windows**: 현재 미지원이다.

## 새 부작용과 비용

- 각 application repository에 project MCP config와 startup 계약이 필요하다.
- workspace trust와 MCP approval이라는 사용자 gate가 생긴다.
- model-selected pull이므로 강제 context injection을 보장하지 않는다.
- Tool loop가 no-context prompt보다 token과 round-trip을 늘린다.
- MCP server lifecycle, version drift, audit outcome을 운영해야 한다.
- session/turn provenance가 없는 상태에서 canonical mutation을 허용할 수 없다.
- VS Code와 CLI의 config/approval 동작을 각각 검증해야 한다.

이 비용은 실제 외부 app context delivery와 project isolation을 얻기 위해 수용한다.
Hybrid의 두 번째 channel과 추가 trust/correlation 비용은 현재 evidence로 정당화되지
않는다.

## Enum/domain validation 후속 조건

Canonical decision mutation을 MCP에 추가하는 후속은 다음 조건을 모두 만족해야 한다.

1. Tool input schema가 canonical enum을 exact value로 제한하고 alias 또는 대소문자
   변형을 조용히 허용하지 않는다.
2. Domain rejection은 machine-readable unsuccessful outcome으로 노출되고
   `is_error=false` 안의 `recorded:false`를 성공으로 집계하지 않는다.
3. Retry는 current allowed values와 revision을 다시 제시하며 무한 반복하거나 임의
   coercion하지 않는다.
4. CLI와 VS Code Remote-WSL에서 Tool-call success와 valid-record success를 분리한
   end-to-end evidence를 수집한다.
5. canonical write가 필요하면 explicit user selection, current revision,
   session/turn provenance의 신뢰 가능한 결합을 증명한다.

이 조건이 해결되지 않으면 MCP는 read-mostly context channel로 유지하고 canonical
Decision은 Work Skill이 기록한다. 현재 4/5 결과는 완료 기준이 아니라 이 gate가 필요한
직접 evidence다.

## VS Code Minimal Hook 재검증 조건

Hybrid를 다시 후보로 올리려면 실제 지원 대상 VS Code/Extension version과
Remote-WSL external app workspace에서 다음을 한 fresh turn으로 증명해야 한다.

1. project Hook source와 hash를 확인하고 사용자가 trust한다.
2. fresh Codex chat에 correlation 가능한 selection ID가 있는 prompt를 제출한다.
3. prompt 이후 새 Minimal Hook `UserPromptSubmit` audit가 생기고 exact
   `session_id`, `turn_id`, `cwd`, selection ID를 포함한다.
4. 같은 turn의 MCP audit가 current context revision과 같은 selection ID를 남긴다.
5. Tool call뿐 아니라 요구된 valid domain side effect까지 성공한다.
6. WSL process 경계와 unrelated repository non-exposure를 다시 확인한다.

Screenshot, MCP success record, 답변의 selection ID만 있고 Hook record가 없으면 전체
Hybrid는 계속 partial이다. Selection ID만으로 두 log를 잇는 경우에도
session-bound proof라고 부르지 않는다.

## 다시 검토할 조건

다음 중 하나가 발생하면 이 결정을 재검토한다.

- 지원 대상 CLI 또는 VS Code에서 required MCP Tool 선택 실패가 반복되어 실제 흐름을
  막는다.
- project trust 또는 approval UX가 반복 사용에서 수용할 수 없는 마찰로 측정된다.
- project config가 unrelated repository에 노출되거나 stale context를 반환한다.
- canonical mutation이 제품 필수 요구가 되고 session/turn provenance 없이는 안전하게
  수행할 수 없다.
- Codex가 MCP call에 신뢰 가능한 session/turn metadata를 제공한다.
- 위 VS Code Minimal Hook 재검증을 통과하고 Hybrid가 정확성 개선으로 추가 비용을
  정당화한다.
- Native Windows 지원을 별도 범위와 evidence로 승인한다.

## Stop gate

Phase C는 이 ADR과 Phase B status 정정으로 종료한다. 사용자 승인 전에는 Phase D,
Production Integration, commit, push, PR을 시작하지 않는다.
`/tmp/af-phase-b-spike`의 prototype/config/log는 merge 또는 copy source가 아니다.
