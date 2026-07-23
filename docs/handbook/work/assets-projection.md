# Read-only Assets Projection

`afCatalogApi` reads `catalog/agents.yaml`, `catalog/workflows.yaml`, and `catalog/tools.yaml` and exposes GET-only `/api/catalog`.

`AssetsPage` filters and renders Agent·Workflow·Tool rows. It has no publish, pin, approval, or proposal editor. A2A and MCP remain protocol/binding details.

Actual Catalog changes are separate reviewed repository changes. External verification may propose `catalog-delta.yaml`, but neither the Work Skill nor web app directly publishes it.

Source:

- `packages/web/server/afCatalogApi.ts`
- `packages/web/src/routes/AssetsPage.tsx`
- `packages/web/src/catalog/catalogIndex.ts`
