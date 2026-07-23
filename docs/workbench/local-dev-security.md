# Local Companion Security

The companion is local-only and must not be exposed to an untrusted network.

- Product APIs require loopback peers.
- Graph and editor mutations additionally require same-origin requests.
- Graph writes require current ETag and an explicit active target session.
- Work Item/file/diff/editor paths are canonicalized and contained within the repository.
- VS Code launch uses a trusted host executable and fixed argv; browser input cannot supply a command.
- Bridge endpoints use random bearer credentials, restrictive permissions, bounded state, and atomic replacement.
- Hook/activity state excludes prompts, transcripts, tool arguments, and tool output.
- Work Item previews cap file size/count and reject binary files and escaping symlinks.
- Catalog is read-only in the app.
- Never place credentials, private endpoints, real customer data, or production secrets in artifacts, Hook payloads, demos, or screenshots.

The fixed development URL is `http://127.0.0.1:5173/`. Reuse an occupied port only when `/api/workspace/identity` proves it belongs to the same canonical repository.
