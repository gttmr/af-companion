# Web Asset Registry Client

## Scope

This directory owns the browser client and contract editor helpers for the versioned Agent, Workflow, and Tool Asset Registry.

## Local rules

- Call `/api/asset-registry`; do not read or parse repository seed files in the browser.
- Keep L0, L1, and L2 progressive disclosure intact. Search sends bounded criteria and receives bounded evidence.
- Require an exact Registry revision for every mutation and surface conflicts without retrying over newer bytes.
- Validate draft contract bytes before save. Review, publish, and deprecate require explicit user decision evidence.
- Never mutate a published version or treat A2A as a fourth asset type.

## Verification

```bash
cd packages/web
npm run test:contracts
npm run test:companion
npm run build
```
