# Agent Working Index

## Repository Role

- This is the primary Agent Factory workbench repository.
- Treat `.agents/skills`, `packages/web`, `schemas`, `templates`, `catalog`, and `docs` as the active Agent Factory source trees.
- Do not treat this repository as only a public skill-source extract.
- Do not add private banking data, private endpoints, credentials, deployment scripts, real customer data, or organization-specific runtime code.
- Edit `.agents/skills` only when the task explicitly asks for skill, DLC workflow, or skill-sync work.

## Required Reading Order

Before non-trivial work:

1. Read [docs/README.md](docs/README.md) for the active documentation path.
2. Read [docs/handbook/README.md](docs/handbook/README.md) to locate current behavior in source.
3. Use the canonical document that owns the decision:
   - concepts and asset classification: [docs/workbench/taxonomy.md](docs/workbench/taxonomy.md)
   - Workflow Graph decisions and display: [docs/workbench/graph-ir.md](docs/workbench/graph-ir.md)
   - Work Skills, reviews, artifacts, and verification: [docs/workbench/operating-model.md](docs/workbench/operating-model.md)
   - Target Contract versus Current Implementation gaps: [docs/migration/taxonomy-vnext-status.md](docs/migration/taxonomy-vnext-status.md)

Do not duplicate or redefine a canonical taxonomy or Graph enum in this file. Link to the owning document.

## Canonical Decision Rules

- Do not create a top-level asset type other than Agent, Workflow, or Tool. Roles, protocols, resources, dependencies, domains, ownership, and reuse states do not become additional asset types.
- Tool Invocation Control uses the display labels Workflow and Agent. Do not promote Model or LLM to an Invocation Control owner. Follow the canonical [Taxonomy](docs/workbench/taxonomy.md) and [Graph IR](docs/workbench/graph-ir.md).
- Handbook locators are navigation aids, not authority over source. Before using a locator, open the current file and re-verify its symbol, callers, inputs, outputs, and side effects.
- When documentation and code differ, state **Target Contract** and **Current Implementation** separately. Do not present a documentation target as implemented behavior.

## Current Implementation Contract

External Codex and the four Work Skills write strict Target Contract v2 fields such as `asset_type`, `binding`, `workflow_profile`, `domain_scope`, `owner`, `reuse_status`, asset refs, and `invocation_control`. `af-work-item.json` v2 is the revisioned, re-entrant lifecycle ledger. The web app projects repository state; its only canonical writes are guarded Graph IR and Asset Registry mutations. Stage Runner, `/api/af`, proposal/apply artifacts, and `af-run-manifest.json` are unsupported.

Graph IR uses the canonical Target node/edge envelope. The canonical Asset Registry is `catalog/asset-registry.json`; Web and `scripts/af.mjs asset ...` share its strict core service, revision checks, and immutable published versions. Registry review, publication, and deprecation require explicit user decision evidence. Adapter and Remote A2A are not asset categories or Registry buckets. A2A remains a protocol binding for Agent assets. The skill tree is `af-workflow` plus four canonical Work Skills with no former-stage shims.

## Local AGENTS.md Hierarchy

This root file carries repository-wide policy. More specific guidance lives near active ownership boundaries:

- [.agents/skills/AGENTS.md](.agents/skills/AGENTS.md): DLC skill authoring, canonical skill map, strict Target v2 contract, and shared references.
- `packages/web/AGENTS.md`: web workbench package, routes, UI, server middleware, and verification entrypoints.
- `packages/mock-lab/AGENTS.md`: standalone Mock Lab package and MCP runtime.
- `docs/AGENTS.md`: active docs versus historical and status snapshots.
- `schemas/AGENTS.md`, `catalog/AGENTS.md`, `templates/AGENTS.md`, `scripts/AGENTS.md`: artifact contracts, seed catalogs, fixtures, and root generators or validators.

When editing inside one of these trees, read the nearest child `AGENTS.md` after this root file. Child files specialize this policy; they do not relax it.

## Documentation Ownership And Impact

- `docs/README.md` indexes active human-facing documentation. The Handbook maps behavior to current source; source remains the final authority.
- Before a source change, check the documentation-impact rules in [Operating Model](docs/workbench/operating-model.md). Update affected active documentation in the same change set.
- If a change alters an interface, schema, gate, or UX contract, append a dated entry to `docs/decision-log.md` with PR, decision, rationale, and impact. The decision log preserves history; canonical documents own current rules.
- `docs/archive/**` and `docs/handoff/claude-home/**` are not active authority and are excluded from normal documentation-currency sweeps. Do not edit them to describe current behavior unless the task explicitly asks for archival or handoff work.
- `.agents/skills/**` Markdown is operational material governed by its nearest `SKILL.md`; do not include it in a general docs sweep or edit it without an explicit skill-related request.

## Skill And Subagent Usage

Use skills as execution discipline, not ceremony.

### Frontend Skill

For any visible workbench UI change, apply `frontend-skill`.

Agent Factory is an operational workbench, not a marketing surface. Prefer:

- dense but readable workspace layouts
- clear task hierarchy
- restrained colors and borders
- utility copy in natural Korean
- English technical terms where clearer, such as `Agent`, `Workflow`, `Tool`, `Graph IR`, and `Runtime Handoff`
- cards only when the card is the interaction surface

The Current Implementation UI presents only Agent, Workflow, and Tool as asset categories. A2A may appear only as an Agent protocol binding or exposure, never as an asset category.

When changing a screen, verify that removed UI does not still render from a parent shell, context panel, inspector, or shared layout component.

### Subagents

Use subagents only when they materially improve reliability or protect the main context from growing too large.

A subagent is appropriate when:

