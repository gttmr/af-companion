# Asset Registry

`assetRegistryApi` exposes `/api/asset-registry` over the shared `AssetRegistryService`. Reads include L0 summary/list, L1 operational detail, L2 full contract/lifecycle, versions, usage, comparison, strict validation, and bounded deterministic search with compatibility facts and rejection reasons.

`AssetsPage` renders Agent·Workflow·Tool records, progressive details, exact versions, source/Handbook references, usage, and version comparison. It supports draft create/update and review/publish/deprecate transitions. Every mutation is loopback/same-origin, validates strict JSON, requires current `If-Match`, and records explicit user decision evidence; published contract bytes cannot be edited.

Both Web and `scripts/af.mjs asset ...` call the same Registry core and canonical `catalog/asset-registry.json`. No YAML bucket parser, `/api/catalog`, proposal file, or direct file-write publication remains. A2A is an Agent protocol binding/exposure, not a Registry category.

Source:

- `packages/agent-factory-core/src/assetRegistry.ts` (`AssetRegistryService`, `search`)
- `packages/web/server/assetRegistryApi.ts` (`createAssetRegistryMiddleware`)
- `packages/web/src/routes/AssetsPage.tsx`
- `packages/web/src/registry/assetRegistryClient.ts`, `registryDraft.ts`
- `scripts/af.mjs` (`dispatchAsset`)
