# CLAUDE.md

This file guides Claude Code in the Agent Factory Companion repository.

## Product boundary

External coding agents perform the Agent Factory lifecycle and write canonical artifacts/source. The web app is a local live projection with two bounded canonical write surfaces: Graph IR and the Asset Registry. The four Work Skills are `af-discover-assets`, `af-compose-solution`, `af-scaffold-runtime`, and `af-verify-runtime`; `af-workflow` routes by current evidence and revision without writing artifacts.

Raw requirements never go directly to code. Runtime Handoff and generated source consume an explicitly approved composition and remain local review material, not production deployment.

## Required reading

1. `AGENTS.md` and the nearest child `AGENTS.md`.
2. [docs/README.md](docs/README.md).
3. [docs/handbook/README.md](docs/handbook/README.md) before relying on a route, API, artifact producer, or source locator.
4. The canonical owner for the decision: [Taxonomy](docs/workbench/taxonomy.md), [Graph IR](docs/workbench/graph-ir.md), [Operating Model](docs/workbench/operating-model.md), or [Codex Companion](docs/workbench/cli-companion.md).

Source is final authority for Current Implementation. Keep Target Contract, observed implementation, and blockers distinct.

## Current implementation

- `artifacts/af/<work-id>/af-work-item.json` is the lifecycle ledger.
- `packages/web/src/routes` contains the home, four Work Skill projections, Connections, and Asset Registry screens.
- `packages/web/server` exposes workspace projection, Work Item/Graph, Codex companion, and Asset Registry middleware.
- External Codex writes Work Item artifacts/source. The browser writes only guarded Graph IR and explicitly reviewed Registry lifecycle mutations.
- The browser never stages, commits, starts a Codex turn, or edits arbitrary source.
- Stage Runner, `/api/af`, `af-run-manifest.json`, proposal/apply, web analyzer execution, and local Run UI are unsupported.

## Commands

```bash
cd packages/web
npm install
npm run test:contracts
npm run test:companion
npm run build
```

```bash
node scripts/validate-skills.mjs
node scripts/validate-artifacts.mjs
```

Start the bridge and fixed-port UI separately:

```bash
cd packages/web && npm run dev:companion-bridge
./scripts/start-manual-web-test.sh
```

Use only `http://127.0.0.1:5173/` for manual verification.

## Editing and verification

- Keep edits surgical and preserve unrelated dirty work.
- Edit `.agents/skills` only for an explicit skill/lifecycle request.
- Keep Agent, Workflow, and Tool as the only asset categories; A2A remains an Agent protocol boundary.
- Keep generators neutral; domain behavior belongs in reviewed artifacts.
- Before visible UI changes, read [Design System](docs/visualization/design-system.md), verify the real screen, and capture a screenshot.
- Schema/interface/UX changes require active docs and a dated `docs/decision-log.md` entry.
- Do not claim connection from bridge health or editor launch alone. Require a fresh Hook-observed prompt and current state receipt.
- Never add secrets, private endpoints, real customer data, deployment scripts, or organization-specific production logic.
