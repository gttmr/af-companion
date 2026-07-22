# CLI Companion Migration Status

> 이 문서는 Hook-first CLI Companion의 Target write ownership과 Current Implementation 사이의 gap을 추적한다. 현재 동작 계약은 [CLI Companion](../workbench/cli-companion.md), 전체 승인·artifact 운영은 [Operating Model](../workbench/operating-model.md)이 소유한다.

## Snapshot

- Base: remote `main` commit `2e92e05ef22ec5c345e7137d75465a08586db559`
- Base checked: `2026-07-22`
- Worktree: `/home/ilmaswsl/work/af-wt-cli-companion`
- Current Codex CLI checked: `0.144.6`
- 상태: **Project Hook 기반 CLI·IDE Session Manager와 next-prompt Context MVP implemented; IDE manual acceptance pending; write-ownership migration incomplete**

## Target Contract와 Current Implementation

| 영역 | Target Contract | Current Implementation | 판정 |
| --- | --- | --- | --- |
| canonical write owner | 외부 Codex CLI가 canonical worktree를 쓴다. | Web Stage Runner, canonical editors, approval, Build/Verify trigger가 계속 current이며 Agent Factory server write가 남아 있다. | deferred |
| projection | AF가 worktree의 source·git·evidence를 정규화해 live projection한다. | strict `analysis-result.json`을 1.5초 polling해 Graph만 갱신한다. | MVP partial |
| Interaction state | AF는 session, selection, delivery 같은 Interaction state만 쓴다. | ignored `.agent-factory/codex-bridge/v1`에 session·delivery를 저장한다. | implemented for MVP |
| Context delivery | 명시적 선택을 연결된 CLI·IDE session에 안전하게 전달한다. | project/plugin Hook bootstrap으로 관찰한 exact session의 다음 `UserPromptSubmit.additionalContext`에 once-only 전달한다. | implemented; IDE acceptance pending |
| connector depth | capability에 따라 Hook, MCP, turn start, steer를 선택한다. | Hook registration/context만 true다. consume ledger는 있지만 Codex/model delivery ack, MCP/direct/steer는 false다. | Hook-only |
| workspace identity | remote와 독립적인 local workspace identity를 사용한다. | canonical local path의 SHA-256 축약 hash를 사용한다. | implemented |

Remote URL은 architecture identity가 아니다. 이후 remote가 바뀌어도 local workspace identity와 저장 경계를 remote 문자열에 결합하지 않는다.

## Current MVP 완료 범위

- tracked `.codex/hooks.json`과 enabled plugin의 독립 thin bootstrap, workspace-owned transport adapter, 분리된 Codex protocol adapter
- Codex `0.144.6`의 `SessionStart`, `UserPromptSubmit` Hook schema와 `additionalContext`
- `SessionEnd` 부재를 보완하는 30분 session TTL
- contained first-prompt recovery, bounded `(session_id, turn_id)` receipt와 duplicate consume 방지
- `/sessions` active/stale table, AF-only alias, explicit single default target, delivery history/cancel
- no-argument canonical-root `code --new-window` launcher와 cached VS Code/Codex extension probe
- loopback-only broker, random bearer endpoint, workspace single-process lock
- ignored state directory `0700`, file `0600`, atomic JSON replacement
- repository-contained `cwd`, exact target session, oldest queued bundle의 once-only atomic consume
- strict analysis server-side bundle 생성, expected ETag conflict의 `409`
- local Workbench Host allow-list, same-origin browser mutation과 loopback peer 검사
- ordered max-20 Graph Node 선택, preview, explicit active/default session 선택, queue, delivery ledger
- Graph·Asset·intent 자유문자열 secret-pattern redaction과 secret-like stable reference 거부; source contents·transcripts·raw prompts 비지속
- 외부 Codex version의 shell-free probe와 local `node_modules/.bin` skip

## Live proof

2026-07-22 이 worktree에서 repo marketplace를 임시 `CODEX_HOME`에 설치했고 사용자 config는 바꾸지 않았다. 실제 plugin session을 등록한 뒤 `node-live-alpha`, `node-live-beta`를 exact session에 queue했다. Resume한 다음 prompt가 두 ID를 그대로 받았고 ledger는 consumed turn ID를 기록했다.

이 결과는 Hook-first MVP의 end-to-end path만 증명한다. 일반 observer, MCP deep context, Shared App Server control, production security/durability를 증명하지 않는다.

병렬 bootstrap 보강 뒤 cachebuster `0.1.0+codex.20260722140353`을 local marketplace에서 재설치했다. 실제 ephemeral `codex exec`의 `SessionStart`·`UserPromptSubmit`으로 새 active session과 receipt가 등록됐고, installed plugin entry를 project Hook 파일이 존재하는 worktree에서 직접 실행해 queued Context 반환, consumed ledger, same-turn duplicate의 두 번째 delivery 보존을 확인했다. 검증용 queued duplicate는 canceled로 정리했다.

CLI proof 뒤 project Hook을 추가했기 때문에 IDE acceptance에는 현재 Hook hash trust, VS Code Codex 새/resume session, Hook registry 표시, exact target queue와 다음 IDE prompt consume을 사용자가 실제 extension에서 확인하는 단계가 남아 있다. VS Code launch endpoint와 capability probe의 자동 검증은 이 acceptance를 대신하지 않는다.

2026-07-22 병렬 bootstrap 보강 뒤에는 plugin이 project Hook 파일 존재만으로 실행을 포기하지 않는다. Project와 plugin Hook이 겹치면 broker의 same-turn receipt가 중복 consume을 막는다. 외부 Codex wire shape는 `scripts/af-codex-hook-protocol.mjs`, endpoint transport는 `scripts/af-codex-hook.mjs`, session·delivery semantics는 bridge store가 각각 소유하므로 이후 CLI·IDE 변경의 수정 범위를 분리한다. 이 보강은 Codex 기본 config나 Codex 설치 source를 변경하지 않는다.

## Deferred와 비목표

| Deferred | 현재 이유 |
| --- | --- |
| 일반 Workspace Observer와 normalized source·git·evidence projection | 현재는 canonical analysis polling만 있다. |
| MCP deep context | capability가 `false`다. |
| Shared App Server turn start·steer | direct start와 in-flight steer capability가 `false`다. |
| source/symbol, edge, asset, handbook, finding 선택 | MVP selector는 Graph Node only다. |
| `SessionEnd` | Codex `0.144.6`이 event를 노출하지 않는다. |
| 기존 lifecycle retirement | Web Stage Runner, editor, approval, Build/Verify 경로를 이 slice에서 제거하지 않는다. |

canonical 5-skill 체계는 변경하지 않는다. 최상위 자산도 Agent·Workflow·Tool 세 가지뿐이며 A2A는 Agent Binding/Exposure다.

## 다음 migration gate

Target write ownership 완료를 주장하려면 최소한 다음이 별도 설계·검증돼야 한다.

1. worktree source·git·evidence 변화의 normalized observer 계약과 provenance
2. canonical editor/Stage Runner write 경로를 유지·전환·retire할 구체적 결정
3. Hook 외 connector capability negotiation과 failure/fallback 경계
4. 선택 kind 확장 시 source content·sensitive data·retention 정책
5. 기존 approval·Build·Verify 계약과 외부 CLI write 충돌을 막는 동시성·ETag 모델
