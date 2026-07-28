# Agent Factory Companion Design System

이 문서는 `packages/web`의 Current Implementation 시각 계약을 설명한다. 자산 분류는 [Taxonomy](../workbench/taxonomy.md), Graph 의미는 [Graph IR](../workbench/graph-ir.md), 화면 소유권은 [Operating Model](../workbench/operating-model.md)이 소유한다.

## 제품 성격

Companion은 외부 Codex 작업을 관찰·검토하는 운영 workspace다. 마케팅 대시보드나 웹 기반 lifecycle runner가 아니다.

- 가장 먼저 Work Item, 현재 Work Skill, live connection, Git change가 읽혀야 한다.
- 화면 이름은 네 Work Skill의 짧은 이름인 Discover, Compose, Scaffold, Verify를 사용한다.
- Activity와 diff는 실시간 보조 rail이며 주 작업면을 밀어내지 않는다.
- 카드는 실제 상호작용 또는 비교 단위일 때만 사용한다.
- 한국어 utility copy와 명확한 영어 기술 용어를 함께 사용한다.

## 화면 골격

`LiveWorkbenchLayout.tsx`가 전체 shell을 소유한다.

```text
Top bar: workspace identity · global navigation
Left rail: four Work Skills and lifecycle state
Center: selected-work live strip · selected Work Skill projection
Right rail: Activity · Changes/diff · Codex sessions
```

Work Item을 선택하지 않은 `/`에서는 왼쪽 rail 없이 lifecycle map과 Work Item index를 보여 준다. `/connections`와 `/assets`는 같은 shell 안의 독립 운영 화면이다.

Home의 첫 운영 surface는 Web-first 시작 register다. `새 작업 시작`은 application 이름 하나,
`기존 작업 선택`은 Work Item 하나만 받으며 두 mode는 `작업 시작하고 VS Code 열기`라는
하나의 primary action을 공유한다. 새 application의 경로 확인, Workspace Trust, MCP Tool
approval은 순서가 분명한 dialog로 안내한다. Editor launch receipt와 Companion 연결을 같은
상태로 표시하지 않으며, Trust 안내는 fresh exact session이 관찰된 뒤에만 다음 안내로
전환한다. 상단 shell에는 factory root만 여는 별도 VS Code action을 두지 않는다.
Home, Connections, live rail의 일반 연결 문구는 `Codex terminal session`을 사용한다.
내부 lifecycle `plan` role을 Codex Plan mode처럼 표시하지 않으며, Discover의 실제
Plan/Materialization authority에서만 Plan 용어를 사용한다.
launch guide를 닫아도 선택한 Work Item에 active Companion session이 있으면 snapshot을
기준으로 연결됨을 표시하며 `VS Code 시작 전` 상태로 되돌리지 않는다.
기존 Work Item을 선택하면 같은 Home에 `HomeGraphOverview`가 읽기 전용 Graph preview와
Root Executable, solution control, Graph revision, 최근 application source를 표시한다. preview는
선택·편집·zoom control을 제공하지 않고 하나의 `전체 Graph IR 열기` 링크로 Compose에 연결한다.

현재 desktop viewport가 acceptance 기준이다. 좁은 화면에서는 rail과 register가 단일 열로 내려가야 하지만 모바일 전용 제품을 만들지는 않는다.

## Work Skill 화면

Home의 현재 선택과 모든 Work Skill 화면 상단에는 카드 묶음이 아닌 하나의 얇은 live strip을 둔다. Work Item,
exact active Companion 수, current/focus Work Skill 상태, Graph revision/최근 변화, 최근
external application source를 같은 행에서 비교한다. `waiting_for_input`은 Skill 상태로만
표시한다. CLI Question 본문·선택지·답변·transcript는 Web에 표시하지 않는다.

### Discover

- normalized requirement와 evidence를 먼저 표시한다.
- Candidate register는 Agent·Workflow·Tool을 한 표에서 비교한다.
- Solution Control Strategy, Root Executable, Discovery cycle과 Plan authority 결과를 별도 운영 register로 표시한다.
- Plan authority는 canonical Handoff 또는 pristine Bootstrap Grant 중 최신 exact 항목 하나를 표시하고, 둘 모두 같은 `새 Materialization Session 열기` primary action을 사용한다.
- Plan Session과 Materialization Session, 선택한 authority의 상태를 같은 Work Item 안에서 연결해 보여 준다. Capsule, Plan body, CLI Question은 표시하지 않는다.
- dependency와 Missing Information은 별도 register로 분리한다.
- 수정 action은 제공하지 않고 VS Code에서 canonical artifact 열기만 제공한다.

