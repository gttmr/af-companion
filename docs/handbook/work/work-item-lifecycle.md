# Work Item Lifecycle

`af-work-item.json` is parsed by `parseAfWorkItemManifest` in `packages/web/src/analyzer/afWorkItem.ts` and persisted/read through `ArtifactRootStore`.

The parser rejects unknown or missing fields and enforces:

- approved Discover must be complete;
- Compose start requires approved Discover;
- approved Compose must be complete;
- Scaffold start requires approved Compose;
- Verify start requires complete Scaffold;
- Verify complete and `verification.outcome: passed` imply each other;
- `active_skill` cannot point at `not_started`.

`schemas/af-work-item.schema.json` and `scripts/validate-artifacts.mjs` enforce the same public shape/order. `WorkspaceHome` lists only roots with readable valid Work Items.

The browser has no lifecycle mutation. Graph PUT may reset composition/downstream state because that canonical edit invalidates prior evidence.
