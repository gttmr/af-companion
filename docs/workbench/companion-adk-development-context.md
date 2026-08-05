# Companion의 skill-aware ADK 개발 컨텍스트

상태: **Target Contract와 순차 구현 방향 확정, Current Implementation은 일부만 충족**

결정일: 2026-08-05 KST

연결 문서:

- [Companion architecture](../../packages/companion/ARCHITECTURE.md)
- [Companion ADK 개발 프로그램](follow-ups/23-companion-adk-development-program.md)
- [AF Skills vNext 프로그램](follow-ups/24-af-skills-vnext-program.md)
- [Taxonomy](taxonomy.md)
- [Graph IR](graph-ir.md)

## 1. 궁극적 목적

Companion은 자체 코드 생성기나 Browser IDE가 아니다. ADK 개발자가 외부 Codex CLI 또는
OpenAI Codex VS Code extension에서 Google 공식 `google-agents-cli-*` Skill과 Agent
Factory Skill을 사용해 더 좋은 ADK 코드를 만들도록 돕는 **개발 컨텍스트·제어 평면**이다.

Companion이 소유하는 핵심 가치는 다음과 같다.

1. 기존 Agent·Workflow·Tool Asset의 검색, exact binding, 계약과 구현 위치를 제공한다.
2. App의 Graph 연결을 시각화하고 선택한 Node·Edge·Region을 개발 문맥의 기준점으로 삼는다.
3. 선택 대상, 주변 Graph, Asset 계약, source root, Git 기준점, 필요한 Skill과 검증 조건을
   하나의 검토 가능한 개발 작업으로 만든다.
4. 실제 소스 작성은 해당 App에서 실행되는 외부 Codex와 Skill이 수행한다.
5. 생성 결과는 App 내부 Git, 테스트, eval, Graph/source mapping으로 검증·보존한다.

```text
Asset Registry + Graph + active selection
                    |
                    v
          Companion context assembler
                    |
      exact cwd / write roots / Skill invocation
                    |
                    v
        Codex CLI or VS Code extension
                    |
     Google Skills + AF Skills vNext
                    |
                    v
          ADK source / tests / eval
                    |
                    v
       App Git + implementation evidence
```

## 2. 실행 환경 제약

사용자가 Companion을 실제 사용하는 환경에는 Internet 연결이 없다. 개발·검증은 이미
provision된 local toolchain, Skill bundle, dependency cache 또는 environment와 local model만
사용해야 한다.

- Session 2 primary acceptance model은 사용자 소유 Linux system에서 제공하는 self-hosted
  Qwen 3.6 27B이며 served model ID는 `qwen3.6-27b-128k`, context lock은 128k
  (`131072`)이다. Session 1의 `qwen3.6-small` manifest와 blocked evidence는 당시 기록으로
  그대로 보존한다.
- Session 2 model transport는 ignored local configuration에만 저장된 승인된 Tailscale direct
  endpoint의 OpenAI-compatible `/v1` 경로다. Private endpoint bytes를 repository source,
  artifact, evidence 또는 App에 저장하지 않으며 localhost tunnel은 acceptance transport가 아니다.
- framework baseline은 exact `google-adk==2.4.0`이고 supported dependency line은
  `>=2.4.0,<2.5.0`이다. 새 환경은 exact interpreter와 imported package path를 다시 확인한다.
- Session 1은 agents-cli `1.2.1`과 installed Google Skills `1.2.1`을
  `compatible_with_corrections`로 accepted했다. Candidate `1.3.1`은 generated dependency
  ranges가 exact ADK 2.4/A2A 0.3 baseline을 제외하므로 rejected다.
- Session 2 Google Skill tree digest lock은 workflow
  `83dea9d79fe84b2c79d8323fdddbe493e040be2c1ebb3a0a365aef266f445c31`,
  scaffold `fc3c18e81027108e18338617d105ef31c2e98821736a5b7d2b37508990240d2f`,
  adk-code `e67352cc574bcea3017e3e03a6247c3b033be7929087b119a7e987914cb48e9f`,
  eval `37c2d1659016791608630fb402b67cceb51f61aa8953804ea7347e4fc7081fc9`다.
  Session 1 manifest가 이 version/digest와 detector correction의 authority다.
- Google agents-cli의 deploy, cloud publish, cloud observability 기능은 제품 고려사항이
  아니며 required Skill coverage에서 제외한다.
- runtime 중 승인된 Tailscale model transport 외 Skill marketplace, GitHub, package index,
  cloud documentation, Internet 또는 외부 model API에 접속하는 정상 경로를 만들지 않는다.
  Cloud model과 Gemini fallback은 금지한다.
- Google 공식 Skill과 AF Skills vNext는 offline 환경에 들어가기 전에 version/digest가 고정된
  bundle로 준비하고, Companion은 App cwd에서 그 local bundle을 확인한다.
