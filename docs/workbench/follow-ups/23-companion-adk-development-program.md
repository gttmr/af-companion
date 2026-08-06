# 23. Companion skill-aware ADK 개발 — 2-session 프로그램

상태: **in progress — Session 1 merged, Session 2 Phase A passed and awaits user merge decision**

작성일: 2026-08-05 KST

정본 결정: [Companion의 skill-aware ADK 개발 컨텍스트](../companion-adk-development-context.md)

Skill 설계 기준: [24. AF Skills vNext 프로그램](24-af-skills-vnext-program.md)

## 목적

외부 Codex CLI 또는 Codex VS Code extension이 제한된 개발 환경에서 Google 공식 Skill과 AF
Skills vNext를 사용해 ADK 2.4 source를 만들고, Companion이 Asset·Graph·selection 기반 문맥,
source mapping과 local Git evidence를 제공하는 전체 루프를 두 번의 fresh session으로 완성한다.

작업을 더 잘게 나눈 이전 12-session 계획은 폐기했다. 아래 두 work order만 실행 지시로
사용한다.

1. [Session 1 — ADK 2.4 evidence 기반 AF Skills vNext](23-companion-adk-development/01-af-skills-vnext.md)
2. [Session 2 — Companion 통합과 end-to-end acceptance](23-companion-adk-development/02-companion-integration.md)

## 확정된 제약과 제품 결정

- 장기 제품 target은 Internet이 없는 개발 환경이다. Session 2에는 사용자가 승인한 model-only
  Gemini Developer API egress 예외를 적용하고 dependency·Skill·source 검증은 계속 local로 한다.
- Session 2 primary acceptance model은 `gemini-3.1-flash-lite`다. Observed model version은
  `3.1-flash-lite-05-2026`, input context는 `1048576`, output limit은 `65536`이다. 요청했던
  `gemini-2.5-flash-lite`는 사용할 수 없어 404를 반환했고 acceptance에 포함하지 않았다.
  Session 1의 `qwen3.6-small` manifest와 blocked evidence는 수정하지 않는다.
- Companion, Codex CLI와 generated runtime은 ignored local configuration의 loopback bridge
  `http://127.0.0.1:8897/v1`만 사용한다. Bridge만 Gemini Developer API로 egress하고 API key는
  external mode-0600 env file에서 읽는다. 다른 Internet egress, model API와 fallback은 금지한다.
- generated runtime과 Skill guidance의 기준은 ADK 2.4이며 repository exact verification
  baseline은 현재 `google-adk==2.4.0`이다. 새 session은 exact interpreter를 다시 확인한다.
- Session 1은 agents-cli `1.2.1`과 Google Skills `1.2.1`을
  `compatible_with_corrections`로 accepted했고 candidate `1.3.1`은 exact ADK 2.4/A2A 0.3을
  제외하는 generated dependency ranges 때문에 rejected했다. Session 2는 accepted `1.2.1`
  source와 manifest의 exact workflow `83dea9d7…5c31`, scaffold `fc3c18e8…0d2f`,
  adk-code `e67352cc…8e9f`, eval `37c2d165…1fc9` tree digest만 사용한다.
- ADK Docs MCP는 offline 개발 환경에서 허용된 documentation evidence surface다. 일반 Web
  search나 online docs fallback으로 대체하지 않는다.
- agents-cli guidance, ADK Docs MCP, installed ADK 2.4 source와 실행 결과가 충돌할 수 있다는
  것을 정상 입력으로 취급한다. 충돌을 숨기거나 model이 임의로 하나를 고르게 하지 않는다.
- deploy, cloud publish, cloud observability는 고려하지 않는다. Gemini Developer API는 이
  Session 2의 primary model transport일 뿐 deploy/publish/observability 승인이 아니다. local Asset Registry publish는
  별도 repository lifecycle로 유지한다.
- App Git root가 Graph, source project, implementation mapping과 local history를 함께 소유한다.
- AF Skills vNext와 Companion product code는 같은 change set/PR에 섞지 않는다.
- Browser App Server direct-host, React Flow 전환과 legacy migration은 두 session의 비범위다.

