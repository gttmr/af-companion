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

## Criterion change after the first review

The user subsequently approved a Session 2-only criterion change: when the installed VS Code
extension cannot use the approved self-hosted provider, its current-run AI chat may be omitted and
Codex CLI becomes the sole AI acceptance client. This supersedes the literal extension requirement
in the first High finding, but does not waive model-mediated MCP get/apply behavior.

The operator then verified Codex CLI `0.146.0` direct model chat and project MCP discovery under the
approved direct Tailscale transport and a system-level egress deny policy. A direct Responses
namespace attempt and a Codex-supported code-mode attempt both failed to make the model invoke
`companion_get_graph_workspace`; neither mutated the Graph. Direct chat, MCP discovery and the
independent local MCP transcript are not substitutes for that model-mediated call.

## Independent re-review

The independent read-only re-review found no High issue and returned the following findings. It
made no file changes and did not invoke Internet, model fallback, deploy, publish or observability.

| Severity | Finding | Disposition |
| --- | --- | --- |
| Medium | The draft over-attributed the failed Tool call to the serving adapter although the evidence did not isolate that layer. | **Resolved after review.** Current text classifies an observed Codex CLI/model/Responses tool-form compatibility failure and leaves Codex, adapter/tool template and model as unisolated possibilities. |
| Medium | Egress PASS lacked a durable named unit, sanitized policy command, timing and result linkage, especially after the failed user-scope enforcement probe. | **Resolved after review.** A journal-backed direct unit retains the HTTP/exit/exact-response marker, while contemporaneous `systemctl show` records sanitized deny/allow properties; a separate named code-mode unit records invocation, hashes and unchanged Graph SHA. |
| Low | The criterion-change section still said the re-review was pending. | **Resolved by this section.** |
| Low | The Markdown inventory count was ambiguous for the current amendment. | **Resolved after review.** The result now states that the current evidence amendment has six Markdown files and 29 checked relative links. |

The reviewer confirmed that direct chat PASS, project MCP discovery PASS and model-mediated MCP
BLOCKED remain separate; no private endpoint, key or capability token was present; Session 1
evidence and `.agents/skills/**` had no current diff; CI remained minimal; and JSON parse plus
`git diff --check` passed. Gate recommendation remains **BLOCKED: do not mark PR #22 ready or
merge it** while model-mediated Companion MCP invocation is unresolved.

## Post-fix check

The resumed reviewer found that the first remediation still called terminal-captured values
`journal_markers` although that unit had piped stdout away from journald, and that the file-count
baseline mixed the full remote PR with the current amendment. The operator reran the direct proof as
`af-session2-phase-a-cli-journal-20260806-01.service` without `--pipe`; `journalctl` then retained the
exact sanitized proof marker and `systemctl show` separately captured the contemporaneous live
policy observation.
The inventory was recomputed from the current amendment as six Markdown files and 29 relative links.
These corrections do not change the reviewer gate: PR #22 remains **BLOCKED**.

## Gemini criterion closure review

After the user changed the Session 2 primary model to `gemini-3.1-flash-lite`, a fresh independent
Codex CLI `0.146.0` thread reviewed the final uncommitted documentation, sanitized JSON and screenshot
in read-only mode. The reviewer process ran in system-level unit
`af-session2-phase-a-independent-review-20260806-10.service`, invocation
`c4f06562a0ee4528815fe85e0bb16e24`, with all network denied except IPv4/IPv6 loopback. Only the
separately restricted bridge could reach the Gemini Developer API. The reviewer did not call MCP or
modify files. Its thread ID was `019fd520-7a7e-7173-93a6-0b79ec2b5450` and last-message SHA-256 was
`cd0244412600daddd613ae09b5323ba40475c8e76792b4938c67294581ca83e8`.

Two setup-only units were excluded before this final review: one exited before model invocation
because systemd lacked the Node PATH, and one exited on an incompatible CLI flag combination. Neither
called the model, reviewed content or changed files.

The closure reviewer returned **no actionable findings**. It confirmed that the changed evidence is
consistent with the user-approved model-only Gemini egress, Codex-CLI-only criterion, exact two-call
Companion MCP mutation and Draft merge gate. It retained these risks:

- Gemini API resolved-IP allowlists need a fail-closed refresh when DNS changes.
- no-egress agents-cli `installed_skills` shape drift remains outside the direct exact-ADK 46/46 pass.
- Codex `0.146.0` still warns that custom model metadata falls back despite explicit context settings.
- existing Apps still lack source remediation for stale mode-0600 capability temp files.

Final gate recommendation: **Phase A passed; keep PR #22 Draft and wait for the user's explicit merge
decision.** The earlier BLOCKED findings above remain historical observations of the superseded model
and criterion state; they are not rewritten as passes.
