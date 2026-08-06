# Session 1. ADK 2.4 evidence 기반 AF Skills vNext

상태: **planned — full capability campaign**

Master: [2-session 프로그램](../23-companion-adk-development-program.md)

설계 기준: [AF Skills vNext 프로그램](../24-af-skills-vnext-program.md)

## 이 session의 한 가지 결과

ADK 2.4로 구현할 수 있는 Workflow·Agent·Sub-agent 실행 표면을 먼저 전수 조사하고, 각
capability의 지원 조건과 실패 경계를 재현 가능한 evidence로 확정한다. 그 결과를 사용해
agents-cli guidance, ADK Docs MCP, exact ADK 2.4 source와 runtime 결과가 충돌해도
`qwen3.6-small`이 추측하지 않고 올바른 pattern을 선택하는 AF Skills vNext bundle을 완성한다.

`sequential`, `parallel`, `loop`, `dynamic`은 최소 seed일 뿐 실험 범위의 상한이 아니다.
Companion package, App manifest, Graph UI와 MCP product code는 이 session에서 수정하지 않는다.

사용자는 이 session에 하루 전체를 사용해도 좋다고 승인했다. 속도나 고정 실험 개수로
종료하지 않고 아래 coverage와 evidence saturation gate로 종료한다.

## 시작 gate

다음 evidence를 먼저 보고하고 하나라도 충족되지 않으면 Skill 문구를 쓰기 전에 해결한다.

1. clean dedicated branch/worktree와 exact base commit
2. selected Python의 exact `google-adk==2.4.0`, installed package path와 relevant source
3. `requirements/adk-runtime.txt`의 supported range
4. installed agents-cli version과 Google Skill bundle path/digest. 사용자가 session 시작 전에
   `1.2.1`에서 `1.3.1`로 외부 upgrade할 예정이므로 `1.3.1`을 자동 승인하지 않고 아래
   version-transition gate로 판정
5. ADK Docs MCP `list_doc_sources` 성공과 `AgentDevelopmentKit` source
6. local `qwen3.6-small` runtime readiness와 external model fallback 비활성
7. test/evidence output root가 evaluator answer를 model에 노출하지 않는 isolation boundary

ADK Docs MCP가 URL을 반환해도 target environment에서 `fetch_docs`가 실제 내용을 제공하는지
검증한다. 실패하면 Web search로 우회하지 않고 Docs evidence를 `unavailable`로 기록한다.
current worktree에 ADK 2.4가 없으면 임의 Python의 결과를 사용하지 말고 approved offline
environment 또는 local package cache를 식별한다.

## agents-cli 1.3.1 version-transition gate

Session 1이 compatibility의 유일한 판정자다. 이 planning 문서와 이전 `1.2.1` evidence는
`1.3.1`이 호환되거나 비호환이라는 결론을 미리 내리지 않는다.

Skill wording이나 experiment harness를 수정하기 전에 다음을 수행한다.

1. `which agents-cli`, `agents-cli --version`, `agents-cli info --json`, imported package path와
   package metadata를 기록한다.
2. 설치된 Google Skill 각각의 metadata version, required CLI range, source path와 digest를
   기록한다. CLI만 `1.3.1`이고 Skill이 `1.2.1`이면 혼합 상태로 분류하고 자동 사용하지 않는다.
3. repository의 previous `1.2.1` evidence와 current installed `1.3.1`의 local `--help`, relevant
   command source, scaffold/eval contract와 Skill guidance를 비교한다. Internet release note를
   availability requirement로 만들지 않는다.
4. `google-adk==2.4.0` interpreter와 agents-cli tool environment를 분리해 확인한다. CLI upgrade가
   ADK baseline upgrade를 승인하거나 의미하지 않는다.
5. Session 1 experiment harness에 영향을 주는 command, default, concurrency, output schema,
   scaffold/eval behavior와 Skill routing 변화만 positive/negative probe로 재검증한다.
6. 결과를 `compatible`, `compatible_with_corrections`, `blocked` 중 하나로 판정하고 exact
   CLI/Skill version과 digest, correction과 rollback 조건을 evidence index에 남긴다.

