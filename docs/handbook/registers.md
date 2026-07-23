# Artifact and State Registers

| Register | Producer | Consumer | Persistence and boundary | Source |
| --- | --- | --- | --- | --- |
| Work Item v2 | external Codex Work Skills; web Graph invalidation | router, all Work Skill screens, validator, generator | `artifacts/af/<work-id>/af-work-item.json`; strict breaking v2 | `packages/web/src/analyzer/afWorkItem.ts`, `schemas/af-work-item.schema.json` |
| Revisions and decisions | external Codex; web Graph revision helper | review gates, Scaffold, Verify, UI | content-addressed subjects, Registry revision, user provenance inside Work Item | `packages/web/server/workItemRevision.ts`, `afWorkItem.ts` |
| Analysis aggregate/splits | Discover/Compose external Codex | Discover/Compose UI, validator, generator | strict Target v2 `analysis-result.json`, `normalized-requirement.json`, `asset-candidates.json` | `targetAnalysisResult.ts`, `scripts/validate-artifacts.mjs` |
| Graph IR | Compose external Codex or guarded web Graph PUT | Compose UI, validator, generator | embedded Graph plus `graph-ir.json`; ETag/revision guarded | `packages/web/server/workItemApi.ts`, `GraphCanvas.tsx` |
| Composition notes/plan | Compose external Codex | Scaffold skill/UI/generator | `boundary-design.md`, `scaffold-plan.json`; bound to current composition | `scripts/adk-source/context.mjs` |
| Runtime source/handoff | Scaffold external Codex | Scaffold/Verify projection | approved output roots and `implementation-handoff.md` | `scripts/generate-adk-source.mjs`, `ScaffoldWorkspace.tsx` |
| Verification | Verify external Codex | Verify UI and lifecycle outcome | `validation-report.md` plus approved evidence refs; no Catalog delta | `VerifyWorkspace.tsx`, Work Item schema |
| Asset Registry | shared Registry service through guarded Web/CLI | Discover search, Assets UI, generator, Mock Lab prefill | `catalog/asset-registry.json`; exact versions, lifecycle decisions, atomic revision writes | `packages/agent-factory-core/src/assetRegistry.ts` |
| Codex bridge | project/plugin Hooks and companion facade | Connections/Discover/live rail and next prompt | ignored `.agent-factory/codex-bridge/v1`; bounded sessions, handoffs, receipts, deliveries | `codexBridgeStore.ts` |
| Workspace activity | filesystem/Git/bridge projection | live rail | ignored `.agent-factory/workspace-projection/activity.json`; metadata only | `workspaceProjection.ts` |

The browser does not persist lifecycle truth in localStorage and does not write Work Item decisions, source, review gates, or verification results. Its canonical write boundary is Graph IR plus revision-checked Asset Registry lifecycle operations.