- the task is bounded and can be reviewed independently
- the subagent can receive nearly the same relevant context as the main agent
- the expected output quality should match the main agent's work
- the work is review, focused investigation, or an isolated implementation slice
- the main agent can continue useful non-overlapping work while the subagent runs

Do not use a subagent for the immediate blocking step when the main thread must act on that result before doing anything else.

When the user authorizes subagents for Agent Factory work, use these defaults:

- model: `gpt-5.6` (the configured Codex default; do not pass `gpt-5.5`)
- reasoning effort: `high`

For code-changing subagents, assign a clear file or module ownership boundary and instruct them not to revert or overwrite unrelated work. For review subagents, request concrete findings with current file and line references.

Track every spawned subagent until its lifecycle is closed. Capture its deliverable, close it immediately after completion, and perform a final sweep before finishing. If the available tool surface cannot close completed subagents, do not start a multi-agent workflow that would leave resident runtimes behind.

## Worktree Hygiene

Git worktrees created for isolated slices must be cleaned up after their work lands.

- After a PR is merged, treat the source worktree and local branch as cleanup-pending in the same session unless the user explicitly keeps them.
- Before deleting, confirm the worktree is clean and the branch is merged with `git merge-base --is-ancestor <branch> main`, or confirm its content is already on `main`.
- Remove a landed worktree with `git worktree remove <path>`, delete its local branch with `git branch -d <branch>`, and run `git worktree prune` for dead registrations.
- Keep and report anything unmerged or dirty. Never remove the primary checkout or touch a remote branch unless the user asks.
- Periodically run `git worktree list` to identify leftovers.

## Editing Rules

- Keep changes scoped to the requested behavior. Do not add unrelated abstractions, configuration, or extensibility.
- Keep Target Contract wording and Current Implementation behavior visibly separate.
- Runtime Handoff and scaffold generation consume approved artifacts, never raw requirements or unreviewed discovery output.
- Follow [Operating Model](docs/workbench/operating-model.md) for Asset Registry lifecycle. Work Skills do not edit Registry bytes directly; use the shared revision-checked service or CLI only after explicit authorization for the exact Asset/version and decision.
- Do not solve generated behavior by hard-coding domain terms, route aliases, product names, scenario names, or Workflow-specific literals into a generator. Generator defaults must stay framework- and runtime-neutral; behavior-specific choices belong in reviewed artifacts or Catalog/mock contracts.
- Preserve Korean workbench UI copy unless the task explicitly changes the language.
- Before a visual change, read `docs/visualization/design-system.md`; verify the result in the real screen and capture a screenshot before reporting completion.

## WSL Browser Verification

This repository is often operated from WSL while the visible Chrome window is a Windows process. Do not assume a browser automation tool can see that browser.

For routine single-screen inspection, DOM, console, or network diagnosis, and screenshots, prefer Chrome DevTools. Use Playwright only when the task requires repeatable multi-browser regression, trace capture, or an independent browser session.

Before Chrome DevTools navigation, DOM inspection, or screenshots, run this WSL gate:

```bash
curl -s http://127.0.0.1:8899/json/version
```

The browser tool is usable only when the response is JSON containing `webSocketDebuggerUrl`. If the gate fails, do not call Chrome DevTools navigation, evaluation, or screenshot operations and do not claim a screenshot was taken.

A known working dedicated WSL browser setup is:

```bash
google-chrome-stable \
  --headless=new \
  --remote-debugging-port=8899 \
  --user-data-dir=/tmp/chrome-codex-devtools \
  --no-first-run \
  --no-default-browser-check \
  about:blank
```

Then verify:

```bash
curl -s http://127.0.0.1:8899/json/version
lsof -iTCP:8899 -sTCP:LISTEN
```

Use a separate `--user-data-dir` for the automation browser. Do not retrofit the user's normal Windows Chrome session unless its debug endpoint is first proven reachable from WSL.

## Dev Server Reachability

- Local Agent Factory services use only the reserved `8890` through `8900` range. The fixed assignments are Companion `8890`, Mock Lab `8891`, generated ADK runtime `8892`, synthetic A2A consumer fixture `8893`, web preview `8894`, Mock Lab preview `8895`, generated A2A provider `8896`, local model API `8897`, Codex Bridge `8898`, and Chrome DevTools `8899`; `8900` remains spare.
- Isolated automated tests may bind port `0` so the OS assigns a non-user-facing ephemeral port; this exception must not appear in manual startup instructions or persistent services.
- Manual and browser testing for `packages/web` uses the fixed port `8890`.
- Start Vite with `npm run dev -- --host 0.0.0.0 --port 8890 --strictPort` so the user can reach it. Do not let Vite auto-increment to another port.
- Before starting, run `lsof -iTCP:8890 -sTCP:LISTEN`. Stop an existing stale Agent Factory/Vite owner; if an unrelated process owns the port, report the blocker instead of moving ports.
- Verify from the same network namespace with `curl -I http://127.0.0.1:8890/` and, when useful, `lsof -iTCP:8890 -sTCP:LISTEN`.
- Report only `http://127.0.0.1:8890/` unless the user explicitly approves another port in the reserved range.

## Verification

After TypeScript, React, Work Item, projection, or web behavior changes, run:

```bash
cd packages/web
npm run build
```

If dependencies are missing, run `npm install` in `packages/web` before the build.

For artifact, schema, Catalog projection, or validator-sensitive changes, run from the repository root:

```bash
node scripts/validate-artifacts.mjs
```

Documentation-only changes must at least pass `git diff --check`, link checks appropriate to the staged documentation set, and an edited-file inventory. Do not call work complete without observable verification; state any unverified item and why it remains unverified.