`compatible` 또는 evidence-backed `compatible_with_corrections` 판정 전에는 capability campaign과
AF Skills vNext final wording으로 진행하지 않는다. `blocked`면 1.2.1로 임의 rollback하지 말고
필요한 사용자 결정과 재현 evidence를 보고한다.

## 필수 읽기

- `.agents/skills/AGENTS.md`
- `.agents/skills/_shared/source-of-truth.md`
- `.agents/skills/_shared/runtime-pattern-selection.md`
- `.agents/skills/_shared/testing-contract.md`
- `.agents/skills/_shared/adk/*.md`
- current five `af-*` `SKILL.md`와 직접 연결된 references
- installed `google-agents-cli-workflow`, `scaffold`, `adk-code`, `eval` Skill과 직접 연결된 references
- `tests/skills/evidence/codex/E1-rule-conflict/**`
- `tests/skills/evidence/research/r1-adk-package-check.md`
- `scripts/adk-source-test/target-behavior-matrix.test.mjs`

기존 evidence와 reference는 조사 시작점이지 current PASS가 아니다. exact current commit과
ADK 2.4.0에서 다시 판정한다.

## 1단계 — capability inventory를 먼저 만든다

실험 목록을 문서 작성자의 기억으로 고정하지 않는다. 다음 네 surface를 독립적으로 조사한다.

1. exact ADK 2.4.0 package의 public exports, signatures, validators와 runtime services
2. ADK Docs MCP의 `llms.txt`와 관련 page
3. installed Google agents-cli Skill의 ADK Python·Workflow references
4. 현재 AF shared ADK cards, generator capability와 regression fixtures

각 발견 항목을 machine-readable inventory와 사람이 검토할 index에 기록한다.

| field | 의미 |
| --- | --- |
| `capability_id` | stable experiment routing ID |
| `family` | Agent topology, Graph Workflow, Tool, State, lifecycle 같은 기능군 |
| `framework_symbols` | exact ADK 2.4 import/signature/validator locator |
| `docs_evidence` | MCP query/page/checked time |
| `google_skill_evidence` | Skill version/digest와 reference locator |
| `af_surface` | AF card, Graph/lowering/generator locator 또는 gap |
| `offline_class` | `required`, `optional_local`, `excluded_cloud`, `unsupported`, `unknown` |
| `risk` | correctness·side effect·resume·concurrency 관점의 high/medium/low |
| `experiment_ids` | positive/negative/interaction/compound run 연결 |
| `status` | `confirmed`, `corrected`, `unsupported`, `blocked`, `unverified` |

Inventory는 최소 아래 기능군을 훑되, exact source/docs에서 발견한 추가 기능을 누락하지 않는다.

### A. Agent와 Sub-agent topology

- single `LlmAgent` baseline, instruction와 typed input/output
- root Agent와 root Workflow 선택
- coordinator와 여러 Sub-agent의 delegation/transfer
- Agent를 Tool처럼 호출하는 pattern과 ordinary Sub-agent delegation의 차이
- sequential, parallel, loop 계열 Workflow Agent의 ADK 2.4 지원·deprecation·권장 대안
- nested hierarchy, sibling isolation, duplicate name와 recursive/self delegation
- `single_turn`, `chat`, `task` 같은 mode가 topology에 주는 제약
- custom `BaseAgent` 또는 custom orchestration
- factory로 만든 Sub-agent의 identity, closure와 state isolation

### B. Explicit Graph와 Dynamic Workflow

- sequential edge, conditional route, default와 invalid route
- fan-out/fan-in, explicit Join, multiple incoming edge의 실제 의미
- static routed cycle, bounded iteration와 unconditional cycle rejection
- runtime node selection, `ctx.run_node` 계열 API와 dynamic scheduling
- Function, Agent, Tool, Human Input, Join과 output Node 조합
- nested Workflow/Subworkflow와 parent-child input/output mapping
- retry configuration, reachability, serialization와 Graph validation
- parallel worker나 map-style processing이 ordinary fan-out과 다른 경우

### C. Tool 실행과 Invocation Control

