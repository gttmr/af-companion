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
- `/connections` — Hook-observed Codex sessions and delivery state;
- `/assets` — Agent·Workflow·Tool Registry browse, search, version, usage, draft, review, publish, and deprecate operations.

Graph saves require the latest ETag, an approved Discover result, same-origin loopback access, and an explicit active Codex session target. Saving synchronizes embedded and split Graph IR, preserves prior cycle history, marks affected composition/downstream evidence stale, and queues metadata about the change to that exact session. Registry mutations require the current Registry revision and explicit lifecycle decisions; published versions are immutable.

## Codex connection

Tracked project Hooks and the companion plugin delegate official Codex lifecycle events to a local bridge:

```text
SessionStart · UserPromptSubmit · PreToolUse · PostToolUse · Stop
```

The bridge persists bounded metadata only. It does not persist prompts, transcripts, tool arguments, or tool output. A queued Graph/context delivery is attached once to the selected session's next prompt; the workbench does not start or steer a turn.

Review project Hook sources and hashes with `/hooks` in Codex before trusting them.

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
