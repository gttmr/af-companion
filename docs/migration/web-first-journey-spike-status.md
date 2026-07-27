# Web-First Journey P0 Feasibility Spike 상태

상태: **P0 PASS — G0-1부터 G0-4까지 통과, P1은 시작하지 않음**

실행일: 2026-07-27 (KST)

이 문서는 Web-First Journey 작업 지시서의 P0 결과만 기록한다. Production source는
변경하지 않았고, 수작성 VS Code workspace와 launcher는 모두 `/tmp`에 둔 일회성
probe다. 이 결과는 P1 이후 구현을 허용하는 feasibility evidence이지 P2의 production
launch chain이나 G1 완료 증거가 아니다.

## 기준선과 실행 환경

- fetch 후 `origin/main`, primary checkout `main`, spike branch 시작 SHA:
  `43f5a5e0b64c9b110ca3e4766aedd7f3ce3e308e`
- Branch/worktree: `spike/web-first-journey-launch`,
  `/home/ilmaswsl/work/af-wt-web-first-journey-launch`
- 실측 factory root: `/home/ilmaswsl/work/af-companion`
- External app root: `/tmp/af-web-first-journey-p0/app`
- Work Item/application/role: `web-first-journey-spike` /
  `web-first-journey-spike-app` / `plan`
- WSL: Ubuntu 24.04, Linux `6.6.87.2-microsoft-standard-WSL2`
- VS Code `1.130.0`, Remote-WSL `Ubuntu-24.04`
- Codex CLI `0.145.0`, model `gpt-5.6-sol`
- Node `24.13.0`, npm `11.17.0`
- Codex Bridge: primary checkout의 `127.0.0.1:8898`; probe 시작 시 해당 Work Item의
  ticket/session은 각각 0건

Spike worktree는 문서 변경을 격리하는 데 사용했다. 실제 TUI/Hook probe는 같은 SHA인
primary checkout에서 실행했다. 현재 host의 Codex Hook trust가 이 canonical path에
명시적으로 저장돼 있어, 별도 개발 worktree의 추가 Hook trust prompt가 Workspace
Trust와 session claim 측정을 섞지 않게 하기 위한 선택이다.

## 수작성 probe

`web-first-journey-spike.code-workspace`는 다음 두 folder를 이 순서로 열었다.

1. `/tmp/af-web-first-journey-p0/app`
2. `/home/ilmaswsl/work/af-companion`

Inline `folderOpen` Task는 dedicated terminal에서 `/tmp` launcher를 실행했다. Launcher는
브라우저를 거치지 않고 Bridge에 `activation_origin: "af_vscode_launch"` enrollment를
요청하고, Capsule을 child environment로만 전달한 뒤 다음 형태로 Codex TUI를 실행했다.

```text
cwd=/home/ilmaswsl/work/af-companion
codex --sandbox workspace-write \
  --config 'sandbox_workspace_write.writable_roots=["/tmp/af-web-first-journey-p0/app"]' \
  <probe prompt>
```

현재 host의 user config는 `approval_policy=never`이며 launcher도 같은 값을 명시했다.
따라서 G0-3은 이 host policy에서 writable-root config가 실제 sandbox 경계를 확장하는지
증명한다. 다른 approval policy의 UI 동작으로 일반화하지 않는다.

Disposable launcher는 ticket ID의 SHA-256과 시각만 기록했다. Endpoint token,
activation Capsule, lease token, prompt 본문은 audit 파일이나 이 문서에 기록하지 않았다.

## Gate 결과

| Gate | 결과 | 실측 |
| --- | --- | --- |
| G0-1 `folderOpen` Task | **PASS** | 첫 화면은 Restricted Mode였고 35초 및 추가 55초 관찰 동안 Task event가 0건이었다. 사용자가 Workspace Trust를 승인한 뒤 추가 클릭 없이 `2026-07-27 17:55:12.033 KST`에 dedicated Task가 시작됐다. 첫 post-approval 확인에서 이미 실행 중이었고 30초 gate 안이었다. `Ctrl+Shift+B` fallback은 발동하지 않았다. |
| G0-2 interactive TUI + Hook | **PASS** | Task의 PTY 안에서 Codex interactive TUI가 유지됐고 `G0_PROBE_DONE`과 다음 입력 prompt가 화면에 남았다. 최초 prompt는 deterministic probe를 위해 Codex TUI launch argument로 전달됐다. `UserPromptSubmit` receipt가 `17:55:17.445 KST`에 기록됐고 같은 turn의 `turn_stop`은 `17:55:28.513 KST`였다. |
| G0-3 external write | **PASS** | Codex process와 binary의 `/proc/<pid>/cwd`는 모두 factory root였다. `-c sandbox_workspace_write.writable_roots=[…]` 상태에서 repo 밖 app root에 `g0-3-proof.txt`를 approval loop 없이 생성했다. 파일은 정확히 `web-first-journey-g0-3\n`, 23 bytes, SHA-256 `740fda65e91bb259a5d054c92128f20a17eb3b0d061b719cd8b3395dc93a2fa2`였다. Artifact-local `runtime-stub/` fallback은 발동하지 않았다. |
| G0-4 factory-cwd enrollment claim | **PASS** | Ticket 발급 `17:55:12.071`, Codex spawn `17:55:12.092`, claim `17:55:17.363 KST`. Persisted ticket은 `claimed`, session은 `companion_active` + `active`, scope는 exact application/Work Item/`plan`, `cwd`는 factory root였다. `canonical_cwd_digest`는 현재 factory realpath SHA-256과 일치했고 lease file mode는 `0600`이었다. 전체 작업 Stop 조건은 발동하지 않았다. |

