# cli-companion-context-delivery CLI Context 전달

## 목적

Design Graph에서 사용자가 순서대로 선택한 Node 문맥을 project/plugin Hook bootstrap으로 관찰한 exact Codex CLI 또는 IDE session의 다음 프롬프트에 한 번 첨부하고, session·queue·consume 결과를 Interaction state 화면에서 확인한다.

## Trigger와 진입 조건

- Trigger: `/sessions`에서 Hook-observed session을 관리하거나 Design review의 `CLI Context` mode에서 Node를 선택하고 `다음 Codex 프롬프트에 첨부`를 실행
- 진입 조건: strict Target v2 `analysis-result.json`, 현재 analysis ETag, 1~20개 ordered Node ID, repository 안에서 등록된 active Codex session, 실행 중인 loopback bridge가 필요하다.

## 종료 조건

- queue 성공 시 immutable Selection Bundle과 `queued` delivery가 Interaction state에 기록된다.
- 대상 session의 다음 `UserPromptSubmit`이 bundle을 `additionalContext`로 받고 같은 state mutation에서 delivery가 `consumed`와 `consumed_turn_id`를 기록한다.
- 다음 prompt가 15분 안에 오지 않으면 bundle은 `expired`가 된다.

## 주요 입력

- canonical `analysis-result.json`의 Graph와 Asset metadata, ETag
- ordered Graph Node IDs, redacted Graph·Asset free text, optional redacted user intent
- active Codex session ID
- local Git HEAD와 dirty hash, canonical local workspace path

## 주요 출력

- `reg.selection-bundle`
- `reg.context-delivery-ledger`
- Codex Hook의 `hookSpecificOutput.additionalContext`
- `reg.codex-session-registry`의 last-seen/active 상태

## Main Flow

1. Design review에서 명시적 CLI Context mode를 열고 Graph Node를 최대 20개까지 순서대로 선택한다.
2. client는 requirement ID, Node IDs, target session, intent, expected ETag만 same-origin browser facade에 보낸다.
3. facade는 canonical analysis를 strict parser로 다시 읽고 ETag를 비교한 뒤 local path hash, Git revision, Graph·Asset metadata로 15분 Selection Bundle을 만든다.
4. facade는 random bearer endpoint로 별도 loopback broker에 exact session delivery를 queue한다.
5. tracked project Hook 또는 enabled plugin의 thin bootstrap이 workspace adapter를 실행한다. Protocol adapter가 Codex payload를 최소 bridge shape로 정규화하고 transport adapter가 nearest workspace endpoint로 전달한다. 두 source가 함께 실행돼도 broker가 same-turn 중복을 제거한다.
6. broker는 `(session_id, turn_id)`를 먼저 중복 검사하고 target session의 가장 오래된 queued delivery 하나만 원자적으로 consumed 처리해 bounded `additionalContext`를 반환한다.
7. `/sessions`와 drawer는 같은 2초 snapshot polling으로 session과 delivery ledger를 갱신한다. 명시적 active default만 drawer 초기 target이 되며 첫 live session으로 자동 전환하지 않는다.

`useAnalysisArtifact`의 1.5초 polling은 현재 Graph projection의 최소 구현이다. source·git·evidence 전체 observer 또는 SSE가 아니다.

## 분기와 실패/needs-info

