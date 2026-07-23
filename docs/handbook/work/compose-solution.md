# Compose and Graph Projection

`ComposeWorkspace` loads strict analysis, Work Item state, Graph projection, and observed Codex sessions. Graph is read-only until edit mode is explicitly enabled.

Graph save requires a selected active session and the latest ETag. `saveGraphProjection` sends only `graph` and `target_session_id`. Server `saveGraph`:

1. verifies loopback, same-origin, ETag, and discovery approval;
2. validates the complete next strict analysis;
3. writes embedded and split Graph IR;
4. resets composition/Scaffold/Verify state;
5. queues exact-session `graph_change` context;
6. records metadata-only projection activity.

An ETag conflict is a hard retry boundary. A post-save delivery failure is surfaced separately and does not roll back the saved Graph.

Source:

- `packages/web/src/routes/work/ComposeWorkspace.tsx`
- `packages/web/src/components/GraphCanvas.tsx`
- `packages/web/src/components/GraphElementEditor.tsx`
- `packages/web/server/workItemApi.ts`
