# External Codex Companion

The companion connects the canonical repository to external Codex CLI and VS Code Codex sessions without taking over their turn or file ownership.

## Current boundary

- External Codex writes canonical artifacts and source through the four Work Skills.
- The web app observes the worktree and stores only bounded interaction/projection metadata outside its two canonical write surfaces.
- Graph IR and the Asset Registry are the only shared browser edit surfaces; the bridge itself never edits either one.
- VS Code commands open the canonical workspace, a contained file, or a local diff; they do not create/select an IDE chat.
- The bridge can attach queued context once to an exact session's next prompt. It cannot start a turn or steer an in-flight turn.

## Hook lifecycle

Tracked `.codex/hooks.json` and the companion plugin delegate the same official event set to `scripts/af-codex-hook.mjs`:

```text
SessionStart
UserPromptSubmit
PreToolUse
PostToolUse
Stop
```

`scripts/af-codex-hook-protocol.mjs` translates the Codex wire shape into a minimal bridge payload. Project and plugin delivery may overlap; session/turn receipts prevent duplicate next-prompt consumption.

Persisted activity includes event kind, session/turn identifiers, tool name when applicable, timestamp, and bounded status metadata. Prompt text, transcript content, tool arguments, and tool output are not persisted or projected.

## Bridge process

Start the bridge independently:

```bash
cd packages/web
npm run dev:companion-bridge
```

The bridge uses a loopback-only random bearer endpoint, one process per canonical workspace, repository-contained `cwd`, restricted state permissions, bounded receipts/activity, and atomic state replacement. It fails open when unavailable so a Codex prompt is not blocked.

Interaction state lives under ignored `.agent-factory/codex-bridge/v1`. Workspace activity projection lives under ignored `.agent-factory/workspace-projection` and remains metadata-only.

## Session trust and connection proof

Review loaded Hook sources/hashes with `/hooks` in Codex and trust the current version. After Hook changes or plugin reinstall, trust again and submit a fresh prompt.

Bridge health or a successful `code` launch is not connection proof. Before claiming a session is connected, confirm:

1. the expected session appears from a current Hook event;
2. a fresh prompt updates `last_turn_id`/receipt;
3. an exact-session delivery, when tested, is consumed only by that session and turn.

Sessions become stale by observation TTL because no supported end-event is assumed.

## Workspace projection

`WorkspaceProjection` watches the canonical repository, Work Item roots, Git status/diff, and bridge activity. It emits SSE events and retains a bounded metadata activity ledger. The UI also performs a slower query refresh as recovery from missed events.

File content is fetched only for an explicit contained Work Item preview or diff request. The projection does not index arbitrary source contents into interaction state.

## Graph change delivery

A Graph save requires one explicit active target session. After canonical files and Work Item invalidation are written, the server queues a compact `graph_change` context containing Work Item ID, Graph revision, changed Node IDs, and canonical references. The next prompt consumes it once.

The delivery is context, not a command. The external Codex session must re-open current files and decide the appropriate Compose work.

## Plan-to-materialization handoff

`POST /api/codex-companion/handoffs` creates a pending handoff only for a known active Plan-mode session and its exact latest turn. It returns a signed, expiring marker with Work Item, discovery/decision revisions, Plan hash, target, and claim token.

The first prompt in a different fresh session claims one exact marker through `UserPromptSubmit`. A claim is consume-once, rejects mismatched, duplicate, expired, ambiguous, same-session, and subagent prompts, and records Plan/materialization session roles. The marker must be carried explicitly; Codex does not provide a verified automatic new-context metadata transfer.

If marker carriage fails, `/connections` or `node scripts/af.mjs work attach-session --session <id> --work-id <id> --role materialization` can attach one explicitly named active session. Neither path guesses the first active session.

## Capabilities

| Capability | Current |
| --- | --- |
| Hook-observed session registration | supported |
| metadata-only tool/turn activity | supported |
| exact next-prompt context | supported |
| exact fresh-session Plan handoff | supported with explicit marker |
| explicit named-session attach fallback | supported |
| workspace/Git/file projection | supported |
| VS Code workspace/file/diff open | supported |
| browser Graph edit | supported |
| delivery/model acknowledgement | not claimed |
| private IDE thread selection | unsupported |
| direct turn start | unsupported |
| in-flight steer | unsupported |
| MCP context pull | unsupported |

## Source locators

| Behavior | Source |
| --- | --- |
| Hook adapter | `scripts/af-codex-hook.mjs`, `scripts/af-codex-hook-protocol.mjs` |
| Hook declarations | `.codex/hooks.json`, `plugins/agent-factory-companion/hooks/hooks.json` |
| bridge state | `packages/web/server/codexBridgeStore.ts` |
| bridge process | `packages/web/server/codexBridgeServer.ts`, `codexBridgeMain.ts` |
| companion facade | `packages/web/server/codexCompanionApi.ts` |
| workspace observer | `packages/web/server/workspaceProjection.ts`, `workspaceApi.ts` |
| editor handoff | `packages/web/server/vscodeWorkspaceLauncher.ts` |
| Connections UI | `packages/web/src/routes/ConnectionsPage.tsx` |
| Work Item/Registry CLI | `scripts/af.mjs` |
| live rail | `packages/web/src/layout/LiveRail.tsx` |