- dependency 설치가 필요하면 approved local wheel/package cache, prebuilt environment 또는
  내부에서 이미 제공된 경로만 사용한다. 정확한 공급 방식은 별도 contract에서 결정한다.
- local Asset Registry의 `publish` lifecycle은 cloud agent publish와 다른 repository-local
  기능이므로 기존 사용자 승인 계약을 유지한다.

고정된 local model과 bounded context를 전제로 Skill과 task를 설계한다.

- 한 task에는 하나의 주 intent와 필요한 최소 Skill만 넣는다.
- 긴 자유 형식 배경 대신 stable field, 짧은 단계, exact path와 output schema를 사용한다.
- parsing, validation, digest, file inventory와 반복 가능한 변환은 model prompt가 아니라
  deterministic script/core가 소유한다.
- 전체 Registry나 Graph를 넣지 않고 selection과 필요한 bounded neighborhood만 제공한다.
- ambiguous 상태는 model이 추측하지 않고 typed blocker 또는 한 질문으로 반환한다.
- Session 2 acceptance는 다른 model fallback 없이 실제 self-hosted
  `qwen3.6-27b-128k` Tailscale direct 경로에서 수행하고
  **self-hosted-27B Session 2 acceptance**로 기록한다.

### ADK 2.4 framework fact의 evidence 순서

Agent Factory taxonomy·Graph·review authority는 canonical product 문서와 current repository
source가 소유한다. ADK API와 runtime behavior만 다음 순서로 판정한다.

1. exact ADK 2.4.0 minimal probe와 representative runtime test
2. 같은 interpreter가 import하는 installed source, signature와 validator
3. ADK Docs MCP query와 fetched page
4. installed Google agents-cli Skill guidance
5. 기존 AF card, 오래된 문서와 model memory

ADK Docs MCP는 offline 환경에서 허용된 documentation evidence surface다. `list_doc_sources ->
fetch_docs(llms.txt) -> relevant page` 순서로 조회하고 fetch가 실패하면 Web으로 우회하지 않는다.
Docs, Skill, source와 runtime이 다르면 차이를 숨기지 않고 exact query, source symbol,
positive/negative probe와 적용 범위를 보존한다. 해결되지 않은 사실은 `unverified` 또는
Blocker다.

### Workflow·Agent·Sub-agent 실험 범위

AF Skills vNext는 loop·parallel·dynamic 세 pattern만 검증하고 완료하지 않는다. Exact ADK 2.4
source, Docs MCP와 Google Skill을 사용해 capability inventory를 만든 뒤 다음 전체 기능군의
positive/negative, high-risk interaction과 compound topology를 실험한다.

- root Agent/Workflow, coordinator/delegation, nested Sub-agent, Agent-as-tool와 custom orchestration
- sequential/parallel/loop 계열과 explicit Graph route/fan-out/Join/cycle/dynamic scheduling
- Function/MCP/Agent-selected Tool과 Invocation Control
- state, Session, Event commit, Artifact, replay/rewind와 local memory/context
- callback, Plugin, guardrail, error propagation
- Human Input/confirmation, pause/resume, restart, retry/cancel과 idempotency
- existing Subworkflow와 local A2A success/input-required/failure
- structured output, local model adapter, context pressure와 unsupported API refusal

Cloud-only 기능도 inventory에서 누락하지 않지만 evidence를 근거로 제외하고 실행하지 않는다.
Session 1은 고정 시간이나 seed 목록이 아니라 두 번 연속 coverage audit에서 새 high/medium-risk
누락이 없는 evidence saturation gate로 끝낸다.

## 3. 확정된 제품 결정

### 외부 Codex가 개발 실행을 소유한다

- Primary 실행 경로는 App source root에서 동작하는 Codex CLI 또는 Codex VS Code
  extension이다.
- Companion Browser는 대화 UI나 source editor를 복제하지 않는다.
- 독립 `app-server-client`는 유지할 수 있지만 Browser가 thread·turn을 직접 소유하는 경로는
  이 목표의 선행조건이 아니다. 필요성이 증명될 때 후속 선택지로 검토한다.

### Google 공식 Skill과 AF Skill을 계층적으로 사용한다

- 모든 ADK 개발 작업은 `google-agents-cli-workflow`를 lifecycle entrypoint로 사용한다.
- offline 개발에 필요한 scaffold, code, eval Skill은 실제 작업 단계에 맞는 것만 명시적으로
  호출한다.
