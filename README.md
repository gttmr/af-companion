# Agent Factory Companion

Agent Factory Companion is a local web projection for Agent Factory work performed in an external Codex CLI or VS Code Codex session. Codex edits Work Item artifacts and source; the web app makes that work visible in real time, can create one strict empty Work Item through a guarded bootstrap, can open its registered app/factory multi-root VS Code descriptor, and provides bounded edit surfaces for Graph IR and the versioned Asset Registry.

The lifecycle is expressed by four re-entrant Work Skills, not web-run stages:

1. `af-discover-assets` — requirement evidence and Agent·Workflow·Tool candidates.
2. `af-compose-solution` — standalone/Workflow decision, Graph IR, bindings, and runtime contracts.
3. `af-scaffold-runtime` — approved composition to ADK source or Runtime Handoff.
4. `af-verify-runtime` — fresh artifact, code, runtime, and behavior evidence.

`af-workflow` is the read-only router for starting, resuming, or returning to the evidence-owning skill. Raw requirements never go directly to source generation.

## Work ownership

| Surface | Owner |
| --- | --- |
| Canonical artifacts, source, handoff, validation report | external Codex CLI or VS Code session |
| Work Skill state and explicit review provenance | executing external Codex session in `af-work-item.json` |
| New empty Work Item v2 ledger | guarded Web bootstrap or `scripts/af.mjs work init` |
| Graph IR | Compose skill or guarded web Graph editor |
| Versioned Asset Registry | shared Registry core through Web or `scripts/af.mjs asset ...` |
| Activity, files, Git changes, diffs, session state | web projection, read-only |

The canonical root is `artifacts/af/<work-id>/`. Its lifecycle ledger is `af-work-item.json`; old stage manifests, run directories, proposal/apply flows, and `/api/af` are not supported.

## Web workspace

The app routes are:

- `/` — new/existing Work Item start, VS Code gate guidance, index, and revisioned lifecycle map;
- `/work/:workId/discover` — evidence and candidate projection;
- `/work/:workId/compose` — Graph IR review and the only browser artifact editor;
- `/work/:workId/scaffold` — generated source, handoff, and Git diff projection;
- `/work/:workId/verify` — five-level evidence projection;
- `/connections` — opt-in Companion sessions, pending handoffs, scoped deliveries, and diagnostics without browser enrollment/Capsule copy;
- `/assets` — Agent·Workflow·Tool Registry browse, search, version, usage, draft, review, publish, and deprecate operations.

The headless root `POST /api/work-items` requires loopback, same-origin JSON no larger than 4 KiB, confirmed server-derived application root, and `CREATE_WORK_ITEM`. It creates only the unchanged empty v2 ledger, initializes the application Git/MCP context, and records its path in an ignored mode-`0600` noncanonical local registry. It cannot edit an existing ledger or grant Session eligibility. Graph saves require the latest ETag, an approved Discover result, same-origin loopback access, and an explicit active Codex session target. Saving synchronizes embedded and split Graph IR, preserves prior cycle history, marks affected composition/downstream evidence stale, and queues metadata about the change to that exact session. Registry mutations require the current Registry revision and explicit lifecycle decisions; published versions are immutable.

The headless `POST /api/codex-companion/vscode-sessions` Plan route resolves
that local registration, requires a reachable Bridge, writes an ignored private
`.code-workspace`, and calls `code --new-window` with fixed argv. The descriptor
shows the app first and factory second. After Workspace Trust, its automatic
default Task runs `af companion vscode-start` in a dedicated terminal; that CLI
creates the `af_vscode_launch` ticket and starts Codex at the factory cwd with
the app root added to sandbox writable roots. The browser receives no Capsule,
does not enroll a session, and does not start a turn. Existing file/diff open
actions remain factory-contained.

Home connects the two guarded APIs behind one `작업 시작하고 VS Code 열기`
action. New applications first require a path-confirmation dialog; accepted
launches show Workspace Trust guidance until a fresh exact Plan session is
observed, then bounded MCP approval guidance. The top shell no longer exposes a
factory-only VS Code shortcut, and Connections does not render enrollment or
handoff Capsule/command copy surfaces. Generated Plan and Materialization
descriptors maximize the dedicated Task terminal panel so structured Questions
show their multiple choices. Explicit CLI enrollment remains an operator path.
Capsule-free fresh Materialization launch is available for either an exact
canonical pending Handoff or the strict pristine-ledger Bootstrap Grant.

Selecting a Work Item also scopes the existing workspace SSE connection to its
registered application. A second bounded watcher observes only that realpath-
contained app root, excludes dependency/build/private state, and emits metadata-
only `application_source` activity with an app-relative path and exact Work ID.
The selected Work Item on Home and every Work Skill screen keep connection
count, current Skill status, Graph revision/change, and the latest app-source
signal visible without another navigation click. Home also renders a read-only
Graph preview with Root Executable and composition context; Compose keeps the
full Graph canvas first. CLI Question text, options, answers, and transcript are
not Web projection surfaces.

