# Companion Web

React Graph workspace and the small production composition entrypoint for the
managed App workspace and Graph Control Server.

## Boundary

- Browser code uses `/api/companion/v2` and SSE for Graph collaboration. The
  separate Web composition action opens only the server-selected active App in
  VS Code; browser input cannot select a filesystem path.
- Node startup composes `ActiveAppWorkspaceController` and one active
  `GraphControlWorkspace`; persistence and Graph concurrency remain owned by
  `graph-control-server`.
- App Server is independent and is not used for Graph synchronization.

The UI supports Node, Edge, and Region operation batches, undo/redo, selection,
draft publication, field-addressed validation, and a presentation sidecar for
layout, viewport, drag, and pin state. Graph identity and root `workflow_ref`
are read-only in this acceptance slice.

MCP availability is never shown as a connected Codex thread.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/companion/v2/workspace` | latest Graph workspace snapshot |
| `GET` | `/api/companion/v2/events` | SSE invalidation events |
| `PUT` | `/api/companion/v2/selection` | publish current selection |
| `PUT` | `/api/companion/v2/draft` | publish operation draft |
| `POST` | `/api/companion/v2/graph/operations` | atomic revision-checked Graph write |
| `PUT` | `/api/companion/v2/presentation` | layout sidecar write |
| `POST` | `/api/companion/editor/launch-vscode` | open the active App in a new VS Code window |

Run the complete workspace through `npm run dev` from `packages/companion`.
