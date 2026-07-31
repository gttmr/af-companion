# 18. agents-cli Skill 개선 잔여 선택 도입

상태: **partial**

작성일: 2026-07-23 KST

구현 여부: **계층 경계와 ADK 2.4 기준은 구현, Slice A–D의 세부 수용 기준은 미완료**

## 목적

전역 `google-agents-cli` Skill에서 확인된 개선 중 Agent Factory의 네 Work Skill에 도움이 되는 규칙만 선택적으로 도입한다. Upstream 문구나 lifecycle을 그대로 복제하지 않고 [Operating Model](../operating-model.md), [Taxonomy](../taxonomy.md), [Graph IR](../graph-ir.md)의 현재 계약을 유지한다.

이 계획은 Skill 개선과 별도 ADK application workspace/GKE 배포 경계를 연결하지만, deployment 실행이나 product contract 변경이 완료됐다고 주장하지 않는다.

## 2026-07-31 현재 상태

- 전역 standalone base는 `google-agents-cli ~= 1.2.1`이다. 아래 1.1.0 delta는 이 계획이 만들어진 당시의 비교 기록이다.
- PR #20에서 standalone `google-agents-cli-*` base, 명시적 Agent Factory 범위에서만 활성화되는 `af-*` overlay, 그 범위의 연결·handoff·write authority·provenance만 담당하는 Companion 경계를 계약화했다.
- 승인된 Agent Factory artifact가 specification/scaffold authority인 동안 base의 ADK API·coding·test·eval 지침을 재사용한다. 승인된 scaffold plan이 선택하지 않은 `.agents-cli-spec.md` 대화나 `agents-cli scaffold create`를 중복 실행하지 않는다.
- ADK Runtime Handoff와 generator는 `>=2.4.0,<2.5.0`을 생성하고 exact `google-adk==2.4.0`에서 검증한다.
- 아래 Slice A–D의 dialogue 세분화, topology 비교, 별도 application workspace/GKE 제품화, version-aware locator·governance evidence는 각 수용 기준이 아직 충족되지 않았으므로 open 상태다.

## 확인된 업데이트

- CLI: `google-agents-cli 1.0.0 -> 1.1.0`
- 전역 Skill: 7개 모두 metadata `version: 1.1.0`
- 전후 비교: 29파일에서 30파일로 증가, 10파일 변경
- 새 파일: `google-agents-cli-workflow/references/brainstorming.md`

실질 변경은 다음과 같다.

| Upstream 변경 | 판정 | Agent Factory 적용 방향 |
| --- | --- | --- |
| Phase 0를 checklist가 아닌 단계적 design dialogue로 전환 | 채택 | Discover가 복잡도에 맞춰 질문하고, non-trivial 요청만 대안 비교로 보낸다. |
| 한 번에 한 질문, non-interactive assumptions 명시 | 조건부 채택 | interactive 기본값으로 사용하되 자동화·명시적 위임에서는 기존 `assumptions`에 결정을 기록하고 진행한다. |
| non-trivial agent에 2–3 architecture approaches와 추천안 요구 | 채택 | Compose에서 standalone/no-Workflow 대안을 포함한 최소 2개 실행 구조를 비교하고 한 안을 추천한다. trivial 요청에는 강제하지 않는다. |
| 3개 이상 specialist/integration이면 first slice와 Future Phases로 축소 | 채택 | Discover candidate 범위를 줄이고 deferred candidate와 후속 범위를 명시한다. |
| spec self-review: placeholder, consistency, scope, measurable criteria, ambiguity | 채택 | 기존 discovery/composition output을 승인 대기 상태로 바꾸기 전에 공통 self-review check로 적용한다. |
| `.agents-cli-spec.md`를 새 정본으로 사용 | 미채택 | `normalizedRequirement`, `analysis-result.json`, `analysis-summary.md`, review gate와 중복되므로 새 lifecycle artifact를 만들지 않는다. |
| sample study를 spec 승인 전 전면 금지 | 변형 채택 | raw requirement에서 source 생성은 계속 금지하지만 Discover의 evidence/Catalog 조회까지 막지는 않는다. Sample 기반 구현 결정만 discovery 승인 이후로 미룬다. |
| RAG sparse-checkout 경로 `core/` -> `core/python/` | 채택 | RAG가 실제 범위일 때만 reference locator와 source check에 반영한다. |
| eval judge locator `tests/eval/metrics.py` -> `tests/eval/response_quality.py` | 채택 | Verify는 agents-cli version과 실제 generated path를 먼저 확인하고 존재하지 않는 고정 경로를 추측하지 않는다. |
| Agent Runtime, Cloud Run, GKE가 모두 container-based라는 정정 | 채택 | deployable application을 image/Deployment 단위로 모델링하고 언어를 Python 전용으로 단정하지 않는다. |
| Agent Gateway와 Semantic Governance 안내 | 조건부 채택 | Gateway는 Asset이나 deployment target이 아니라 governed ingress/egress Resource·Dependency다. 실제 구성은 별도 승인된 deployment/Terraform 범위로 둔다. |
| 나머지 ADK code/scaffold/eval/observe/publish 변경 | 기록만 | metadata version 외 동작 변경이 없으므로 AF Skill 문구를 불필요하게 재작성하지 않는다. |