- Function Tool, Workflow-fixed function, Agent-selected Tool의 경계
- Agent-as-tool이 exact 2.4에서 지원될 경우 입력·출력·error contract
- local stdio MCP Tool, exact tool filtering와 unavailable server
- Tool confirmation/Human approval의 pause·resume
- Tool callback, timeout, retry, duplicate side effect와 idempotency
- OpenAPI, authentication, built-in Tool은 offline 사용 가능성부터 분류

### D. State, Session, Event, Artifact와 Memory

- session/user/app/invocation scope state와 key collision
- Event action commit timing, partial/final event와 failure 전후 state
- Artifact save/load/version, missing artifact와 concurrent update
- SessionService와 invocation/session identity, rewind/replay가 실제 제공될 경우 그 의미
- memory, context cache와 compaction은 local 지원 여부와 Sub-agent context 전달을 판정
- parent/child, parallel branch와 resumed invocation 사이의 state isolation/merge owner

### E. Callback, Plugin과 guardrail

- agent/model/tool callback의 order, short-circuit와 returned value
- Plugin과 agent-level callback의 ordering
- callback/tool/model error가 Workflow와 downstream state에 미치는 영향
- validation, redaction와 policy guardrail을 deterministic code로 둘 경계
- callback에서 발생한 state/artifact action의 commit과 replay

### F. 중단, 재개와 실패 semantics

- Human Input 또는 tool confirmation pause/resume
- task-mode input-required가 exact 2.4에서 지원되는 경우 그 resume path
- cancellation, timeout, retry, fallback와 partial failure
- restart 뒤 resume, already-completed Node replay와 duplicate event
- bounded loop exhaustion, dynamic dispatch failure와 typed terminal result
- side effect가 있는 작업의 at-most-once/idempotent contract

### G. 재사용과 local protocol boundary

- local existing Agent, Workflow/Subworkflow와 Tool import
- local A2A provider/consumer, Agent Card health와 semantic readiness
- A2A success, input-required/resume, timeout, malformed result와 remote failure
- parent Workflow에 child internals를 복제하지 않는 reuse
- A2UI, ambient agent와 Managed Agent는 inventory에 넣되 offline ADK 개발과 관계없는 cloud,
  server-hosted 또는 extra-service dependency면 `excluded_cloud`/`optional_local`로 명시한다.

### H. Model·schema와 small-model behavior

- structured input/output와 Tool 사용의 실제 compatibility
- model adapter/LiteLLM을 통한 local `qwen3.6-small` call boundary
- malformed structured output, context overflow와 retry
- instruction/state injection, Sub-agent context 최소화와 result normalization
- unsupported API hallucination, stale guidance와 ambiguous pattern 선택 거부

Cloud deploy, cloud publish, cloud observability와 외부 Web 호출은 inventory에서 명시적으로
`excluded_cloud`로 분류하고 실행하지 않는다. 분류는 누락이 아니라 evidence가 있는 제외다.

## Framework evidence protocol

ADK API·runtime claim 하나마다 다음 순서로 조사한다.

1. 질문을 한 문장으로 고정한다.
2. installed agents-cli Skill에서 guidance와 exact file/digest를 기록한다.
3. ADK Docs MCP에서 `list_doc_sources -> fetch_docs(llms.txt) -> relevant page` 순서로 조회하고
   query/page/checked time/요약을 기록한다.
4. exact installed ADK 2.4.0 source symbol, signature와 validation code를 찾는다.
5. 최소 negative/positive probe를 exact interpreter에서 실행한다.
6. 실제 제품 topology를 축소한 representative runtime test를 실행한다.
7. 결과를 `confirmed`, `version-specific correction`, `docs conflict`, `agents-cli conflict`,
   `unsupported`, `unverified` 중 하나로 판정한다.
8. Skill에는 confirmed한 가장 좁은 조건만 쓰고 conflict와 unsupported는 explicit guard 또는
   Blocker로 남긴다.

