# CLI Companion Migration Status

Checked 2026-07-23 against the current checkout.

## Result

The external-Codex ownership cutover is implemented.

| Area | Current result |
| --- | --- |
| canonical write owner | external Codex Work Skills own artifacts/source; web owns Graph IR only |
| lifecycle | strict `af-work-item.json` with four Work Skills and two review gates |
| projection | Work Items, filesystem activity, Git status/diff, files, evidence, and Codex sessions |
| realtime | workspace SSE plus bounded metadata activity and query recovery |
| Hooks | `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop` |
| editor handoff | canonical VS Code workspace, contained file, and local diff open |
| Catalog | read-only web projection |
| removed | Stage Runner, `/api/af`, stage routes, server lifecycle primitives, proposal/apply, legacy manifest |

## Preserved constraints

- No direct turn start, in-flight steering, private IDE thread selection, or model delivery acknowledgement is claimed.
- Hook/observer persistence is metadata-only; prompts, transcripts, tool arguments, and tool output are excluded.
- A VS Code launch receipt is not a Codex connection receipt.
- Fixed-port reuse requires exact canonical workspace identity.
- Browser Graph save requires ETag, same-origin loopback, approved discovery, strict validation, and explicit target session.

## Acceptance still environment-dependent

Automated tests can prove Hook protocol adaptation, exact-session queueing, filesystem/Git projection, and editor argv safety. An actual VS Code Codex extension connection still requires the user to trust the current Hook hash, submit a fresh prompt, and observe the resulting session/turn receipt.

Current contract: [External Codex Companion](../workbench/cli-companion.md). Source-backed behavior: [Handbook](../handbook/README.md).
