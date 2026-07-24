# Agent Factory Companion

Agent Factory Companion is a local web projection for Agent Factory work performed in an external Codex CLI or VS Code Codex session. Codex edits Work Item artifacts and source; the web app makes that work visible in real time and provides bounded edit surfaces for Graph IR and the versioned Asset Registry.

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
| Graph IR | Compose skill or guarded web Graph editor |
| Versioned Asset Registry | shared Registry core through Web or `scripts/af.mjs asset ...` |
| Activity, files, Git changes, diffs, session state | web projection, read-only |

The canonical root is `artifacts/af/<work-id>/`. Its lifecycle ledger is `af-work-item.json`; old stage manifests, run directories, proposal/apply flows, and `/api/af` are not supported.

## Web workspace

The app routes are:

- `/` — Work Item index and revisioned lifecycle map;
- `/work/:workId/discover` — evidence and candidate projection;
- `/work/:workId/compose` — Graph IR review and the only browser artifact editor;
- `/work/:workId/scaffold` — generated source, handoff, and Git diff projection;
- `/work/:workId/verify` — five-level evidence projection;
- `/connections` — opt-in Companion sessions, pending handoffs, scoped deliveries, and setup diagnostics;
- `/assets` — Agent·Workflow·Tool Registry browse, search, version, usage, draft, review, publish, and deprecate operations.

Graph saves require the latest ETag, an approved Discover result, same-origin loopback access, and an explicit active Codex session target. Saving synchronizes embedded and split Graph IR, preserves prior cycle history, marks affected composition/downstream evidence stale, and queues metadata about the change to that exact session. Registry mutations require the current Registry revision and explicit lifecycle decisions; published versions are immutable.

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

Ticket issuance reads the strict canonical Work Item and binds its ETag. Activation re-reads that same Work Item and rejects a deleted or changed ledger instead of creating a phantom session.

Plan handoff continuation is also explicit:

```bash
node scripts/af.mjs companion continue --handoff <handoff-id>
```

The Bridge accepts only the exact canonical Work Item Handoff ID and marker, recomputes the canonical Plan body hash, and keeps the bounded body encrypted in ignored local state until one successful claim. Its 512 KiB JSON request envelope safely carries a valid canonical Plan capped at 64 KiB even under worst-case escaping, while snapshot reads fail removed or drifted canonical Handoff authority closed and erase the body. `/connections` additionally allows a user to durably attach that pending Handoff to one explicitly selected, already-enrolled materialization session with the same exact scope, or cancel it. Attach returns no raw Capsule or Plan body; the named session receives the verified body on its next leased prompt, and no candidate is ever preselected.

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

## Safety boundary

This is a local review and implementation companion, not a production deployment surface. Do not add private endpoints, credentials, real customer data, deployment scripts, or organization-specific production logic. Generated examples and runtime probes use synthetic data.
