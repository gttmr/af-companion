# Handbook Overview

Agent Factory Companion has two cooperating execution surfaces:

```text
external Codex CLI / VS Code
  writes canonical artifacts and source through Work Skills
          │
          ├── official lifecycle Hooks -> local Codex bridge
          │
          └── repository files and Git state
                    │
                    v
web companion on 127.0.0.1:5173
  projects Work Items, files, diffs, evidence, and sessions
  writes only Graph IR and contained VS Code open requests
```

The lifecycle is Discover → review → Compose → review → Scaffold → Verify. The source of lifecycle truth is `artifacts/af/<work-id>/af-work-item.json`, not a route or browser cache.

The visible shell is `LiveWorkbenchLayout`, with `WorkSkillRail` on the left and `LiveRail` on the right. External Codex owns all source changes; the web does not stage or commit.
