# E2 (skill collision) — Selected skills (core evidence)

## Run 2-1b: what Codex injected (zero tool calls)

Run 2-1b executed **0 shell commands** (`grep -c '^/bin/bash -lc' run-2-1-raw.log`
returns `0`). The model answered directly from context. It therefore could not have
read any file. Everything it listed was injected by Codex.

It listed 24 skills. Both contested sets appeared:

Repo-local, from the git **worktree** root — auto-discovered:

| Skill | SKILL.md absolute path |
|---|---|
| af-compose-solution | `/home/ilmaswsl/work/af-companion-skillsync/.agents/skills/af-compose-solution/SKILL.md` |
| af-discover-assets | `/home/ilmaswsl/work/af-companion-skillsync/.agents/skills/af-discover-assets/SKILL.md` |
| af-scaffold-runtime | `/home/ilmaswsl/work/af-companion-skillsync/.agents/skills/af-scaffold-runtime/SKILL.md` |
| af-verify-runtime | `/home/ilmaswsl/work/af-companion-skillsync/.agents/skills/af-verify-runtime/SKILL.md` |
| af-workflow | `/home/ilmaswsl/work/af-companion-skillsync/.agents/skills/af-workflow/SKILL.md` |

Global `~/.agents/skills`:

| Skill | SKILL.md absolute path |
|---|---|
| google-agents-cli-adk-code | `/home/ilmaswsl/.agents/skills/google-agents-cli-adk-code/SKILL.md` |
| google-agents-cli-deploy | `/home/ilmaswsl/.agents/skills/google-agents-cli-deploy/SKILL.md` |
| google-agents-cli-eval | `/home/ilmaswsl/.agents/skills/google-agents-cli-eval/SKILL.md` |
| google-agents-cli-observability | `/home/ilmaswsl/.agents/skills/google-agents-cli-observability/SKILL.md` |
| google-agents-cli-publish | `/home/ilmaswsl/.agents/skills/google-agents-cli-publish/SKILL.md` |
| google-agents-cli-scaffold | `/home/ilmaswsl/.agents/skills/google-agents-cli-scaffold/SKILL.md` |
| google-agents-cli-workflow | `/home/ilmaswsl/.agents/skills/google-agents-cli-workflow/SKILL.md` |

Plus 12 out-of-scope entries it correctly separated: `~/.codex/skills/.system/*`
(imagegen, openai-docs, plugin-creator, skill-creator, skill-installer),
`~/.codex/skills/{frontend-skill,playwright,playwright-interactive}`, and four
plugin-cache skills under
`~/.codex/plugins/cache/openai-curated-remote/github/0.1.8-2841cf9749ae/skills/`.

### Why this is not explainable by AGENTS.md

`/home/ilmaswsl/work/af-companion-skillsync/AGENTS.md` (also injected) references
`.agents/skills` as a directory and says "the skill tree is `af-workflow` plus four
canonical Work Skills", but it does **not** enumerate the four names
(`af-discover-assets`, `af-compose-solution`, `af-scaffold-runtime`,
`af-verify-runtime`) nor any absolute `SKILL.md` path. The model produced all five
names with correct absolute worktree paths. That information came from Codex's
skill list, not from AGENTS.md.

### Negative control observed in run 2-1a

The eight `figma-*` skills under `~/.codex/skills/` are marked
`enabled = false` in `~/.codex/config.toml`. In run 2-1a the model's own
`rg --files` output listed those figma paths, yet the model **excluded** them from
its answer — consistent with it holding an authoritative enabled-skill list from
context. Suggestive, not conclusive (it may have inferred disabled status
another way; the head of run 2-1a's log was truncated by `tail -150`).

## Run 2-2: what the model actually READ (40 shell commands)

Skill files opened via `sed`/`rg` during run 2-2, from `run-2-2-raw.log`:

Repo-local `.agents/skills` (read):

- `.agents/skills/af-workflow/SKILL.md` (read twice: lines 1-400, then 1-180)
- `.agents/skills/af-discover-assets/SKILL.md`
- `.agents/skills/af-compose-solution/SKILL.md` (twice)
- `.agents/skills/af-scaffold-runtime/SKILL.md`
- `.agents/skills/af-verify-runtime/SKILL.md`
- `.agents/skills/af-scaffold-runtime/references/artifact-and-source-generation.md`
- `.agents/skills/af-scaffold-runtime/references/output-modes-and-handoff.md`
- `.agents/skills/_shared/source-of-truth.md`
- `.agents/skills/_shared/lifecycle-invariants.md`
- `.agents/skills/_shared/work-item-and-external-codex.md` (twice)
- `.agents/skills/_shared/fresh-context-handoff.md`
- `.agents/skills/_shared/missing-information.md`
- `.agents/skills/_shared/decision-input-adapter.md` (twice)
- `.agents/skills/_shared/session-and-work-item-provenance.md`
- `.agents/skills/_shared/companion-session-participation.md` (twice)

Global `~/.agents/skills` (read):

- `/home/ilmaswsl/.agents/skills/google-agents-cli-workflow/SKILL.md`
  (read three times: 1-400, 171-360, 1-170 — i.e. read in full)
- `/home/ilmaswsl/.agents/skills/google-agents-cli-scaffold/SKILL.md` (1-400)

Non-skill repo files also read: `docs/README.md`, `docs/handbook/README.md`,
`docs/workbench/operating-model.md`, `scripts/AGENTS.md`, `packages/web/AGENTS.md`,
`~/.codex/memories/MEMORY.md`, plus `git status --short` and `git diff`.

The other five google-agents-cli skills (adk-code, deploy, eval, observability,
publish) were **not** opened in run 2-2.

## Which set won

The model followed the **repo-local af-\* skills** and demoted the global Google
skills to "supporting reference". Its stated ordering, quoting the repo's own
authority rule:

> Agent Factory의 authority 규칙은 Google Agents CLI skill을 "구조와 workflow의
> 예시일 뿐 Agent Factory authority는 아니다"라고 명시합니다. 근거:
> `/home/ilmaswsl/work/af-companion-skillsync/.agents/skills/_shared/source-of-truth.md:14`

Its top-line answer was that `agents-cli scaffold create` must **not** be used
directly, and that the repo's `Discover → Compose → Scaffold → Verify` gate
sequence applies instead.

Important: the precedence was decided by **content**
(`_shared/source-of-truth.md` explicitly subordinates the Google skills), not by
any observed Codex-level precedence mechanism between global and repo scope. This
run provides **no** evidence that Codex itself ranks repo skills over global ones.