## ADK framework fact의 판정 순서

Agent Factory taxonomy·Graph·review 같은 product contract는 각 canonical 문서와 current
repository source가 소유한다. 아래 순서는 **ADK 2.4 API와 runtime behavior**를 판단할 때만
사용한다.

1. exact `google-adk==2.4.0`에서 실행한 최소 probe와 representative runtime test
2. 같은 interpreter가 import하는 installed ADK 2.4 source, signature와 validator
3. ADK Docs MCP의 관련 문서 결과와 checked source
4. 설치된 `google-agents-cli-*` Skill의 guidance
5. 기존 AF card, 오래된 문서와 model memory

실제 target은 exact ADK 2.4 runtime이므로 version-specific behavior는 1과 2가 최종 근거다.
Docs MCP와 source가 다르면 “문서 오류”로 단정하는 대신 exact query, source symbol, probe와
관찰 차이를 conflict record로 남긴다. probe가 불가능하거나 source만으로 의미가 모호하면
지원되는 것처럼 Skill에 쓰지 않고 `unverified` 또는 Blocker로 남긴다.

ADK Docs MCP 사용 순서는 `list_doc_sources -> fetch_docs(llms.txt) -> 관련 page fetch`다.
현재 도구는 `AgentDevelopmentKit` source를 노출한다. target 환경에서 MCP가 해당 source를
실제로 제공하는지 session 시작 때 다시 확인하고, 실패하면 Internet으로 우회하지 않는다.

## 2026-08-05 GitHub snapshot

아래는 기록 시점 evidence이며 새 session은 그대로 믿지 않는다.

| 항목 | 기록 시점 값 |
| --- | --- |
| `origin/main` | `3510e79` |
| PR #21 | `CLOSED`, head `9dca45f` |
| PR #22 | `OPEN`, Draft, `MERGEABLE`, head `1deac39`, checks 없음 |
| PR #22 worktree | `/home/ilmaswsl/work/af-companion-primary-only` |
| ADK requirement | `google-adk[a2a,mcp]>=2.4.0,<2.5.0` |
| exact repository verification baseline | `google-adk 2.4.0` |
| agents-cli transition | 기록 시점 `1.2.1`; Session 1 전 외부 `1.3.1` upgrade 예정; compatibility 미판정 |
| 보존할 local 파일 | primary checkout의 `agent-factory-web-first-journey-work-order.md`, `agent-factory-web-first-next-session-context.md` |

새 session은 다음을 다시 확인한다.

```bash
git status -sb
git log --oneline -8
git worktree list
gh pr view 22 --repo gttmr/af-companion
```

또한 selected Python에서 `importlib.metadata.version("google-adk")`, installed package path와
source signature를 확인한다. ignored runtime venv가 있을 것이라고 가정하지 않는다.

## 두 session의 경계

| Session | 한 가지 소유 범위 | 완료 gate |
| --- | --- | --- |
| [1. AF Skills vNext](23-companion-adk-development/01-af-skills-vnext.md) | ADK 2.4 capability inventory, Docs MCP/source conflict records, Workflow·Agent·Sub-agent 종합 실험, concise offline Skill bundle | coverage saturation과 Skill PR 검증; merged evidence의 `qwen3.6-small` forward cases는 blocked로 보존 |
| [2. Companion integration](23-companion-adk-development/02-companion-integration.md) | PR #22 foundation closure, source/context contract, Skill readiness, selection handoff, representative capability·Subworkflow·A2A acceptance | constrained-egress full loop와 local Git evidence PASS |

Session 안에는 여러 checkpoint와 commit이 있을 수 있다. reviewability 때문에 PR을 분리할 수
있지만 새 fresh session으로 쪼개지 않는다. 반대로 같은 commit이나 PR에 AF Skill source와
Companion package source를 섞지는 않는다.

## 공통 실행 계약

