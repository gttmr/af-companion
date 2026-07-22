# Hook-first Codex Companion

> 이 문서는 Agent Factory와 외부 Codex CLI·IDE extension 사이의 목표 경계와 Hook-first MVP의 Current Implementation을 분리해 설명한다. 자산 분류는 [Taxonomy](taxonomy.md), Graph 의미는 [Graph IR](graph-ir.md), 승인·artifact 흐름은 [Operating Model](operating-model.md)이 소유한다.

## 목적

Codex Companion은 Workbench에서 검토 중인 Graph 문맥을 사용자가 선택한 외부 Codex CLI 또는 VS Code Codex session의 **다음 프롬프트**에 한 번 전달한다. Workbench가 Codex turn을 시작하거나 진행 중인 turn을 steer하지 않으며, VS Code 창을 여는 동작도 Codex session 생성·선택으로 해석하지 않는다. 선택한 Graph 문맥을 새 자산이나 canonical artifact로 승격하지 않는다.

최상위 자산은 계속 Agent·Workflow·Tool뿐이고 A2A는 Agent의 Binding/Exposure다. `af-workflow`와 네 Work Skill로 구성된 canonical 5-skill 체계도 이 MVP에서 바뀌지 않는다.

## Target Contract

목표 write ownership은 다음과 같다.

- 외부 Codex CLI가 canonical worktree를 쓴다.
- Agent Factory는 canonical worktree를 관찰·정규화해 Workbench에 projection하고 Interaction state만 쓴다.
- workspace identity는 remote URL이 아니라 canonical local path hash를 사용한다. remote가 바뀌어도 같은 local workspace의 identity가 조용히 바뀌지 않는다.

이 경계는 migration target이다. 일반 Workspace Observer, source·git·evidence normalized projection, CLI가 소유하는 전체 canonical write flow는 아직 Current Implementation이 아니다.

## Current Implementation — Project Hook과 Session Manager

현재 MVP는 다음 경로만 구현한다.

```text
strict analysis-result.json
  -> browser facade가 ordered Selection Bundle 생성
  -> loopback Codex Bridge에 exact session 대상으로 queue
  -> Codex CLI 또는 IDE의 UserPromptSubmit Hook
  -> hookSpecificOutput.additionalContext로 한 번 전달
  -> delivery ledger를 consumed + turn_id로 갱신
```

- tracked `.codex/hooks.json`과 enabled repo/team plugin은 서로 독립적인 thin bootstrap이다. CLI와 IDE extension에서 관찰한 `SessionStart`와 `UserPromptSubmit`을 모두 workspace-owned adapter에 위임하며, 어느 source가 실제로 로드됐는지 서로 추측하지 않는다.
- `scripts/af-codex-hook-protocol.mjs`가 외부 Codex Hook input/output shape를 최소 bridge payload와 `hookSpecificOutput.additionalContext`로 정규화하고, `scripts/af-codex-hook.mjs`는 endpoint discovery와 authenticated loopback transport만 소유한다. 이후 CLI·IDE Hook schema 변화는 protocol adapter에서 우선 흡수하며 plugin bootstrap과 broker state 계약을 바꾸지 않는다.
- project와 plugin Hook이 함께 실행돼도 broker의 `(session_id, turn_id)` receipt와 serialized mutation이 같은 prompt의 두 번째 호출을 no-content로 끝내므로 다음 delivery를 중복 소비하지 않는다. `SessionStart` 중복 관찰도 같은 exact session record를 갱신한다.
- 현재 확인한 host에는 Codex CLI `0.144.6`, VS Code `1.129.1`, `openai.chatgpt@26.715.61943`이 설치돼 있다. 화면의 capability probe는 실행 시점의 실제 값을 다시 읽으며 특정 version을 기능 계약으로 고정하지 않는다.
- 현재 `0.144.6`은 `SessionEnd`를 노출하지 않는다. session lifecycle은 마지막 Hook 관찰 시각 기준 30분 TTL로 active/stale를 판정한다.
- Session Registry는 Hook이 관찰한 exact ID, contained cwd, model, permission mode, start source, 마지막 event/turn을 저장한다. AF-only alias와 explicit default target은 Codex chat 이름이나 IDE 선택을 바꾸지 않는다.
- Bridge 재시작 뒤 `SessionStart`가 오지 않아도 첫 `UserPromptSubmit`의 contained cwd를 확인해 session을 복구한다. `(session_id, turn_id)` receipt는 bounded metadata로 유지하며 같은 turn의 중복 Hook이 다음 delivery까지 소비하지 않게 한다.
- Codex Bridge는 별도 loopback process다. 임의 bearer endpoint, workspace별 single-process lock, exact session target, repository 안으로 resolve되는 `cwd` containment를 요구한다.
- Interaction state는 ignored `.agent-factory/codex-bridge/v1` 아래에 저장한다. directory는 `0700`, state·endpoint·lock file은 `0600`이며 JSON은 temp file과 rename으로 원자 교체한다.
- delivery는 `next_prompt` + `once`만 허용한다. 가장 오래된 queued bundle 하나를 다음 `UserPromptSubmit`에서 consumed로 바꾸고 같은 원자적 mutation에 `consumed_turn_id`를 기록한다.
- Selection Bundle TTL은 15분이다. 만료된 bundle은 전달하지 않는다.

