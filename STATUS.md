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
- Project/plugin Hooks cover `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, and `Stop`. Persisted activity is metadata-only.
- VS Code actions open the canonical workspace, a contained file, or a generated local diff. They do not claim IDE-thread creation or selection.
- Old Stage Runner APIs, stage routes, server analyzer/build/verify primitives, proposal/apply artifacts, and `af-run-manifest.json` are removed.
- Strict Target Contract v2, deterministic generation, and the no-raw-requirement-to-code gate remain active.

## Current routes and APIs

The UI exposes `/`, four `/work/:workId/*` Work Skill screens, `/connections`, and `/assets`.

Vite registers only these product API families:

- `/api/workspace` — identity, snapshot, Git diff, SSE, and contained VS Code open;
- `/api/work-items` — read-only Work Item/files plus Graph GET/PUT;
- `/api/codex-companion` — sessions and exact next-prompt deliveries;
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

Visible UI changes additionally require a fixed-port browser check and screenshot. A VS Code launch receipt proves only that the editor command was accepted; a fresh Hook-observed prompt and state receipt are still required before claiming a Codex session is connected.
