# Live Companion

`WorkspaceProjection` combines canonical workspace identity, Work Item summaries, Git status/diff, factory filesystem events, selected-application filesystem events, and newest enrolled-Bridge activity. It emits SSE through `/api/workspace/events` and persists a bounded metadata-only activity list. `LiveRail` shows Activity, Changes, and Codex tabs; explicit file/diff open uses `VscodeWorkspaceLauncher` after factory path containment checks.

## Main flow

1. For the Web-first Plan path, `codexCompanionApi` resolves the Work Item's local Application Registry binding and asks `VscodeWorkspaceLauncher.launchSessionWorkspace` to write and open a private multi-root descriptor. This browser request creates no enrollment.
2. After Workspace Trust, the descriptor's `folderOpen` Task runs `af companion vscode-start` from the factory root. The CLI creates a one-time `af_vscode_launch` ticket bound to the Work Item ETag and exact workspace, application, Work Item, and role, then starts interactive Codex with the app root added to sandbox writable roots.
3. The user submits the first terminal prompt. The new Codex session carries the activation Capsule, and the local Hook gate validates workspace and Capsule before endpoint discovery.
4. The Bridge re-reads the unchanged Work Item, consumes the ticket once, persists only the activated Companion session, and writes an exact-session lease bound to the current Bridge instance.
5. Later lifecycle Hooks resolve that contained lease locally. Unmanaged, revoked, expired, wrong-workspace, and subagent events no-op before Agent Factory network/state.
6. Exact-scope deliveries recheck canonical source revision and may be consumed once by the next eligible prompt. Ordinary sessions are never candidate targets.

Explicit CLI enrollment remains available as a low-level operator path. The
browser `/connections` enrollment/copy surface is removed: Home launches the
registered Plan workspace while the Task-owned CLI creates enrollment. In every
path, editor launch, ticket issuance, claim, lease, and prompt receipt are
distinct evidence. The Web-first server never starts a turn.

The bridge stores bounded session, role, receipt, handoff, delivery, and activity metadata. It does not store prompts, transcripts, tool arguments, tool output, plaintext durable claim tokens, or unmanaged session rows.

## External application MCP

`mcpExportContext` reads one strict Work Item through
`parseAfWorkItemManifest`, reads the current Registry through
`AssetRegistryService.loadSnapshot`, and writes a portable bounded context plus
project-local `.codex/config.toml` to one explicitly named application root. It
does not mutate the Work Item or Registry. A different existing project config
is a conflict rather than an overwrite.

`runServer` starts the installed `@agent-factory/context-mcp` package over
stdio. `findProjectContext` resolves only a regular context/config pair from
the application root or descendant. Every Tool call reloads and revalidates the
context. `callTool` keeps transport completion separate from domain outcome,
fails stale revisions and invalid allowed values as `UNVERIFIED`, and exposes no
canonical mutation, session/turn fabrication, or handoff claim.

## Handoff and decisions

Plan handoff creation requires the exact canonical Work Item Handoff ID/marker, leased Plan session, exact latest turn, and complete canonical Plan body. The Bridge recomputes its hash, encrypts the bounded body locally, and omits it from public state. A distinct fresh prompt claims one exact signed Capsule once and receives those verified bytes; wrong scope/marker, missing or duplicate Capsule, canonical revision drift, expiry, replay, same-session, and subagent claims fail closed. The low-level `node scripts/af.mjs companion continue --handoff <id>` remains available. The Discover Plan screen can now post the latest launchable exact Handoff ID as Materialization mode to `codexCompanionApi`; `vscodeWorkspaceLauncher` writes a capsule-free private descriptor whose trusted `folderOpen` Task invokes that same CLI boundary. The browser neither calls Continue nor receives or renders its command, Capsule, or Plan bytes. A launch receipt is not claim proof; the new exact leased Materialization Session and `claimed` Handoff snapshot are. `/connections` may durably record one user-selected, same-scope leased materialization target without returning a Capsule or Plan body; only its next leased prompt receives the Handoff. No candidate is preselected. Pending handoffs can be canceled, target revocation detaches them, and source revocation/staleness or Bridge restart closes their authority and erases body ciphertext.

Work Skills choose structured decision input only from tools actually exposed in the current turn. Otherwise they ask one conversational question and stop at `waiting_for_input`. Both adapters preserve one decision ID/option meaning plus durable decision/recommendation revisions, selection source, bounded answer summary, input mode, and exact session/turn; an ambiguous answer or stale recommendation does not write a user decision. An executable semantic fixture proves strict-parser roundtrip, path-independent semantics, delegated-recommendation binding, and protected-gate blocking; live two-client-path execution remains capability-dependent.

