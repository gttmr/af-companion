# Companion App Graph 사용자 Acceptance

## 준비

`packages/companion`에서 `npm run dev`를 실행하고
`http://127.0.0.1:8890/`을 연다. 기본 App 저장 root는
`~/work/af-companion-apps`다. 기존 `~/work/af-apps` directory는 import하거나
선택하지 않는다.

1. `새 App`에서 App ID와 표시 이름을 입력한다.
2. 생성된 Graph가 `입력 → 출력` 두 Node와 Edge 하나인지 확인한다.
3. `Published Assets`에서 Agent, Workflow, Tool을 각각 검색하고 하나를
   `App + Node 추가`한다.
4. Graph를 저장한다.

## VS Code extension

1. 상단 `VS Code에서 열기 ↗`를 누른다.
2. 새 VS Code window의 root가 방금 선택한
   `~/work/af-companion-apps/<app-id>`인지 확인한다. 다른 root를 수동으로
   열면 project-local `.codex/config.toml`이 적용되지 않는다.
3. WSL remote window인지 확인하고 Workspace Trust를 승인한다.
4. Codex extension에서 새 chat을 시작한다. 기존 chat은 전환 전 App의 MCP
   process를 유지할 수 있으므로 재사용하지 않는다.
5. 다음처럼 요청한다.

   `companion_get_graph_workspace를 호출해 application_id, 현재 선택, Node 수를 알려 줘.`

6. Tool 목록 또는 호출 카드에서 `companion_get_graph_workspace`와
   `companion_apply_graph_changes`를 확인한다.
7. 다음처럼 변경을 요청하고 write Tool 승인을 확인한다.

   `반드시 get 후 apply를 사용해 출력 Node의 label을 결과로 바꿔 줘.`

8. 새로고침 없이 Web Graph가 갱신되는지 확인한다. 버튼의 `202 Accepted`는
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
