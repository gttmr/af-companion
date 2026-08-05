# Phase A independent review · 2026-08-06

Scope: Draft PR #22 Phase A changes and current acceptance claims.

Reviewer mode: independent read-only Codex reviewer. It made no file changes and did not invoke an
Internet search, cloud model fallback, deploy, publish, or observability path.

## Findings and disposition

| Severity | Finding | Disposition |
| --- | --- | --- |
| High | Current-run VS Code Codex AI chat, Tool card, write approval and two-chat stale retry were not executed. Prior-day cloud extension evidence and direct local MCP are not substitutes for the current Session 2 transport lock. | **Open blocker.** Phase A and PR #22 remain BLOCKED/INCOMPLETE and must not be marked ready or merged. |
| Medium | Active docs still described agents-cli 1.3.1 as an open transition although Session 1 accepted 1.2.1 and rejected 1.3.1. | **Resolved in active docs.** Session 2 now locks accepted agents-cli/Google Skills 1.2.1 and the four exact Google Skill digests. Frozen Session 1 evidence remains unchanged. |
| Medium | Ignoring capability atomic-write temp files only for newly generated Apps would not protect existing Apps. | **Partial fix removed.** The observed existing-App mode-0600 stale temp and manual disposable cleanup are recorded as an unresolved security/Git-staging follow-up. |
| Medium | Detailed browser/HTTP/MCP/hash claims were mostly prose plus one screenshot. | **Mitigated.** A sanitized persistent JSON transcript now records exact current statuses, revisions, hashes, Git evidence and CDP error arrays without endpoint, key or token bytes. |

## Confirmed by reviewer

- The proposed CI workflow uses Node 22, `npm ci`, Companion typecheck/test/build and the root
  artifact validator with `contents: read` permission.
- No literal private endpoint, API key or capability token was present in reviewed changed text or
  screenshot.
- Session 1 manifest, `.agents/skills/**` and existing Session 1 evidence had no current diff.
- `git diff --check` passed at review time.

The sanitized execution transcript is
[phase-a-2026-08-06-evidence.json](./phase-a-2026-08-06-evidence.json).