## 적용 원칙

1. **현재 정본 재사용**: `.agents-cli-spec.md`를 추가하지 않고 기존 requirement/evidence/Graph/review artifact를 강화한다.
2. **복잡도 비례 절차**: 단일 Agent·무연동 요청에는 2–3문장 요약과 한 번의 review면 충분하다. multi-Agent, RAG, external auth, safety-critical 요청에만 전체 dialogue를 적용한다.
3. **질문과 가정 분리**: 답을 받을 수 있는 interactive session에서는 가장 큰 설계 축 하나만 질문한다. 자동화나 사용자가 결정을 위임한 경우에는 `assumptions`에 선택과 근거를 기록한다.
4. **대안은 Compose가 소유**: Discover는 문제·범위·후보를 정리하고, standalone/Workflow/deployment topology 비교는 approved discovery를 소비하는 Compose에서 수행한다.
5. **Gateway를 분류 체계에 추가하지 않음**: Agent Gateway, policy, cluster, image registry는 Resource 또는 Dependency이며 Agent·Workflow·Tool 네임스페이스를 늘리지 않는다.
6. **배포 가능과 배포 실행 분리**: GKE-ready source, Dockerfile, Terraform 검증은 Scaffold/Verify 증거가 될 수 있지만 실제 `agents-cli deploy`는 별도 명시적 human approval 없이는 실행하지 않는다.

## 구현 계획

### Slice A — Discover dialogue와 scope control

대상:

- [af-discover-assets](../../../.agents/skills/af-discover-assets/SKILL.md)
- `.agents/skills/af-discover-assets/references/evidence-and-candidate-discovery.md`
- `.agents/skills/_shared/missing-information.md`

변경:

1. trivial/complex 판별 기준을 추가한다.
2. interactive 요구 정리에서는 한 번에 가장 영향이 큰 질문 하나만 제시한다.
3. non-interactive 또는 위임된 선택은 `assumptions`에 한 줄 decision으로 남긴다.
4. specialist/integration이 과도하면 최소 end-to-end slice를 추천하고 나머지 candidate를 deferred로 기록한다.
5. success/failure/safety criteria가 측정 가능한지 review 전 self-check한다.

수용 기준:

- 단순 단일-Agent fixture에는 불필요한 multi-option 문서가 생기지 않는다.
- 복합 fixture는 first slice와 deferred scope를 구분한다.
- hard-gate Missing Information을 assumption으로 숨기지 않는다.

### Slice B — Compose alternatives와 recommendation

대상:

- [af-compose-solution](../../../.agents/skills/af-compose-solution/SKILL.md)
- `.agents/skills/af-compose-solution/references/candidate-and-graph-review.md`
- `.agents/skills/af-compose-solution/references/design-output-and-readiness.md`

변경:

