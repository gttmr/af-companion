# 24. AF Skills vNext — Session 1 설계와 evidence 범위

상태: **planned — two-session 프로그램의 Session 1**

작성일: 2026-08-05 KST

제품 결정: [Companion의 skill-aware ADK 개발 컨텍스트](../companion-adk-development-context.md)

실행 지시: [Session 1 — ADK 2.4 evidence 기반 AF Skills vNext](23-companion-adk-development/01-af-skills-vnext.md)

## 목적

현재 다섯 `af-*` Skill을 Google 공식 `google-agents-cli-*`와 중복되지 않는 versioned Agent
Factory overlay로 다시 설계한다. AF Skills vNext는 Companion이 제공한 exact Graph·Asset·source
context를 소비해 ADK source 작업을 안내하고, 결과의 Graph/source provenance와 검증을
보강한다.

이 문서는 별도 fresh session들을 추가하지 않는다. Capability 조사, 실험, Skill 구현과
distribution은 모두 [Session 1 work order](23-companion-adk-development/01-af-skills-vnext.md)의
checkpoint다. Companion package code, UI, App manifest와 MCP 구현은 Session 2가 소유한다.

## Primary 환경 제약

- 실제 사용 환경은 Internet이 없다.
- 기준 local LLM은 사용자 제공 값 `qwen3.6-small`이다.
- exact framework baseline은 `google-adk==2.4.0`이며 supported line은
  `google-adk[a2a,mcp]>=2.4.0,<2.5.0`이다.
- Session 1 전에 외부 설치되는 agents-cli `1.3.1`은 candidate toolchain이다. 이전 `1.2.1`
  evidence만으로 승인하거나 거부하지 않고 installed CLI/source/Skill bundle을 Session 1에서
  별도 판정한다.
- ADK Docs MCP는 허용된 documentation evidence surface지만 fetch 실패 때 Web으로 우회하지
  않는다.
- deploy, cloud publish, cloud observability는 route, coverage와 acceptance에서 제외한다.
- Google 공식 Skill, AF Skill, agents-cli/ADK dependency와 references는 offline 환경에 들어오기
  전에 exact version/digest bundle로 준비한다.
- Skill은 strong cloud model의 장문 추론을 전제하지 않는다. 한 task/주 intent, bounded input,
  짧은 ordered step, exact output schema와 deterministic helper를 사용한다.

## 현재 문제

현재 Skill tree는 다음 lifecycle을 소유한다.

- `af-workflow`
- `af-discover-assets`
- `af-compose-solution`
- `af-scaffold-runtime`
- `af-verify-runtime`

이 구조는 strict Work Item v2, review, Runtime Handoff와 generator 중심의 기존 Agent Factory
lifecycle에 맞춰져 있다. 새 primary Companion의 App·selection·project-local source 경로와
Google 공식 scaffold/code/eval lifecycle을 그대로 표현하지 못한다.

기존 Skill을 즉시 삭제하거나 Companion PR에서 부분 patch하지 않는다. vNext contract와
acceptance가 준비될 때까지 Current Implementation으로 보존한다.

## 역할 경계

| Google 공식 Skill | AF Skills vNext |
| --- | --- |
| ADK project lifecycle entrypoint | Agent Factory scope와 task routing |
| scaffold와 package layout | App/Graph/Asset/source context 검증 |
| ADK Agent·Sub-agent·Tool·callback·state API | selected Node·Edge·Region의 exact lowering 및 evidence guard |
| 일반 unit과 local eval | exact Asset reuse, provenance와 Graph/source drift |

AF Skill은 Google Skill의 current ADK API 설명이나 command flag를 복사하지 않는다. 필요한
Google Skill ID와 compatibility만 명시하고 해당 Skill을 함께 호출한다. 다만 Google guidance가
exact ADK 2.4 source/runtime와 다르면 재현 가능한 correction evidence와 version guard를 제공한다.

## ADK 2.4 fact 판정 계약

Framework fact 하나마다 다음 순서를 사용한다.

1. exact ADK 2.4.0 minimal probe와 representative runtime
2. 같은 interpreter의 installed source, signature와 validator
3. ADK Docs MCP query와 fetched page
4. installed Google agents-cli Skill guidance
5. 기존 AF card, 오래된 문서와 model memory

이 순서는 Agent Factory taxonomy·Graph enum·review authority를 바꾸지 않는다. Docs, Skill과
runtime이 다르면 차이를 숨기지 않고 source locator, exact query, positive/negative probe와
적용 범위를 evidence packet으로 남긴다. 판정할 수 없으면 `unverified` 또는 Blocker다.

## Workflow·Sub-agent 전반의 실험 범위