ADK framework fact의 판정 우선순위는 exact runtime probe → installed 2.4 source → Docs MCP →
agents-cli guidance다. nondeterministic model output만 관찰한 probe는 framework contract evidence로
승격하지 않는다. Product taxonomy나 Graph enum은 이 순서로 바꾸지 않고 canonical Agent Factory
문서를 따른다.

기존 `source-of-truth.md`가 official docs와 installed source의 순서를 모호하게 표현하면 이
session에서 ADK 2.4-specific hierarchy를 명확히 고친다.

## 2단계 — inventory에서 실험을 파생한다

고정 W0–W7을 완료했다고 멈추지 않는다. 모든 `required`와 high/medium-risk `optional_local`
capability마다 다음 test layer를 만든다.

1. **symbol probe** — import/signature/validator와 invalid construction
2. **deterministic unit** — model 없이 input/output, event, state와 error를 확인
3. **representative runtime** — Runner/Session/Artifact/Workflow를 실제 topology로 실행
4. **negative/failure** — invalid input, unsupported composition, timeout, cancellation 또는 dependency
   unavailable 중 해당 사례
5. **interaction** — 다른 capability와 결합했을 때 ownership·commit·resume를 확인
6. **small-model forward** — 실제 code-generation 판단이 필요한 대표 사례를
   `qwen3.6-small`에서 fresh run

Framework 자체에 없는 기능은 억지 fixture를 만들지 않는다. source/probe와 함께
`unsupported`로 닫고 AF Skill이 해당 요청을 Blocker나 검증된 대안으로 안내하는지 테스트한다.

### 최소 seed experiments — 상한이 아님

| family | 반드시 포함할 독립 실험 |
| --- | --- |
| Agent topology | single root, coordinator→specialist delegation, nested Sub-agent, Agent-as-tool/transfer 비교, recursive·duplicate identity rejection |
| Workflow Agent | Sequential/Parallel/Loop 계열 각각의 2.4 status, ordering/concurrency/termination, explicit Graph 대안 비교 |
| Graph | sequence, route/default, fan-out/Join, incoming OR-vs-AND, routed cycle, unreachable/unconditional cycle, dynamic dispatch |
| Tool | fixed Function, Agent-selected Function Tool, local MCP, confirmation, Tool error/timeout/duplicate side effect |
| State/Event | scope별 state, partial/final commit, parent-child visibility, parallel collision, failure-before-commit |
| Artifact/Memory | artifact producer/consumer/version/missing, replay, local memory/context 전달과 unavailable service |
| Callback/Plugin | execution order, short-circuit, state delta, Tool/model error와 downstream suppression |
| Pause/Resume | Human Input, confirmation, restart/re-entry, completed-work replay 방지, stale/duplicate response |
| Reuse/A2A | local Subworkflow, local A2A success/input-required/timeout/malformed result, health-vs-readiness |
| Model/schema | structured output+Tool, malformed output, qwen context limit, unsupported symbol refusal |

### 위험 기반 pairwise interaction

최소 다음 조합은 각 독립 실험과 별도로 실행한다.

- Sub-agent delegation × state/context isolation
- Sub-agent 또는 Agent Tool × structured output/error propagation
- parallel branch × shared state/artifact collision
- parallel branch × one-branch timeout/failure × Join
- bounded loop × side-effect idempotency × resume
- dynamic dispatch × nested Workflow × unsupported target
- Human Input/confirmation × restart × duplicate response
- callback/plugin × Tool error × event commit
- retry/cancellation × external local MCP/A2A side effect
- Subworkflow × parent-child state/artifact mapping
- session rewind/replay가 지원될 경우 × callback/artifact side effect
- context compaction가 지원될 경우 × Sub-agent handoff completeness

Inventory review에서 high-risk 상호작용이 추가로 발견되면 이 목록보다 우선한다.

### 복합 Workflow 실험

최소 다섯 개의 서로 다른 compound topology를 만든다. 하나의 거대 fixture로 합쳐 coverage를
주장하지 않는다.

1. coordinator가 둘 이상의 specialist Sub-agent를 선택하고 deterministic aggregator가 결과를
   병합하는 topology
