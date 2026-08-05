# Companion App Graph 사용자 Acceptance

## 준비

`packages/companion`에서 `npm run dev`를 실행하고
`http://127.0.0.1:8890/`을 연다. 기본 App 저장 root는
`~/work/af-companion-apps`다. 기존 `~/work/af-apps` directory는 import하거나
선택하지 않는다.

1. `새 App`에서 App ID와 표시 이름을 입력한다.
2. 생성된 Graph가 `입력 → 출력` 두 Node와 Edge 하나인지 확인한다.
3. Asset이나 Graph를 바꾸기 전에 생성된 App root에서 다음을 확인한다.

   ```bash
   git branch --show-current
   git log -1 --format='%s%n%an%n%ae'
   git ls-tree -r --name-only HEAD
   git status --short
   git remote
   ```

   branch는 `main`, commit은 하나이며 제목은
   `chore: initialize Companion app workspace`, 작성자는
   `Agent Factory Companion <companion@agent-factory.local>`이어야 한다. Tree는
   `.gitignore`와 App manifest, Asset binding, Graph 네 파일만 포함해야 한다.
   최초 status와 remote 출력은 비어 있어야 한다.
4. `Published Assets`에서 Agent, Workflow, Tool을 각각 검색하고 하나를
   `App + Node 추가`한다.
5. Graph를 저장한다.
6. `git rev-list --count HEAD`가 계속 `1`이고 `git status --short`에 Asset
   binding과 Graph 변경이 나타나는지 확인한다. App Manager는 최초 baseline
   이후 자동 commit하거나 remote에 push하지 않는다.

## Asset lifecycle

실제 Catalog를 오염시키지 않도록 이 시나리오는 임시 Registry 복사본으로
수행한다. `packages/companion`에서 기존 server를 종료한 뒤 실행한다.

```bash
REGISTRY_FIXTURE_DIR="$(mktemp -d)"
cp ../../catalog/asset-registry.json "$REGISTRY_FIXTURE_DIR/asset-registry.json"
COMPANION_REGISTRY_PATH="$REGISTRY_FIXTURE_DIR/asset-registry.json" npm run dev
```

1. 상단 `Assets`를 열고 Agent·Workflow·Tool 이외 category가 없는지 확인한다.
2. `New draft`로 테스트 Asset contract를 작성하고 `Validate` 후 생성한다.
3. 생성한 draft를 다시 열어 responsibility를 바꾸고 `Validate` 후 갱신한다.
4. Decision ID와 실제 사용자 검토 근거를 입력해 `Mark reviewed`를 누른다.
5. Owner, Domain, Reuse 세 확인을 모두 선택하고 immutable version을
   Publish한다. 하나라도 빠지면 write가 거절돼야 한다.
6. `Graph`로 돌아와 Published Assets 검색 결과에서 방금 version을 App에
   binding하고 typed Node를 추가한다.
7. Published contract가 편집 불가인지 확인하고 `New version draft`가 다음
   version을 만드는지 확인한다.
8. 두 browser tab에서 같은 Registry revision을 사용해 lifecycle write를
   시도한다. 늦은 요청은 `registry_revision_conflict` 안내와 함께 적용되지
   않고 최신 version을 다시 읽어야 한다.
9. 명시적인 사용자 Decision으로 published version을 Deprecated 처리한다.
   기존 exact App binding은 deprecated 상태로 보이지만 새 binding 대상에는
   사용할 수 없어야 한다.

## VS Code extension

1. 상단 `VS Code에서 열기 ↗`를 누른다.
2. 새 VS Code window의 root가 방금 선택한
   `~/work/af-companion-apps/<app-id>`인지 확인한다. 다른 root를 수동으로
   열면 project-local `.codex/config.toml`이 적용되지 않는다.
3. WSL remote window인지 확인하고 Workspace Trust를 승인한다.
4. Codex가 현재 exact App root를 trusted project로 인식하는지 확인한다.
   이 신뢰가 없으면 project-local `.codex/config.toml`과
   `companion_graph`가 로드되지 않는다.
5. Codex extension에서 새 chat을 시작한다. 기존 chat은 전환 전 App의 MCP
   process를 유지할 수 있으므로 재사용하지 않는다.
6. 다음처럼 결과 경로를 명시해 요청한다.

   `companion_get_graph_workspace를 호출해 workspace.scope.application_id, workspace.active_selection, workspace.graph.nodes.length를 알려 줘.`

7. Tool 목록 또는 호출 카드에서 `companion_get_graph_workspace`와
   `companion_apply_graph_changes`를 확인한다.
8. 다음처럼 변경을 요청하고 write Tool 승인을 확인한다.

   `반드시 get 후 apply를 사용해 출력 Node의 label을 결과로 바꿔 줘. apply 인자는 정확히 base_graph_revision과 operations를 사용해.`

9. 새로고침 없이 Web Graph가 갱신되는지 확인한다. 버튼의 `202 Accepted`는
   VS Code dispatch 증거일 뿐 Codex thread 연결 증거가 아니다.

## App 전환과 격리

1. 두 번째 App을 만든다.
2. 첫 App에서 열어 둔 Codex chat으로 Graph write를 다시 시도한다.
3. `app_inactive`로 실패하는지 확인한다.
4. 두 번째 App을 VS Code에서 열고 새 chat을 시작한 뒤 get → apply가
   두 번째 App에만 반영되는지 확인한다.
5. Companion server를 재시작하고 마지막 active App, Graph, layout,
   selection, Context가 복구되는지 확인한다.

## Graph 협업 회귀

1. Web에서 Node를 선택하고 Codex가 선택 정보를 설명하는지 확인한다.
2. Codex로 Node와 Edge를 추가하고 변경 강조와 자동 위치를 확인한다.
3. Edge endpoint/control/channel을 Web Inspector에서 수정한다.
4. Web draft 중 Codex 변경을 보내 외부 우선 적용과 폐기 개수 안내를 본다.
5. Graph 파일을 직접 유효하게 수정해 fallback 반영을 확인한다.
6. 잘못된 JSON 동안 fail-closed 표시와 write 차단, 복구를 확인한다.
7. 두 Codex session의 stale write가 `graph_stale`을 받고 새 get 후
   재계산하는지 확인한다.

결과에는 App 생성/전환, Asset binding, VS Code extension의 두 MCP Tool,
write 승인, `app_inactive`, stale 충돌, 실시간 Web 반영 여부를 구분해 적는다.

2026-08-05 격리 실행 결과와 남은 경계는
[Acceptance 결과](./ACCEPTANCE-RESULTS-2026-08-05.md)에 기록했다.