Session 1은 `loop`, `parallel`, `dynamic` 세 pattern을 검증하고 끝내지 않는다. Exact ADK 2.4
source, Docs MCP와 Google Skill에서 capability inventory를 만든 뒤 다음 기능군 전체를
positive/negative/interaction/compound 실험 대상으로 삼는다.

- Agent root, Workflow root, coordinator/delegation, nested Sub-agent, Agent-as-tool/transfer,
  custom agent와 mode/topology constraints
- Sequential/Parallel/Loop 계열 Workflow Agent의 2.4 status와 explicit Graph 대안
- Graph sequence, routing, fan-out/fan-in, Join, cycle, dynamic scheduling, nested Workflow,
  Human Input와 retry
- Function/MCP/Agent-selected Tool, confirmation, timeout, duplicate side effect와 Invocation Control
- state scope, Event commit, Session, Artifact, replay/rewind, local memory와 context behavior
- agent/model/tool callback, Plugin order, short-circuit, validation와 error propagation
- pause/resume, cancellation, restart, retry/fallback와 idempotency
- existing Subworkflow, local A2A success/input-required/failure와 protocol boundary
- structured output, local `qwen3.6-small` adapter, context pressure와 unsupported API refusal

Managed/cloud-only, online Tool과 external service feature도 inventory에서 누락하지 않는다. 실행
환경과 맞지 않으면 evidence를 근거로 `excluded_cloud`, `optional_local` 또는 `unsupported`로
분류하고 cloud 호출은 하지 않는다.

상세 coverage, 최소 다섯 compound topology, 위험 기반 pairwise matrix와 evidence saturation
gate는 [Session 1 work order](23-companion-adk-development/01-af-skills-vnext.md)가 소유한다.

## “모든 Skill 사용” 계약

- 모든 ADK 작업은 Google workflow entrypoint를 요청한다.
- offline 개발 phase에 필요한 scaffold, code, eval Google Skill과 AF Skill만 task에 추가한다.
- 프로젝트 전체 evidence는 scaffold, code와 local eval coverage를 기록한다.
- deploy, cloud publish, cloud observability Skill은 호출하거나 missing으로 보고하지 않는다.
- Skill 설치·요청·self-report와 결과 품질 evidence를 서로 다른 사실로 기록한다.
- `qwen3.6-small`에는 한 번에 하나의 primary intent와 필요한 reference만 전달한다.

## Skill 구조

- machine-readable manifest가 Skill ID, version/digest, intent, input/output, required Google Skill,
  ADK compatibility, offline/model profile을 제공한다.
- core `SKILL.md`는 routing, evidence order, stop conditions와 output contract만 간결하게 둔다.
- Agent/Sub-agent, Workflow, Tool, state/event, lifecycle와 protocol facts는 one-level
  `references/`에 분리한다.
- version/source probe, Docs MCP query capture, path/hash validation, evidence inventory와 output
  checks는 deterministic `scripts/`가 소유한다.
- 상세 실험 transcript나 평가 answer를 Skill 폴더에 넣지 않고 isolated evidence suite에 둔다.
- 일반 ADK 요청은 AF scope로 강제하지 않고 explicit Agent Factory context가 있을 때만 overlay를
  활성화한다.

## 완료 조건

- exact ADK 2.4 capability inventory의 모든 row가 evidence 있는 status로 닫혔다.
- agents-cli 1.3.1과 installed Google Skill bundle의 compatibility/correction/rollback evidence가
  확정됐다.
- 모든 required Workflow·Agent·Sub-agent 기능군에 positive와 negative/failure evidence가 있다.
- high-risk interaction과 최소 다섯 compound topology가 실제 runtime에서 재현된다.
- agents-cli, Docs MCP와 source/runtime 비교 protocol이 최소 다섯 source-comparison probe로
  검증된다.
- selected Node·Edge·Region과 exact Asset/source context를 소비하는 bounded workflow가 있다.
- unsupported, stale Graph, missing decision/Asset/source와 write-root drift를 fail closed한다.
- Codex CLI와 VS Code extension이 App cwd에서 같은 vNext bundle을 발견할 수 있고 Companion이
  version/digest readiness를 판정할 interface가 준비됐다.
- network-disabled local `qwen3.6-small`에서 Agent/Sub-agent, Graph, Tool, state/lifecycle와 local
  reuse 대표 task가 통과한다.
- 두 번 연속 coverage audit에서 새 high/medium-risk 누락이 없고 independent review가
  capability→evidence→Skill 연결을 확인한다.

## 비범위

- Google 공식 Skill fork 또는 AF Skill tree로의 내용 복제
- Companion UI/API/MCP implementation
- deploy, cloud publish, cloud observability
- runtime online install, external docs/model fallback
- legacy Work Item data migration
- Skill 사용 여부만으로 generated code 품질을 PASS 처리
