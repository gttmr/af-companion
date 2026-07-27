# Work Item Lifecycle

`parseAfWorkItemManifest` in `packages/web/src/analyzer/afWorkItem.ts` parses strict `schema_version: 2`; `ArtifactRootStore` persists it with ETag and canonical write locking.

The parser rejects unknown/missing fields, v1 input, ambiguous identifiers, unsorted or empty revision subjects, invalid digests, stale gates that pretend to be current, incomplete user decisions, duplicate handoff claims, and inconsistent Verify completion. It models:

- `focus_skill` separately from zero or more `active_runs`;
- revisioned skill inputs/outputs and `stale` status;
- append-preserved discovery/composition cycles and Return-to-Discover records;
- required decisions, Asset dispositions, Solution Control Strategy, and Root Executable;
- exact discovery/composition gate bindings;
- invalidations, session handoffs, and verification evidence.

Compose may return to Discover; no global forward-order assertion forbids that. Current approved discovery still gates composition review, current approved composition gates Scaffold, and Verify complete is equivalent to a fresh `passed` outcome. A normal Compose update preserves the approved Discovery binding: its artifact ETag identifies the bound discovery revision, while the current mutable aggregate is checked against the composition revision and Composition ETag.

`schemas/af-work-item.schema.json`, `scripts/validate-artifacts.mjs`, and `scripts/af.mjs work validate` enforce the same public shape. `WorkspaceHome` lists only roots with readable valid Work Items. Guarded `POST /api/work-items` may create exactly the unchanged empty v2 template used by `af work init`; it cannot modify an existing ledger or add application/path fields. The browser has no general lifecycle mutation. Graph PUT creates a new composition revision/cycle and marks dependent evidence stale without deleting history.

The bootstrap derives one application root under `AF_APPLICATIONS_ROOT` (default `~/work/af-apps`), initializes Git, exports the existing project MCP context, and stores the application/work/path binding in ignored mode-`0600` `.agent-factory/applications/registry.json`. That local register is not lifecycle truth, Workspace eligibility, Session enrollment, or a Work Item schema extension.
