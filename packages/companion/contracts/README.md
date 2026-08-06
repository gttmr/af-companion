# Companion UI-context contracts

Dependency-free, browser-safe wire contracts for context published by the
Companion Web application. The document is deliberately non-authoritative: it
describes a visible selection, an uncommitted draft, and the last committed
mutation without granting write, review, session, or lifecycle authority.

The package validates exact object keys and bounded JSON values, serializes keys
canonically, and verifies a deterministic SHA-256 document revision. Expiration
against the current clock and source-file freshness are environment concerns and
are checked by the read-side adapter, not by this package.

It also owns browser-safe wire shapes for managed Apps, exact App Asset
bindings, and the primary Companion Registry lifecycle API. Canonical Asset
validation and mutation behavior remain in `AssetRegistryService`; these types
do not grant review or publication authority.

```ts
import {
  createUiContextDocument,
  parseUiContextDocument,
  serializeUiContextDocument,
} from "@agent-factory/companion-contracts";
```