### Local 실행과 IDE 연결

Bridge를 별도 process로 명시적으로 시작한다.

```bash
cd packages/web
npm run dev:companion-bridge
```

Workbench는 기존 고정 port 계약대로 다른 terminal에서 시작한다.

```bash
cd packages/web
npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
```

CLI 또는 VS Code Codex에서 이 Worktree를 처음 사용할 때 실제로 로드된 project/plugin Hook의 현재 hash를 검토하고 trust해야 한다. CLI에서는 `/hooks`로 source와 hash를 확인할 수 있다. Hook 변경이나 plugin 재설치 뒤에는 새 hash를 다시 trust하고 새 thread에서 확인한다.

`/sessions`에서 `VS Code에서 Worktree 열기`를 누르면 server가 client 입력 없이 canonical root에 대해 `code --new-window <root>`만 실행한다. 그다음 사용자가 VS Code Codex에서 새 chat을 만들거나 기존 chat을 resume하고 prompt를 제출하면 Hook 관찰 뒤 session이 목록에 나타난다. Web은 extension의 private thread API나 deep link를 사용하지 않으며 현재 IDE에서 선택된 chat을 직접 읽지 않는다.

Bridge가 꺼져 있으면 Hook은 fail-open으로 종료해 prompt를 막지 않는다. Bridge를 다시 켠 뒤에는 다음 prompt의 `UserPromptSubmit`으로 registry를 복구할 수 있지만, Bridge가 꺼져 있던 동안 queue된 적 없는 Context를 소급 전달하지 않는다.

## Browser facade와 Graph UX

브라우저는 bundle 내용을 직접 구성하지 않는다. 허용된 local Workbench Host(`127.0.0.1`, `localhost`, `::1`)의 같은 Origin·loopback 요청으로 requirement ID, **순서가 보존된** Node ID, 대상 session, 선택 의도, 예상 analysis ETag만 보낸다. Server facade가 strict Target Contract v2 `analysis-result.json`을 다시 읽고 canonical Graph와 Asset metadata에서 Selection Bundle을 만든다. ETag가 바뀌었으면 `409 stale_selection`으로 거부한다.

Design Graph의 `CLI Context`는 명시적 선택 mode다.

- Node만 선택하며 선택 순서를 표시한다. MVP 한도는 20개다.
- companion drawer는 선택 목록, 첨부 미리보기, 선택 의도, active session 선택, queue action, delivery ledger를 한 작업면에 둔다. 첫 live session으로 자동 retarget하지 않고 사용자가 지정한 active default만 초기값으로 사용한다.
- Graph edit mode와 CLI Context mode는 동시에 활성화하지 않는다.
- canonical analysis ETag가 바뀌면 기존 Node 선택을 초기화한다.
- current live Graph projection은 `analysis-result.json`을 1.5초마다 polling하는 최소 구현이다. 일반 source/git/evidence observer나 SSE projection이 아니다.

Selection Bundle에는 선택 Node metadata, 선택 Node 사이의 직접 Edge, typed ref로 연결된 Agent·Workflow·Tool metadata, revision, 선택 의도만 포함한다. Node label·Asset owner/domain·선택 의도 같은 자유문자열은 알려진 secret pattern을 `[REDACTED]`로 바꾸고, stable reference에 secret pattern이 있으면 bundle 생성을 거부한다. source contents, transcript contents, raw prompt는 Interaction state에 저장하지 않는다.

## Connector capability

Bridge 시작 시 외부 설치 Codex version을 shell 없이 `codex --version`으로 probe한다. `PATH` 후보 중 local `node_modules/.bin`은 건너뛰어 Workbench dependency를 사용자 CLI로 오인하지 않는다.

현재 capability는 다음과 같다.

| Capability | Current |
| --- | --- |
| Session registration | `true` |
| Next-prompt Context | `true` |
| Codex/model delivery ack | `false` — ledger의 `consumed`는 Hook consume 기록이며 model 수신 보장이 아니다. |
| SessionEnd event | `unsupported` |
| MCP context pull | `false` |
| Direct turn start | `false` |
| In-flight steer | `false` |

`/sessions`의 VS Code/extension probe와 Bridge capability는 별도다. VS Code launch 성공은 editor handoff가 받아들여졌다는 뜻일 뿐, Codex Hook 관찰이나 session 연결 성공을 의미하지 않는다.

## 현재 유지되는 기존 경로

