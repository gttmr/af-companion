# Verify Projection

`VerifyWorkspace` maps current files and Work Item outcome onto five evidence levels. It previews `validation-report.md` and evidence files but runs no command and writes no report.

The displayed outcome comes from `af-work-item.json`; file presence alone cannot upgrade it. External `af-verify-runtime` owns command selection, execution, report writing, optional Catalog delta, and final outcome.

Source:

- `packages/web/src/routes/work/VerifyWorkspace.tsx`
- `packages/web/src/analyzer/afWorkItem.ts`
- `docs/workbench/validation.md`