1. root와 nearest `AGENTS.md`, 이 master, 해당 session work order를 완전히 읽는다.
2. Target Contract와 Current Implementation, product contract와 ADK framework fact를 구분한다.
3. framework claim마다 version, Docs MCP query, source locator와 실행 evidence 중 해당 근거를
   기록한다.
4. session-specific locked model에는 한 번에 하나의 primary intent와 bounded context만 전달한다.
5. parsing, hash, path validation, artifact inventory와 scoring은 deterministic script/test가
   소유한다.
6. skipped check를 PASS로 만들지 않고 locked model 외 model fallback이나 승인되지 않은 Internet
   egress를 사용하지 않는다.
7. interface/schema/UX 결정은 `docs/decision-log.md`에 append한다.
8. session 종료 시 commit/PR, exact commands/results, evidence paths, remaining risk와 다음
   session의 선행조건을 기록한다.

## Operator 실행 runbook

두 session을 동시에 실행하지 않는다. 아래 단계가 끝날 때마다 command 결과와 gate를 확인한
뒤 다음 단계로 이동한다. `<...>` placeholder는 실제 값으로 바꾸고 그대로 shell에 넣지 않는다.

### 0. 이 계획을 Draft PR #22에 보존

기록 시점에 계획 문서는 `/home/ilmaswsl/work/af-companion-primary-only`의
`agent/companion-primary-only` branch에 있고 이 branch는 Draft PR #22의 head다. 새 session을
열기 전에 current state를 다시 확인한다.

```bash
cd /home/ilmaswsl/work/af-companion-primary-only
git status -sb
git branch --show-current
gh pr view 22 --repo gttmr/af-companion
git diff --check
```

다음 path만 이 계획 commit에 stage한다. 다른 기존 변경이 나타나면 중단하고 범위를 확인한다.

```bash
git add \
  docs/README.md \
  docs/decision-log.md \
  docs/workbench/companion-adk-development-context.md \
  docs/workbench/follow-ups/22-companion-simplification-vscode-extension.md \
  docs/workbench/follow-ups/23-companion-adk-development-program.md \
  docs/workbench/follow-ups/23-companion-adk-development/01-af-skills-vnext.md \
  docs/workbench/follow-ups/23-companion-adk-development/02-companion-integration.md \
  docs/workbench/follow-ups/24-af-skills-vnext-program.md \
  docs/workbench/follow-ups/INDEX.md \
  packages/companion/ARCHITECTURE.md

git diff --cached --check
git diff --cached --stat
git diff --cached --name-only
git commit -m "docs(companion): define two-session ADK development program"
git push origin agent/companion-primary-only
gh pr view 22 --repo gttmr/af-companion
```

이 단계는 PR #22를 merge하거나 Draft에서 해제하지 않는다. Session 1이 읽을 work order를 remote에
보존하는 단계다.

### 1. Session 1 worktree 생성

Session 1의 Skill 변경을 PR #22의 Companion code와 섞지 않기 위해 `origin/main`에서 독립
worktree를 만든다. Work order는 PR #22 worktree의 committed copy를 read-only instruction으로
읽는다.

```bash
cd /home/ilmaswsl/work/af-companion-primary-only
git fetch origin
git worktree list
git branch --list agent/af-skills-vnext

git worktree add \
  /home/ilmaswsl/work/af-companion-skills-vnext \
  -b agent/af-skills-vnext \
  origin/main

cd /home/ilmaswsl/work/af-companion-skills-vnext
git status -sb
git rev-parse HEAD
which agents-cli
agents-cli --version
```

`agent/af-skills-vnext` branch나 target directory가 이미 있으면 새로 덮어쓰지 말고 기존 상태를
검사한다.

### 2. Session 1 실행 prompt

아래 code block은 Session 1에 전달한 historical input을 보존한 것이다. 현재 Session 2
toolchain lock으로 다시 해석하거나 실행하지 않는다.

`/home/ilmaswsl/work/af-companion-skills-vnext`를 cwd로 새 Codex CLI 또는 VS Code Codex session을
열고 다음 prompt를 그대로 전달한다.