## Projection

`WorkspaceHome` owns the normal start path: new application name or existing Work Item, one VS Code launch action, path confirmation, then Trust/MCP guidance. `ConnectionsPage` presents four ordered registers: Companion Sessions, Pending Handoffs, Deliveries, and Setup/Diagnostics. Session rows keep participation, application/Work Item/role, activation origin, lease expiry, last event, alias, and revoke action distinct. Handoff rows show the source session/turn, revisions, transport, destination, expiry, exact existing-session Attach, and Cancel actions. Diagnostics expose capability labels and aggregate ignored/invalid/expired counts only. No React component renders `activation_capsule`.

The Work Item selected by Home or a Work Skill route is sent only as the
`work_id` query on its SSE connection.
When the local Application Registry has that exact binding, one second chokidar
watcher observes the realpath-contained app root at depth 6 and excludes
`node_modules`, `.git`, `.venv`, `__pycache__`, `dist`, and `.agent-factory`.
Its `application_source` activity stores the Work ID, action, app-relative path,
and timestamp, never source bytes or an absolute app path. Switching the selected
Work Item closes the prior app watcher; closing the final matching SSE lease
closes the watcher. Factory Git change/diff and editor-open scope stay unchanged.

`WorkLiveStrip` projects exact active Companion count, current/focus Work Skill,
Graph revision/latest Graph event, and latest application-source event for the
Home selection and every Work Skill route. `WaitingDecisionStrip` renders a
current Decision topic and its options only when the ledger also contains a
`waiting_for_input` active run. It does not answer the Decision. Run/test/eval
result display remains a follow-up.

`JourneyRecoveryPanel` receives a pure classification from stable API error
codes and the current launch observation. Bridge unavailable, missing Work Item,
VS Code unavailable/failed/cooldown, unclaimed/expired enrollment, missing prompt
Hook, ETag activation rejection, stale revision, and MCP export failure retain
distinct labels and actions. Because public snapshot tickets remain pending-only,
the browser correlates a pending ticket observed for the current exact Work Item
with later aggregate diagnostic growth; it does not infer historical ticket
scope from a counter alone. Bridge and Trust/Task recovery remain guides, while
bounded one-click actions reuse existing bootstrap, launch, and refresh routes.

Bridge health, editor launch acceptance, ticket issuance, active lease, and prompt receipt are separate states. The UI never lists ordinary Hook-observed sessions, selects the first active session, or reports editor launch as Codex connection proof.

The generated descriptor is stored under
`.agent-factory/vscode/<work-id>.code-workspace`. Its first folder is the
registered external app and its second folder is the canonical factory root.
Only this descriptor path may name the app root; `openFile` and `openDiff` still
reject paths outside the factory. Since the Codex process cwd remains factory,
the app's project `.codex/config.toml` is not consumed by this session.

Source:

- `packages/web/src/companion/sessionContract.ts` (`deliveryEligibility`, `canonicalizePlanBody`)
- `packages/web/server/workspaceProjection.ts`, `workspaceApi.ts`, `vscodeWorkspaceLauncher.ts`
- `packages/web/src/layout/LiveRail.tsx`, `WorkLiveStrip.tsx`, `WaitingDecisionStrip.tsx`
- `packages/web/src/routes/WorkspaceHome.tsx`, `packages/web/src/components/JourneyGuideDialog.tsx`, `JourneyRecoveryPanel.tsx`
- `packages/web/src/companion/journeyRecovery.ts`
- `packages/web/server/codexBridgeStore.ts`
- `packages/web/server/codexBridgeServer.ts`, `codexCompanionApi.ts`
- `packages/web/src/routes/ConnectionsPage.tsx`, `packages/web/src/state/useCodexSessions.ts`
- `scripts/af-codex-hook.mjs`, `scripts/af-codex-hook-protocol.mjs`, `scripts/af.mjs`
- `packages/agent-factory-context-mcp/src/context.mjs`, `packages/agent-factory-context-mcp/src/server.mjs`
- `.agents/skills/_shared/decision-input-adapter.md`, `.agents/skills/_shared/fresh-context-handoff.md`
- `tests/skills/decision-input-fixture.mjs`, `tests/skills/decision-session-contract.test.mjs`
