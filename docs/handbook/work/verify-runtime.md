# Verify Projection

`VerifyWorkspace` maps current files and Work Item outcome onto five evidence levels. It previews `validation-report.md` and evidence files but runs no command and writes no report.

The displayed outcome comes from `af-work-item.json`; file presence alone cannot upgrade it. External `af-verify-runtime` chooses and runs claim-matched checks, records exact revision/environment/command/observations, and routes failures to the evidence-owning Discover, Compose, or Scaffold skill. It does not create `catalog-delta.yaml`; any Registry lifecycle mutation is separately authorized, revision checked, and followed by stale-evidence handling.

Source:

- `packages/web/src/routes/work/VerifyWorkspace.tsx`
- `packages/web/src/analyzer/afWorkItem.ts`
- `.agents/skills/af-verify-runtime/SKILL.md`
- `docs/workbench/validation.md`
