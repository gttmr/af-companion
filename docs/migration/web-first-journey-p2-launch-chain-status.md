# Web-First Journey P2 Launch Chain 상태

상태: **P2 PASS — G1 `af_vscode_launch` claim 확인**

실행일: 2026-07-28 (KST)

이 문서는 Web-First Journey 작업 지시서 P2의 production launch chain과 G1 실측만
기록한다. P3의 Web UI, P4의 live projection, P5의 오류 UX, P6의 cleanup, P7의 전체
사람 acceptance는 아직 충족했다고 간주하지 않는다.

## 검증 범위

- Branch/worktree: `agent/web-first-session-launch`,
  `/home/ilmaswsl/work/af-wt-web-first-session-launch`
- Application/Work Item/role: `web-first-p2-g1` / `web-first-p2-g1` / `plan`
- External app root: `/home/ilmaswsl/work/af-apps/web-first-p2-g1`
- Factory root: `/home/ilmaswsl/work/af-wt-web-first-session-launch`
- VS Code `1.130.0`, Codex CLI `0.145.0`
- Codex Bridge `127.0.0.1:8898`, Web `127.0.0.1:8890`

`POST /api/codex-companion/vscode-sessions`는 `202 Accepted`를 반환하고
`.agent-factory/vscode/web-first-p2-g1.code-workspace`를 생성한 뒤 실제
`code --new-window <descriptor>`를 호출했다. Descriptor mode는 `0600`, 부모 directory는
`0700`이었고, folder 순서는 external app root 다음 factory root였다. Inline
`Start AF Session` task는 factory root에서 다음 production command를 실행했다.

```text
node <factory>/scripts/af.mjs companion vscode-start \
  --application web-first-p2-g1 \
  --work web-first-p2-g1 \
  --role plan \
  --application-root /home/ilmaswsl/work/af-apps/web-first-p2-g1
```

VS Code Workspace Trust는 사용자의 명시적 승인에 따라 이 disposable application,
factory worktree, generated workspace에만 부여했다. Trust 후 별도 build-task fallback 없이
`folderOpen` task가 자동으로 시작됐다. 실제 child Codex argv에는
`--sandbox workspace-write`와 external app root만 담은
`sandbox_workspace_write.writable_roots`가 있었고 process cwd는 factory root였다.

## G1 결과

| 항목 | 결과 | 실측 |
| --- | --- | --- |
| VS Code launch chain | **PASS** | 실제 generated workspace의 trusted `folderOpen` task가 `af companion vscode-start`를 실행했고 `2026-07-28 01:52:43.517 KST`에 `activation_origin: af_vscode_launch` ticket을 발급했다. |
| Production CLI claim | **PASS** | 같은 generated task command를 factory cwd의 controlled PTY에서 실행해 fresh interactive Codex input을 제출했다. Ticket `5d3c1a4d-bab3-4e77-b546-fa79c86a8874`는 `2026-07-28 01:55:32.581 KST`에 `claimed`가 됐다. |
| Exact active session | **PASS** | Session `019fa480-5266-70d3-9b7c-cee20085b4d7`은 exact application/Work Item/`plan`, factory cwd, `activation_origin: af_vscode_launch`, `participation: companion_active`, `status: active`였다. |
| Fresh turn evidence | **PASS** | 같은 session에서 `prompt_submit`이 `01:55:32.657 KST`, `turn_stop`이 `01:55:34.951 KST`에 기록됐고 terminal 응답은 `G1_CLAIM_OK`였다. |

VS Code integrated terminal에서 발급된 첫 ticket은 GUI key injection으로 사람 입력을
대체하지 않았기 때문에 `pending`으로 남았고, controlled PTY가 발급한 두 번째 ticket이
claimed됐다. 따라서 G1이 요구하는 production `af_vscode_launch` origin claim은
실측됐지만, generated VS Code terminal에 사람이 직접 요구사항을 입력하는 전체 여정은
P7 acceptance 소유로 유지한다. Browser는 어느 단계에서도 enrollment를 발급하거나
activation Capsule을 받지 않았다.

## 검증 결과

- `packages/web` targeted launcher/API tests: 12 passed
- `scripts/af-cli.test.mjs`: 9 passed
- `npm run test:companion`: package 50 + CLI/Hook 18 passed
- `npm run test:contracts`: 23 TypeScript contract tests passed; shared
  `google-adk==2.3.0` Python을 지정한 artifact/generator tests 87 passed
- `npm run build`: passed
- `node scripts/validate-artifacts.mjs`: passed
- `git diff --check`: passed

Fresh worktree에는 ignored ADK venv가 없어서 기본 `npm run test:contracts`의 Python
subprocess가 처음에는 `ENOENT`로 실패했다. 기존 검증된
`/home/ilmaswsl/work/af-companion/.agent-factory/runtime/.venv/bin/python`을
`AF_TEST_PYTHON`으로 지정해 같은 suite를 다시 실행했고 `google-adk==2.3.0`과 전체 통과를
확인했다. 이 환경 차이를 product failure로 분류하지 않는다.

## 남은 경계

- App root `.codex/config.toml`은 factory-cwd Codex가 소비하지 않는다. MCP export는
  app-rooted client 후속을 위해 유지한다.
- P3 전에는 G1이 충족됐으므로 launch-chain gate에 의한 중단 조건은 없다.
- VS Code integrated terminal의 사람 직접 입력, 시간 측정, live projection, 오류 복구,
  Capsule 부재 검사는 P7에서 새 Work Item으로 다시 수행한다.
