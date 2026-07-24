# Local Companion Security

The companion is local-only and must not be exposed to an untrusted network.

- Product APIs require loopback peers.
- Graph, Registry, enrollment, handoff, session revocation, delivery, state reset, and editor mutations additionally require same-origin requests.
- Graph writes require current ETag and an exact active Companion target with a current lease and matching workspace/application/Work Item/role scope.
- Work Item/file/diff/editor paths are canonicalized and contained within the repository.
- VS Code launch uses a trusted host executable and fixed argv; browser input cannot supply a command.
- Bridge v2 endpoints use random bearer credentials and a per-process instance identity. State uses restrictive permissions, bounded records, and atomic replacement; v1 state is not migrated.
- Enrollment and fresh-session Handoff claims are one-time and expiring. Durable state stores token digests; lease files are exact-session, contained, regular, non-symlink files with restrictive permissions and become invalid after Bridge restart. Existing-session Attach requires an explicit target with a current same-scope materialization lease, persists only that target ID, clears Capsule claim authority, and injects context only into its next leased prompt.
- The Hook adapter proves an exact activation Capsule or current lease before endpoint discovery. Leaked endpoint credentials without that proof cannot enroll a session, and unmanaged events produce no Agent Factory request or durable state.
- Hook/activity state excludes prompts, transcripts, tool arguments, and tool output. Capsule parsing rejects extra prompt content, duplicate markers, wrong scope, replay, and oversized input.
- Work Item previews cap file size/count and reject binary files and escaping symlinks.
- Registry mutations require strict payloads, current `If-Match`, process locking, atomic replacement, and explicit decision evidence. Published contract bytes are immutable.
- Never place credentials, private endpoints, real customer data, or production secrets in artifacts, Hook payloads, demos, or screenshots.

The fixed development URL is `http://127.0.0.1:8890/`. Local Agent Factory listeners use only the reserved `8890` through `8900` range. Reuse an occupied port only when `/api/workspace/identity` proves it belongs to the same canonical repository.
