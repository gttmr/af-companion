# Greenfield Companion Workspace

This directory is an isolated implementation boundary. Existing Companion,
Bridge, Hook, launcher, and Agent Factory Web code elsewhere is reference
material, not a runtime dependency. Do not switch the existing `packages/web`
Graph surface before this workspace passes user acceptance.

## Package boundaries

- `graph-domain` owns strict canonical Graph IR, validation, typed operations,
  semantic revisions, and element diffs. It has no I/O dependencies.
- `contracts` owns Context v2 and the HTTP/MCP/UI wire types.
- `graph-control-server` is the single writer. It owns atomic persistence,
  external-file reconciliation, Context publication, and loopback HTTP/SSE.
- `mcp-plane` owns exactly one read Tool and one write Tool. It reaches the
  Control Server only through a project-contained mode-0600 capability.
- `web` owns the React Graph workspace and a small Node composition entrypoint.
  Browser code never imports filesystem, MCP SDK, or App Server wire types.
- `app-server-client` remains an independent Codex execution plane and has no
  Graph synchronization dependency.
- `tests/integration` uses public APIs and executable entrypoints.

Do not add a generic gateway, repository hierarchy, transport registry, Hook,
or compatibility layer. Graph writes use `get -> apply`; direct file edits are
only a reconciled fallback.

## Product language

- Say `Context 사용 가능`, `선택 공유됨`, `저장 전 변경 공유됨`,
  `Codex 변경 반영됨`, or `외부 파일 변경 반영됨`.
- MCP readiness is not `Codex 연결됨`.
- Every Context document has `authority: "none"`; cwd, session identity, and
  Context never grant lifecycle or review authority.
- Context has no user-managed sequence cursor. `document_revision` identifies
  the snapshot; `graph_revision` is only the CAS boundary.

## Verification

Run from this directory:

```bash
npm run typecheck
npm run test
npm run build
```

Browser acceptance uses port `8890` after checking its owner. Real authenticated
Codex tests remain opt-in and never run in the default suite.