- deploy, cloud publish, cloud observability Skill은 이 환경의 required set에 포함하지 않는다.
- Agent Factory 범위에서는 관련 AF Skills vNext를 함께 호출한다.
- “모든 Skill 사용”은 한 turn에 모든 Skill을 동시에 넣는다는 뜻이 아니라, 전체 lifecycle의
  각 작업에 필요한 Skill을 빠짐없이 명시적으로 사용하고 그 이력을 남긴다는 뜻이다.
- implicit description matching만 신뢰하지 않는다. Companion이 만드는 개발 작업에는 exact
  `$skill-name`과 기대 version 또는 digest를 포함한다.

### App Git root가 Graph와 runtime source를 함께 소유한다

- 하나의 managed App Git 저장소가 Companion Graph, exact Asset binding, 구현 mapping과
  하나 이상의 runtime source project를 함께 보존한다.
- `general-agent/` 같은 중첩 source project는 허용하지만 폴더 이름을 제품에 하드코딩하지
  않는다.
- App Manager는 최초 baseline commit만 만들며 이후 source·Graph 변경과 commit은 사용자
  또는 App에서 실행되는 Codex가 소유한다.
- local commit은 remote와 독립적이다. remote 생성과 push는 자동화하지 않는다.

### Graph와 구현 위치를 분리한다

- Graph IR은 실행 구조와 Asset reference를 소유한다.
- source file, Python module/symbol, test locator 같은 구현 정보는 Graph Node나 Edge에
  임의 field로 추가하지 않고 별도 implementation mapping에 둔다.
- Graph와 code의 자동 역추론은 첫 구현 범위가 아니다. 사용자가 연결한 exact locator를
  Companion이 검증하고 drift를 표시하는 경로부터 구현한다.

### 선택은 개발 문맥의 기준점이지 write 권한이 아니다

- 선택한 Node·Edge·Region은 개발 작업의 scope를 정하는 입력이다.
- source write는 사용자가 시작한 외부 Codex 작업과 명시된 write root가 권한 경계다.
- Graph write는 기존 revision-checked `get -> apply` 경계를 계속 사용한다.
- selection, cwd, Context 문서 자체는 review나 lifecycle authority를 부여하지 않는다.

### AF Skills vNext는 별도 작업이다

- 기존 `af-*` Skill 개편을 Companion product PR과 섞지 않는다.
- Google Skill의 ADK API·scaffold·coding·eval 지침을 복제하지 않는다.
- AF Skills vNext는 Graph, Asset reuse, exact binding, selected context, lowering,
  provenance와 Graph/source verification에 집중한다.
- Companion은 Skill 본문의 문장 구조가 아니라 versioned Skill interface/manifest에
  의존한다.

## 4. Target 계약

아래 이름과 shape는 계약 세션에서 source·validator와 함께 확정할 대상이다. 이 문서만으로
Current Implementation이라고 간주하지 않는다.

### App source project declaration

App manifest의 다음 revision은 최소한 아래 개념을 표현해야 한다.

```yaml
source_projects:
  - project_id: general-agent
    source_root: general-agent
    runtime: google-adk
    language: python
    package_manager: uv
    entrypoint: general_agent.agent:root_agent
    agents_cli_spec: general-agent/.agents-cli-spec.md
```

정확한 schema version, v1 compatibility, locator grammar와 attach/create API는
[Session 2](follow-ups/23-companion-adk-development/02-companion-integration.md)에서 결정한다.

### Skill lock과 readiness

App은 필요한 Google/AF Skill ID, version 또는 digest, compatibility를 고정할 수 있어야
한다. Companion은 최소한 `installed`, `discoverable_from_app`, `version_match`,
`digest_match`, `disabled`, `missing`, `offline_ready`를 구분해야 한다.

공식 Google Skill은 수정하거나 App마다 임의 복사하지 않는다. Google/AF bundle은 Internet이
있는 환경에서 exact version/digest로 준비한 뒤 offline package로 반입하고, Codex CLI와 VS
Code extension이 공통 탐색하는 local user Skill scope에 설치한다. online marketplace나
runtime download는 baseline이 아니다.

### Implementation mapping

별도 sidecar는 최소한 다음 관계를 표현해야 한다.

- Graph element ID 또는 exact Asset ref
- source project ID
- executable locator와 configuration locator
- 관련 test/eval locator
- mapping을 검증한 Graph revision과 Git commit
- missing, current, stale, conflict 같은 drift 상태를 계산할 근거

sidecar 이름, schema와 write ownership은 계약 세션에서 확정한다.

### Development Context Capsule

Companion이 만드는 검토 가능한 작업에는 최소한 다음이 포함돼야 한다.

- application과 source project
- base Git commit과 Graph revision
- 선택한 Graph element와 필요한 one-hop 주변 구조
- exact Asset version, contract hash, binding과 runtime contract
- 사용자 intent
- required Skill IDs와 명시적 invocation
- `offline: true`, local model profile과 허용된 local dependency source
- source write roots와 금지 범위
- acceptance와 verification commands