1. non-trivial composition에서 2–3개 topology를 비교한다.
2. 최소 하나는 standalone 또는 no-Workflow 대안이어야 한다.
3. complexity, ownership, failure isolation, deployment lifecycle, testability를 비교하고 한 안을 명시적으로 추천한다.
4. 선택되지 않은 대안은 `boundary-design.md`의 rationale로만 남기고 Graph enum이나 새 asset type을 만들지 않는다.
5. output write 전 placeholder·contract consistency·scope·ambiguity self-review를 수행한다.

수용 기준:

- 추천안 없이 중립적인 option 목록만 남기면 실패한다.
- Graph는 승인된 추천안 하나만 표현한다.
- 단순 요청에는 option ceremony를 강제하지 않는다.

### Slice C — Scaffold application workspace와 container boundary

이 Slice는 별도 ADK application workspace 설계가 승인된 후 진행한다.

1. `Work Item -> ADK Application -> Git workspace -> container image -> Kubernetes Deployment`의 1:1 기본 경계를 계약화한다.
2. `~/work/af-apps/<app-id>` 같은 등록된 외부 source root에서 `agents-cli scaffold create --deployment-target gke`를 실행할 수 있게 한다.
3. 현재 artifact-local `runtime-stub/` 완성 조건을 실제 application source/output revision으로 대체한다. 2026-07-27에 root validator의 선언된 외부 output root 지원은 완료했으며, application workspace 등록과 source revision의 제품화는 이 Slice에 남아 있다.
4. Agent Gateway는 optional post-deploy attachment로 기록하며 GKE, Cloud Run, Agent Runtime 대신 선택하는 target으로 노출하지 않는다.
5. Semantic Governance는 organization policy 입력과 명시적 승인이 있을 때만 Terraform/Console handoff로 제안한다.

수용 기준:

- `af-companion` source tree에는 생성 앱 코드가 쓰이지 않는다.
- 앱마다 별도 Git root, Dockerfile, image identity, Deployment evidence가 있다.
- deploy 명령은 review/eval 통과와 별도 human approval 전에는 실행되지 않는다.

### Slice D — Verify locator와 governance evidence

대상:

- [af-verify-runtime](../../../.agents/skills/af-verify-runtime/SKILL.md)
- `.agents/skills/af-verify-runtime/references/verification-commands.md`
- `.agents/skills/af-verify-runtime/references/runtime-validation-checks.md`

변경:

1. `agents-cli --version`과 `agents-cli info`를 evidence에 기록한다.
2. eval custom judge 경로는 version-aware source inspection으로 확인하며 1.1.0 scaffold에서는 `tests/eval/response_quality.py`를 기대한다.
3. RAG sample을 사용했다면 `core/python/<sample>` provenance를 확인한다.
4. application health, container readiness, Gateway attachment, Semantic Governance policy를 서로 다른 claim으로 검증한다.
5. Gateway/SGP가 구성되지 않았으면 app runtime 성공만으로 governed production readiness를 주장하지 않는다.

수용 기준:

- 경로 존재만으로 eval 성공을 주장하지 않는다.
- container build와 Kubernetes Deployment readiness를 분리한다.
- Gateway나 policy가 없는 상태는 명시적 `unverified` 또는 out-of-scope claim으로 남는다.

## 검증 계획

- `node scripts/validate-skills.mjs`
- `node scripts/validate-artifacts.mjs`
- `cd packages/web && npm run test:contracts`
- simple/complex/non-interactive/over-scoped discovery fixtures
- standalone-vs-Workflow recommendation fixture
- RAG locator와 eval locator source check
- Gateway가 asset 또는 deployment target으로 승격되지 않는 schema/skill regression
- 별도 app workspace에서 VS Code/Codex Hook, Git projection, GKE scaffold dry-run acceptance
- `git diff --check`와 active Markdown relative-link check

## 명시적 비범위

- Upstream Skill 전체 복사
- Agent Factory lifecycle을 `agents-cli` 8-phase lifecycle로 교체
- 별도 승인 없는 future ADK runtime contract, model, provider 변경
- `.agents-cli-spec.md`를 추가 정본으로 도입
- Agent Gateway/SGP를 자동 provision
- human approval 없는 실제 cloud deployment