```text
현재 cwd는 /home/ilmaswsl/work/af-companion-skills-vnext 이다.

먼저 이 worktree의 root AGENTS.md와 required documentation reading order를 지켜라.
다음 committed planning documents는
/home/ilmaswsl/work/af-companion-primary-only 에서 read-only instruction으로 완전히 읽어라.

- docs/workbench/companion-adk-development-context.md
- docs/workbench/follow-ups/23-companion-adk-development-program.md
- docs/workbench/follow-ups/24-af-skills-vnext-program.md
- docs/workbench/follow-ups/23-companion-adk-development/01-af-skills-vnext.md

skill-creator, google-agents-cli-workflow, google-agents-cli-adk-code를 적용하라.
평가 설계와 실행에는 google-agents-cli-eval을 적용하라.

current Git/base commit, exact google-adk 2.4.0 interpreter와 imported source path,
externally upgraded agents-cli 1.3.1/Google Skill bundle version, source path와 digest,
ADK Docs MCP fetch,
offline qwen3.6-small readiness와 evidence isolation을 먼저 재검증하라.

agents-cli 1.3.1을 호환된 것으로 가정하지 마라. 1.2.1 previous evidence와 current installed
1.3.1 CLI/source/Skill/help를 비교하고 work order의 version-transition gate에 따라
compatible, compatible_with_corrections 또는 blocked로 판정하라. CLI upgrade와 exact ADK 2.4
framework baseline을 별도 축으로 유지하라. 판정 전에는 final Skill wording으로 진행하지 마라.

Session 1만 수행하라.
ADK 2.4 source, Docs MCP, Google Skill과 current AF surface에서 capability inventory를 만들고
Workflow·Agent·Sub-agent 전반의 실험을 파생하라.
loop·parallel·dynamic에서 멈추지 말고 Tool, state/session/event/artifact, callback/plugin,
pause/resume/failure, Subworkflow/local A2A와 small-model behavior까지 work order의
positive/negative/interaction/compound matrix를 수행하라.

하루 전체가 걸려도 시간이나 seed test 개수로 완료하지 마라.
두 번 연속 coverage audit에서 새 high/medium-risk 누락이 없고 모든 completion gate가
evidence로 충족될 때까지 계속하라.

packages/companion과 Companion product code는 수정하지 마라.
Internet, cloud model, deploy, cloud publish와 cloud observability를 사용하지 마라.
ADK Docs MCP가 실패하면 Web search로 우회하지 말고 unavailable evidence를 남겨라.

checkpoint마다 plan과 evidence index를 갱신하고 실패 원인을 source/docs/Skill/model adapter/
test harness로 분류하라. unsupported와 blocked를 PASS로 계산하지 마라.

완료 gate를 충족하면 검증 결과와 changed-file inventory를 독립 review하고 intentional commit을
만들어 agent/af-skills-vnext를 push한 뒤 main 대상 Draft PR을 생성하라.
PR description에는 exact commands/results, capability/evidence index, bundle version/digest,
known unsupported/excluded patterns와 Session 2 required_integration handoff를 기록하라.
Draft 해제나 merge는 하지 말고 사용자 review gate에서 멈춰라.
```

### 3. Session 1 review와 merge gate

Session 1이 만든 PR 번호를 확인한 뒤 사용자가 evidence와 checks를 review한다.

```bash
SESSION1_PR=<actual-pr-number>
gh pr view "$SESSION1_PR" --repo gttmr/af-companion
gh pr checks "$SESSION1_PR" --repo gttmr/af-companion
```

Completion gate를 확인한 뒤에만 Draft를 해제하고 merge한다.

```bash
gh pr ready "$SESSION1_PR" --repo gttmr/af-companion
gh pr merge "$SESSION1_PR" \
  --repo gttmr/af-companion \
  --merge \
  --delete-branch
```

Merge 뒤 worktree가 clean인지 확인하고 정리한다.