The 2026-07-28 P7 acceptance verified the Web bootstrap, multi-root VS Code
launch, one exact `af_vscode_launch` Plan Session, Luna low multi-choice terminal
flow, and `bridge_down` recovery. It observed that an ephemeral
`request_user_input` question is not present in the strict ledger that Web
projects; this is now an intentional CLI/Web ownership boundary. It also found
that the Phase A no-write rule could not create the canonical Work Item Handoff
required by the fresh Materialization launcher. A follow-up now implements a
strict pristine-ledger Bootstrap Grant with exact ETag/source turn/Plan hash,
expiry, one-time fresh claim, restart recovery, and automatic finalization
against the actual claimed canonical Handoff record. The uninterrupted new-work
journey through Graph/source still needs live acceptance. See the
[measured status](docs/migration/web-first-journey-status.md) and
[zero-context handoff](docs/migration/web-first-journey-handoff.md).

## Codex connection

Tracked project Hooks and the companion plugin may invoke the local adapter for these official Codex lifecycle events:

```text
SessionStart · UserPromptSubmit · PreToolUse · PostToolUse · Stop
```

Invocation does not enroll a session. The adapter proves an exact enrollment capsule or unexpired per-session lease before endpoint discovery or network access. An ordinary `codex` session therefore produces no Agent Factory request, durable session, receipt, or activity. An enrolled Companion session persists bounded metadata only; prompts, transcripts, tool arguments, and tool output are never persisted.

Start or join one exact application/Work Item/role scope explicitly:

```bash
node scripts/af.mjs companion start --application <application-id> --work <work-id> --role plan
node scripts/af.mjs companion join --application <application-id> --work <work-id> --role materialization
```

Generated Web-first workspaces use this non-browser enrollment command after
Workspace Trust; it is normally not typed by the user:

```bash
node scripts/af.mjs companion vscode-start \
  --application <application-id> --work <work-id> --role plan \
  --application-root <registered-application-root>
```

Its activation Capsule exists only in the launched child environment. A fresh
human terminal prompt and current claimed ticket/lease remain necessary before
the session is connected. Since Codex stays factory-rooted, the external app's
project MCP config is not consumed on this path.

Ticket issuance reads the strict canonical Work Item and binds its ETag. Activation re-reads that same Work Item and rejects a deleted or changed ledger instead of creating a phantom session.

Plan handoff continuation is also explicit:

```bash
node scripts/af.mjs companion continue --handoff <handoff-id>
```

The Bridge accepts only the exact canonical Work Item Handoff ID and marker, recomputes the canonical Plan body hash, and keeps the bounded body encrypted in ignored local state until one successful claim. Its 512 KiB JSON request envelope safely carries a valid canonical Plan capped at 64 KiB even under worst-case escaping, while snapshot reads fail removed or drifted canonical Handoff authority closed and erase the body. `/connections` additionally allows a user to durably attach that pending Handoff to one explicitly selected, already-enrolled materialization session with the same exact scope, or cancel it. Attach returns no raw Capsule or Plan body; the named session receives the verified body on its next leased prompt, and no candidate is ever preselected.

For the strict pristine Work Item, the Plan session instead prepares and
continues one local Bootstrap Grant:

```bash
printf '%s' "$PLAN_BODY" | node scripts/af.mjs companion prepare-materialization \
  --work <work-id> --session <plan-session-id> --turn <latest-turn-id>
node scripts/af.mjs companion continue --grant <grant-id>
```

The Grant prevents accidental wrong-session, stale, or replayed continuation
for a local single user; it is not a new same-user security layer. The Plan is
temporary plaintext in ignored mode-`0600` Bridge state and absent from public
or browser surfaces. Phase B must write real revisions and one exact claimed
canonical Handoff record before snapshot auto-finalizes the Grant.

A queued Graph/context delivery is attached once only when the active lease and delivery scope match the exact workspace, application, Work Item, and allowed role. Its canonical source revision is checked again at consume time. The workbench does not choose a default target, start a turn, or steer an in-flight turn.

Review project Hook sources and hashes with `/hooks` in Codex before trusting them. Hook definitions are additive, so profile selection alone is not a session-isolation boundary.

## Development

Install and verify the web package:

```bash
cd packages/web
npm install
npm run build
npm run test:companion
```

For a live session, run the bridge and fixed-port workbench in separate terminals:

```bash
cd packages/web
npm run dev:companion-bridge
```

```bash
./scripts/start-manual-web-test.sh
```

The only supported manual URL is `http://127.0.0.1:8890/`. The launcher reuses that port only when `/api/workspace/identity` proves it belongs to this exact canonical repository. Local Agent Factory services stay within the reserved `8890` through `8900` range.

Validate artifacts from the repository root:

```bash
node scripts/validate-artifacts.mjs
node scripts/validate-artifacts.mjs artifacts/af/<work-id>
```

## Canonical documentation

- [Documentation index](docs/README.md)
- [Operating Model](docs/workbench/operating-model.md)
- [Taxonomy](docs/workbench/taxonomy.md)
- [Graph IR](docs/workbench/graph-ir.md)
- [Codex Companion](docs/workbench/cli-companion.md)
- [Source-backed Handbook](docs/handbook/README.md)
- [Web-first P7 acceptance status](docs/migration/web-first-journey-status.md)
- [Web-first zero-context handoff](docs/migration/web-first-journey-handoff.md)

## Safety boundary

This is a local review and implementation companion, not a production deployment surface. Do not add private endpoints, credentials, real customer data, deployment scripts, or organization-specific production logic. Generated examples and runtime probes use synthetic data.
