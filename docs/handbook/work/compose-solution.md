# Compose and Graph Projection

`ComposeWorkspace` loads strict analysis, Work Item state, Graph projection, and observed Codex sessions. Before the Graph, it shows current discovery/Graph/Root/runtime/composition revisions, Solution Control Strategy, exact Root Executable, Registry snapshot, required-decision readiness, Asset dispositions, Return-to-Discover requests, and active invalidations.

Graph is read-only until edit mode is explicitly enabled. Save requires a selected active session and latest ETag. `saveGraphProjection` sends only `graph` and `target_session_id`; server `saveGraph`:

1. verifies loopback, same origin, ETag, and approved discovery;
2. validates the complete next strict analysis;
3. writes embedded and split Graph IR;
4. creates a new composition cycle/revision and preserves superseded history;
5. marks composition/Scaffold/Verify evidence stale and records invalidations;
6. queues exact-session `graph_change` context and records metadata-only activity.

An ETag conflict is a hard retry boundary. A delivery failure is surfaced separately and does not roll back the saved Graph. Compose-to-Discover re-entry is represented by structured cycle data; after a new approved discovery, Compose must compare prior/current revisions and never auto-merge the old Graph.

Source:

- `packages/web/src/routes/work/ComposeWorkspace.tsx` (`CompositionDecisionStrip`, `CompositionRegisters`)
- `packages/web/src/components/GraphCanvas.tsx`
- `packages/web/src/components/GraphElementEditor.tsx`
- `packages/web/server/workItemApi.ts` (`saveGraph`, `invalidateAfterGraphChange`)