```bash
git -C /home/ilmaswsl/work/af-companion-skills-vnext status -sb
git -C /home/ilmaswsl/work/af-companion-primary-only fetch origin
git -C /home/ilmaswsl/work/af-companion-primary-only merge-base --is-ancestor \
  agent/af-skills-vnext origin/main
git -C /home/ilmaswsl/work/af-companion-primary-only worktree remove \
  /home/ilmaswsl/work/af-companion-skills-vnext
git -C /home/ilmaswsl/work/af-companion-primary-only branch -d agent/af-skills-vnext
git -C /home/ilmaswsl/work/af-companion-primary-only worktree prune
```

Dirty 또는 unmerged worktree는 제거하지 않는다.

### 4. Session 2 시작 전 PR #22 동기화

Session 1 merge 결과를 PR #22 branch에 merge한다. Shared docs나 contract conflict가 생기면
자동 선택하지 말고 Session 1의 merged contract를 기준으로 의도적으로 해결한다.

```bash
cd /home/ilmaswsl/work/af-companion-primary-only
git fetch origin
git status -sb
git merge --no-edit origin/main
git diff --check
git push origin agent/companion-primary-only
gh pr view 22 --repo gttmr/af-companion
```

Session 1 PR이 merged되지 않았거나 bundle/evidence handoff가 불완전하면 Session 2를 시작하지
않는다.

### 5. Session 2 실행 prompt

`/home/ilmaswsl/work/af-companion-primary-only`를 cwd로 **새로운** Codex CLI 또는 VS Code Codex
session을 열고 다음 prompt를 그대로 전달한다.

```text
현재 cwd는 /home/ilmaswsl/work/af-companion-primary-only 이다.

먼저 root AGENTS.md와 required documentation reading order를 지켜라.
다음 문서를 완전히 읽어라.

- docs/workbench/companion-adk-development-context.md
- docs/workbench/follow-ups/23-companion-adk-development-program.md
- docs/workbench/follow-ups/23-companion-adk-development/02-companion-integration.md

Session 1 merged commit과 Draft/merged PR evidence를 확인하고 다음 handoff를 정확히 읽어라.

- AF Skills vNext bundle location/version/digest
- Session 1이 accepted한 exact agents-cli/Google Skill bundle과 compatibility correction
- compatible google-adk와 active Session 2 model profile
- capability inventory와 evidence index
- required_integration representative set
- known unsupported/excluded/blocked patterns

current Git/worktree, PR #22 head/base/checks/review 상태와 기존 dirt를 다시 확인하라.
Session 2만 수행하고 AF Skill instruction과 Session 1 evidence를 수정하지 마라.

먼저 Phase A로 PR #22의 최소 CI, full USER-ACCEPTANCE, real browser evidence와 independent review를
완료하라. 실패를 재현한 뒤 current foundation failure만 최소 수정하라.
PR #22를 ready 또는 merge하기 전에는 evidence와 remaining risk를 보고하고 사용자의 명시적
merge 결정을 받아라.

Session 2에서 approved provider를 Codex VS Code extension에 설정할 수 없으면
current-run extension AI chat은 생략하고 Codex CLI만 AI acceptance client로 사용한다. 이 경우에도
direct model chat과 MCP config/list만으로 model-mediated get/apply를 PASS 처리하지 말고, 실제
Codex CLI turn의 Companion MCP 호출 여부를 별도로 증명하라.

사용자가 PR #22 merge를 승인하면 merge를 확인하고 origin/main을 fetch하라.
같은 Codex conversation을 유지한 채 다음 clean worktree를 생성해 cwd를 전환하라.

- path: /home/ilmaswsl/work/af-companion-adk-integration
- branch: agent/companion-adk-integration
- base: latest origin/main containing PR #22 and Session 1

그 worktree에서 Phase B부터 E까지 계속 수행하라. 이것은 별도 세 번째 session이 아니다.

source project, implementation mapping, Skill/model lock과 read-only Development Context Capsule을
contract tests부터 구현하라. 이어서 selected Node/Edge/Region의 bounded task를 external Codex
CLI/VS Code 경로에 연결하고 frontend-skill과 project browser rules에 따라 실제 UI를 검증하라.

loopback bridge를 통한 `gemini-3.1-flash-lite`와 exact ADK 2.4에서 E1
Subworkflow, E2 representative Agent/Sub-agent·Graph·Tool·state/lifecycle integration, E3 local
A2A를 수행하라. Gemini Developer API 외 Internet egress, 다른 model, fallback, deploy, cloud publish,
cloud observability와 Browser direct App Server를 사용하지 마라.

Graph mutation은 항상 latest get -> base_graph_revision -> minimal apply를 사용하고 graph_stale면
재조회 후 재계산하라. source write와 Graph write authority를 합치지 마라.

각 checkpoint마다 typecheck/test/build, validator, ADK runtime, loopback과 Gemini Developer API 외
network-disabled Gemini 3.1 Flash-Lite Session 2 acceptance, browser DOM/console/network/screenshot와 local
App Git evidence를 남겨라.

완료 gate를 충족하면 independent review, intentional commits와 changed-file inventory를 확인한 뒤
agent/companion-adk-integration를 push하고 main 대상 Draft PR을 생성하라.
PR description에 exact commands/results, screenshots/evidence, local Git proof, unsupported items와
remaining risk를 기록하라. Draft 해제나 merge는 하지 말고 사용자 review gate에서 멈춰라.
```