G0-1의 Trust click 자체는 VS Code log에 별도 timestamp로 나오지 않았다. 판정은 승인 전
반복 관찰에서 Task가 없었던 사실, 사용자 승인, 승인 후 첫 관찰에서 Task가 이미 실행된
사실, launcher의 monotonic event 순서를 함께 사용한다. Click-to-task의 정밀 latency를
claim하지 않는다.

G0-2의 최초 input은 terminal에서 타이핑한 문장이 아니라 interactive TUI의 initial
prompt였다. TUI가 dedicated integrated terminal에서 후속 입력을 받을 수 있는 상태로
유지된 것과 fresh `UserPromptSubmit` receipt까지는 verified다. 사람이 후속 문장을 직접
입력하는 acceptance는 P7 소유이며 이 spike가 대체하지 않는다.

## Claim evidence

State의 해당 scope만 축약하면 다음과 같았다.

```json
{
  "ticket": {
    "workspace_eligibility": "factory",
    "application_id": "web-first-journey-spike-app",
    "work_id": "web-first-journey-spike",
    "requested_role": "plan",
    "activation_origin": "af_vscode_launch",
    "status": "claimed"
  },
  "session": {
    "participation": "companion_active",
    "status": "active",
    "cwd": "/home/ilmaswsl/work/af-companion",
    "application_id": "web-first-journey-spike-app",
    "work_id": "web-first-journey-spike",
    "role": "plan",
    "activation_origin": "af_vscode_launch"
  },
  "prompt_receipts": 1
}
```

Ticket 발급에서 claim까지는 `5.292s`, claim에서 persisted prompt receipt까지는
`0.082s`, ticket 발급에서 외부 파일 생성까지는 `13.708s`였다. Bridge health나 editor
launch receipt만으로 성공을 판정하지 않고, claimed ticket, exact active session, fresh
prompt receipt, process cwd, external file bytes를 함께 사용했다.

## Screenshot과 local evidence

P0의 retained 산출물은 이 문서 한 파일뿐이다. 다음 evidence는 현재 host의
`/tmp/af-web-first-journey-p0/evidence/`에 남긴 local disposable 파일이며 merge하지
않는다.

| Evidence | SHA-256 | 의미 |
| --- | --- | --- |
| `vscode-before-trust.png` | `98fa9c512938aba820951abda88065930d12610c1ded7e335b12a501bed38e31` | multi-root와 Restricted Mode, Task 미실행 |
| `vscode-g0-pass.png` | `7c840c877d57227c19a80e9449be760d6001f8296ff1a9454913ac9d7e19fcc7` | dedicated terminal의 Codex TUI, `G0_PROBE_DONE`, external file 표시 |
| `state-before.json` | `929829dfd39f3dede42e9b0e5379c602ac86bbc53ba91b4d629b58c32f30210f` | 해당 scope ticket/session 0건 |
| `state-after.json` | `0046e1046c108ed2372264212a05be021d1e9179fb45322c6dd834c9ed397a9e` | claimed ticket, active session, receipt |
| `launcher-events-pass.jsonl` | `03ef600e42de74f732b9e397dbcb7618a37f121d7667cfeac7d04d9ccafa6ca7` | Task, ticket, spawn timestamp와 non-secret digest의 frozen copy |

## Source-grounded boundary

- Current CLI는 `companion start`에서 enrollment를 발급하고
  `AF_COMPANION_ENROLLMENT` environment로 `cwd=root`, `stdio=inherit` Codex를 시작한다:
  `scripts/af.mjs:704-723`, `831-854`.
- Bridge는 factory root digest와 Work Item ETag를 ticket에 묶고 claim 때 exact scope,
  cwd digest, origin, expiry, nonce/claim digest를 다시 검사한다:
  `packages/web/server/codexBridgeStore.ts:977-1002`, `1019-1061`.
- Hook은 event cwd에서 현재 adapter의 exact factory root를 찾고 activation Capsule 또는
  contained `0600` lease가 있을 때만 endpoint를 읽는다:
  `scripts/af-codex-hook.mjs:44-80`, `129-145`.

이 spike의 `/tmp` launcher가 `af_vscode_launch` origin을 실제로 claim한 것은 설계
feasibility를 증명한다. Production `af companion vscode-start`, generated workspace,
server launcher route가 아직 없으므로 **G1은 미충족**이고 P2 종료 전 다시 실제로
검증해야 한다.

## Fallback과 다음 경계

- G0-1 PASS: default build task fallback 불필요.
- G0-2 PASS: terminal profile fallback 불필요.
- G0-3 PASS: artifact-local `runtime-stub/` fallback 불필요.
- G0-4 PASS: 전체 Stop 및 `registered_application` 보안 재설계 불필요.
- Factory-cwd 세션이 app root `.codex/config.toml` MCP를 소비하지 않는 문제는 이번
  gate에서 변경하거나 재분류하지 않았다. 지시서대로 P2 decision-log와 최종 handoff의
  후속 목록에 남겨야 한다.
- G1, G2, P7 end-to-end acceptance는 각각 원래 Phase 소유이며 이 결과로 선충족 처리하지
  않는다.

P0 이후 production code와 P1 범위는 아직 시작하지 않았다. 다음 Phase는 이 문서의 PR이
검토·merge되고 사용자가 명시적으로 진행을 승인한 뒤 최신 `origin/main`에서 별도
branch/worktree로 시작해야 한다.
