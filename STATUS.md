# STATUS — Agent Factory Companion

Last updated: 2026-07-24 (KST).

This is a branch-neutral product status. Check the live checkout separately:

```bash
git status --short
git rev-parse --abbrev-ref HEAD
git rev-parse --short HEAD
```

## Current implementation

- The web product is an external-Codex-first live companion. It no longer runs Analyze, Design, Build, or Verify stages.
- The lifecycle ledger is strict `artifacts/af/<work-id>/af-work-item.json` v2 with four Work Skills, revision-bound review gates, re-entrant discovery/composition cycles, decisions, invalidations, and session handoffs.
- External Codex owns canonical artifacts and source. The web app projects Work Items, files, Git status/diffs, Hook activity, and session state.
- Browser canonical writes are limited to Graph IR and the Asset Registry. Both are loopback/same-origin, revision guarded, and strictly validated; Graph writes also target one explicit active Codex session.
- `catalog/asset-registry.json` versions Agent, Workflow, and Tool contracts. Draft/review/publish/deprecate transitions use explicit decisions, and published versions are immutable.
- Companion participation is opt-in. Workspace eligibility, session participation, and Work Item attachment are independent; `cwd` or Hook observation never enrolls a session.
- Project/plugin Hooks cover `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, and `Stop`, but the adapter resolves a signed activation capsule or current per-session lease before endpoint discovery. Ordinary unmanaged sessions create no Agent Factory network or durable bridge state.
- Companion bridge state is breaking v2 under ignored `.agent-factory/codex-bridge/v2`. Tickets are one-time and expiring, leases are bound to one Bridge instance and exact scope, and delivery has no global default target.
- Fresh-session transfer is explicit: use Companion Continue when built-in Capsule carriage is not proven. Claims are exact and consume-once. `/connections` can also durably attach a pending Handoff to one explicitly selected same-scope existing session for its next leased prompt, without returning a raw Capsule; no target is preselected.
- Decision input is selected from tools actually exposed in the current turn. Structured and conversational paths normalize to the same decision/revision/provenance contract; a recommendation is never consent.
- VS Code actions open the canonical workspace, a contained file, or a generated local diff. They do not claim IDE-thread creation or selection.
- Old Stage Runner APIs, stage routes, server analyzer/build/verify primitives, proposal/apply artifacts, and `af-run-manifest.json` are removed.
- Strict Target Contract v2, deterministic generation, and the no-raw-requirement-to-code gate remain active.

## Current routes and APIs

The UI exposes `/`, four `/work/:workId/*` Work Skill screens, `/connections`, and `/assets`.

Vite registers only these product API families:

- `/api/workspace` — identity, snapshot, Git diff, SSE, and contained VS Code open;
- `/api/work-items` — read-only Work Item/files plus Graph GET/PUT;
- `/api/codex-companion` — enrollment, Companion sessions, exact handoff continuation/attach/cancel, revocation, and scoped next-prompt deliveries;
- `/api/asset-registry` — progressive Registry reads/search and guarded lifecycle mutations.

## Verification posture

Source remains the authority. Required local gates are:

```bash
node scripts/validate-skills.mjs
node scripts/validate-artifacts.mjs
cd packages/web && npm run test:contracts
cd packages/web && npm run test:companion
cd packages/web && npm run build
```

Visible UI changes additionally require a fixed-port browser check and screenshot. A VS Code launch receipt proves only that the editor command was accepted; a fresh eligible Hook prompt plus current lease/session receipt are still required before claiming a Companion session is connected.

Strict suppression of the Hook process itself and automatic built-in fresh-context Capsule transport are not claimed. The supported safety boundary is zero Agent Factory side effect for an unmanaged invocation plus explicit Companion Continue when transport is unavailable or unverified.
