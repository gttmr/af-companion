# Handbook Overview

This page describes the existing `packages/web` Work Item lifecycle surface.
It remains implemented as a legacy/reference path. The primary Companion
development surface is the App-scoped Graph/MCP workspace documented in
[`packages/companion/README.md`](../../packages/companion/README.md).

Agent Factory Companion has two cooperating execution surfaces:

```text
external Codex CLI / VS Code
  runs re-entrant Work Skills
  writes Work Item artifacts and source
          │
          ├── explicit enrollment + locally gated lifecycle Hooks -> local Codex bridge
          └── repository files and Git state
                    │
                    v
web companion on 127.0.0.1:8890
  projects Work Items, decisions, revisions, files, diffs, evidence, and enrolled Companion sessions
  may create one strict empty Work Item through a confirmed bootstrap
  edits guarded Graph IR and Asset Registry only
```

The lifecycle is Discover Plan → fresh-session materialization → review → Compose ⇄ Discover → review → Scaffold → Verify. Failures return to the skill that owns the missing evidence. The source of lifecycle truth is `artifacts/af/<work-id>/af-work-item.json` v2, not a route or browser cache.

Codex connectivity is opt-in. A one-time enrollment ticket and current per-session lease establish participation for one exact workspace, application, Work Item, and role. Ordinary Codex Hook invocations are local no-ops and do not appear in the web. Fresh-session Plan transfer uses explicit Companion Continue: a canonical Handoff once real revisions exist, or a strict pristine-ledger Bootstrap Grant for the first materialization only.

The visible shell is `LiveWorkbenchLayout`, with `WorkSkillRail` on the left and `LiveRail` on the right. External Codex owns Work Item/source changes after the create-only empty bootstrap; the web does not stage or commit. Registry writes go through the shared strict service with an exact revision and explicit decision. The ignored local Application Registry is a path locator, not lifecycle or Session authority.