2. explicit Graph fan-out/Join 뒤 Agent 또는 Tool 단계가 state/artifact를 소비하는 topology
3. bounded loop 안의 Tool side effect와 Human Input/confirmation을 pause/resume하는 topology
4. parent Workflow가 existing Subworkflow를 호출하고 local A2A Agent failure를 typed fallback으로
   처리하는 topology
5. dynamic node selection이 typed output, callback guardrail과 terminal result를 결합하는 topology

Exact ADK 2.4가 위 조합의 일부를 지원하지 않으면 조용히 단순화하지 않는다. unsupported
evidence와 가장 가까운 supported decomposition을 각각 남긴다. 추가 실험이 기능군 coverage를
높이면 다섯 개를 넘겨 계속한다.

### source conflict stress

서로 다른 source를 비교하는 conflict probe를 최소 다섯 개 수행한다. known
`output_schema`/Tool guidance 같은 기존 사례는 current version에서 재현하고, 나머지는 inventory의
실제 불일치 후보에서 고른다. 충돌이 없으면 만들지 말고 `agreement`로 기록한다.

각 conflict probe는 다음을 검증한다.

- `qwen3.6-small`이 먼저 본 guidance를 맹목적으로 따르지 않는가
- exact source symbol과 positive/negative runtime probe를 찾는가
- product convention과 framework requirement를 구분하는가
- 해결되지 않은 차이를 `unverified`로 남기는가
- correction이 해당 version과 조건 밖으로 과잉 일반화되지 않는가

## Evidence 보존 계약

현재 `testing-contract.md`의 seven-file behavioral run layout을 유지한다. Capability inventory,
framework conflict와 experiment마다 최소한 다음 사실을 그 layout에 넣거나 validator가 허용하는
별도 research evidence로 연결한다.

- capability/experiment/question ID와 hypothesis
- repository commit, Python path, exact ADK/agents-cli/Skill/model versions와 digests
- ADK Docs MCP source, query, fetched page와 checked time
- agents-cli guidance locator
- installed source path, stable symbol/signature와 relevant source digest
- positive/negative probe와 representative topology commands, exit code와 bounded output
- Graph/contract fixture와 generated/handwritten source tree
- `qwen3.6-small` prompt, selected Skills/references와 output
- source 간 agreement/conflict matrix
- final decision, scope, unsupported cases와 remaining uncertainty

Raw tokens, private endpoint, full terminal transcript와 evaluator answer는 저장하지 않는다. 평가
agent가 rubric/expected answer를 읽은 run은 `unverified`다.

## Skill 설계와 구현

Capability inventory와 high-risk deterministic evidence가 review되기 전에 최종 Skill wording을
확정하지 않는다.

1. sufficient한 Skill ID/trigger map을 정한다. 기존 다섯 ID를 관성으로 유지하거나 무조건
   늘리지 않는다.
2. Google workflow/scaffold/adk-code/eval Skill은 offline base로 명시하되 내용을 복제하지
   않는다.
3. core `SKILL.md`는 routing, evidence protocol, stop condition만 두고 500 lines 아래로 유지한다.
4. Agent/Sub-agent, Graph, Tool, state/event, lifecycle와 protocol detail은 one-level
   `references/`로 분리하고 필요한 card만 load한다.
5. version/source/MCP query, path/hash validation, evidence inventory와 output checks는 반복 prompt
   대신 deterministic `scripts/`로 만든다.
6. Skill 하나의 task에는 primary intent 하나, bounded Graph neighborhood와 exact output schema만
   전달한다.
7. conflict를 발견하면 model이 조용히 한 source를 선택하지 않고 evidence packet과 판정을
   반환하도록 한다.
8. deploy, cloud publish, cloud observability, online install과 strong-model fallback을 넣지 않는다.
9. Skill manifest는 version/digest, intent, required Google Skills, input/output, compatibility,
   offline/model profile을 제공한다.

`skill-creator` 원칙에 따라 상세 실험 결과는 Skill 폴더의 auxiliary README가 아니라 test
evidence에 둔다. Runtime 판단에 필요한 간결한 사실만 references/scripts로 이동한다.

## Forward testing