- expected ETag가 current analysis ETag와 다르면 facade가 `409 stale_selection`을 반환하며 bundle을 만들지 않는다.
- 선택 Node가 canonical Graph에 없거나 typed Asset ref가 후보와 맞지 않으면 bundle 검증이 실패한다.
- target session이 없거나 30분 TTL로 stale이면 queue를 거부한다.
- Bridge 재시작 뒤 unknown session의 첫 `UserPromptSubmit`은 contained cwd를 확인해 registry를 복구한다. 동일 `(session_id, turn_id)` 중복 호출은 두 번째 delivery를 소비하지 않는다.
- bundle은 `next_prompt`와 `once`만 허용한다. consumed delivery를 다시 전달하지 않는다.
- Hook endpoint, browser API, broker는 loopback 경계를 검사한다. browser API는 local Workbench Host allow-list를 적용하고 mutation은 same-origin도 요구한다.
- Hook payload의 transcript path와 raw prompt는 state에 저장하지 않는다. Graph·Asset·intent 자유문자열은 secret pattern redaction 뒤 bundle에 넣고 secret-like stable reference는 거부한다.
- 현재 connector capability는 MCP context pull, direct turn start, in-flight steer를 지원하지 않는다.
- Codex `0.144.6`에 `SessionEnd`가 없어 명시적 종료 대신 30분 TTL을 사용한다.

## 읽는 Register