Hook-first MVP는 Web Stage Runner, canonical artifact editor, approval gate, Build/Verify trigger를 retire하거나 우회하지 않는다. 이 경로들은 계속 Current Implementation이다. 특히 `analysis-result.json`과 Graph save의 write ownership은 아직 Agent Factory server 경로에도 남아 있다.

Target write ownership과 Current Implementation의 차이는 [CLI Companion Migration Status](../migration/cli-companion-status.md)에서 추적한다.

## Live proof — 2026-07-22

기준 remote main commit `2e92e05ef22ec5c345e7137d75465a08586db559`에서 시작한 이 worktree에서 다음 경로를 실제로 확인했다.

1. repo marketplace를 임시 `CODEX_HOME`에 설치해 사용자 config를 변경하지 않았다.
2. plugin을 통해 실제 Codex session이 등록됐다.
3. `node-live-alpha`, `node-live-beta`를 그 exact session에 queue했다.
4. resume한 session의 다음 prompt가 두 ID를 그대로 `additionalContext`에서 받았다.
5. delivery ledger가 해당 turn ID와 함께 `consumed`가 됐다.

이 proof는 CLI Hook-first next-prompt 전달을 증명한다. Project Hook을 통한 IDE session 등록·consume은 새 Hook hash를 trust한 VS Code Codex session에서 별도 수동 acceptance가 필요하다. 일반 Workspace Observer, MCP context pull, turn start/steer 또는 production 운영 준비를 증명하지 않는다.

병렬 bootstrap 보강 뒤에는 cachebuster `0.1.0+codex.20260722140353` plugin을 local marketplace에서 재설치하고 추가 live probe를 수행했다. 일회성 실제 `codex exec`가 새 session과 prompt receipt를 자동 등록했고, installed plugin entry는 project Hook 파일이 있는 현재 worktree에서도 queued synthetic Context를 반환해 ledger를 `consumed`로 바꿨다. 같은 `(session_id, turn_id)` 재호출에서는 stdout이 비고 두 번째 delivery가 queued로 유지됐으며 검증 뒤 canceled로 정리했다. 이 proof도 IDE 화면에서 새 thread를 만든 실제 extension acceptance를 대신하지 않는다.

## Deferred

- 일반 Workspace Observer와 normalized source·git·evidence projection
- MCP deep context
- Shared App Server의 turn start와 in-flight steer
- Graph node 외 source/symbol, edge, asset, handbook, finding 선택 kind
- 현재 Codex release가 지원하지 않는 `SessionEnd`
- 기존 Web Stage Runner, canonical editor, approval, Build/Verify 경로의 retirement/removal

## Current source locators

2026-07-22 현재 CLI Companion worktree에서 path와 stable anchor를 다시 확인했다. Handbook의 행동 지도는 [cli-companion-context-delivery](../handbook/stages/cli-companion-context-delivery.md)에서 찾는다.

| 행동 | Path | Stable anchor |
| --- | --- | --- |
| Selection Bundle 생성·redaction·preview | `packages/web/src/companion/selectionBundle.ts` | `buildSelectionBundleV1`, `renderSelectionBundlePreview` |
| Graph 선택과 companion drawer | `packages/web/src/components/GraphCanvas.tsx`, `packages/web/src/routes/design/DesignGraphPanel.tsx`, `packages/web/src/companion/CodexContextDrawer.tsx` | `GraphCanvas`, `DesignGraphPanel`, `CodexContextDrawer` |
| client polling·queue | `packages/web/src/state/useCodexCompanion.ts`, `packages/web/src/state/useAnalysisArtifact.ts` | `useCodexCompanion`, `useAnalysisArtifact` |
| Session 관리 화면과 editor handoff | `packages/web/src/routes/CodexSessionsPage.tsx`, `packages/web/src/state/useCodexSessions.ts`, `packages/web/server/vscodeWorkspaceLauncher.ts` | `CodexSessionsPage`, `useCodexSessions`, `VscodeWorkspaceLauncher` |
| browser facade | `packages/web/server/codexCompanionApi.ts` | `createCodexCompanionMiddleware` |
| broker state와 consume | `packages/web/server/codexBridgeStore.ts` | `CodexBridgeStore`, `renderSelectionContext` |
| loopback process와 Codex probe | `packages/web/server/codexBridgeServer.ts`, `packages/web/server/codexBridgeMain.ts` | `startCodexBridgeServer`, `probeInstalledCodexVersion`, `runCodexBridgeMain` |
| Hook bootstraps와 protocol adapter | `.codex/hooks.json`, `scripts/af-codex-hook.mjs`, `scripts/af-codex-hook-protocol.mjs`, `plugins/agent-factory-companion/scripts/af-codex-hook-entry.mjs`, `plugins/agent-factory-companion/hooks/hooks.json`, `.agents/plugins/marketplace.json` | `hooks.SessionStart`, `hooks.UserPromptSubmit`, `run`, `toBridgeHookInput`, `toCodexHookOutput`, `findWorkspaceAdapter`, `plugins[name=agent-factory-companion]` |