### 6. Session 2 안에서 PR #22 merge 뒤 worktree 생성

위 prompt를 받은 Codex가 실행할 기준 명령은 다음과 같다. 사용자가 직접 실행할 경우에도 같은
순서를 사용한다.

```bash
gh pr merge 22 --repo gttmr/af-companion --merge --delete-branch

cd /home/ilmaswsl/work/af-companion
git fetch origin
git worktree add \
  /home/ilmaswsl/work/af-companion-adk-integration \
  -b agent/companion-adk-integration \
  origin/main

cd /home/ilmaswsl/work/af-companion-adk-integration
git status -sb
git log --oneline -5
```

PR #22 merge는 Phase A acceptance와 사용자 승인 전에는 실행하지 않는다. Branch 또는 target
directory가 이미 존재하면 덮어쓰지 않는다.

## 프로그램 완료 조건

- agents-cli `1.2.1`과 Google Skills `1.2.1`이 Session 1 evidence로
  `compatible_with_corrections` 판정됐고 Session 2가 그 exact version/digest만 사용한다.
  Candidate `1.3.1` rejection을 자동으로 되돌리지 않는다.
- agents-cli guidance, Docs MCP와 ADK 2.4 source/runtime가 충돌할 때 재현 가능한 최종 판정
  절차와 evidence가 있다.
- ADK 2.4의 Workflow·Agent·Sub-agent, Tool, state/event/artifact, callback/plugin,
  pause/resume와 local reuse capability inventory가 evidence 있는 status로 닫힌다.
- 각 required 기능군의 positive/negative, high-risk interaction과 대표 복합 topology guidance가
  Skill reference와 tests로 검증된다.
- Session 1의 model-forward blocked evidence를 PASS로 바꾸지 않고, Session 2가
  `gemini-3.1-flash-lite`에서 bounded context로 동작하며 unsupported behavior를 추측하지 않는다.
- Companion이 source project, Skill bundle, locked model profile, Graph selection과 implementation
  mapping을 한 task capsule로 연결한다.
- Existing Workflow/Subworkflow, A2A Agent와 representative Agent/Sub-agent·Graph·Tool·state 및
  lifecycle 조합이 constrained-egress end-to-end에서 source/test/eval/local Git evidence를 남긴다.
- cloud deploy/publish/observability, Gemini Developer API 외 Internet과 model fallback 없이 위
  결과를 재현한다.

두 planned session 중 하나가 blocker로 끝나면 다음 session으로 우회하지 않는다. 같은 work
order에 evidence와 필요한 사용자 결정을 남기며, 예외적인 recovery session이 필요하다는
사실을 완료처럼 숨기지 않는다.
