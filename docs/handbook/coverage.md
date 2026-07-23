# Handbook Coverage

Surveyed 2026-07-24 against the current checkout.

| Area | Covered behavior | Page |
| --- | --- | --- |
| lifecycle | Work Item v2, focus/runs, revisions, cycles, decisions, gates, invalidations | [Work Item lifecycle](work/work-item-lifecycle.md) |
| discovery | Plan/materialization split, decisions, candidates, session handoff projection | [Discover](work/discover-assets.md) |
| composition | strategy/Root/Asset decisions, Graph read/edit, re-entry, invalidation | [Compose](work/compose-solution.md) |
| scaffold | exact approved Asset/Root binding and source/handoff projection | [Scaffold](work/scaffold-runtime.md) |
| verification | evidence ladder, rollback ownership, and report projection | [Verify](work/verify-runtime.md) |
| connectivity | Hooks, bridge, exact marker claim, attach fallback, SSE, Git, VS Code | [Live companion](work/live-companion.md) |
| Registry | progressive reads/search, versions, usage, guarded lifecycle | [Assets](work/assets-projection.md) |

Excluded from current behavior coverage: `docs/archive/**`, `docs/handoff/**`, dated review snapshots, removed stage/run APIs, production deployment, and Mock Lab internals beyond the shared read-only Registry prefill boundary.
