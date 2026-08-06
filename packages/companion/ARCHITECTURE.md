# Companion bidirectional Graph collaboration

## Product north star

Companion is the skill-aware ADK development context plane for an external
Codex CLI or Codex VS Code extension. It visualizes exact Asset bindings and
Graph structure, turns a selected Node, Edge, or Region into a bounded source
development task, and preserves implementation evidence in the managed App
Git repository. Google `google-agents-cli-*` Skills and separately versioned AF
Skills own the ADK development method; external Codex owns source generation.
The target operating environment has no Internet access. Session 2 primary
acceptance uses the user-owned self-hosted `qwen3.6-27b-128k` model with a 128k
context through one approved Tailscale direct `/v1` transport. The private
endpoint remains in ignored local configuration and is never persisted in
repository source, an App, artifacts, or evidence; localhost tunnels, cloud
models, Gemini fallback, deployment, agent publication, and cloud observability
are outside the primary path. Skill bundles, toolchains, dependencies, and
model configuration must be provisioned and verified before a development task
starts.

AF Skills are an ADK 2.4 evidence-backed overlay, not a copy of Google Skill
guidance. Framework claims are decided by exact 2.4 runtime probes, imported
source/signatures, ADK Docs MCP evidence, and then installed agents-cli guidance.
The evidence campaign covers the full Workflow, Agent/Sub-agent, Tool,
state/event/artifact, callback/lifecycle, Subworkflow, and local A2A surface;
parallel, loop, and dynamic patterns are examples rather than its boundary.

This is a Target Contract, not a claim that the current package already owns
source projects, Skill readiness, implementation mapping, or task capsules.
Those gaps and their sequenced work orders are defined in
[Skill-aware ADK development context](../../docs/workbench/companion-adk-development-context.md).
The independent App Server client is optional follow-up infrastructure rather
than a prerequisite for the external-client path.

## Decision

Graph collaboration has one canonical writer and two independent planes.

```text
Companion Web ---------+
                       v
              Graph Control Server ---> canonical Graph / presentation / Context
                       ^
External Codex -> MCP -+
                       ^
direct Graph file -----+  validated import fallback

App Server client          independent execution and approval plane

Companion Assets UI ---> Registry gateway ---> shared AssetRegistryService
                                               |
                                               v
                                  catalog/asset-registry.json
```

The server reconciles the Graph file before every read or mutation and also
uses `fs.watch` only as a debounced hint. Valid direct edits become external
changes. Invalid, symlinked, partial, or oversized sources retain the last valid
Graph for reference while all writes fail closed.

## Contracts

- Graph IR supports the canonical eight Node kinds, full Edge control/channel,
  and parallel/loop Region nesting. Graph identity and root `workflow_ref`
  remain read-only in this slice.
- Every Graph mutation is an explicit `GraphEditOperation[]` transaction.
  Removing a referenced Node requires same-transaction Edge/Region operations.
- `graph_revision` is a semantic SHA-256 and the optimistic concurrency key.
  Formatting-only file changes do not create Graph history.
- `GraphPresentation` is a separate sidecar; layout, viewport, and pin changes
  do not change `graph_revision`.
- Context v2 removes `sequence`, `after_sequence`, and `UNCHANGED`.
  `document_revision` identifies a snapshot and `authority` is always `none`.

## Control API

- `GET /api/companion/v2/workspace`
- `GET /api/companion/v2/events`
- `PUT /api/companion/v2/selection`
- `PUT /api/companion/v2/draft`
- `POST /api/companion/v2/graph/operations`
- `PUT /api/companion/v2/presentation`

Stale Graph revisions return `412 graph_stale`, contract failures return `422`,
an invalid external source returns `409 invalid_external_source`, and a
semantically identical operation batch returns `NO_CHANGE`.

## MCP and authority

The project MCP exposes only:

- `companion_get_graph_workspace`
- `companion_apply_graph_changes`

Server instructions require `get -> apply` and a fresh recomputation after a
stale response. The write Tool advertises `readOnlyHint: false`; generated Codex
configuration uses `default_tools_approval_mode = "writes"`. The MCP process
hot-reads a project-contained mode-0600 capability and accepts only loopback
HTTP origins. App Server thread execution remains independent.

## Web conflict policy

SSE invalidation causes the browser to fetch a fresh snapshot. MCP or direct
file changes win over an overlapping Web draft: the draft and undo history are
discarded, preserved selection is kept, deleted selection is cleared, and the
UI reports the discarded operation count. Changed Node, Edge, and Region IDs
receive a short visual highlight.

The Web composition layer also exposes a same-origin `POST
/api/companion/editor/launch-vscode` action. It accepts no path input and opens
only the server-canonical project root with a trusted external `code`
executable. This editor handoff is not part of the Graph Control API and is not
evidence that a Codex thread is connected.

## Integration boundary

This workspace is the primary direction for new Companion product work, but it
does not yet redirect or delete the existing Agent Factory Graph editor. The
existing `packages/web` implementation is a legacy/reference surface during
the transition.

If legacy Work Item artifacts must later be migrated, that adapter must treat
`analysis-result.json.graph`, `graph-ir.json`, and `af-work-item.json` as one
journaled logical transaction while preserving review, invalidation, and full
Target analysis validation. That compatibility work is separate from this
App-scoped Graph core and starts only after the isolated acceptance scenarios
pass.

## Managed App workspace

The greenfield surface owns one active App at a time. It does not import the
mixed legacy `~/work/af-apps` tree and does not accept browser-supplied paths.
New Apps are atomically created below `~/work/af-companion-apps` (or the
server-only `COMPANION_APPLICATIONS_ROOT`) with Git, Companion manifests, the
minimal Graph, presentation state, and Codex MCP configuration. Before the
staging directory is renamed into the visible App path, the manager creates one
baseline commit on `main` using its command-scoped `Agent Factory Companion
<companion@agent-factory.local>` identity. The commit contains exactly
`.gitignore`, `.agent-factory/companion-app.json`,
`.agent-factory/companion-assets.json`, and
`.agent-factory/companion-graph.json`. Commit hooks and GPG signing are disabled
for this one manager-owned operation; failure removes the staging directory and
exposes no partial App.

Codex config, capability, presentation, workspace state, and UI context remain
ignored private/runtime state. The manager creates no remote, performs no push,
and does not commit later Graph or Asset edits. Runtime source and all history
after the baseline are owned by the user or Codex in the App repository.

Switching Apps closes the previous Graph watcher, writes an inactive capability
to the old App, opens the new canonical workspace, and rotates the current
loopback capability into it. An MCP process in the old App fails with
`app_inactive`; it cannot silently write the newly selected App.

The App Manager remains a read-only Registry consumer. It stores exact
published bindings in `.agent-factory/companion-assets.json`; Graph validation
rejects unbound refs, type mismatches, missing exact versions, and changed
contract hashes.

The primary Companion product separately owns the Asset lifecycle UI. Its
server-side Registry gateway delegates strict validation, contract hashes,
locking, revision comparison, lifecycle transitions, and atomic replacement to
the shared `AssetRegistryService`. Draft create/update requires the current
Registry revision. Review, publish, and deprecate require an explicit
`selected_by: "user"` Decision; publish also requires Owner, Domain, and Reuse
confirmation. A revision conflict cancels the attempted operation and requires
a fresh read—there is no blind retry. Work Items, Bridge sessions, and App
Server threads remain outside the App Manager and Registry gateway.