- [`reg.analysis-result`](../registers.md#cross-stage-registers)
- [`reg.graph-ir`](../registers.md#cross-stage-registers)
- [`reg.codex-session-registry`](../registers.md#cross-stage-registers)
- [`reg.connector-capability`](../registers.md#cross-stage-registers)
- [`reg.context-delivery-ledger`](../registers.md#cross-stage-registers)

## 쓰는 Register

- [`reg.selection-bundle`](../registers.md#cross-stage-registers)
- [`reg.codex-session-registry`](../registers.md#cross-stage-registers)
- [`reg.context-delivery-ledger`](../registers.md#cross-stage-registers)

## 이전·다음 Stage

- 연결 지점: [design-boundary-contract](design-boundary-contract.md)의 Graph review
- 외부 다음 단계: 선택한 Codex CLI session의 다음 prompt
- 기존 Build·Verify·approval Stage를 대체하거나 retire하지 않는다.

## 외부 경계

- browser same-origin HTTP facade
- 별도 loopback-only Codex Bridge와 random bearer endpoint
- tracked project Hook과 enabled plugin의 독립 bootstrap, workspace-owned protocol/transport adapter
- external Codex CLI `0.144.6` 또는 VS Code Codex extension
- fixed-argv VS Code WSL launcher (`code --new-window <canonical-root>`)
- ignored local filesystem `.agent-factory/codex-bridge/v1`

## L3 Source Map

### Selection Bundle builder

- Path: `packages/web/src/companion/selectionBundle.ts`
- Stable anchor: `buildSelectionBundleV1`, `renderSelectionBundlePreview`
- Role in behavior: ordered Node selection을 canonical Graph·Asset metadata와 revision에 결합하고 Graph·Asset·intent 자유문자열을 redaction해 v1 bundle과 preview를 만든다.
- Inputs: strict Graph IR, Asset candidates, ordered Node IDs, workspace/artifact/revision metadata, intent, created/expiry time
- Outputs: immutable `SelectionBundleV1`, human-readable preview
- State/artifact reads: `reg.analysis-result`, `reg.graph-ir`
- State/artifact writes: callback을 통해 `reg.selection-bundle`
- Important callers: `createCodexCompanionMiddleware`
- Important callees: typed Node→Asset resolution, secret-pattern redaction, stable selection hash
- External boundaries: 없음
- Failure/edge behavior: empty/duplicate/20개 초과 selection, missing Node·Asset, typed ref mismatch, revision 부재, invalid TTL을 거부한다.
- Related registers: `reg.selection-bundle`, `reg.graph-ir`
- Verified at: base `2e92e05ef22ec5c345e7137d75465a08586db559` + 2026-07-22 CLI Companion worktree
- Locator status: `active`

### Graph selection and companion drawer

- Path: `packages/web/src/components/GraphCanvas.tsx`, `packages/web/src/routes/design/DesignGraphPanel.tsx`, `packages/web/src/companion/CodexContextDrawer.tsx`
- Stable anchor: `GraphCanvas`, `DesignGraphPanel`, `CodexContextDrawer`
- Role in behavior: explicit CLI Context mode, ordered max-20 Node selection, preview, session chooser, queue action과 delivery ledger를 Graph-dominant 작업면에 조합한다.
- Inputs: Graph IR, current selection, companion controller, active sessions와 deliveries
- Outputs: ordered Node toggles, target/intent change, queue action
- State/artifact reads: `reg.graph-ir`, `reg.codex-session-registry`, `reg.context-delivery-ledger`, `reg.connector-capability`
- State/artifact writes: client controller를 통해 `reg.selection-bundle`, `reg.context-delivery-ledger`
- Important callers: `DesignReviewStep`, `DesignWorkbench`
- Important callees: `useCodexCompanion`, React Flow node renderer
- External boundaries: browser interaction
- Failure/edge behavior: Graph invalid, ETag 미준비, active session 없음, capability false, edit mode active이면 queue 또는 mode 진입을 막는다.
- Related registers: `reg.graph-ir`, `reg.selection-bundle`, `reg.context-delivery-ledger`
- Verified at: base `2e92e05ef22ec5c345e7137d75465a08586db559` + 2026-07-22 CLI Companion worktree
- Locator status: `active`

### Client polling and queue hook

- Path: `packages/web/src/state/useCodexCompanion.ts`, `packages/web/src/state/useAnalysisArtifact.ts`
- Stable anchor: `useCodexCompanion`, `useAnalysisArtifact`
- Role in behavior: bridge snapshot을 2초, canonical analysis를 1.5초 polling하고 expected ETag를 포함한 queue mutation과 ordered selection state를 소유한다.
- Inputs: requirement ID, analysis ETag, available Node IDs, enabled state
- Outputs: session/delivery snapshot, selection controller, `/api/codex-companion/queue` request
- State/artifact reads: `reg.analysis-result`, `reg.codex-session-registry`, `reg.context-delivery-ledger`, `reg.connector-capability`
- State/artifact writes: HTTP mutation을 통해 `reg.selection-bundle`, `reg.context-delivery-ledger`
- Important callers: `DesignWorkbench`, `CodexContextDrawer`
- Important callees: TanStack Query, browser fetch
- External boundaries: browser HTTP와 query cache
- Failure/edge behavior: Graph ETag 변경 시 selection을 초기화한다. stale/missing explicit target은 보존해 queue를 막고 다른 live session으로 교체하지 않으며 active explicit default만 빈 target의 초기값이 된다. 이 polling은 general observer나 SSE가 아니다.
- Related registers: `reg.analysis-result`, `reg.codex-session-registry`, `reg.context-delivery-ledger`
- Verified at: base `2e92e05ef22ec5c345e7137d75465a08586db559` + 2026-07-22 CLI Companion worktree
- Locator status: `active`

### Session manager and VS Code Worktree launcher

- Path: `packages/web/src/routes/CodexSessionsPage.tsx`, `packages/web/src/state/useCodexSessions.ts`, `packages/web/server/vscodeWorkspaceLauncher.ts`
- Stable anchor: `CodexSessionsPage`, `useCodexSessions`, `VscodeWorkspaceLauncher`
- Role in behavior: shared snapshot polling으로 Hook-observed session과 delivery를 표·inspector에 표시하고 AF-only alias/default를 관리한다. 명시적 button은 server가 선택한 host `code` executable에 고정된 `--new-window <canonical-root>` argv만 전달한다.
- Inputs: companion snapshot, selected session ID, alias/default mutation, empty launch request
- Outputs: active/stale session view, preference result, delivery cancel, editor capability와 launch accepted receipt
- State/artifact reads: `reg.codex-session-registry`, `reg.context-delivery-ledger`, external VS Code version/extension list
- State/artifact writes: broker를 통한 session preference와 delivery cancel; VS Code process handoff. canonical artifact는 쓰지 않는다.
- Important callers: `/sessions`, `CodexContextDrawer`
- Important callees: browser companion facade, React Query cache, `code --version`, `code --list-extensions --show-versions`, `code --new-window`
- External boundaries: same-origin HTTP, trusted host executable, WSL VS Code handoff
- Failure/edge behavior: client가 path·command·flag를 지정할 수 없고 repository 안 executable을 거부한다. Launch accepted를 Codex session 생성·선택으로 표시하지 않으며 session은 Hook 관찰 뒤에만 나타난다. stale/missing explicit target을 다른 live session으로 자동 교체하지 않는다.
- Related registers: `reg.codex-session-registry`, `reg.context-delivery-ledger`, `reg.connector-capability`
- Verified at: base `2e92e05ef22ec5c345e7137d75465a08586db559` + 2026-07-22 CLI Companion worktree
- Locator status: `active`

### Browser facade

- Path: `packages/web/server/codexCompanionApi.ts`
- Stable anchor: `createCodexCompanionMiddleware`
- Role in behavior: browser의 최소 selection request를 strict canonical analysis와 server-owned revision metadata로 bundle화하고 broker snapshot/queue/cancel을 중계한다.
- Inputs: same-origin loopback HTTP, requirement ID, ordered Node IDs, target session, intent, expected ETag
- Outputs: Selection Bundle preview, delivery, enriched bridge/editor snapshot, session preference result, VS Code launch receipt
- State/artifact reads: `reg.analysis-result`, `reg.codex-session-registry`, `reg.context-delivery-ledger`, bridge endpoint
- State/artifact writes: broker를 통해 `reg.selection-bundle`, `reg.context-delivery-ledger`
- Important callers: Vite middleware mount, `useCodexCompanion`
- Important callees: `ArtifactRootStore`, `parseTargetAnalysisResult`, `buildSelectionBundleV1`, broker fetch
- External boundaries: HTTP, Git subprocess, local filesystem endpoint
- Failure/edge behavior: non-loopback, cross-origin, non-JSON, invalid req/Node/session, stale ETag, invalid strict analysis, untrusted endpoint를 fail-closed한다.
- Related registers: `reg.analysis-result`, `reg.selection-bundle`, `reg.context-delivery-ledger`
- Verified at: base `2e92e05ef22ec5c345e7137d75465a08586db559` + 2026-07-22 CLI Companion worktree
- Locator status: `active`

### Broker store and atomic consume

- Path: `packages/web/server/codexBridgeStore.ts`
- Stable anchor: `CodexBridgeStore`, `renderSelectionContext`
- Role in behavior: session registry와 delivery ledger를 `0600` atomic JSON으로 유지하고 exact session의 queued bundle 하나를 consumed 처리해 bounded `additionalContext`로 렌더링한다.
- Inputs: validated Hook payload, validated bundle delivery, 30분 session TTL
- Outputs: session/delivery snapshot, optional `UserPromptSubmit.additionalContext`
- State/artifact reads: `reg.codex-session-registry`, `reg.context-delivery-ledger`
- State/artifact writes: `reg.codex-session-registry`, `reg.context-delivery-ledger`
- Important callers: `startCodexBridgeServer`
- Important callees: canonical cwd containment, serialized mutation tail, atomic temp+rename writer
- External boundaries: local filesystem와 resolved repository path
- Failure/edge behavior: repository 밖 cwd, stale delivery target, expired bundle, invalid Hook/bundle shape를 거부한다. unknown prompt session은 contained cwd 확인 뒤 복구하고 duplicate turn receipt는 두 번째 consume을 막는다. raw prompt와 transcript는 state에 저장하지 않는다.
- Related registers: `reg.codex-session-registry`, `reg.context-delivery-ledger`, `reg.connector-capability`
- Verified at: base `2e92e05ef22ec5c345e7137d75465a08586db559` + 2026-07-22 CLI Companion worktree
- Locator status: `active`

### Loopback server and bridge main

- Path: `packages/web/server/codexBridgeServer.ts`, `packages/web/server/codexBridgeMain.ts`
- Stable anchor: `startCodexBridgeServer`, `probeInstalledCodexVersion`, `runCodexBridgeMain`
- Role in behavior: random bearer를 가진 loopback endpoint와 workspace single-process lock을 열고 external Codex version을 shell-free probe해 capability에 반영한다.
- Inputs: canonical repo root, optional random/fixed port, `PATH` 또는 `AF_CODEX_BIN`
- Outputs: endpoint file, running broker, connector capability
- State/artifact reads: existing lock/state, external Codex executable
- State/artifact writes: endpoint/lock, `reg.connector-capability` snapshot
- Important callers: `dev:companion-bridge` script 또는 direct Node entry
- Important callees: `CodexBridgeStore.open`, Node HTTP server, `execFile`
- External boundaries: loopback TCP, process table, external Codex CLI
- Failure/edge behavior: live lock owner, non-loopback peer, invalid bearer/content type/body, local `node_modules/.bin` shadow를 차단한다. MCP/direct/steer capability는 false다.
- Related registers: `reg.connector-capability`, `reg.codex-session-registry`, `reg.context-delivery-ledger`
- Verified at: base `2e92e05ef22ec5c345e7137d75465a08586db559` + 2026-07-22 CLI Companion worktree
- Locator status: `active`

### Hook bootstraps, protocol adapter, and plugin packaging

- Path: `.codex/hooks.json`, `scripts/af-codex-hook.mjs`, `scripts/af-codex-hook-protocol.mjs`, `plugins/agent-factory-companion/scripts/af-codex-hook-entry.mjs`, `plugins/agent-factory-companion/hooks/hooks.json`, `.agents/plugins/marketplace.json`
- Stable anchor: `hooks.SessionStart`, `hooks.UserPromptSubmit`, `run`, `toBridgeHookInput`, `toCodexHookOutput`, `findWorkspaceAdapter`, `plugins[name=agent-factory-companion]`
- Role in behavior: project와 plugin Hook을 독립 bootstrap으로 유지하고 둘 다 workspace adapter에 위임한다. Protocol adapter가 외부 Codex input/output shape를 격리하고 transport adapter가 nearest workspace bridge와 통신한다. Broker receipt가 overlapping Hook의 duplicate consume을 막는다.
- Inputs: Codex `SessionStart` 또는 `UserPromptSubmit` JSON stdin, current cwd, plugin bootstrap에서 `$PLUGIN_ROOT`
- Outputs: session registration 또는 `hookSpecificOutput.additionalContext`
- State/artifact reads: nearest workspace endpoint
- State/artifact writes: broker를 통해 `reg.codex-session-registry`, `reg.context-delivery-ledger`
- Important callers: external Codex CLI·IDE project Hook runtime, enabled plugin Hook runtime
- Important callees: workspace adapter discovery, protocol normalization, loopback authenticated fetch
- External boundaries: Codex Hook process, plugin installation, stdin/stdout
- Failure/edge behavior: endpoint가 없으면 no-op하고 adapter/bridge 오류는 Hook을 깨지 않도록 삼킨다. Project Hook이 로드되지 않아도 plugin은 on-disk 파일 존재만 보고 종료하지 않는다. 둘 다 로드되면 same-turn duplicate가 다음 delivery를 소비하지 않는다. 현재 package는 `SessionEnd`를 선언하지 않는다.
- Related registers: `reg.codex-session-registry`, `reg.context-delivery-ledger`, `reg.connector-capability`
- Verified at: base `2e92e05ef22ec5c345e7137d75465a08586db559` + 2026-07-22 CLI Companion worktree
- Locator status: `active`

## 확인되지 않은 사항

- 일반 source·git·evidence observer와 normalized projection은 구현되지 않았다.
- MCP context pull, direct turn start, in-flight steer는 capability가 false이며 동작 proof가 없다.
- 현재 Codex release는 `SessionEnd`를 제공하지 않아 explicit end lifecycle을 확인할 수 없다.
- 이 stage는 기존 Stage Runner, canonical editor, approval, Build/Verify trigger의 retirement를 뜻하지 않는다.
