# Handbook Overview

Agent Factory Companion has two cooperating execution surfaces:

```text
external Codex CLI / VS Code
  runs re-entrant Work Skills
  writes Work Item artifacts and source
          │
          ├── official lifecycle Hooks -> local Codex bridge
          └── repository files and Git state
                    │
                    v
web companion on 127.0.0.1:5173
  projects Work Items, decisions, revisions, files, diffs, evidence, and sessions
  writes guarded Graph IR and Asset Registry only
```

The lifecycle is Discover Plan → fresh-session materialization → review → Compose ⇄ Discover → review → Scaffold → Verify. Failures return to the skill that owns the missing evidence. The source of lifecycle truth is `artifacts/af/<work-id>/af-work-item.json` v2, not a route or browser cache.

The visible shell is `LiveWorkbenchLayout`, with `WorkSkillRail` on the left and `LiveRail` on the right. External Codex owns Work Item/source changes; the web does not stage or commit. Registry writes go through the shared strict service with an exact revision and explicit decision.
