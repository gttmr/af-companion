# STATUS — Agent Factory Companion

Last updated: 2026-08-05 (KST).

This is a branch-neutral product status. Check the live checkout separately:

```bash
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse --short HEAD
```

## Product direction

- `packages/companion` is the primary Companion development and acceptance
  surface. It owns managed App workspaces under `~/work/af-companion-apps`,
  exact published Asset bindings, the canonical Graph writer, Context v2,
  read/write MCP, live Web synchronization, and the VS Code extension entry
  point.
- Generated App repositories are user-controlled and independent. They are not
  part of this repository's commit or push flow unless the user separately
  configures their own remote.
- `packages/web` remains implemented and test-covered as the legacy Agent
  Factory Work Item lifecycle surface. No route redirect or source removal is
  claimed yet; new work should modify it only when the task explicitly targets
  legacy lifecycle behavior or migration compatibility.
- The independent `packages/companion/app-server-client` is implemented and
  verified, but it is not yet wired into the Graph synchronization plane or a
  replacement execution UI.

## Legacy lifecycle implementation

- The web product is an external-Codex-first live companion. It no longer runs Analyze, Design, Build, or Verify stages.
- The lifecycle ledger is strict `artifacts/af/<work-id>/af-work-item.json` v2 with four Work Skills, revision-bound review gates, re-entrant discovery/composition cycles, decisions, invalidations, and session handoffs.
- External Codex owns canonical artifacts and source. The web app projects Work Items, files, Git status/diffs, Hook activity, and session state.
- The guarded Web bootstrap may create one strict empty Work Item v2 ledger, initialize its server-derived application Git/MCP root, and write an ignored mode-`0600` local Application Registry binding. It cannot mutate an existing ledger; that local binding is noncanonical and grants no Session eligibility.
- The guarded terminal-session launch resolves that binding, generates an ignored mode-`0600` app-first/factory-second `.code-workspace`, and invokes `code --new-window` only after confirming the Bridge/editor path. Workspace Trust lets its `folderOpen` Task run `af companion vscode-start`; the CLI, not the browser, issues the `af_vscode_launch` ticket and launches factory-cwd Codex with the app sandbox writable root. Browser launch carries no Capsule and starts no turn. The internal `plan` role is a lifecycle attachment and does not force Codex Plan mode.
- Home now owns the Web-first terminal start UI: one application name or existing Work Item, one primary VS Code action, explicit new-path confirmation, and Trust/MCP guidance tied to fresh session/tool evidence. Connections has no manual enrollment form, fresh-session command, Capsule copy, or Capsule DOM rendering; existing-session Attach, Cancel, Revoke, and diagnostics remain. Discover may separately launch Materialization from the latest exact canonical Handoff or strict pristine-ledger Bootstrap Grant, but that convenience path is not terminal connection proof.
- Generated terminal and Materialization workspaces maximize the dedicated Task terminal panel so a structured CLI Question shows its multiple choices instead of looking like a one-option prompt. The CLI owns collaboration-mode changes, Questions, and `/model`.
- A selected Work Item opens one bounded watcher for its registered, realpath-contained external app root. Its metadata-only `application_source` events share the workspace SSE and drive Home plus Work Skill live strips for exact Companion connection count, current Skill state, Graph revision/change, and recent app source. Home adds a read-only Graph preview with Root Executable, solution control, revision, and app-source context; Compose presents the full Graph canvas before review/readiness registers. External source remains read-only in Web. CLI Question text, options, answers, and transcript are intentionally not projected; run/test/eval result projection is still deferred.
- Shared browser edits are limited to Graph IR and the Asset Registry. Both are loopback/same-origin, revision guarded, and strictly validated; Graph writes also target one explicit active Codex session.
- `catalog/asset-registry.json` versions Agent, Workflow, and Tool contracts. Draft/review/publish/deprecate transitions use explicit decisions, and published versions are immutable.
- Companion participation is opt-in. Workspace eligibility, session participation, and Work Item attachment are independent; `cwd` or Hook observation never enrolls a session.
- Project/plugin Hooks cover `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, and `Stop`, but the adapter resolves a signed activation capsule or current per-session lease before endpoint discovery. Ordinary unmanaged sessions create no Agent Factory network or durable bridge state.
- Companion bridge state is breaking v2 under ignored `.agent-factory/codex-bridge/v2`. Tickets are one-time and expiring, activation rechecks the ticket-bound canonical Work Item ETag, leases are bound to one Bridge instance and exact scope, and delivery has no global default target. Queued delivery rechecks the canonical source revision at consume time.
- Fresh-session transfer is explicit. Canonical Handoff claims bind exact ID, marker, revisions, verified Plan body, and consume-once Capsule; its Plan remains encrypted and pending authority fails on Bridge restart. A pristine Bootstrap Grant instead uses exact default-ledger ETag, source Plan session/latest turn, Plan hash, expiry, and one-time fresh claim. It survives restart, temporarily keeps the Plan plaintext only in ignored mode-`0600` local state, omits it publicly, and auto-finalizes against one exact claimed canonical Handoff record. `/connections` existing-session Attach remains canonical-Handoff-only and never preselects a target.
- Decision input is selected from tools actually exposed in the current turn. Structured and conversational paths normalize to the same semantics, while strict Decision and Asset Decision records preserve decision/recommendation revisions, selection source, bounded answer summary, input mode, and exact session/turn; superseded selection provenance remains all-or-none and a recommendation is never consent.
- VS Code actions open the canonical workspace, a contained file, a generated local diff, or one registered multi-root session descriptor. File/diff containment remains factory-only, and no editor receipt claims connection, IDE-thread creation, selection, or a first turn.
- Old Stage Runner APIs, stage routes, server analyzer/build/verify primitives, proposal/apply artifacts, and `af-run-manifest.json` are removed.
- Strict Target Contract v2, deterministic generation, and the no-raw-requirement-to-code gate remain active.

## Current routes and APIs

The UI exposes the Web-first start surface at `/`, four `/work/:workId/*` Work Skill screens, `/connections`, and `/assets`.

Vite registers only these product API families:

- `/api/workspace` — identity, snapshot, Git diff, selected-Work-Item SSE including bounded `application_source`, and contained VS Code open;
- `/api/work-items` — Work Item/files/Graph reads, guarded root POST for an empty Work Item bootstrap, and Graph PUT;
- `/api/codex-companion` — Plan or exact Handoff/Bootstrap Grant multi-root VS Code descriptor launch, enrollment, Companion sessions, canonical Handoff attach/cancel, revocation, and scoped next-prompt deliveries;
- `/api/asset-registry` — progressive Registry reads/search and guarded lifecycle mutations.

## Verification posture

Source remains the authority. Required local gates are:

```bash
cd packages/companion
npm run typecheck
npm test
npm run build
```

The legacy lifecycle gates remain:

```bash
node scripts/validate-skills.mjs
node scripts/validate-artifacts.mjs
cd packages/web && npm run test:contracts
cd packages/web && npm run test:companion
cd packages/web && npm run build
```

Visible UI changes additionally require a fixed-port browser check and screenshot. A VS Code launch receipt proves only that the editor command was accepted; a fresh eligible Hook prompt plus current lease/session receipt are still required before claiming a Companion session is connected.

Strict suppression of the Hook process itself and automatic built-in fresh-context Capsule transport are not claimed. The supported safety boundary is zero Agent Factory side effect for an unmanaged invocation plus explicit Companion Continue when transport is unavailable or unverified.

The measured Web-first result and zero-context continuation notes are:

- [P7 acceptance status](docs/migration/web-first-journey-status.md)
- [Web-first journey handoff](docs/migration/web-first-journey-handoff.md)
