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
- The `Assets` workspace uses a server-only Registry gateway that delegates all
  lifecycle transitions and writes to the shared `AssetRegistryService`.
  Browser code never writes Registry JSON directly.
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
| `GET` | `/api/companion/registry/assets` | list exact Registry versions by type/status |
| `GET` | `/api/companion/registry/assets/:id/versions/:version` | read a full versioned contract and lifecycle evidence |
| `POST` | `/api/companion/registry/validate` | validate draft contract bytes without mutation |
| `POST` | `/api/companion/registry/drafts` | create a revision-checked draft version |
| `PUT` | `/api/companion/registry/drafts/:id/versions/:version` | update a mutable draft |
| `POST` | `/api/companion/registry/drafts/:id/versions/:version/review` | record explicit user review |
| `POST` | `/api/companion/registry/assets/:id/versions/:version/publish` | publish after user confirmations |
| `POST` | `/api/companion/registry/assets/:id/versions/:version/deprecate` | deprecate after explicit user decision |

Registry mutations are same-origin JSON requests and require the current raw
Registry SHA-256 in `If-Match`. `409 registry_revision_conflict` is fail-closed
and must be followed by a fresh read and renewed review.

Run the complete workspace through `npm run dev` from `packages/companion`.
