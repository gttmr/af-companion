# Web-First Journey Handoff

> **2026-07-28:** P7에서는 Web bootstrap→multi-root VS Code→fresh exact Luna low Plan
> Session과 `bridge_down` 복구만 실제 동작했고, 새 빈 Work Item의 canonical Handoff
> 순환 때문에 Materialization·Graph/source는 **BLOCKED**였다. 후속 source는 strict
> pristine ledger 전용 Bootstrap Grant로 그 계약 blocker를 해소했고, 실제 fresh CLI의
> one-time claim까지 확인했다. 그러나 Phase B materialization·automatic finalization과
> Graph/source를 포함한 uninterrupted live acceptance는 아직 완료하지 않았으므로 P7을
> PASS로 소급하지 않는다.
> CLI Question 본문·선택지·답변은 Web projection 대상이 아니다.

이 파일은 별도 대화 history가 없는 후속 세션이 현재 상태를 재현하고 다음 계약 결정을
내릴 수 있도록 작성했다. 현재 source와 [P7 acceptance 상태](web-first-journey-status.md)가
최종 근거이며, 성공하지 않은 구간을 구현된 것으로 해석하지 않는다.

## Phase와 PR

| Phase | Branch | PR | Merge SHA | Evidence |
| --- | --- | --- | --- | --- |
| P0 | `spike/web-first-journey-launch` | [#8](https://github.com/gttmr/af-companion/pull/8) | `72477ef7569b52b067a2ef98942acdbbe39a2fa0` | [G0-1~G0-4](web-first-journey-spike-status.md) |
| P1 | `agent/web-first-work-bootstrap` | [#9](https://github.com/gttmr/af-companion/pull/9) | `18279fa367288eae55f005b1f3a0f87cc4594fe0` | [bootstrap decision](../decision-log.md) |
| P2 | `agent/web-first-session-launch` | [#10](https://github.com/gttmr/af-companion/pull/10) | `f3fb72cbe84145024c4ec4158d4b86d5e4feafac` | [G1 launch chain](web-first-journey-p2-launch-chain-status.md) |
| P3 | `agent/web-first-journey-ui` | [#11](https://github.com/gttmr/af-companion/pull/11) | `453a51ebd8cb306361833cf83dbb1e6ef39ec4ef` | [Web-first UX decision](../decision-log.md) |
| P4 | `agent/web-first-live-projection` | [#12](https://github.com/gttmr/af-companion/pull/12) | `782557bf7d62b43130af01a68f3da6ffb5b0bb58` | [live projection decision](../decision-log.md) |
| P5 | `agent/web-first-error-recovery` | [#13](https://github.com/gttmr/af-companion/pull/13) | `697b953f18e1e7d7a2aab693066bf440acd4a881` | [recovery decision](../decision-log.md) |
| P6 | `agent/web-first-materialization-handoff` | [#14](https://github.com/gttmr/af-companion/pull/14) | `2166f67413ecf1b90191d759bcba582ee8fdd47e` | [Materialization launch decision](../decision-log.md) |
| P7 | `agent/web-first-journey-acceptance` | [#15](https://github.com/gttmr/af-companion/pull/15) | `54fa43305ad9a94fe1cb19370465f67e452c9285` | [P7 actual acceptance](web-first-journey-status.md) |
| Graph-primary correction | `agent/web-first-graph-primary` | [#17](https://github.com/gttmr/af-companion/pull/17) | `04a4eb5eb01618cfc2430905bdf765c153d0f64c` | [Graph-primary decision](../decision-log.md) |
| Bootstrap follow-up | `agent/web-first-materialization-bootstrap` | [#18](https://github.com/gttmr/af-companion/pull/18) | merge pending | [Bootstrap Grant decision](../decision-log.md) |

PR #15의 `mergeCommit.oid`와 현재 `origin/main`의 first-parent history에서 위 SHA를
재확인했다.

## 실제 구현 여정

| 순서 | Actor | 오늘 실제 동작한 것 |
| --- | --- | --- |
| 1 | 사용자 | Web `/`에서 application 이름 `journey acceptance` 입력. |
| 2 | 사용자 | `작업 시작하고 VS Code 열기` 한 번 클릭. |
| 3 | 사용자 | server-derived `~/work/af-apps/journey-acceptance` 경로 한 번 확인. |
| 4 | Web server | strict 빈 Work Item, app Git root, MCP context/config, ignored local Application Registry 생성. |
| 5 | Web server | app-first/factory-second private `.code-workspace` 생성 후 `code --new-window` 호출. |
| 6 | 사용자 | VS Code Workspace Trust 승인. |
| 7 | VS Code | trusted `folderOpen` Task가 dedicated maximized terminal에서 `af companion vscode-start` 실행. |
| 8 | CLI/Bridge | terminal 시점에 `af_vscode_launch` ticket 발급, factory-cwd Codex 시작, fresh human prompt에서 exact scope claim. |
| 9 | 사용자 | 자연어 요구사항 입력, `/model`에서 `gpt-5.6-luna`, 이어지는 effort picker에서 `low` 선택. |
| 10 | Web | exact active Plan Session, application/Work Item/role과 Hook activity 표시. |
| 11 | CLI | `request_user_input`으로 여러 선택지를 한 질문씩 표시하고 사용자 결정 9개 수집. |
| 12 | Web | bounded tool activity와 Skill 상태만 표시하고 CLI 질문 본문은 투영하지 않음. |
| 13 | Plan | 빈 ledger와 Bridge canonical check의 순환 선행조건을 확인하고 marker 없이 `BLOCKED` 종료. |
| 14 | Web | Bridge 종료 probe에서 `bridge_down`과 재시작 안내 표시; 재시작 뒤 offline 해제. |

실측 interaction은 application 이름 1회, initial 자연어 요구 1회, primary click 1회,
path/Trust gate 2회, ID/Capsule/shell 입력 0회였다. 결정 답변은 terminal의 structured
Question 선택으로 별도 수행했다. 첫 launch의 `T1−T0`는 `21.689s`; terminal-ready와
후속 구간은 host interruption 때문에 연속 latency를 검증하지 못했다. 상세 timestamp와
Session/Decision evidence는 [P7 상태](web-first-journey-status.md)에 있다.

## Cold machine 재현

지원 대상은 Windows Host + WSL2 + VS Code Remote-WSL이다. Native Windows는 아직
지원하지 않는다. 먼저 checkout과 runtime을 확인한다.

```bash
cd /home/ilmaswsl/work/af-companion
git fetch origin
git switch main
git pull --ff-only origin main
git status --short

code --version
codex --version
node --version
npm --version
```

Fresh checkout에 web dependencies가 없으면 한 번 설치한다.

```bash
cd /home/ilmaswsl/work/af-companion/packages/web
npm install
```

두 WSL terminal에서 Bridge와 Web을 각각 시작한다. 고정 listener가 다른 process에
점유됐으면 port를 바꾸지 말고 owner를 먼저 판별한다.

```bash
cd /home/ilmaswsl/work/af-companion/packages/web
lsof -nP -iTCP:8898 -sTCP:LISTEN
npm run dev:companion-bridge
```

```bash
cd /home/ilmaswsl/work/af-companion
lsof -nP -iTCP:8890 -sTCP:LISTEN
./scripts/start-manual-web-test.sh
curl -I http://127.0.0.1:8890/
```

브라우저에서 `http://127.0.0.1:8890/`만 연다. `새 작업 시작`에 충돌하지 않는 새 이름
(예: `journey acceptance repro 1`)을 입력하고 primary action을 한 번 클릭한다. 새 경로를
확인하고 VS Code가 열리면 Workspace Trust를 승인한다. Automatic Task가 시작되지 않을
때만 fallback으로 `Ctrl+Shift+B`를 한 번 누른다. terminal Codex가 입력 가능해지면
자연어 요구를 직접 입력한다. 정상 제품 경로에서 application/work ID, Capsule 또는
shell command를 terminal에 입력하지 않는다.

질문 선택 UX를 재검증할 때 `/model`은 먼저 model picker, 다음에 effort picker를 연다.
이번 acceptance와 향후 동일 회귀 테스트는 `gpt-5.6-luna` + `low`를 사용한다.

Chrome DevTools로 실화면을 확인할 때는 먼저 다음 gate가 JSON과
`webSocketDebuggerUrl`을 반환하는지 확인한다.

```bash
curl -s http://127.0.0.1:8899/json/version
```

## 계약 경계

Web-first 구현이 추가한 일곱 경계는 [Decision Log](../decision-log.md)에 날짜순으로
남아 있다.

1. Web canonical write는 guarded `POST /api/work-items`의 **새 빈 v2 ledger 한 건**으로
   제한된다. 기존 ledger field는 수정하지 않는다.
2. Browser는 workspace descriptor를 만들고 `code`를 호출할 뿐 Codex turn을 시작하지
   않는다. Process와 첫 turn은 trusted VS Code terminal이 소유한다.
3. Generated multi-root descriptor만 registered app root를 열 수 있다. 기존 file/diff
   open containment는 factory 내부로 유지된다.
4. `af_vscode_launch` enrollment는 Task terminal에서 발급된다. Ticket/Lease/Hook
   crypto와 exact scope 검사는 바뀌지 않았다.
5. Browser는 Capsule/command를 렌더링하지 않으며 HTTP status를 “지원하지 않음”으로
   뭉개지 않고 stable cause code로 복구 UX를 고른다.
6. Factory-cwd Codex는 app root `.codex/config.toml` MCP를 소비하지 않는다. Export는
   future app-rooted client용으로만 유지한다.
7. Strict pristine Work Item의 첫 Plan→Materialization 전환만 local Bootstrap Grant를
   사용한다. exact ETag/source turn/Plan hash/expiry/one-time fresh claim을 검사하고,
   browser는 Grant ID 외 Capsule/Plan을 받지 않는다. 이후 전환은 canonical Handoff다.

P7은 이 경계를 넓히지 않았다. Generated workspace의 terminal panel만 최대화해 CLI가
이미 제공한 여러 Question option을 보이게 했다. Handoff authority나 Decision 의미는
바꾸지 않았다.

후속 제품 결정은 P7의 “Web Question body FAIL” 분류를 철회했다. Web은 CLI 대화를
복제하지 않고 Graph IR, Root Executable, composition, application/source evidence를
표시한다. 이 정정은 Handoff 순환 blocker를 해소하지 않는다.

## Phase별 파일 지도

다음은 각 merged phase의 first-parent diff에 포함된 tracked path다. 반복된 파일은 여러
phase가 실제로 같은 active 문서를 갱신했기 때문에 그대로 둔다.

- **P0:** `docs/migration/web-first-journey-spike-status.md`.
- **P1:** `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `STATUS.md`,
  `docs/decision-log.md`, `docs/handbook/index.md`, `docs/handbook/overview.md`,
  `docs/handbook/registers.md`, `docs/handbook/work/work-item-lifecycle.md`,
  `docs/workbench/AGENTS.md`, `docs/workbench/cli-companion.md`,
  `docs/workbench/local-dev-security.md`, `docs/workbench/operating-model.md`,
  `docs/workbench/workflow-decision-guide.md`, `packages/web/AGENTS.md`,
  `packages/web/server/applicationRegistryStore.ts`,
  `packages/web/server/workItemApi.test.ts`, `packages/web/server/workItemApi.ts`.
- **P2:** `.gitignore`, `CLAUDE.md`, `README.md`, `STATUS.md`, `docs/README.md`,
  `docs/decision-log.md`, `docs/handbook/index.md`,
  `docs/handbook/work/live-companion.md`,
  `docs/migration/web-first-journey-p2-launch-chain-status.md`,
  `docs/workbench/cli-companion.md`, `docs/workbench/operating-model.md`,
  `packages/web/server/codexCompanionApi.test.ts`,
  `packages/web/server/codexCompanionApi.ts`,
  `packages/web/server/vscodeWorkspaceLauncher.test.ts`,
  `packages/web/server/vscodeWorkspaceLauncher.ts`, `scripts/af-cli.test.mjs`,
  `scripts/af.mjs`.
- **P3:** `CLAUDE.md`, `README.md`, `STATUS.md`, `docs/decision-log.md`,
  `docs/handbook/index.md`, `docs/handbook/work/live-companion.md`,
  `docs/visualization/design-system.md`, `docs/workbench/cli-companion.md`,
  `docs/workbench/operating-model.md`, `packages/web/src/companion/types.ts`,
  `packages/web/src/components/JourneyGuideDialog.tsx`,
  `packages/web/src/layout/LiveRail.tsx`, `packages/web/src/layout/LiveWorkbenchLayout.tsx`,
  `packages/web/src/routes/ConnectionsPage.tsx`,
  `packages/web/src/routes/WorkspaceHome.tsx`,
  `packages/web/src/routes/work/ComposeWorkspace.tsx`,
  `packages/web/src/state/useCodexSessions.ts`,
  `packages/web/src/styles/router/live-workbench.css`,
  `packages/web/src/workspace/api.ts`.
- **P4:** `CLAUDE.md`, `README.md`, `STATUS.md`, `docs/decision-log.md`,
  `docs/handbook/index.md`, `docs/handbook/work/live-companion.md`,
  `docs/visualization/design-system.md`, `docs/workbench/operating-model.md`,
  `packages/web/server/workItemApi.ts`, `packages/web/server/workspaceApi.ts`,
  `packages/web/server/workspaceProjection.test.ts`,
  `packages/web/server/workspaceProjection.ts`, `packages/web/src/layout/LiveRail.tsx`,
  `packages/web/src/layout/LiveWorkbenchLayout.tsx`,
  `packages/web/src/layout/WaitingDecisionStrip.tsx`,
  `packages/web/src/layout/WorkLiveStrip.tsx`,
  `packages/web/src/routes/WorkspaceHome.tsx`,
  `packages/web/src/routes/work/SkillScreenHeader.tsx`,
  `packages/web/src/styles/router/live-workbench.css`,
  `packages/web/src/workspace/types.ts`,
  `packages/web/src/workspace/useWorkspaceProjection.ts`.
- **P5:** `docs/decision-log.md`, `docs/handbook/work/live-companion.md`,
  `docs/workbench/cli-companion.md`, `docs/workbench/operating-model.md`,
  `packages/web/package.json`, `packages/web/server/codexCompanionApi.test.ts`,
  `packages/web/server/codexCompanionApi.ts`,
  `packages/web/server/vscodeWorkspaceLauncher.test.ts`,
  `packages/web/server/vscodeWorkspaceLauncher.ts`,
  `packages/web/server/workItemApi.test.ts`, `packages/web/server/workItemApi.ts`,
  `packages/web/src/companion/journeyRecovery.test.ts`,
  `packages/web/src/companion/journeyRecovery.ts`,
  `packages/web/src/components/JourneyRecoveryPanel.tsx`,
  `packages/web/src/routes/WorkspaceHome.tsx`,
  `packages/web/src/state/useCodexSessions.ts`,
  `packages/web/src/styles/router/live-workbench.css`,
  `packages/web/src/workspace/api.ts`.
- **P6:** `docs/decision-log.md`, `docs/handbook/work/live-companion.md`,
  `docs/workbench/cli-companion.md`, `docs/workbench/operating-model.md`,
  `packages/web/server/codexCompanionApi.test.ts`,
  `packages/web/server/codexCompanionApi.ts`,
  `packages/web/server/vscodeWorkspaceLauncher.test.ts`,
  `packages/web/server/vscodeWorkspaceLauncher.ts`,
  `packages/web/src/companion/types.ts`,
  `packages/web/src/routes/work/DiscoverWorkspace.tsx`,
  `packages/web/src/state/useCodexSessions.ts`,
  `packages/web/src/styles/router/live-workbench.css`.
- **P7:** `packages/web/server/vscodeWorkspaceLauncher.ts`,
  `packages/web/server/vscodeWorkspaceLauncher.test.ts`, `README.md`, `STATUS.md`,
  `CLAUDE.md`, `docs/README.md`, `docs/decision-log.md`,
  `docs/workbench/cli-companion.md`, `docs/handbook/work/live-companion.md`,
  `docs/migration/web-first-journey-status.md`,
  `docs/migration/web-first-journey-handoff.md`.

## 한계와 fallback

| Gate / 기능 | 현재 결과 | Fallback |
| --- | --- | --- |
| G0-1 `folderOpen` Task | PASS | `Ctrl+Shift+B` 불필요; cold host에서 auto Task가 실패할 때만 1회 사용. |
| G0-2 interactive TUI | PASS | terminal profile fallback 미발동. |
| G0-3 external writable root | P0 PASS | artifact-local `runtime-stub/` fallback 미발동. |
| G0-4 factory-cwd claim | PASS | `registered_application` 보안 재설계 미발동. |
| G1 production `af_vscode_launch` | PASS | P7에서도 claimed ticket 1건 재확인. |
| G2 external watcher | P4 fixture/실측 PASS | depth 6과 excluded tree 한계는 유지. P7에서는 durable source 생성 단계 미도달. |
| P7 terminal choices | PASS after panel fix | semantic one-choice fallback 없음; 여러 option이 정상 계약. |
| Web Question body | N/A | CLI-owned이며 Web projection 대상에서 제외. |
| Plan→Materialization | CLAIM LIVE VERIFIED / PHASE B UNVERIFIED | pristine Bootstrap Grant가 실제 Luna low fresh CLI에서 exact claim됨. Materialization write, auto-finalize, Graph/source까지의 uninterrupted acceptance 필요. |
| Bridge recovery | PASS | Web은 spawn하지 않고 operator에게 restart 명령을 안내; restart는 기존 participation을 만료시켜 fresh launch 필요. |

## 미완료 후속 작업

우선순위는 다음과 같다.

1. §9 전체 acceptance를 Bootstrap Grant 경로로 한 번의 끊기지 않은 cold run에서 반복하고
   T2/T3/T4/T5를 다시 측정한다.
2. **run/test/eval 결과의 Web 표시** — 결정 6에서 유예된 필수 후속이다.
3. VS Code extension chat 경로 — 별도 feasibility gate 통과 전 지원 선언 금지.
4. `registered_application` workspace eligibility — 별도 보안 검토 필요.
5. Factory-cwd Session의 app-root project MCP 미소비 문제.
6. External app watcher `depth: 6`의 깊은 tree 누락과 large tree 성능 측정.
7. Native Windows 지원.

## 다음 세션이 먼저 실행할 명령

`STATUS.md`의 branch-neutral verification gate를 그대로 실행한다. Fresh P7 후속
worktree에는 ignored ADK venv가 없을 수 있으므로 검증된 Python을 명시한다.

```bash
cd /home/ilmaswsl/work/af-companion
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse --short HEAD

/home/ilmaswsl/work/af-companion/.agent-factory/runtime/.venv/bin/python \
  -c 'import google.adk; print(google.adk.__version__)'
export AF_TEST_PYTHON=/home/ilmaswsl/work/af-companion/.agent-factory/runtime/.venv/bin/python

node scripts/validate-skills.mjs
node scripts/validate-artifacts.mjs
cd packages/web
npm run test:contracts
npm run test:companion
npm run build
```

그 다음 Bootstrap Grant source와 exact canonical finalization을 다시 확인한다.

```bash
cd /home/ilmaswsl/work/af-companion
rg -n "createMaterializationGrant|continueMaterializationGrant|finalized|session_handoffs" \
  packages/web/server/codexBridgeStore.ts .agents/skills/af-discover-assets/SKILL.md
```

## 사용자 승인이 필요한 결정

Bootstrap blocker 결정은 다음과 같이 확정됐다.

- **`web-first.plan-handoff-bootstrap.v1`:** 로컬 단일 사용자의 무결성만 보장하는 별도
  pristine Bootstrap Grant. Phase A tracked write와 fake revision은 만들지 않고, ignored
  mode-`0600` local Plan state, exact ETag/source turn/hash/expiry/one-time claim, restart
  recovery와 exact canonical auto-finalization을 사용한다. Existing Handoff crypto와
  restart-fail 계약은 유지한다.

아직 사용자 판단이 필요한 결정은 하나다.

1. **`web-first.launch-slo-clock.v1`:** `T2≤90s` 측정에서 사용자가 Workspace Trust를
   판단하는 시간을 포함할지, Trust 승인 시점을 별도 gate clock으로 분리할지.

새 Bootstrap 경로의 live acceptance 전에는 fresh Materialization 성공을 선언하지 않는다.
