# Artifact and State Registers

| Register | Producer | Consumer | Persistence and boundary | Source |
| --- | --- | --- | --- | --- |
| Work Item | external Codex Work Skills; web Graph invalidation | all Work Skill screens, generator | `artifacts/af/<work-id>/af-work-item.json`; strict four-skill ledger | `packages/web/src/analyzer/afWorkItem.ts`, `packages/web/server/artifactRootStore.ts` |
| Analysis aggregate | Discover/Compose external Codex | Discover/Compose UI, validator, generator | strict v2 `analysis-result.json`; canonical aggregate | `packages/web/src/analyzer/targetAnalysisResult.ts`, `scripts/validate-artifacts.mjs` |
| Candidate/requirement splits | Discover external Codex | projection and validator | `normalized-requirement.json`, `asset-candidates.json` | schemas and validator |
| Graph IR | Compose external Codex or web Graph PUT | Compose UI, validator, generator | embedded Graph and `graph-ir.json`; web ETag guarded | `packages/web/server/workItemApi.ts`, `GraphCanvas.tsx` |
| Composition notes/plan | Compose external Codex | Scaffold skill/UI/generator | `boundary-design.md`, `scaffold-plan.json` | `scripts/adk-source/context.mjs` |
| Runtime source/handoff | Scaffold external Codex | Scaffold/Verify projection | explicit output roots and `implementation-handoff.md` | `scripts/generate-adk-source.mjs`, `ScaffoldWorkspace.tsx` |
| Verification | Verify external Codex | Verify UI and lifecycle outcome | `validation-report.md`, optional `catalog-delta.yaml` | `VerifyWorkspace.tsx`, Work Item schema |
| Catalog | reviewed repository files | Assets UI and reuse checks | `catalog/agents.yaml`, `workflows.yaml`, `tools.yaml`; app read-only | `packages/web/server/afCatalogApi.ts` |
| Codex bridge | project/plugin Hooks and companion facade | Connections/live rail and next prompt | ignored `.agent-factory/codex-bridge/v1`; bounded metadata | `codexBridgeStore.ts` |
| Workspace activity | filesystem/Git/bridge projection | live rail | ignored `.agent-factory/workspace-projection/activity.json`; metadata only | `workspaceProjection.ts` |

The browser does not persist lifecycle truth in localStorage and does not write Catalog seeds, source, review decisions, or verification results.