### Compose

- Graph IR이 주 작업면이다.
- full Graph canvas와 Inspector를 header 바로 다음에 배치한다.
- Strategy, Root Executable, Registry revision, Asset disposition, review/readiness는 Graph 아래의 해석 맥락으로 배치한다.
- Discovery와 Composition review gate를 함께 표시하되 웹에서 결정하지 않는다.
- 명시적 active Codex session을 선택해야 Graph save가 가능하다.
- Graph edit mode에서 `GraphElementEditor`가 Canvas 옆에 표시된다.
- Return-to-Discover와 active invalidation을 보여 주고, save 후 composition/downstream evidence가 stale 상태로 바뀐다는 점을 작업면 안에서 알린다.

### Scaffold

- generated source/handoff file tree와 preview를 좌우로 배치한다.
- Git projection은 source change와 status를 보여 주지만 stage/commit action을 제공하지 않는다.
- 파일과 diff는 VS Code로 열 수 있다.

### Verify

- Level 1–5 evidence ladder가 핵심이다.
- 각 level은 passed/failed/unverified를 command/report evidence와 함께 표시한다.
- validation report는 읽기 전용 preview다.

## Connections와 Assets

Connections는 조용한 운영 register 안에서 명시적 참여 범위와 만료·위험만 선명하게 드러낸다. 기본 순서는 `Companion Sessions` → `Pending Handoffs` → `Deliveries` → `Setup / Diagnostics`다. 일반 Codex Session은 표시하지 않으며, 각 row는 application, Work Item, role, activation origin, lease expiry, last event, participation을 구분한다. Plan session 시작은 Home이 소유하고 Connections에는 수동 enrollment form, launch command, raw Capsule 또는 copy action이 없다. 현재 canonical Handoff action은 exact existing-session Attach, Cancel, Revoke이며 첫 active session이나 global default를 추측하지 않는다. Existing Attach의 select는 최초에 빈 값이고 Attach 후에는 영속 target만 표시한다. Fresh-session Continue는 Discover의 exact Plan-authority primary action과 trusted VS Code Task가 소유하며 Connections에 raw command나 Bootstrap Grant control을 추가하지 않는다.

Bridge health, Hook side-effect gate, strict no-hook 검증 여부, CLI/VS Code launch capability, Capsule transport capability를 별도 진단으로 표시한다. Editor launch accepted, enrollment pending, leased Companion active, delivery consumed를 하나의 성공 상태로 합치지 않는다. 진단은 aggregate count만 보여 주고 raw prompt, transcript, token, Capsule 본문을 노출하지 않는다.

Assets는 Agent·Workflow·Tool Registry를 dense register로 표시한다. L0 목록에서 L1 operational detail과 L2 full contract로 점진적으로 열고, deterministic search evidence, exact versions, usage, version compare를 제공한다. Draft create/update와 review/publish/deprecate는 current Registry revision, strict validation, 명시적 사용자 Decision을 요구한다. Published contract는 편집하지 않는다. A2A는 Agent의 protocol binding/exposure이며 네 번째 category가 아니다.

## Live rail

오른쪽 rail은 세 탭을 사용한다.

- `Activity`: Hook, factory filesystem, 선택된 external app의 `application_source` bounded metadata event.
- `Changes`: Git status, contained diff preview, VS Code file/diff open.
- `Codex`: leased Companion active/stale sessions와 exact-scope queued delivery. 일반 Session은 rail에도 표시하지 않는다.

Activity에는 prompt, transcript, tool argument, tool output을 표시하거나 저장하지 않는다. 자유 텍스트 payload가 없다는 사실을 empty/metadata copy에서도 유지한다.

## 스타일시트

`main.tsx`는 `styles/index.css`만 import한다.

```css
@layer tokens, base, primitives, components, features, router, utilities;
```

| 레이어 | 파일 |
| --- | --- |
| tokens | `tokens.css` |
| base | `base.css` |
| primitives | `primitives.css` |
| components | `category.css` |
| features | `features/graph.css` |
| router | `router/live-workbench.css` |

Retired stage/shell CSS bundle을 다시 import하지 않는다. 색, 간격, radius, type은 기존 token을 먼저 사용한다.