최종 평가는 isolated fresh runs에서 실제 `qwen3.6-small`을 사용한다.

- should-trigger와 should-not-trigger
- Agent/Sub-agent, explicit Graph, Tool, state/artifact, callback/lifecycle, Subworkflow/A2A 기능군별
  최소 한 대표 prompt
- 최소 다섯 compound topology의 design/code/review prompt
- agents-cli guidance와 AF reference가 의도적으로 다른 conflict probe
- Docs MCP unavailable와 exact source symbol missing case
- context budget 초과 시 bounded subtask 또는 typed Blocker
- write-root escape와 unsupported API refusal

Expected answer, suspected bug와 intended fix를 test model에 전달하지 않는다. 강한 model에서만
PASS하고 `qwen3.6-small`에서 실패하면 완료가 아니다. 실패 원인이 context 과다이면 Skill을 더
짧게 분리하거나 deterministic helper로 옮긴 뒤 다시 forward-test한다.

## Checkpoint와 change-set 경계

한 session 안에서 아래 checkpoint를 순서대로 진행한다.

1. agents-cli 1.3.1 version-transition 판정, capability inventory와 experiment/evidence schema review
2. 기능군별 symbol probe와 deterministic positive/negative evidence
3. risk-based pairwise interaction과 최소 다섯 compound topology
4. source conflict stress와 evidence hierarchy correction
5. Skill interface와 concise references/scripts 구현
6. isolated `qwen3.6-small` forward tests
7. coverage audit, independent diff review와 Draft PR

Checkpoint failure를 prompt 수정으로 덮지 않는다. Root cause가 docs, source, agents-cli,
generator, Skill, model adapter 또는 test harness 중 어디에 있는지 분류한다.

## 검증

- `node scripts/validate-skills.mjs`
- Skill manifest/trigger/contract tests
- `node scripts/validate-artifacts.mjs` when fixtures/artifacts change
- exact ADK 2.4.0 capability probes와 representative runtime matrix
- accepted agents-cli 1.3.1 compatibility/correction probes와 exact Google Skill digests
- current relevant generator/runtime matrix
- network-disabled `qwen3.6-small` forward-test evidence
- evidence index에서 capability → source/docs → probe/runtime → Skill reference 양방향 확인
- `git diff --check`, relative links와 changed-file inventory

## 완료 gate와 evidence saturation

고정 시간이나 최소 seed 통과만으로 완료하지 않는다. 다음을 모두 만족해야 한다.

- 네 evidence surface에서 발견한 모든 capability inventory row가 `confirmed`, `corrected`,
  `unsupported`, `excluded_cloud` 또는 evidence가 있는 `blocked`로 닫혔다.
- agents-cli 1.3.1과 installed Google Skill bundle이 `compatible` 또는 evidence-backed
  `compatible_with_corrections`로 판정됐다.
- 모든 required 기능군에 positive와 negative/failure evidence가 있다.
- 모든 high-risk capability에 representative runtime과 하나 이상의 interaction test가 있다.
- 최소 다섯 compound topology와 최소 다섯 source-comparison conflict probe가 재현 가능하다.
- actual `qwen3.6-small` forward tests가 Agent/Sub-agent, Graph, Tool, state/lifecycle와 local reuse
  기능군을 대표한다.
- 두 번 연속 coverage audit에서 새 high/medium-risk 누락이 발견되지 않고 independent reviewer가
  inventory↔evidence↔Skill 연결을 확인했다.
- offline Skill bundle version/digest와 local install/rollback 절차가 검증됐다.
- AF Skill PR에 Companion package 변경이 없다.

새 capability가 마지막 audit에서 발견되면 시간이 오래 걸렸다는 이유로 멈추지 않고 inventory와
실험을 갱신한다. 실제 dependency·service 부재로 실행할 수 없으면 그 사실과 source-level
evidence를 `blocked`로 남기며 PASS로 계산하지 않는다.

Session 2에는 Skill bundle location/version/digest, compatible ADK/agents-cli/model profile,
capability inventory, task input/output contract, evidence index, representative integration set와
known unsupported/excluded patterns를 전달한다.