가칭 `companion_prepare_adk_task` 같은 read-only MCP 또는 기존 read surface 확장 중 어느
wire가 더 작은지는 계약 세션에서 결정한다. 선택에서 바로 source를 쓰는 Tool은 만들지
않는다.

## 5. Asset과 Graph 표현 경계

자산 유형은 [Taxonomy](taxonomy.md)의 Agent·Workflow·Tool 세 가지뿐이다.

- Existing local Agent는 project-local implementation locator 또는 exact Agent Asset으로
  연결한다.
- Remote Agent는 Agent Asset의 A2A Binding 또는 Exposure로 표현한다. A2A를 Node kind나
  별도 Asset category로 만들지 않는다.
- Existing Workflow는 Workflow Asset과
  [Subworkflow Node](graph-ir.md#subworkflow-node)로 연결한다. 하위 Workflow 내부 Node를
  부모 Graph에 복제하지 않는다.
- Existing Tool은 Tool Asset의 exact function 또는 MCP binding으로 연결한다.
- 아직 publish할 필요가 없는 코드는 project-only mapping으로 둘 수 있다. 재사용을 위해
  모든 local source를 억지로 Registry publish하지 않는다.

## 6. Current Implementation과 Gap

2026-08-05 PR #22 기준 snapshot이다. 새 세션은 source와 PR 상태를 다시 확인한다.

| 영역 | Current Implementation | Target gap |
| --- | --- | --- |
| App | Git baseline, App manifest v1, exact Asset binding, Graph와 presentation | source project와 runtime entrypoint가 manifest에 없음 |
| Git | Manager-owned 최초 local commit, remote/push 없음 | task base/result commit과 mapping evidence가 없음 |
| Graph | Node·Edge·Region 선택, revision-checked Web/MCP write | 선택을 source·Skill 작업으로 변환하지 않음 |
| Asset | search, exact binding, primary lifecycle UX | project-local implementation locator 연결이 없음 |
| Skill | App-local Codex MCP config | offline Skill bundle lock, discoverability, version readiness가 없음 |
| MCP | Graph workspace read와 Graph apply | 개발 작업 capsule read surface가 없음 |
| Source | 사용자가 별도로 source를 만들 수 있음 | App이 source project identity를 소유하지 않음 |
| Execution | VS Code convenience launch, 독립 App Server client | skill-aware external Codex handoff와 완료 evidence가 없음 |
| Verification | Companion typecheck/test/build와 수동 acceptance | GitHub CI, generated ADK eval, skill quality suite가 없음 |

## 7. Verification 전략

검증은 세 층을 섞지 않는다.

1. Companion CI는 typecheck, test, build와 관련 artifact validator로 deterministic product
   contract를 보호한다.
2. AF Skills vNext CI는 capability inventory, manifest, trigger/intent fixture, compatibility,
   framework probe와 산출물 계약을 검증한다.
3. generated App acceptance는 승인된 Tailscale model transport 외 network를 차단한 상태에서 import/lint/unit,
   `agents-cli info`, local runtime smoke, local `agents-cli eval`, Subworkflow 또는 A2A
   contract를 실제 App source root와 self-hosted `qwen3.6-27b-128k` 경로에서 검증한다.

local model process가 필요한 eval은 deterministic required GitHub check와 분리해 offline
acceptance evidence로 기록한다. 테스트 통과는 Skill을 실제로 사용했다는 완전한 증명이
아니므로, task에 요청된 Skill, completion receipt와 output quality evidence를 구분해 기록한다.
Internet이 우연히 열려 있어야만 PASS하는 test나 runtime은 offline readiness 실패다.

## 8. 우선순위와 명시적 비범위

첫 end-to-end 기본 순서는 Existing Workflow를 Subworkflow로 재사용하는 slice다. 이 slice는
Asset binding, Graph 시각화, selection, Skill handoff, source generation, mapping, eval과
local Git을 한 번에 검증하면서 A2A transport 변수를 피할 수 있다. A2A slice는 그 다음이다.

다음은 이 핵심 루프의 선행조건이 아니다.

- Browser가 Codex App Server thread/turn을 직접 소유하는 기능
- React Flow 전환이나 고급 pan/zoom/layout
- arbitrary source-to-Graph reverse engineering
- legacy Work Item/Graph 자동 migration
- remote 생성, push, cloud deployment·publish·observability
- runtime Skill/package download와 외부 model fallback

구현 순서와 세션별 완료 계약은
[Companion ADK 개발 프로그램](follow-ups/23-companion-adk-development-program.md)을 따른다.
AF Skill 본문과 배포 변경은
[AF Skills vNext 프로그램](follow-ups/24-af-skills-vnext-program.md)에서만 수행한다.