## 자산과 프로토콜

자산 category는 세 종류뿐이다.

| Asset | token | badge |
| --- | --- | --- |
| Agent | `--cat-agent*` | `CategoryBadge category="agent"` |
| Workflow | `--cat-workflow*` | `CategoryBadge category="workflow"` |
| Tool | `--cat-tool*` | `CategoryBadge category="tool"` |

MCP와 A2A는 `ProtocolBadge`로 자산 badge 옆에 표시한다. 오류/위험 색과 A2A protocol 색을 혼합하지 않는다. Graph input/output token은 lane 표현이지 asset category가 아니다.

## Graph IR

Graph는 `GraphCanvas.tsx`, `GraphInspector.tsx`, `GraphElementEditor.tsx`, `components/graph/*`, `features/graph.css`가 함께 구현한다.

- Node kind는 canonical 여덟 값만 사용한다.
- Agent/Tool/Subworkflow Node는 각각 typed ref를 사용한다.
- Edge의 `control`과 optional `channel`을 별도로 보여 준다.
- `parallel`과 `loop`는 Region overlay로 표시한다.
- Node 위치는 presentation state이며 Graph IR에 저장하지 않는다.
- 기본은 read-only이고 Compose 화면만 `editable`을 켠다. Home은 interaction control과 Inspector가 없는 explicit `preview` variant를 사용한다.
- Inspector와 Editor는 Canvas 옆 두 번째 column이며 retired Design sidebar selector에 의존하지 않는다.

Graph save는 현재 `analysis-result.json.graph`과 `graph-ir.json`을 동기화한다. 웹은 runtime contract, review gate, source, validator result를 자동 수정하지 않는다. save 결과는 Compose review와 downstream Work Skill evidence를 무효화하고 exact Codex session에 `graph_change` context를 queue한다.

## 접근성과 motion

- tab과 button에는 keyboard focus가 보여야 한다.
- 상태는 색만으로 표현하지 않고 label/dot/code를 함께 사용한다.
- table과 code preview는 좁은 열에서 horizontal overflow를 허용한다.
- 상태 전환 motion은 짧은 opacity/position 변화만 사용하고 `prefers-reduced-motion`을 존중한다.
- Graph 편집 control과 session target은 명시적 label을 갖는다.
- Journey dialog는 native modal semantics와 visible focus를 사용한다. Trust 안내는 exact Session이 활성화되면 자동 전환되고 MCP 안내는 fresh Tool activity 뒤 자동 종료되지만, 사용자는 막힌 안내를 직접 닫을 수도 있다.

## Source locators

| 행동 | Source |
| --- | --- |
| shell과 route | `packages/web/src/layout/LiveWorkbenchLayout.tsx`, `packages/web/src/routes/router.tsx` |
| Web-first 시작과 gate 안내 | `packages/web/src/routes/WorkspaceHome.tsx`, `packages/web/src/components/JourneyGuideDialog.tsx` |
| Work Skill rail | `packages/web/src/layout/WorkSkillRail.tsx` |
| selected-work live strip | `packages/web/src/layout/WorkLiveStrip.tsx`, `packages/web/src/routes/work/SkillScreenHeader.tsx` |
| Home Graph preview | `packages/web/src/components/HomeGraphOverview.tsx`, `GraphCanvas.tsx`의 `preview` variant |
| live Activity/Git/Codex rail | `packages/web/src/layout/LiveRail.tsx` |
| Discover/Compose/Scaffold/Verify | `packages/web/src/routes/work/*Workspace.tsx` |
| Connections/Assets | `packages/web/src/routes/ConnectionsPage.tsx`, `AssetsPage.tsx` |
| Graph canvas/editor | `packages/web/src/components/GraphCanvas.tsx`, `GraphElementEditor.tsx` |
| Graph write client | `packages/web/src/workspace/api.ts` |
| Registry client/editor | `packages/web/src/registry/assetRegistryClient.ts`, `registryDraft.ts` |
| styles | `packages/web/src/styles/index.css`, `features/graph.css`, `router/live-workbench.css` |

## Verification

Visible changes require:

```bash
cd packages/web
npm run build
```

Then verify the real fixed-port screen at `http://127.0.0.1:8890/`, exercise all main routes, enter Graph edit mode, inspect responsive behavior, and capture a screenshot. Removed stage UI must not remain in a parent shell, shared component, or imported stylesheet.
